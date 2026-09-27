import { state, get, save, remove, savePhoto, deletePhoto } from '../db.js';
import { AREAS, AREA, TYPES, TYPE, FEATURES, FEATURE, FURNISHING, DEALS, PROPERTY_STATUS, ACTIVE_STAGES } from '../data.js';
import {
  esc, money, num, toast, actionSheet, confirmSheet, sheet, chips, bindChips, readChips, stepper, bindSteppers, readStepper, haptic,
} from '../ui.js';
import { matchesForProperty, distanceKm, parseLocation, normalizePhone } from '../match.js';
import { importPhoto } from '../photo.js';
import { openEditor } from '../editor.js';
import { createMap, priceIcon, getPosition, DOHA } from '../map.js';
import {
  topbar, propertyCard, propertyTitle, statusPill, photoImg, hydrate, matchBlock, bindMatchActions,
  openNavigation, shareProperty, appointmentSheet, telLink, waLink, go, emptyState,
} from './common.js';
import { I } from '../icons.js';

// Filters survive navigation so the agent returns to the same list.
const ui = { q: '', deal: '', status: 'available', sort: 'new', view: 'list', here: null };

const shortPrice = (p) => {
  const n = +p.price || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return Math.round(n / 1e3) + 'K';
  return n || '—';
};

function filtered() {
  const q = ui.q.trim().toLowerCase();
  let list = state.properties.filter((p) => {
    if (ui.deal && p.deal !== ui.deal) return false;
    if (ui.status && (p.status || 'available') !== ui.status) return false;
    if (!q) return true;
    const hay = [propertyTitle(p), AREA[p.area]?.name, p.ownerName, p.ownerPhone, p.notes, p.description, p.building, p.price]
      .join(' ').toLowerCase();
    return hay.includes(q);
  });
  const by = {
    new: (a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''),
    priceAsc: (a, b) => (+a.price || 0) - (+b.price || 0),
    priceDesc: (a, b) => (+b.price || 0) - (+a.price || 0),
    near: (a, b) => (distanceKm(ui.here, a) ?? 1e9) - (distanceKm(ui.here, b) ?? 1e9),
  };
  return list.sort(by[ui.sort] || by.new);
}

const SORTS = { new: 'الأحدث', priceAsc: 'السعر ↑', priceDesc: 'السعر ↓', near: 'الأقرب لي' };

export function propertiesView() {
  const list = filtered();
  const count = (f) => state.properties.filter((p) => (p.status || 'available') === f).length;
  const html = `<div class="page">
    ${topbar('العقارات', {
      sub: `${state.properties.length} عقار`,
      actions: `<button type="button" class="icon-btn" data-toggle-view aria-label="${ui.view === 'map' ? 'قائمة' : 'خريطة'}">${ui.view === 'map' ? I.list : I.map}</button>
        <button type="button" class="icon-btn" data-go="#/property/new" aria-label="إضافة عقار" style="background:var(--brand);color:#fff">${I.plus}</button>`,
    })}
    <label class="search">${I.search}<input type="search" placeholder="ابحث بالمنطقة، المالك، السعر…" value="${esc(ui.q)}" data-q enterkeyhint="search"></label>
    <div class="filterbar">
      <button type="button" class="fchip ${ui.status === 'available' ? 'on' : ''}" data-status="available">متاح <span class="n">${count('available')}</span></button>
      <button type="button" class="fchip ${ui.status === 'reserved' ? 'on' : ''}" data-status="reserved">محجوز <span class="n">${count('reserved')}</span></button>
      <button type="button" class="fchip ${ui.status === 'closed' ? 'on' : ''}" data-status="closed">مغلق <span class="n">${count('closed')}</span></button>
      <button type="button" class="fchip ${ui.status === '' ? 'on' : ''}" data-status="">الكل</button>
      <span style="width:1px;background:var(--line);flex:none"></span>
      <button type="button" class="fchip ${ui.deal === 'rent' ? 'on' : ''}" data-deal="rent">إيجار</button>
      <button type="button" class="fchip ${ui.deal === 'sale' ? 'on' : ''}" data-deal="sale">بيع</button>
      <button type="button" class="fchip" data-sort>↕ ${SORTS[ui.sort]}</button>
    </div>
    <div data-results>${results(list)}</div>
  </div>`;

  return {
    html,
    mount(root, refresh) {
      const input = root.querySelector('[data-q]');
      input.addEventListener('input', () => {
        ui.q = input.value;
        root.querySelector('[data-results]').innerHTML = results(filtered());
        hydrate(root);
        if (ui.view === 'map') mountMap(root);
      });
      root.querySelectorAll('[data-status]').forEach((b) => (b.onclick = () => { ui.status = b.dataset.status; refresh(); }));
      root.querySelectorAll('[data-deal]').forEach((b) => (b.onclick = () => { ui.deal = ui.deal === b.dataset.deal ? '' : b.dataset.deal; refresh(); }));
      root.querySelector('[data-toggle-view]').onclick = () => { ui.view = ui.view === 'map' ? 'list' : 'map'; refresh(); };
      root.querySelector('[data-sort]').onclick = () =>
        actionSheet(
          Object.entries(SORTS).map(([k, label]) => ({
            icon: k === ui.sort ? '✓' : '',
            label,
            run: async () => {
              if (k === 'near') {
                try {
                  toast('جارٍ تحديد موقعك…');
                  ui.here = await getPosition();
                } catch {
                  return toast('تعذّر تحديد موقعك — فعّل خدمة الموقع');
                }
              }
              ui.sort = k;
              refresh();
            },
          })),
          'ترتيب حسب',
        );
      if (ui.view === 'map') mountMap(root);
    },
  };
}

