import { state, get, save, remove } from '../db.js';
import {
  AREAS, AREA, TYPES, TYPE, FEATURES, FEATURE, FURNISHING, FURN, STAGES, STAGE, ACTIVE_STAGES, SOURCES,
} from '../data.js';
import {
  esc, money, num, toast, actionSheet, confirmSheet, chips, bindChips, readChips, stepper, bindSteppers, readStepper,
  localInput, dayDiff, relDay, ago, initials, avatarColor, haptic,
} from '../ui.js';
import { matchesForClient, normalizePhone } from '../match.js';
import {
  topbar, clientRow, matchBlock, bindMatchActions, appointmentSheet, telLink, waLink, go, emptyState,
  followPill,
} from './common.js';
import { I } from '../icons.js';

const ui = { q: '', f: 'active' };

function filtered() {
  const q = ui.q.trim().toLowerCase();
  return state.clients
    .filter((c) => {
      const st = c.stage || 'new';
      if (ui.f === 'active' && !ACTIVE_STAGES.includes(st)) return false;
      if (ui.f === 'follow' && !(ACTIVE_STAGES.includes(st) && c.nextFollowUp && dayDiff(c.nextFollowUp) <= 0)) return false;
      if (STAGE[ui.f] && st !== ui.f) return false;
      if (!q) return true;
      return [c.name, c.phone, c.nationality, c.notes, c.source].join(' ').toLowerCase().includes(q);
    })
    .sort((a, b) => {
      // Overdue follow-ups first, then most recently touched.
      const fa = a.nextFollowUp ? dayDiff(a.nextFollowUp) : 99;
      const fb = b.nextFollowUp ? dayDiff(b.nextFollowUp) : 99;
      if (fa <= 0 || fb <= 0) return fa - fb;
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    });
}

export function clientsView(params) {
  if (params.get('f')) ui.f = params.get('f');
  const list = filtered();
  const cnt = (fn) => state.clients.filter(fn).length;
  const filters = [
    { id: 'active', name: 'النشطون', n: cnt((c) => ACTIVE_STAGES.includes(c.stage || 'new')) },
    { id: 'follow', name: '⏰ متابعة', n: cnt((c) => ACTIVE_STAGES.includes(c.stage || 'new') && c.nextFollowUp && dayDiff(c.nextFollowUp) <= 0) },
    ...STAGES.map((s) => ({ id: s.id, name: s.name, n: cnt((c) => (c.stage || 'new') === s.id) })),
    { id: 'all', name: 'الكل', n: state.clients.length },
  ];
  const html = `<div class="page">
    ${topbar('العملاء', {
      sub: `${state.clients.length} عميل`,
      actions: `<button type="button" class="icon-btn" data-go="#/client/new" aria-label="إضافة عميل" style="background:var(--brand);color:#fff">${I.plus}</button>`,
    })}
    <label class="search">${I.search}<input type="search" placeholder="ابحث بالاسم أو الرقم…" value="${esc(ui.q)}" data-q enterkeyhint="search"></label>
    <div class="filterbar">${filters.map((f) => `<button type="button" class="fchip ${ui.f === f.id ? 'on' : ''}" data-f="${f.id}">${esc(f.name)} <span class="n">${f.n}</span></button>`).join('')}</div>
    <div class="list" data-results>${results(list)}</div>
  </div>`;
  return {
    html,
    mount(root, refresh) {
      const input = root.querySelector('[data-q]');
      input.addEventListener('input', () => {
        ui.q = input.value;
        root.querySelector('[data-results]').innerHTML = results(filtered());
      });
      root.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => {
        ui.f = b.dataset.f;
        history.replaceState(null, '', '#/clients');
        refresh();
      }));
    },
  };
}

