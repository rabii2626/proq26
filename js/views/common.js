import { state, save, get, photoUrl, getPhoto } from '../db.js';
import { AREA, TYPE, FURN, FEATURE, DEAL, PSTATUS, STAGE, APPT, APPT_TYPES } from '../data.js';
import { esc, money, sheet, actionSheet, toast, chips, bindChips, readChips, localInput, initials, avatarColor, relDay, fmtTime, haptic } from '../ui.js';
import { normalizePhone } from '../match.js';
import { I } from '../icons.js';

export const go = (hash) => { location.hash = hash; };

export function topbar(title, { back, actions = '', sub = '' } = {}) {
  return `<header class="topbar">
    ${back ? `<button type="button" class="icon-btn back-btn" data-back="${esc(back)}" aria-label="رجوع">${I.back}</button>` : ''}
    <h1>${esc(title)}${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</h1>
    ${actions}
  </header>`;
}

export function propertyTitle(p) {
  const t = TYPE[p.type]?.name || 'عقار';
  const d = p.deal === 'sale' ? 'للبيع' : 'للإيجار';
  return p.title?.trim() || `${t} ${d}${p.area ? ' - ' + (AREA[p.area]?.name || '') : ''}`;
}

export function propertyFacts(p) {
  const out = [];
  if (p.bedrooms) out.push(`🛏 ${p.bedrooms}`);
  if (p.bathrooms) out.push(`🛁 ${p.bathrooms}`);
  if (p.size) out.push(`📐 ${p.size} م²`);
  if (p.furnishing) out.push(FURN[p.furnishing]?.name);
  return out.filter(Boolean);
}

export function statusPill(p) {
  const s = PSTATUS[p.status || 'available'];
  return `<span class="pill ${s.tone}">${esc(s.name)}</span>`;
}

export function stagePill(c) {
  const s = STAGE[c.stage || 'new'];
  return `<span class="pill ${s.tone}">${esc(s.name)}</span>`;
}

export const photoImg = (id, kind = 'thumb', alt = '') =>
  id ? `<img data-photo="${esc(id)}" data-kind="${kind}" alt="${esc(alt)}" loading="lazy" decoding="async">` : '';

/** Fill <img data-photo> elements with object URLs from IndexedDB. */
export function hydrate(root) {
  root.querySelectorAll('img[data-photo]:not([src])').forEach(async (img) => {
    img.src = await photoUrl(img.dataset.photo, img.dataset.kind || 'thumb');
  });
}

export function propertyCard(p, extra = '') {
  const cover = p.photos?.[0];
  return `<a class="prop-card" href="#/property/${p.id}">
    <div class="cover">${cover ? photoImg(cover, 'thumb', propertyTitle(p)) : TYPE[p.type]?.icon || '🏠'}
      ${statusPill(p)}
      ${p.photos?.length > 1 ? `<span class="count">📷 ${p.photos.length}</span>` : ''}
    </div>
    <div class="body">
      <div class="row gap"><div class="price grow">${money(p.price, p.deal)}</div>${extra}</div>
      <div class="item-title">${esc(propertyTitle(p))}</div>
      <div class="facts">${propertyFacts(p).map((f) => `<span>${esc(f)}</span>`).join('')}</div>
    </div>
  </a>`;
}

export function propertyRow(p, side = '') {
  const cover = p.photos?.[0];
  return `<div class="item" data-href="#/property/${p.id}" role="link" tabindex="0">
    <div class="thumb">${cover ? photoImg(cover) : TYPE[p.type]?.icon || '🏠'}</div>
    <div class="item-main">
      <div class="item-title">${esc(propertyTitle(p))}</div>
      <div class="price" style="font-size:15px">${money(p.price, p.deal)}</div>
      <div class="item-sub">${esc(propertyFacts(p).join(' · '))}</div>
    </div>
    ${side}
  </div>`;
}