function results(list) {
  if (ui.view === 'map') return `<div class="map" id="props-map"></div>`;
  if (!state.properties.length) {
    return emptyState('🏢', 'لا توجد عقارات بعد', 'أضف أول عقار مع صوره وموقعه، وسيقترح التطبيق العملاء المناسبين تلقائياً.',
      `<button type="button" class="btn btn-primary" data-go="#/property/new">+ إضافة عقار</button>`);
  }
  if (!list.length) return emptyState('🔍', 'لا نتائج', 'جرّب تغيير الفلاتر أو كلمة البحث.');
  return `<div class="list prop-grid">${list.map((p) => {
    const d = ui.sort === 'near' ? distanceKm(ui.here, p) : null;
    return propertyCard(p, d != null ? `<span class="pill info">${d < 1 ? Math.round(d * 1000) + ' م' : d.toFixed(1) + ' كم'}</span>` : '');
  }).join('')}</div>`;
}

let mapInst = null;
async function mountMap(root) {
  const el = root.querySelector('#props-map');
  if (!el) return;
  try {
    mapInst?.map.remove();
    mapInst = await createMap(el);
    const { L, map } = mapInst;
    const pts = [];
    for (const p of filtered()) {
      const ll = p.lat != null ? [p.lat, p.lng] : AREA[p.area] ? [AREA[p.area].lat, AREA[p.area].lng] : null;
      if (!ll) continue;
      pts.push(ll);
      L.marker(ll, { icon: priceIcon(L, shortPrice(p)) })
        .addTo(map)
        .bindPopup(`<b>${esc(propertyTitle(p))}</b><br>${esc(money(p.price, p.deal))}<br><a href="#/property/${p.id}">فتح التفاصيل ←</a>`);
    }
    if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 14 });
    if (ui.here) L.circleMarker([ui.here.lat, ui.here.lng], { radius: 8, color: '#2457a6', fillOpacity: 0.8 }).addTo(map);
  } catch {
    el.innerHTML = `<div class="empty">🗺️<p>تعذّر تحميل الخريطة — تحقق من الاتصال بالإنترنت.</p></div>`;
  }
}

// ---------------- Detail ----------------