function results(list) {
  if (!state.clients.length) {
    return emptyState('👥', 'لا يوجد عملاء بعد', 'أضف عميلاً مع طلباته (المنطقة، الميزانية، عدد الغرف) وسأجد له العقارات المناسبة.',
      `<button type="button" class="btn btn-primary" data-go="#/client/new">+ إضافة عميل</button>`);
  }
  if (!list.length) return emptyState('🔍', 'لا نتائج', 'لا يوجد عملاء في هذا التصنيف.');
  return list.map((c) => clientRow(c, contactSide(c))).join('');
}

function contactSide(c) {
  const n = matchesForClient(c, state.properties).filter((m) => !(c.sent || []).includes(m.property.id)).length;
  return `<div class="item-side">
    ${n && ACTIVE_STAGES.includes(c.stage || 'new') ? `<span class="pill ok">🎯 ${n}</span>` : ''}
    ${c.phone ? `<a class="icon-btn" href="${waLink(c.phone)}" target="_blank" rel="noopener" data-stop aria-label="واتساب" style="width:38px;height:38px;color:var(--wa)">💬</a>` : ''}
  </div>`;
}

// ---------------- Detail ----------------

const FOLLOW_OPTIONS = [
  { d: 1, label: 'غداً' },
  { d: 3, label: '3 أيام' },
  { d: 7, label: 'أسبوع' },
  { d: 14, label: 'أسبوعين' },
];