export function clientRow(c, side = '') {
  const want = [c.deal ? DEAL[c.deal]?.name : '', (c.types || []).map((t) => TYPE[t]?.name).join('/'), c.bedrooms ? `${c.bedrooms}+ غرف` : '']
    .filter(Boolean).join(' · ');
  const follow = c.nextFollowUp && ['new', 'contacted', 'viewing', 'negotiation'].includes(c.stage)
    ? followPill(c.nextFollowUp) : '';
  return `<div class="item" data-href="#/client/${c.id}" role="link" tabindex="0">
    <div class="avatar" style="background:${avatarColor(c.id)}">${esc(initials(c.name))}</div>
    <div class="item-main">
      <div class="item-title">${esc(c.name || 'بدون اسم')}</div>
      <div class="item-sub">${esc(want || 'لم تُحدَّد الطلبات')}${c.budgetMax ? ' · حتى ' + esc(money(c.budgetMax)) : ''}</div>
      <div class="item-meta">${stagePill(c)}${follow}</div>
    </div>
    ${side}
  </div>`;
}

export function followPill(date) {
  const d = new Date(date);
  const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);
  const tone = diff < 0 ? 'danger' : diff === 0 ? 'warn' : 'mute';
  const label = diff < 0 ? `متأخر ${-diff} يوم` : `متابعة ${relDay(d)}`;
  return `<span class="pill ${tone}">⏰ ${esc(label)}</span>`;
}

export function scoreRing(score) {
  const c = score >= 85 ? 'var(--ok)' : score >= 70 ? 'var(--info)' : 'var(--warn)';
  return `<div class="score" style="--s:${score};--sc:${c}"><span class="num">${score}%</span></div>`;
}

export function whyPills(m) {
  return `<div class="why">${m.good.map((g) => `<span class="pill ok">✓ ${esc(g)}</span>`).join('')}${m.bad
    .map((b) => `<span class="pill warn">${esc(b)}</span>`).join('')}</div>`;
}

/** A match card. show: 'property' (on a client page) or 'client' (on a property page). */
export function matchBlock(m, show = 'property') {
  const key = `${m.client.id}|${m.property.id}`;
  const sent = (m.client.sent || []).includes(m.property.id);
  const side = `<div class="item-side">${scoreRing(m.score)}</div>`;
  return `<div class="match">
    ${show === 'property' ? propertyRow(m.property, side) : clientRow(m.client, side)}
    ${whyPills(m)}
    <div class="match-actions">
      <button type="button" class="btn btn-sm btn-ghost" data-dismiss="${key}">✕ غير مناسب</button>
      <button type="button" class="btn btn-sm grow ${sent ? 'btn-outline' : 'btn-wa'}" data-send="${key}">${sent ? '✓ أُرسل · إرسال مجدداً' : '💬 إرسال للعميل'}</button>
    </div>
  </div>`;
}

export function bindMatchActions(root, refresh) {
  root.addEventListener('click', async (e) => {
    const send = e.target.closest('[data-send]');
    if (send) {
      const [cid, pid] = send.dataset.send.split('|');
      shareProperty(get('properties', pid), get('clients', cid));
      return;
    }
    const dis = e.target.closest('[data-dismiss]');
    if (!dis) return;
    const [cid, pid] = dis.dataset.dismiss.split('|');
    const c = get('clients', cid);
    await save('clients', { ...c, dismissed: [...(c.dismissed || []), pid] });
    haptic(10);
    refresh();
    toast('تم الاستبعاد من الاقتراحات', {
      label: 'تراجع',
      run: async () => {
        const x = get('clients', cid);
        await save('clients', { ...x, dismissed: (x.dismissed || []).filter((d) => d !== pid) });
        refresh();
      },
    });
  });
}

// ---- Contact helpers ----
export const telLink = (phone) => `tel:+${normalizePhone(phone)}`;
export const waLink = (phone, text = '') =>
  `https://wa.me/${normalizePhone(phone)}${text ? '?text=' + encodeURIComponent(text) : ''}`;

export function navLinks(p) {
  if (p.lat == null || p.lng == null) return null;
  const ll = `${p.lat},${p.lng}`;
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${ll}&travelmode=driving`,
    waze: `https://waze.com/ul?ll=${ll}&navigate=yes`,
    apple: `https://maps.apple.com/?daddr=${ll}`,
    view: `https://maps.google.com/?q=${ll}`,
  };
}