export function propertyDetailView(id) {
  const p = get('properties', id);
  if (!p) return notFound();
  const matches = matchesForProperty(p, state.clients, 60, ACTIVE_STAGES);
  const nav = p.lat != null;
  const comm = p.deal === 'rent' ? +p.price || 0 : ((+p.price || 0) * (+state.settings.saleCommission || 0)) / 100;
  const appts = state.appointments.filter((a) => a.propertyId === p.id && !a.done).sort((a, b) => a.date.localeCompare(b.date));

  const html = `<div class="page">
    ${topbar('', {
      back: '#/properties',
      actions: `<button type="button" class="icon-btn" data-share aria-label="مشاركة">${I.share}</button>
                <button type="button" class="icon-btn" data-go="#/property/${p.id}/edit" aria-label="تعديل">${I.edit}</button>
                <button type="button" class="icon-btn" data-more aria-label="المزيد">${I.more}</button>`,
    })}
    <div class="gallery-wrap">
      ${p.photos?.length ? `<div class="gallery" data-gallery>${p.photos.map((ph, i) => `<button type="button" class="g-item" data-view="${i}" style="border:0;padding:0">${photoImg(ph, 'full')}</button>`).join('')}</div>
        ${p.photos.length > 1 ? `<div class="gallery-dots">${p.photos.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>` : ''}`
        : `<div class="gallery"><div class="gallery-empty" style="width:100%"><div><div style="font-size:44px">${TYPE[p.type]?.icon || '🏠'}</div>لا توجد صور بعد</div></div></div>`}
    </div>

    <div class="detail-head">
      <div class="row gap wrap">${statusPill(p)}<span class="pill brand">${p.deal === 'sale' ? 'للبيع' : 'للإيجار'}</span>${p.area ? `<span class="pill">📍 ${esc(AREA[p.area]?.name)}</span>` : ''}</div>
      <h2>${esc(propertyTitle(p))}</h2>
      <div class="price" style="font-size:24px">${money(p.price, p.deal)}</div>
    </div>

    <div class="contact-bar">
      <button type="button" data-nav><i>🧭</i>${nav ? 'التوجه' : 'حدد الموقع'}</button>
      <button type="button" data-appt><i>📅</i>معاينة</button>
      <button type="button" data-share><i>📤</i>مشاركة</button>
      <button type="button" data-photos><i>📷</i>الصور</button>
    </div>

    <div class="card">
      <div class="kv">
        <div><b class="num">${p.bedrooms || '—'}</b><span>غرف نوم</span></div>
        <div><b class="num">${p.bathrooms || '—'}</b><span>حمامات</span></div>
        <div><b class="num">${p.size ? num(p.size) : '—'}</b><span>م²</span></div>
      </div>
      <div class="row gap wrap mt">
        <span class="pill">${TYPE[p.type]?.icon || ''} ${esc(TYPE[p.type]?.name || '')}</span>
        ${p.furnishing ? `<span class="pill">🛋 ${esc(FURNISHING.find((f) => f.id === p.furnishing)?.name)}</span>` : ''}
        ${p.floor ? `<span class="pill">الطابق ${esc(p.floor)}</span>` : ''}
        ${p.building ? `<span class="pill">🏢 ${esc(p.building)}</span>` : ''}
      </div>
      ${p.features?.length ? `<div class="divider"></div><div class="tags">${p.features.map((f) => `<span class="pill ok">✓ ${esc(FEATURE[f]?.name)}</span>`).join('')}</div>` : ''}
      ${p.description ? `<div class="divider"></div><div class="notes">${esc(p.description)}</div>` : ''}
    </div>

    <div class="section-h"><h2>عملاء مناسبون <span class="pill ok">${matches.length}</span></h2></div>
    ${matches.length ? `<div class="list">${matches.slice(0, 8).map((m) => matchBlock(m, 'client')).join('')}</div>`
      : `<div class="card empty" style="padding:18px">لا يوجد عميل نشط يطابق هذا العقار حالياً.</div>`}

    ${appts.length ? `<div class="section-h"><h2>المواعيد القادمة</h2></div><div class="list">${appts.map((a) => `<div class="item"><div class="item-main"><div class="item-title">📅 ${esc(new Date(a.date).toLocaleString('ar-QA-u-nu-latn', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }))}</div><div class="item-sub">${esc(get('clients', a.clientId)?.name || '')}</div></div></div>`).join('')}</div>` : ''}

    <div class="section-h"><h2>المالك / المسؤول</h2></div>
    <div class="card">
      ${p.ownerName || p.ownerPhone ? `<div class="row gap">
        <div class="grow"><b>${esc(p.ownerName || 'المالك')}</b><div class="muted small num">${esc(p.ownerPhone || '')}</div></div>
        ${p.ownerPhone ? `<a class="icon-btn" href="${waLink(p.ownerPhone)}" target="_blank" rel="noopener" style="color:var(--wa)" aria-label="واتساب">💬</a>
        <a class="icon-btn" href="${telLink(p.ownerPhone)}" aria-label="اتصال">📞</a>` : ''}
      </div>` : `<span class="muted">لم تُضف بيانات المالك.</span>`}
      ${comm ? `<div class="divider"></div><div class="row"><span class="grow muted">العمولة المتوقعة</span><b>${money(comm)}</b></div>
        <div class="muted small">${p.deal === 'rent' ? 'تقدير: إيجار شهر واحد' : `تقدير: ${state.settings.saleCommission}% من سعر البيع`}</div>` : ''}
    </div>

    ${p.notes ? `<div class="section-h"><h2>ملاحظات خاصة</h2></div><div class="card notes">${esc(p.notes)}</div>` : ''}
    <p class="muted small" style="text-align:center">أُضيف ${esc(new Date(p.createdAt).toLocaleDateString('ar-QA-u-nu-latn'))}</p>
  </div>`;

  return {
    html,
    mount(root, refresh) {
      const gal = root.querySelector('[data-gallery]');
      if (gal) {
        const dots = root.querySelectorAll('.gallery-dots i');
        gal.addEventListener('scroll', () => {
          const i = Math.round(Math.abs(gal.scrollLeft) / gal.clientWidth);
          dots.forEach((d, j) => d.classList.toggle('on', i === j));
        }, { passive: true });
        gal.addEventListener('click', (e) => {
          const b = e.target.closest('[data-view]');
          if (b) viewer(p.photos, +b.dataset.view);
        });
      }
      root.querySelectorAll('[data-share]').forEach((b) => (b.onclick = () => shareProperty(p)));
      root.querySelector('[data-nav]').onclick = () => openNavigation(p);
      root.querySelector('[data-appt]').onclick = () => appointmentSheet({ propertyId: p.id, onSaved: refresh });
      root.querySelector('[data-photos]').onclick = () => photosSheet(p, refresh);
      bindMatchActions(root, refresh);
      root.querySelector('[data-more]').onclick = () =>
        actionSheet([
          ...PROPERTY_STATUS.filter((s) => s.id !== (p.status || 'available')).map((s) => ({
            icon: s.id === 'available' ? '🟢' : s.id === 'reserved' ? '🟠' : '⚫',
            label: `تغيير الحالة إلى: ${s.name}`,
            run: async () => { await save('properties', { ...p, status: s.id }); toast(`الحالة: ${s.name}`); refresh(); },
          })),
          { icon: '📄', label: 'نسخ كعقار جديد', run: async () => {
            const copy = await save('properties', { ...p, id: undefined, createdAt: undefined, photos: [], title: p.title ? p.title + ' (نسخة)' : '' });
            toast('تم إنشاء نسخة'); go(`#/property/${copy.id}/edit`);
          } },
          { icon: '🗑️', label: 'حذف العقار', danger: true, run: () => deleteProperty(p) },
        ], propertyTitle(p));
    },
  };
}