export function clientDetailView(id, params) {
  const c = get('clients', id);
  if (!c) return notFound();
  const tab = params.get('tab') || 'matches';
  const matches = matchesForClient(c, state.properties);
  const stIdx = STAGES.findIndex((s) => s.id === (c.stage || 'new'));
  const appts = state.appointments.filter((a) => a.clientId === c.id && !a.done && dayDiff(a.date) >= 0).sort((a, b) => a.date.localeCompare(b.date));

  const req = [];
  if (c.deal) req.push(['الصفقة', c.deal === 'sale' ? 'شراء' : 'إيجار']);
  if (c.types?.length) req.push(['النوع', c.types.map((t) => TYPE[t]?.name).join('، ')]);
  if (c.areas?.length) req.push(['المناطق', c.areas.map((a) => AREA[a]?.name).join('، ')]);
  if (c.budgetMin || c.budgetMax) req.push(['الميزانية', `${c.budgetMin ? num(c.budgetMin) : '0'} – ${c.budgetMax ? money(c.budgetMax, c.deal) : 'مفتوحة'}`]);
  if (c.bedrooms) req.push(['الغرف', `${c.bedrooms} أو أكثر`]);
  if (c.furnishing && c.furnishing !== 'any') req.push(['الفرش', FURN[c.furnishing]?.name]);
  if (c.features?.length) req.push(['مزايا', c.features.map((f) => FEATURE[f]?.name).join('، ')]);
  if (c.moveDate) req.push(['موعد الانتقال', new Date(c.moveDate).toLocaleDateString('ar-QA-u-nu-latn', { day: 'numeric', month: 'long' })]);

  const html = `<div class="page">
    ${topbar('', {
      back: '#/clients',
      actions: `<button type="button" class="icon-btn" data-go="#/client/${c.id}/edit" aria-label="تعديل">${I.edit}</button>
        <button type="button" class="icon-btn" data-more aria-label="المزيد">${I.more}</button>`,
    })}
    <div class="row gap">
      <div class="avatar" style="width:60px;height:60px;font-size:22px;background:${avatarColor(c.id)}">${esc(initials(c.name))}</div>
      <div class="grow" style="min-width:0">
        <h2 style="margin:0;font-size:22px">${esc(c.name)}</h2>
        <div class="muted num small">${c.phone ? '+' + esc(c.phone) : 'بدون رقم'}${c.nationality ? ' · ' + esc(c.nationality) : ''}${c.source ? ' · ' + esc(c.source) : ''}</div>
      </div>
    </div>

    <div class="contact-bar">
      ${c.phone ? `<a href="${telLink(c.phone)}"><i>📞</i>اتصال</a><a class="wa" href="${waLink(c.phone)}" target="_blank" rel="noopener"><i>💬</i>واتساب</a>`
        : `<button type="button" data-go="#/client/${c.id}/edit"><i>📞</i>أضف رقماً</button><span></span>`}
      <button type="button" data-appt><i>📅</i>موعد</button>
      <button type="button" data-note><i>📝</i>ملاحظة</button>
    </div>

    <div class="stage-track" role="radiogroup" aria-label="مرحلة العميل">
      ${STAGES.map((s, i) => `<button type="button" data-stage="${s.id}" role="radio" aria-checked="${i === stIdx}" class="${i === stIdx ? 'on' : i < stIdx && stIdx < 5 ? 'past' : ''} ${s.id}">${esc(s.name)}</button>`).join('')}
    </div>

    <div class="card mt">
      <div class="row gap"><b class="grow">⏰ المتابعة القادمة</b>${c.nextFollowUp ? followPill(c.nextFollowUp) : '<span class="muted small">غير محددة</span>'}</div>
      <div class="chips mt" data-follow>
        ${FOLLOW_OPTIONS.map((o) => `<button type="button" class="chip" data-d="${o.d}">${o.label}</button>`).join('')}
        <label class="chip" style="position:relative">📅 تاريخ<input type="date" data-follow-date style="position:absolute;inset:0;opacity:0"></label>
        ${c.nextFollowUp ? '<button type="button" class="chip" data-d="clear">✓ تمت</button>' : ''}
      </div>
    </div>

    ${appts.length ? `<div class="banner brand">📅 ${esc(relDay(appts[0].date))} ${esc(new Date(appts[0].date).toLocaleTimeString('ar-QA-u-nu-latn', { hour: 'numeric', minute: '2-digit' }))} — ${esc(appts[0].type === 'viewing' ? 'معاينة' : 'موعد')}</div>` : ''}

    <div class="card">
      <div class="row"><b class="grow">🔎 طلب العميل</b><button type="button" class="link-btn" data-go="#/client/${c.id}/edit">تعديل</button></div>
      ${req.length ? `<div style="display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin-top:8px;font-size:14.5px">${req.map(([k, v]) => `<span class="muted">${esc(k)}</span><span>${esc(v)}</span>`).join('')}</div>`
        : `<p class="muted small">لم تُحدد الطلبات بعد — أضفها للحصول على اقتراحات.</p>`}
      ${c.notes ? `<div class="divider"></div><div class="notes small">${esc(c.notes)}</div>` : ''}
    </div>

    <div class="seg" style="margin-top:16px">
      <button type="button" class="${tab === 'matches' ? 'on' : ''}" data-tab="matches">🎯 عقارات مناسبة (${matches.length})</button>
      <button type="button" class="${tab === 'log' ? 'on' : ''}" data-tab="log">🕒 السجل (${(c.log || []).length})</button>
    </div>

    <div class="mt">
    ${tab === 'matches'
      ? matches.length
        ? `<div class="list">${matches.map((m) => matchBlock(m, 'property')).join('')}</div>`
        : `<div class="card">${emptyState('🔍', 'لا توجد عقارات مطابقة', 'وسّع الميزانية أو المناطق، أو أضف عقارات جديدة.')}</div>`
      : `<div class="card"><form class="row gap" data-log-form><input class="input grow" name="text" placeholder="أضف ملاحظة: اتصلت، طلب خصم…" autocomplete="off"><button class="btn btn-primary btn-sm" type="submit">إضافة</button></form>
          ${(c.log || []).length ? `<ul class="log mt">${c.log.map((l) => `<li><time>${esc(ago(l.at))}</time><span>${esc(l.text)}</span></li>`).join('')}</ul>` : '<p class="muted small">لا يوجد نشاط بعد.</p>'}</div>`}
    </div>
    ${(c.dismissed || []).length ? `<p style="text-align:center"><button type="button" class="link-btn" data-undismiss>إظهار ${c.dismissed.length} عقار تم استبعاده</button></p>` : ''}
  </div>`;

  return {
    html,
    mount(root, refresh) {
      const update = async (patch, logText) => {
        const cur = get('clients', c.id);
        const log = logText ? [{ at: new Date().toISOString(), text: logText }, ...(cur.log || [])] : cur.log;
        await save('clients', { ...cur, ...patch, log });
        refresh();
      };
      root.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => {
        history.replaceState(null, '', `#/client/${c.id}?tab=${b.dataset.tab}`);
        refresh();
      }));
      root.querySelectorAll('[data-stage]').forEach((b) => (b.onclick = async () => {
        const s = b.dataset.stage;
        if (s === (c.stage || 'new')) return;
        haptic(10);
        await update({ stage: s }, `المرحلة ← ${STAGE[s].name}`);
        if (s === 'won') toast('مبروك الصفقة! 🎉');
      }));
      root.querySelector('[data-follow]').addEventListener('click', async (e) => {
        const b = e.target.closest('[data-d]');
        if (!b) return;
        if (b.dataset.d === 'clear') return update({ nextFollowUp: '' }, 'تمت المتابعة');
        const d = new Date();
        d.setDate(d.getDate() + +b.dataset.d);
        await update({ nextFollowUp: localInput(d) });
        toast(`سأذكّرك ${relDay(d)}`);
      });
      root.querySelector('[data-follow-date]').addEventListener('change', async (e) => {
        if (!e.target.value) return;
        await update({ nextFollowUp: e.target.value });
        toast(`سأذكّرك ${relDay(e.target.value)}`);
      });
      root.querySelector('[data-appt]').onclick = () => appointmentSheet({ clientId: c.id, onSaved: refresh });
      root.querySelector('[data-note]').onclick = () => {
        history.replaceState(null, '', `#/client/${c.id}?tab=log`);
        refresh();
        setTimeout(() => document.querySelector('[data-log-form] input')?.focus(), 50);
      };
      root.querySelector('[data-log-form]')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const t = e.target.text.value.trim();
        if (!t) return;
        await update({}, t);
      });
      bindMatchActions(root, refresh);
      root.querySelector('[data-undismiss]')?.addEventListener('click', () => update({ dismissed: [] }));
      root.querySelector('[data-more]').onclick = () =>
        actionSheet([
          { icon: '✏️', label: 'تعديل البيانات والطلب', run: () => go(`#/client/${c.id}/edit`) },
          ...(c.phone ? [{ icon: '📋', label: 'نسخ الرقم', run: async () => { await navigator.clipboard?.writeText('+' + c.phone); toast('تم النسخ'); } }] : []),
          { icon: '🗑️', label: 'حذف العميل', danger: true, run: async () => {
            if (!(await confirmSheet(`حذف ${c.name}؟`, { ok: 'حذف', danger: true }))) return;
            await remove('clients', c.id);
            go('#/clients');
            toast('تم حذف العميل', { label: 'تراجع', run: async () => { await save('clients', c); go(`#/client/${c.id}`); } });
          } },
        ], c.name);
    },
  };
}