export function openNavigation(p) {
  const links = navLinks(p);
  if (!links) {
    toast('لم يُحدَّد موقع هذا العقار بعد');
    go(`#/property/${p.id}/edit`);
    return;
  }
  actionSheet(
    [
      { icon: '🗺️', label: 'خرائط Google', run: () => window.open(links.google, '_blank') },
      { icon: '🚙', label: 'Waze', run: () => window.open(links.waze, '_blank') },
      { icon: '🍎', label: 'خرائط Apple', run: () => window.open(links.apple, '_blank') },
    ],
    'التوجه إلى العقار',
  );
}

/** Google Maps multi-stop route through properties in order, starting from current location. */
export function routeUrl(properties) {
  const pts = properties.filter((p) => p.lat != null).map((p) => `${p.lat},${p.lng}`);
  if (!pts.length) return null;
  const dest = pts.pop();
  const wp = pts.length ? '&waypoints=' + encodeURIComponent(pts.join('|')) : '';
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}${wp}&travelmode=driving`;
}

// ---- Sharing ----
export function propertyMessage(p, client) {
  const s = state.settings;
  const lines = [];
  if (client?.name) lines.push(`مرحباً ${client.name.split(' ')[0]} 👋`, 'وجدت لك عقاراً مناسباً لطلبك:', '');
  lines.push(`${TYPE[p.type]?.icon || '🏠'} *${propertyTitle(p)}*`);
  lines.push(`💰 ${money(p.price, p.deal)}`);
  const facts = [];
  if (p.bedrooms) facts.push(`${p.bedrooms} غرف نوم`);
  if (p.bathrooms) facts.push(`${p.bathrooms} حمام`);
  if (p.size) facts.push(`${p.size} م²`);
  if (facts.length) lines.push('📐 ' + facts.join(' · '));
  if (p.furnishing) lines.push(`🛋️ ${FURN[p.furnishing]?.name}`);
  if (p.features?.length) lines.push('✨ ' + p.features.map((f) => FEATURE[f]?.name).filter(Boolean).join('، '));
  if (p.description) lines.push('', p.description);
  const nav = navLinks(p);
  if (nav) lines.push('', `📍 الموقع: ${nav.view}`);
  if (s.agentName || s.agentPhone) {
    lines.push('', '—', [s.agentName, s.agency].filter(Boolean).join(' | '));
    if (s.agentPhone) lines.push(`📞 +${normalizePhone(s.agentPhone)}`);
  }
  return lines.join('\n');
}

async function photoFiles(p, max = 10) {
  const files = [];
  for (const id of (p.photos || []).slice(0, max)) {
    const rec = await getPhoto(id);
    if (rec?.blob) files.push(new File([rec.blob], `${id}.jpg`, { type: 'image/jpeg' }));
  }
  return files;
}

export async function logSent(client, p) {
  const sent = new Set(client.sent || []);
  sent.add(p.id);
  const log = [{ at: new Date().toISOString(), text: `أُرسل له: ${propertyTitle(p)}` }, ...(client.log || [])];
  const stage = client.stage === 'new' ? 'contacted' : client.stage;
  await save('clients', { ...client, sent: [...sent], log, stage });
}

/** Share a property: to a specific client on WhatsApp, or via the OS share sheet with photos. */
export function shareProperty(p, client) {
  const text = propertyMessage(p, client);
  const items = [];
  if (client?.phone) {
    items.push({
      icon: '💬',
      label: `واتساب إلى ${client.name}`,
      run: async () => {
        window.open(waLink(client.phone, text), '_blank');
        await logSent(client, p);
      },
    });
  }
  if (p.photos?.length && navigator.canShare) {
    items.push({
      icon: '🖼️',
      label: `مشاركة مع الصور (${p.photos.length})`,
      run: async () => {
        try {
          const files = await photoFiles(p);
          const data = { text, files };
          if (!navigator.canShare(data)) delete data.files;
          await navigator.share(data);
          if (client) await logSent(client, p);
        } catch (e) {
          if (e.name !== 'AbortError') toast('تعذّرت المشاركة');
        }
      },
    });
  }
  if (!client) {
    items.push({ icon: '💬', label: 'واتساب (اختيار جهة اتصال)', run: () => window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank') });
  }
  items.push({
    icon: '📋',
    label: 'نسخ الوصف',
    run: async () => {
      await navigator.clipboard?.writeText(text);
      toast('تم نسخ الوصف');
    },
  });
  actionSheet(items, 'مشاركة العقار');
}

// ---- Appointment sheet ----
export function appointmentSheet({ appt, clientId, propertyId, onSaved } = {}) {
  const a = appt || {};
  const base = a.date ? new Date(a.date) : nextSlot();
  const clients = [...state.clients].sort((x, y) => (x.name || '').localeCompare(y.name || '', 'ar'));
  const props = state.properties.filter((p) => p.status !== 'closed' || p.id === (a.propertyId || propertyId));
  const cId = a.clientId || clientId || '';
  const pId = a.propertyId || propertyId || '';
  const html = `<form class="form" style="padding-bottom:0" novalidate>
    ${chips('type', APPT_TYPES, [a.type || 'viewing'], { multi: false })}
    <div class="form-grid">
      <div class="field"><label for="ap-date">اليوم</label><input id="ap-date" class="input" type="date" name="date" value="${localInput(base)}" required></div>
      <div class="field"><label for="ap-time">الساعة</label><input id="ap-time" class="input" type="time" name="time" value="${localInput(base, true).slice(11)}" required></div>
    </div>
    <div class="chips" data-quick-day>
      <button type="button" class="chip" data-d="0">اليوم</button>
      <button type="button" class="chip" data-d="1">غداً</button>
      <button type="button" class="chip" data-d="2">بعد غد</button>
    </div>
    <div class="field"><label for="ap-client">العميل</label>
      <select id="ap-client" class="input" name="clientId"><option value="">— بدون —</option>${clients
        .map((c) => `<option value="${c.id}" ${c.id === cId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
    <div class="field"><label for="ap-prop">العقار</label>
      <select id="ap-prop" class="input" name="propertyId"><option value="">— بدون —</option>${props
        .map((p) => `<option value="${p.id}" ${p.id === pId ? 'selected' : ''}>${esc(propertyTitle(p))}</option>`).join('')}</select></div>
    <div class="field"><label for="ap-note">ملاحظة</label><input id="ap-note" class="input" name="note" value="${esc(a.note || '')}" placeholder="مثال: إحضار المفتاح من الحارس"></div>
    <button class="btn btn-primary" type="submit">${a.id ? 'حفظ التعديل' : 'إضافة الموعد'}</button>
  </form>`;
  sheet(html, {
    title: a.id ? 'تعديل الموعد' : 'موعد جديد',
    onMount(body, close) {
      const form = body.querySelector('form');
      bindChips(body);
      body.querySelector('[data-quick-day]').addEventListener('click', (e) => {
        const b = e.target.closest('[data-d]');
        if (!b) return;
        const d = new Date();
        d.setDate(d.getDate() + +b.dataset.d);
        form.date.value = localInput(d);
        haptic(5);
      });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!form.date.value || !form.time.value) return toast('حدد اليوم والساعة');
        const date = new Date(`${form.date.value}T${form.time.value}`).toISOString();
        const rec = await save('appointments', {
          ...a,
          type: readChips(body, 'type')[0] || 'viewing',
          date,
          clientId: form.clientId.value,
          propertyId: form.propertyId.value,
          note: form.note.value.trim(),
          done: a.done || false,
        });
        // Move the client along the pipeline when a viewing is booked.
        const c = get('clients', rec.clientId);
        if (c && rec.type === 'viewing' && ['new', 'contacted'].includes(c.stage)) {
          await save('clients', { ...c, stage: 'viewing', log: [{ at: new Date().toISOString(), text: `حُجزت معاينة ${relDay(date)} ${fmtTime(date)}` }, ...(c.log || [])] });
        }
        close();
        toast(a.id ? 'تم تعديل الموعد' : 'تمت إضافة الموعد');
        onSaved?.(rec);
      });
    },
  });
}