async function deleteProperty(p) {
  const ok = await confirmSheet(`حذف "${propertyTitle(p)}"؟`, { ok: 'حذف', danger: true });
  if (!ok) return;
  await remove('properties', p.id);
  go('#/properties');
  toast('تم حذف العقار', {
    label: 'تراجع',
    run: async () => { await save('properties', p); go(`#/property/${p.id}`); },
  });
  // Photos are removed only once the undo window has passed.
  setTimeout(() => { if (!get('properties', p.id)) (p.photos || []).forEach(deletePhoto); }, 6000);
}

function viewer(photos, start = 0) {
  const el = document.createElement('div');
  el.className = 'viewer';
  el.innerHTML = `<button type="button" class="icon-btn viewer-close" aria-label="إغلاق">${I.x}</button>
    <div class="gallery">${photos.map((ph) => `<div class="g-item">${photoImg(ph, 'full')}</div>`).join('')}</div>`;
  document.body.appendChild(el);
  hydrate(el);
  const g = el.querySelector('.gallery');
  requestAnimationFrame(() => g.children[start]?.scrollIntoView({ inline: 'center' }));
  history.pushState({ viewer: 1 }, '');
  const close = () => { el.remove(); window.removeEventListener('popstate', close); };
  window.addEventListener('popstate', close);
  el.querySelector('.viewer-close').onclick = () => history.back();
}