// ---------------- Form ----------------

const FURN_ANY = [{ id: 'any', name: 'لا يهم' }, ...FURNISHING];

export function clientFormView(id) {
  const existing = id ? get('clients', id) : null;
  if (id && !existing) return notFound();
  const c = existing || { deal: 'rent', stage: 'new', types: [], areas: [], features: [], furnishing: 'any', bedrooms: 0 };

  const html = `<div class="page">
    ${topbar(existing ? 'تعديل العميل' : 'عميل جديد', { back: existing ? `#/client/${c.id}` : '#/clients' })}
    <form class="form" novalidate autocomplete="off">
      ${'contacts' in navigator && 'ContactsManager' in window ? `<button type="button" class="btn btn-outline" data-pick-contact>📇 اختيار من جهات الاتصال</button>` : ''}
      <div class="field"><label for="c-name">الاسم *</label><input id="c-name" class="input" name="name" value="${esc(c.name || '')}" required autocomplete="name"></div>
      <div class="field"><label for="c-phone">رقم الجوال</label><input id="c-phone" class="input num" name="phone" type="tel" inputmode="tel" placeholder="5555 1234" value="${esc(c.phone || '')}" style="text-align:right">
        <div class="hint">الأرقام القطرية (8 أرقام) يُضاف لها ‎+974 تلقائياً</div></div>

      <div class="card" style="margin:0;background:var(--ok-soft);color:var(--ok);box-shadow:none;padding:12px 14px;font-weight:700" data-live>…</div>

      <div class="field"><span class="label">يبحث عن</span>${chips('deal', [{ id: 'rent', name: 'إيجار' }, { id: 'sale', name: 'شراء' }], [c.deal], { multi: false }).replace('class="chips"', 'class="chips big"')}</div>
      <div class="field"><span class="label">نوع العقار</span>${chips('types', TYPES, c.types)}<div class="hint">اترك الكل غير محدد إذا كان أي نوع مناسباً</div></div>
      <div class="field"><span class="label">الميزانية <span class="muted small" data-budget-hint>(شهرياً)</span></span>
        <div class="input-group">
          <div class="input-affix"><input class="input num" name="budgetMin" inputmode="numeric" placeholder="من" value="${c.budgetMin ? num(c.budgetMin) : ''}" style="text-align:right" aria-label="أقل ميزانية"><span class="affix">ر.ق</span></div>
          <div class="input-affix"><input class="input num" name="budgetMax" inputmode="numeric" placeholder="إلى" value="${c.budgetMax ? num(c.budgetMax) : ''}" style="text-align:right" aria-label="أعلى ميزانية"><span class="affix">ر.ق</span></div>
        </div></div>
      <div class="field"><span class="label">المناطق المفضلة</span>${chips('areas', AREAS.map((a) => ({ id: a.id, name: a.name.replace(/ \(.+\)/, '') })), c.areas)}</div>
      ${stepper('bedrooms', c.bedrooms, { label: 'أقل عدد غرف نوم', max: 10 })}
      <div class="field"><span class="label">الفرش</span>${chips('furnishing', FURN_ANY, [c.furnishing || 'any'], { multi: false })}</div>

      <details class="more" ${existing && (c.features?.length || c.notes || c.moveDate) ? 'open' : ''}>
        <summary>+ تفاصيل إضافية (مزايا، موعد الانتقال، المصدر…)</summary>
        <div class="form">
          <div class="field"><span class="label">مزايا مطلوبة</span>${chips('features', FEATURES, c.features)}</div>
          <div class="form-grid">
            <div class="field"><label for="c-move">موعد الانتقال</label><input id="c-move" class="input" type="date" name="moveDate" value="${esc(c.moveDate || '')}"></div>
            <div class="field"><label for="c-nat">الجنسية</label><input id="c-nat" class="input" name="nationality" value="${esc(c.nationality || '')}"></div>
          </div>
          <div class="field"><span class="label">المصدر</span>${chips('source', SOURCES.map((s) => ({ id: s, name: s })), [c.source], { multi: false })}</div>
          <div class="field"><label for="c-notes">ملاحظات</label><textarea id="c-notes" class="input" name="notes" rows="3" placeholder="مثال: لديه أطفال، يفضل قرب مدرسة، يعمل في لوسيل">${esc(c.notes || '')}</textarea></div>
        </div>
      </details>
      <div class="field"><span class="label">المرحلة</span>${chips('stage', STAGES, [c.stage || 'new'], { multi: false })}</div>

      <div class="save-bar"><button type="submit" class="btn btn-primary grow">${existing ? 'حفظ التعديلات' : 'حفظ العميل'}</button></div>
    </form>
  </div>`;

  return {
    html,
    form: true,
    mount(root) {
      const form = root.querySelector('form');
      bindChips(root);
      bindSteppers(root);
      const money$ = (el) => {
        el.addEventListener('input', () => {
          const d = el.value.replace(/[^\d٠-٩]/g, '').replace(/[٠-٩]/g, (x) => '٠١٢٣٤٥٦٧٨٩'.indexOf(x));
          el.value = d ? num(d) : '';
        });
      };
      money$(form.budgetMin);
      money$(form.budgetMax);

      const read = () => ({
        ...c,
        name: form.name.value.trim(),
        phone: form.phone.value.trim() ? normalizePhone(form.phone.value) : '',
        deal: readChips(root, 'deal')[0] || 'rent',
        types: readChips(root, 'types'),
        areas: readChips(root, 'areas'),
        budgetMin: +form.budgetMin.value.replace(/\D/g, '') || '',
        budgetMax: +form.budgetMax.value.replace(/\D/g, '') || '',
        bedrooms: readStepper(root, 'bedrooms'),
        furnishing: readChips(root, 'furnishing')[0] || 'any',
        features: readChips(root, 'features'),
        moveDate: form.moveDate.value,
        nationality: form.nationality.value.trim(),
        source: readChips(root, 'source')[0] || '',
        notes: form.notes.value.trim(),
        stage: readChips(root, 'stage')[0] || 'new',
      });

      // Live preview of how many properties fit while the agent fills the request.
      const live = root.querySelector('[data-live]');
      const updateLive = () => {
        const draft = read();
        root.querySelector('[data-budget-hint]').textContent = draft.deal === 'sale' ? '(إجمالي)' : '(شهرياً)';
        const n = matchesForClient(draft, state.properties).length;
        live.textContent = !state.properties.length
          ? '💡 أضف عقارات ليقترح التطبيق المناسب منها تلقائياً'
          : n ? `🎯 ${n} عقار يطابق هذا الطلب الآن` : '🔍 لا يوجد عقار مطابق حالياً — سيظهر فور إضافته';
        live.style.background = n ? 'var(--ok-soft)' : 'var(--surface-2)';
        live.style.color = n ? 'var(--ok)' : 'var(--text-2)';
      };
      let t;
      const schedule = () => { clearTimeout(t); t = setTimeout(updateLive, 120); };
      form.addEventListener('input', schedule);
      form.addEventListener('change', schedule);
      form.addEventListener('click', (e) => { if (e.target.closest('[data-step]')) schedule(); });
      updateLive();

      root.querySelector('[data-pick-contact]')?.addEventListener('click', async () => {
        try {
          const [ct] = await navigator.contacts.select(['name', 'tel'], { multiple: false });
          if (!ct) return;
          if (ct.name?.[0]) form.name.value = ct.name[0];
          if (ct.tel?.[0]) form.phone.value = ct.tel[0];
          dirty = true;
        } catch { /* cancelled */ }
      });

      let dirty = false;
      form.addEventListener('input', () => (dirty = true));
      form.addEventListener('change', () => (dirty = true));
      root.isDirty = () => dirty;

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const rec0 = read();
        if (!rec0.name) {
          form.name.classList.add('invalid');
          form.name.focus();
          return toast('أدخل اسم العميل');
        }
        if (rec0.phone && !existing) {
          const dup = state.clients.find((x) => x.phone === rec0.phone);
          if (dup && !(await confirmSheet(`الرقم مسجّل مسبقاً باسم ${dup.name}. حفظ على أي حال؟`, { ok: 'حفظ' }))) return;
        }
        if (!existing) rec0.log = [{ at: new Date().toISOString(), text: 'تمت إضافة العميل' }];
        if (!existing && !rec0.nextFollowUp) {
          const d = new Date();
          d.setDate(d.getDate() + 1);
          rec0.nextFollowUp = localInput(d);
        }
        const rec = await save('clients', rec0);
        root.isDirty = () => false;
        haptic(20);
        const n = matchesForClient(rec, state.properties).length;
        toast(n ? `تم الحفظ — ${n} عقار مناسب 🎯` : 'تم حفظ العميل');
        location.replace(`#/client/${rec.id}`);
      });
    },
  };
}

function notFound() {
  return { html: `<div class="page">${topbar('غير موجود', { back: '#/clients' })}${emptyState('🤷', 'العميل غير موجود', 'ربما تم حذفه.')}</div>` };
}

