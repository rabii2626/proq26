// Local-first storage on IndexedDB. Records are mirrored in memory for instant UI;
// photos stay in IndexedDB as Blobs and are loaded on demand.

const DB_NAME = 'wakeel-crm';
const DB_VERSION = 1;
const COLLECTIONS = ['properties', 'clients', 'appointments'];

let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of [...COLLECTIONS, 'photos', 'kv']) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    Promise.resolve(fn(s)).then((r) => (result = r));
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const reqP = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** In-memory mirror of all collections. */
export const state = { properties: [], clients: [], appointments: [], settings: {} };

const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);
const emit = () => listeners.forEach((fn) => fn());

export async function load() {
  for (const name of COLLECTIONS) {
    state[name] = await tx(name, 'readonly', (s) => reqP(s.getAll()));
  }
  const settings = await tx('kv', 'readonly', (s) => reqP(s.get('settings')));
  state.settings = {
    agentName: '',
    agentPhone: '',
    agency: '',
    watermark: true,
    saleCommission: 2,
    ...(settings?.value || {}),
  };
}

export function get(collection, id) {
  return state[collection].find((x) => x.id === id);
}

export async function save(collection, record) {
  const now = new Date().toISOString();
  const rec = { ...record, id: record.id || uid(), updatedAt: now, createdAt: record.createdAt || now };
  await tx(collection, 'readwrite', (s) => s.put(rec));
  const list = state[collection];
  const i = list.findIndex((x) => x.id === rec.id);
  if (i >= 0) list[i] = rec;
  else list.push(rec);
  emit();
  return rec;
}

export async function remove(collection, id) {
  await tx(collection, 'readwrite', (s) => s.delete(id));
  state[collection] = state[collection].filter((x) => x.id !== id);
  emit();
}

export async function saveSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  await tx('kv', 'readwrite', (s) => s.put({ id: 'settings', value: state.settings }));
  emit();
}

// ---- Photos ----
const urlCache = new Map();

/** rec: { blob, thumb, original?, params? } — original is kept so edits are non-destructive. */
export async function savePhoto(rec) {
  const id = uid();
  await tx('photos', 'readwrite', (s) => s.put({ ...rec, id }));
  return id;
}

export async function replacePhoto(id, patch) {
  const old = (await getPhoto(id)) || {};
  await tx('photos', 'readwrite', (s) => s.put({ ...old, ...patch, id }));
  for (const key of [id + ':full', id + ':thumb']) {
    if (urlCache.has(key)) URL.revokeObjectURL(urlCache.get(key));
    urlCache.delete(key);
  }
}

export async function getPhoto(id) {
  return tx('photos', 'readonly', (s) => reqP(s.get(id)));
}

export async function deletePhoto(id) {
  await tx('photos', 'readwrite', (s) => s.delete(id));
}

/** Object URL for a stored photo (cached). kind: 'thumb' | 'full'. */
export async function photoUrl(id, kind = 'thumb') {
  const key = id + ':' + kind;
  if (urlCache.has(key)) return urlCache.get(key);
  const rec = await getPhoto(id);
  if (!rec) return '';
  const url = URL.createObjectURL(kind === 'thumb' && rec.thumb ? rec.thumb : rec.blob);
  urlCache.set(key, url);
  return url;
}

// ---- Backup ----
const blobToDataUrl = (blob) =>
  new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.readAsDataURL(blob);
  });

const dataUrlToBlob = async (url) => (await fetch(url)).blob();

export async function exportAll() {
  const photos = await tx('photos', 'readonly', (s) => reqP(s.getAll()));
  const out = {
    app: 'wakeel-crm',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: state.settings,
    photos: [],
  };
  for (const name of COLLECTIONS) out[name] = state[name];
  for (const p of photos) {
    out.photos.push({
      id: p.id,
      params: p.params || null,
      blob: await blobToDataUrl(p.blob),
      thumb: p.thumb ? await blobToDataUrl(p.thumb) : null,
      original: p.original ? await blobToDataUrl(p.original) : null,
    });
  }
  return out;
}

export async function importAll(data) {
  if (!data || data.app !== 'wakeel-crm') throw new Error('ملف غير صالح');
  for (const name of COLLECTIONS) {
    const items = data[name] || [];
    await tx(name, 'readwrite', (s) => items.forEach((it) => s.put(it)));
  }
  for (const p of data.photos || []) {
    const blob = await dataUrlToBlob(p.blob);
    const thumb = p.thumb ? await dataUrlToBlob(p.thumb) : null;
    const original = p.original ? await dataUrlToBlob(p.original) : null;
    await tx('photos', 'readwrite', (s) => s.put({ id: p.id, blob, thumb, original, params: p.params }));
  }
  if (data.settings) await saveSettings(data.settings);
  await load();
  emit();
}

export async function wipeAll() {
  for (const name of [...COLLECTIONS, 'photos']) await tx(name, 'readwrite', (s) => s.clear());
  urlCache.forEach((u) => URL.revokeObjectURL(u));
  urlCache.clear();
  await load();
  emit();
}