// ---------------- Photos ----------------

/** Photo grid editor used both in the form and via the detail page sheet. */
function photoGrid(ids) {
  return `<div class="photo-strip" data-photo-grid>
    ${ids.map((id, i) => `<button type="button" class="ph" data-ph="${id}">${photoImg(id)}${i === 0 ? '<span class="cover-tag">الغلاف</span>' : ''}</button>`).join('')}
    <label class="ph add"><i>＋</i>إضافة صور<input type="file" accept="image/*" multiple hidden data-add-photos></label>
  </div>`;
}

function bindPhotoGrid(container, getIds, setIds) {
  const rerender = () => {
    container.innerHTML = photoGrid(getIds());
    hydrate(container);
  };
  container.addEventListener('change', async (e) => {
    const input = e.target.closest('[data-add-photos]');
    if (!input || !input.files.length) return;
    const files = [...input.files];
    input.value = '';
    const grid = container.querySelector('[data-photo-grid]');
    const placeholders = files.map(() => {
      const b = document.createElement('div');
      b.className = 'ph busy';
      grid.insertBefore(b, grid.lastElementChild);
      return b;
    });
    const s = state.settings;
    const wm = s.watermark ? [s.agentName, s.agentPhone].filter(Boolean).join(' · ') : '';
    const ids = [...getIds()];
    for (const [i, f] of files.entries()) {
      try {
        const out = await importPhoto(f, { enhance: s.autoEnhance !== false, watermark: wm });
        ids.push(await savePhoto(out));
      } catch {
        toast('تعذّرت قراءة إحدى الصور');
      }
      placeholders[i].remove();
    }
    await setIds(ids);
    rerender();
    toast(s.autoEnhance !== false ? `✨ أُضيفت ${files.length} صورة وتم تحسينها تلقائياً` : `أُضيفت ${files.length} صورة`);
  });
  container.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ph]');
    if (!b) return;
    const id = b.dataset.ph;
    const ids = getIds();
    actionSheet([
      { icon: '✨', label: 'تحسين وتعديل الصورة', run: async () => { if (await openEditor(id)) rerender(); } },
      ...(ids[0] !== id ? [{ icon: '⭐', label: 'تعيين كصورة الغلاف', run: async () => { await setIds([id, ...ids.filter((x) => x !== id)]); rerender(); } }] : []),
      { icon: '🗑️', label: 'حذف الصورة', danger: true, run: async () => {
        await setIds(ids.filter((x) => x !== id));
        rerender();
        toast('تم حذف الصورة', { label: 'تراجع', run: async () => { await setIds(ids); rerender(); } });
        setTimeout(() => { if (!getIds().includes(id)) deletePhoto(id); }, 6000);
      } },
    ]);
  });
  rerender();
}

function photosSheet(p, refresh) {
  let cur = get('properties', p.id);
  sheet(`<p class="muted small" style="margin-top:0">تُحسَّن الصور تلقائياً عند الإضافة (إضاءة، ألوان، حدة). اضغط على أي صورة لتعديلها أو جعلها الغلاف.</p><div data-grid></div>
    <button type="button" class="btn btn-primary mt" style="width:100%" data-done>تم</button>`, {
    title: 'صور العقار',
    onMount(body, close) {
      bindPhotoGrid(body.querySelector('[data-grid]'), () => cur.photos || [], async (ids) => {
        cur = await save('properties', { ...cur, photos: ids });
      });
      body.querySelector('[data-done]').onclick = () => { close(); refresh(); };
      body.closest('.sheet-wrap').querySelector('.sheet-backdrop').addEventListener('click', refresh);
    },
  });
}

// ---------------- Form ----------------