function nextSlot() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

export function apptRow(a, { showDay = false } = {}) {
  const c = get('clients', a.clientId);
  const p = get('properties', a.propertyId);
  const t = APPT[a.type] || APPT.viewing;
  const title = [t.name, c?.name].filter(Boolean).join(' مع ');
  return `<div class="appt ${a.done ? 'done' : ''}" data-appt="${a.id}">
    <div class="appt-time num">${fmtTime(a.date)}${showDay ? `<small>${esc(relDay(a.date))}</small>` : ''}</div>
    <div class="item" data-open-appt="${a.id}">
      <div class="item-main">
        <div class="item-title">${t.icon} ${esc(title)}</div>
        ${p ? `<div class="item-sub">📍 ${esc(propertyTitle(p))}</div>` : ''}
        ${a.note ? `<div class="item-sub">📝 ${esc(a.note)}</div>` : ''}
      </div>
      <button type="button" class="check ${a.done ? 'on' : ''}" data-toggle-appt="${a.id}" aria-label="تم">${a.done ? '✓' : ''}</button>
    </div>
  </div>`;
}

/** Shared handlers for appointment rows (toggle done, action sheet). */
export function bindAppointments(root, refresh) {
  root.addEventListener('click', async (e) => {
    const tog = e.target.closest('[data-toggle-appt]');
    if (tog) {
      e.stopPropagation();
      const a = get('appointments', tog.dataset.toggleAppt);
      await save('appointments', { ...a, done: !a.done });
      haptic(15);
      refresh();
      return;
    }
    const open = e.target.closest('[data-open-appt]');
    if (!open) return;
    const a = get('appointments', open.dataset.openAppt);
    const c = get('clients', a.clientId);
    const p = get('properties', a.propertyId);
    const items = [];
    if (p) items.push({ icon: '🧭', label: 'التوجه إلى العقار', run: () => openNavigation(p) });
    if (c?.phone) {
      items.push({ icon: '📞', label: `اتصال بـ ${c.name}`, run: () => (location.href = telLink(c.phone)) });
      items.push({
        icon: '💬',
        label: 'تذكير العميل على واتساب',
        run: () => window.open(waLink(c.phone, reminderText(a, c, p)), '_blank'),
      });
    }
    if (p?.ownerPhone) {
      items.push({ icon: '🔑', label: 'إبلاغ المالك / الحارس', run: () => window.open(waLink(p.ownerPhone, ownerText(a, c, p)), '_blank') });
    }
    items.push({ icon: '✏️', label: 'تعديل الموعد', run: () => appointmentSheet({ appt: a, onSaved: refresh }) });
    if (c) items.push({ icon: '👤', label: 'ملف العميل', run: () => go(`#/client/${c.id}`) });
    if (p) items.push({ icon: '🏢', label: 'صفحة العقار', run: () => go(`#/property/${p.id}`) });
    items.push({
      icon: '🗑️',
      label: 'حذف الموعد',
      danger: true,
      run: async () => {
        const { remove } = await import('../db.js');
        await remove('appointments', a.id);
        refresh();
        toast('تم حذف الموعد', { label: 'تراجع', run: async () => { await save('appointments', a); refresh(); } });
      },
    });
    actionSheet(items, `${APPT[a.type]?.name || 'موعد'} · ${relDay(a.date)} ${fmtTime(a.date)}`);
  });
}

function reminderText(a, c, p) {
  const s = state.settings;
  let t = `مرحباً ${c.name.split(' ')[0]}، تذكير بموعد ${APPT[a.type]?.name || 'الموعد'} ${relDay(a.date)} الساعة ${fmtTime(a.date)}`;
  if (p) {
    t += ` - ${propertyTitle(p)}`;
    const n = navLinks(p);
    if (n) t += `\n📍 ${n.view}`;
  }
  if (s.agentName) t += `\n${s.agentName}`;
  return t;
}

function ownerText(a, c, p) {
  return `مرحباً، لدي معاينة للعقار (${propertyTitle(p)}) ${relDay(a.date)} الساعة ${fmtTime(a.date)}${c ? ' مع عميل' : ''}. يرجى التأكيد 🙏`;
}

export function emptyState(icon, title, text, btn = '') {
  return `<div class="empty"><div class="big">${icon}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${btn}</div>`;
}