export function propertyFormView(id) {
  const existing = id ? get('properties', id) : null;
  if (id && !existing) return notFound();
  const p = existing || { deal: 'rent', type: 'apartment', status: 'available', furnishing: '', features: [], photos: [], bedrooms: 2, bathrooms: 2 };
  let photos = [...(p.photos || [])];
  let loc = p.lat != null ? { lat: p.lat, lng: p.lng } : null;

  const html = `<div class="page">
    ${topbar(existing ? 'تعديل العقار' : 'عقار جديد', { back: existing ? `#/property/${p.id}` : '#/properties' })}
    <form class="form" novalidate autocomplete="off">
      <div class="field"><span class="label">نوع الصفقة</span>${chips('deal', DEALS, [p.deal], { multi: false }).replace('class="chips"', 'class="chips big"')}</div>
      <div class="field"><span class="label">نوع العقار</span>${chips('type', TYPES, [p.type], { multi: false })}</div>
      <div class="field"><label for="f-price">السعر <span class="muted small" data-price-hint>${p.deal === 'sale' ? '(إجمالي)' : '(شهرياً)'}</span></label>
        <div class="input-affix"><input id="f-price" class="input num" name="price" inputmode="numeric" placeholder="0" value="${p.price ? num(p.price) : ''}" style="text-align:right"><span class="affix">ر.ق</span></div>
        <div class="hint" data-price-words></div></div>
      <div class="field"><label for="f-area">المنطقة</label>
        <select id="f-area" class="input" name="area"><option value="">اختر المنطقة…</option>${AREAS.map((a) => `<option value="${a.id}" ${a.id === p.area ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></div>
      <div class="form-grid">${stepper('bedrooms', p.bedrooms, { label: 'غرف', max: 12 })}${stepper('bathrooms', p.bathrooms, { label: 'حمامات', max: 12 })}</div>
      <div class="form-grid">
        <div class="field"><label for="f-size">المساحة م²</label><input id="f-size" class="input num" name="size" inputmode="numeric" value="${esc(p.size || '')}"></div>
        <div class="field"><label for="f-floor">الطابق</label><input id="f-floor" class="input" name="floor" value="${esc(p.floor || '')}"></div>
      </div>
      <div class="field"><span class="label">الفرش</span>${chips('furnishing', FURNISHING, [p.furnishing], { multi: false })}</div>

      <div class="field"><span class="label">الصور</span><div data-photos></div>
        <div class="hint">✨ تُحسَّن تلقائياً: إضاءة الغرف الداخلية، توازن الألوان والحدة${state.settings.watermark && state.settings.agentName ? '، مع علامة باسمك' : ''}.</div></div>

      <div class="field"><span class="label">الموقع</span>
        <div class="card" style="margin:0;padding:12px">
          <div data-loc-status class="small" style="margin-bottom:10px"></div>
          <div class="row gap wrap">
            <button type="button" class="btn btn-sm btn-outline" data-loc-here>📍 أنا في العقار الآن</button>
            <button type="button" class="btn btn-sm btn-outline" data-loc-map>🗺️ على الخريطة</button>
            <button type="button" class="btn btn-sm btn-outline" data-loc-paste>🔗 لصق رابط</button>
          </div>
        </div></div>

      <div class="field"><span class="label">المزايا</span>${chips('features', FEATURES, p.features || [])}</div>
      <div class="field"><span class="label">الحالة</span>${chips('status', PROPERTY_STATUS, [p.status || 'available'], { multi: false })}</div>

      <div class="field"><label for="f-oname">المالك / المسؤول</label>
        <div class="input-group"><input id="f-oname" class="input" name="ownerName" placeholder="الاسم" value="${esc(p.ownerName || '')}">
        <input class="input num" name="ownerPhone" type="tel" inputmode="tel" placeholder="رقم الجوال" value="${esc(p.ownerPhone || '')}" aria-label="رقم المالك"></div></div>

      <details class="more" ${existing && (p.title || p.description || p.notes || p.building) ? 'open' : ''}>
        <summary>+ تفاصيل إضافية (عنوان، وصف، ملاحظات)</summary>
        <div class="form">
          <div class="field"><label for="f-title">عنوان الإعلان</label><input id="f-title" class="input" name="title" value="${esc(p.title || '')}" placeholder="يُنشأ تلقائياً إن تُرك فارغاً"></div>
          <div class="field"><label for="f-bld">اسم البرج / الكمباوند</label><input id="f-bld" class="input" name="building" value="${esc(p.building || '')}"></div>
          <div class="field"><label for="f-desc">الوصف (يظهر عند المشاركة)</label><textarea id="f-desc" class="input" name="description" rows="3">${esc(p.description || '')}</textarea></div>
          <div class="field"><label for="f-notes">ملاحظات خاصة (لا تُشارك)</label><textarea id="f-notes" class="input" name="notes" rows="3" placeholder="مثال: المفتاح عند الحارس، يقبل شيكات 12">${esc(p.notes || '')}</textarea></div>
        </div>
      </details>

      <div class="save-bar"><button type="submit" class="btn btn-primary grow">${existing ? 'حفظ التعديلات' : 'حفظ العقار'}</button></div>
    </form>
  </div>`;

  return {
    html,
    form: true,
    mount(root) {
      const form = root.querySelector('form');
      bindChips(root);
      bindSteppers(root);
      bindPhotoGrid(root.querySelector('[data-photos]'), () => photos, async (ids) => { photos = ids; });

      const priceInput = form.price;
      const words = root.querySelector('[data-price-words]');
      const showPrice = () => {
        const n = +priceInput.value.replace(/\D/g, '');
        words.textContent = n ? money(n, readChips(root, 'deal')[0]) : '';
      };
      priceInput.addEventListener('input', () => {
        const digits = priceInput.value.replace(/[^\d٠-٩]/g, '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
        priceInput.value = digits ? num(digits) : '';
        showPrice();
      });
      root.querySelector('[data-chips="deal"]').addEventListener('change', () => {
        root.querySelector('[data-price-hint]').textContent = readChips(root, 'deal')[0] === 'sale' ? '(إجمالي)' : '(شهرياً)';
        showPrice();
      });
      showPrice();

      const locStatus = root.querySelector('[data-loc-status]');
      const renderLoc = () => {
        locStatus.innerHTML = loc
          ? `<span class="pill ok">✓ تم تحديد الموقع</span> <span class="muted num">${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}</span> <button type="button" class="link-btn" data-loc-clear>إزالة</button>`
          : `<span class="pill warn">لم يُحدد</span> <span class="muted">حدده لتتمكن من التوجه إليه بضغطة واحدة</span>`;
      };
      renderLoc();
      locStatus.addEventListener('click', (e) => { if (e.target.closest('[data-loc-clear]')) { loc = null; renderLoc(); } });
      root.querySelector('[data-loc-here]').onclick = async (e) => {
        const b = e.currentTarget;
        b.disabled = true;
        b.textContent = '…جارٍ التحديد';
        try {
          loc = await getPosition();
          renderLoc();
          toast(`تم حفظ موقعك (دقة ${Math.round(loc.acc)} م)`);
          delete loc.acc;
        } catch {
          toast('تعذّر تحديد الموقع — تأكد من السماح للتطبيق');
        }
        b.disabled = false;
        b.textContent = '📍 أنا في العقار الآن';
      };
      root.querySelector('[data-loc-paste]').onclick = async () => {
        let text = '';
        try { text = await navigator.clipboard.readText(); } catch { /* permission denied */ }
        const parsed = parseLocation(text);
        if (parsed) { loc = parsed; renderLoc(); return toast('تم أخذ الموقع من الرابط'); }
        sheet(`<div class="form" style="padding:0"><div class="field"><label for="loc-link">الصق رابط خرائط Google أو الإحداثيات</label>
          <input id="loc-link" class="input" dir="ltr" placeholder="https://maps.google.com/…  أو 25.28, 51.53"></div>
          <div class="hint">روابط maps.app.goo.gl المختصرة: افتحها أولاً ثم انسخ الرابط الكامل، أو استخدم "على الخريطة".</div>
          <button type="button" class="btn btn-primary" data-ok>استخدام</button></div>`, {
          title: 'رابط الموقع',
          onMount(body, close) {
            body.querySelector('[data-ok]').onclick = () => {
              const v = parseLocation(body.querySelector('input').value);
              if (!v) return toast('لم أتعرف على الإحداثيات في الرابط');
              loc = v; renderLoc(); close();
            };
          },
        });
      };
      root.querySelector('[data-loc-map]').onclick = () =>
        pickOnMap(loc || (AREA[form.area.value] && { lat: AREA[form.area.value].lat, lng: AREA[form.area.value].lng }), (v) => { loc = v; renderLoc(); });

      let dirty = false;
      form.addEventListener('input', () => (dirty = true));
      form.addEventListener('change', () => (dirty = true));
      root.dataset.dirtyCheck = '1';
      root.isDirty = () => dirty || photos.join() !== (p.photos || []).join();

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const price = +form.price.value.replace(/\D/g, '');
        if (!price) {
          form.price.classList.add('invalid');
          form.price.focus();
          return toast('أدخل السعر');
        }
        const rec = await save('properties', {
          ...p,
          deal: readChips(root, 'deal')[0] || 'rent',
          type: readChips(root, 'type')[0] || 'apartment',
          price,
          area: form.area.value,
          bedrooms: readStepper(root, 'bedrooms'),
          bathrooms: readStepper(root, 'bathrooms'),
          size: +form.size.value.replace(/\D/g, '') || '',
          floor: form.floor.value.trim(),
          furnishing: readChips(root, 'furnishing')[0] || '',
          features: readChips(root, 'features'),
          status: readChips(root, 'status')[0] || 'available',
          ownerName: form.ownerName.value.trim(),
          ownerPhone: form.ownerPhone.value.trim() ? normalizePhone(form.ownerPhone.value) : '',
          title: form.title.value.trim(),
          building: form.building.value.trim(),
          description: form.description.value.trim(),
          notes: form.notes.value.trim(),
          photos,
          lat: loc?.lat ?? null,
          lng: loc?.lng ?? null,
        });
        root.isDirty = () => false;
        haptic(20);
        const n = matchesForProperty(rec, state.clients, 60, ACTIVE_STAGES).length;
        toast(n ? `تم الحفظ — ${n} عميل مناسب لهذا العقار 🎯` : 'تم حفظ العقار');
        location.replace(`#/property/${rec.id}`);
      });
    },
  };
}

function pickOnMap(start, onPick) {
  const center = start ? [start.lat, start.lng] : DOHA;
  let chosen = start || null;
  sheet(`<div class="map-pick" id="pick-map"></div>
    <p class="muted small">اضغط على موقع العقار في الخريطة.</p>
    <div class="row gap"><button type="button" class="btn btn-outline" data-me>📍 موقعي</button>
    <button type="button" class="btn btn-primary grow" data-ok>تأكيد الموقع</button></div>`, {
    title: 'حدد موقع العقار',
    async onMount(body, close) {
      try {
        const { L, map } = await createMap(body.querySelector('#pick-map'), { center, zoom: start ? 16 : 12 });
        let marker = chosen ? L.marker(center).addTo(map) : null;
        const set = (ll) => {
          chosen = { lat: +ll.lat.toFixed(6), lng: +ll.lng.toFixed(6) };
          if (marker) marker.setLatLng(ll); else marker = L.marker(ll).addTo(map);
          haptic(8);
        };
        map.on('click', (e) => set(e.latlng));
        setTimeout(() => map.invalidateSize(), 300);
        body.querySelector('[data-me]').onclick = async () => {
          try {
            const p = await getPosition();
            map.setView([p.lat, p.lng], 17);
            set({ lat: p.lat, lng: p.lng });
          } catch { toast('تعذّر تحديد موقعك'); }
        };
      } catch {
        body.querySelector('#pick-map').innerHTML = '<div class="empty">تعذّر تحميل الخريطة</div>';
      }
      body.querySelector('[data-ok]').onclick = () => {
        if (!chosen) return toast('اضغط على الخريطة لتحديد الموقع');
        onPick(chosen);
        close();
      };
    },
  });
}

function notFound() {
  return { html: `<div class="page">${topbar('غير موجود', { back: '#/properties' })}${emptyState('🤷', 'العقار غير موجود', 'ربما تم حذفه.')}</div>` };
}
