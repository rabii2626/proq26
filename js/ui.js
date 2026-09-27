// Small UI toolkit: escaping, formatting, toasts, bottom sheets, confirm dialogs.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const nf = new Intl.NumberFormat('en-US');
export function money(v, deal) {
  const n = Number(v) || 0;
  if (!n) return '—';
  let s;
  if (n >= 1_000_000) s = (n / 1_000_000).toFixed(n % 1_000_000 ? 2 : 0).replace(/\.?0+$/, '') + ' مليون';
  else s = nf.format(n);
  return s + ' ر.ق' + (deal === 'rent' ? ' / شهر' : '');
}
export const num = (v) => nf.format(Number(v) || 0);

const dayFmt = new Intl.DateTimeFormat('ar-QA-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' });
const timeFmt = new Intl.DateTimeFormat('ar-QA-u-nu-latn', { hour: 'numeric', minute: '2-digit' });
const shortFmt = new Intl.DateTimeFormat('ar-QA-u-nu-latn', { day: 'numeric', month: 'short' });

export const startOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
export const dayDiff = (d) => Math.round((startOfDay(d) - startOfDay()) / 86400000);

export function relDay(d) {
  if (!d) return '';
  const diff = dayDiff(d);
  if (diff === 0) return 'اليوم';
  if (diff === 1) return 'غداً';
  if (diff === -1) return 'أمس';
  if (diff > 1 && diff < 7) return dayFmt.format(new Date(d)).split('،')[0];
  return shortFmt.format(new Date(d));
}
export const fmtDay = (d) => dayFmt.format(new Date(d));
export const fmtTime = (d) => timeFmt.format(new Date(d));

export function ago(iso) {
  const mins = Math.round((Date.now() - new Date(iso)) / 60000);
  if (mins < 1) return 'الآن';
  if (mins < 60) return `قبل ${mins} د`;
  const h = Math.round(mins / 60);
  if (h < 24) return `قبل ${h} س`;
  return relDay(iso);
}

/** yyyy-mm-dd / yyyy-mm-ddThh:mm in local time for <input> values. */
export function localInput(d, withTime) {
  const x = new Date(d);
  const p = (n) => String(n).padStart(2, '0');
  const date = `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
  return withTime ? `${date}T${p(x.getHours())}:${p(x.getMinutes())}` : date;
}

export function haptic(ms = 10) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

// ---- Toast ----
let toastTimer;
export function toast(msg, action) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
  el.classList.add('show');
  if (action) {
    el.querySelector('button').onclick = () => {
      el.classList.remove('show');
      action.run();
    };
  }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? 5000 : 2600);
}

// ---- Bottom sheet ----
export function sheet(html, { onMount, title } = {}) {
  const root = $('#sheet-root');
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `
    <div class="sheet-backdrop"></div>
    <div class="sheet" role="dialog" aria-modal="true">
      <div class="sheet-grip"></div>
      ${title ? `<h3 class="sheet-title">${esc(title)}</h3>` : ''}
      <div class="sheet-body">${html}</div>
    </div>`;
  root.appendChild(wrap);
  $('#toast').classList.remove('show');
  requestAnimationFrame(() => wrap.classList.add('open'));

  const close = () => {
    wrap.classList.remove('open');
    setTimeout(() => wrap.remove(), 250);
    window.removeEventListener('popstate', onPop);
  };
  const onPop = () => close();
  wrap.querySelector('.sheet-backdrop').onclick = close;

  // Swipe down to dismiss
  const panel = wrap.querySelector('.sheet');
  let y0 = null;
  let dy = 0;
  panel.addEventListener('touchstart', (e) => {
    if (panel.scrollTop > 0) return;
    y0 = e.touches[0].clientY;
  }, { passive: true });
  panel.addEventListener('touchmove', (e) => {
    if (y0 == null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    panel.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  panel.addEventListener('touchend', () => {
    panel.style.transform = '';
    if (dy > 90) close();
    y0 = null;
    dy = 0;
  });

  onMount?.(wrap.querySelector('.sheet-body'), close);
  return close;
}

/** Action list sheet: items = [{icon, label, run, danger}] */
export function actionSheet(items, title) {
  const html = `<div class="action-list">${items
    .map((it, i) => `<button type="button" class="action-item ${it.danger ? 'danger' : ''}" data-i="${i}"><span class="ai-icon">${it.icon || ''}</span><span>${esc(it.label)}</span></button>`)
    .join('')}</div>`;
  sheet(html, {
    title,
    onMount(body, close) {
      body.addEventListener('click', (e) => {
        const b = e.target.closest('[data-i]');
        if (!b) return;
        close();
        items[+b.dataset.i].run();
      });
    },
  });
}

export function confirmSheet(message, { ok = 'تأكيد', danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    sheet(
      `<p class="confirm-msg">${esc(message)}</p>
       <div class="row gap">
         <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'} grow" data-ok>${esc(ok)}</button>
         <button type="button" class="btn btn-ghost grow" data-cancel>إلغاء</button>
       </div>`,
      {
        onMount(body, close) {
          body.querySelector('[data-ok]').onclick = () => { done = true; close(); resolve(true); };
          body.querySelector('[data-cancel]').onclick = () => { close(); };
          const obs = new MutationObserver(() => {
            if (!body.isConnected) { obs.disconnect(); if (!done) resolve(false); }
          });
          obs.observe(document.getElementById('sheet-root'), { childList: true });
        },
      },
    );
  });
}

// ---- Form helpers ----
export function chips(name, options, selected = [], { multi = true } = {}) {
  const sel = new Set([].concat(selected || []));
  return `<div class="chips" data-chips="${esc(name)}" data-multi="${multi ? 1 : 0}">${options
    .map((o) => `<button type="button" class="chip ${sel.has(o.id) ? 'on' : ''}" data-v="${esc(o.id)}" aria-pressed="${sel.has(o.id)}">${o.icon ? o.icon + ' ' : ''}${esc(o.name)}</button>`)
    .join('')}</div>`;
}

export function bindChips(root) {
  root.addEventListener('click', (e) => {
    const chip = e.target.closest('.chips .chip');
    if (!chip) return;
    const group = chip.parentElement;
    const multi = group.dataset.multi === '1';
    if (!multi) {
      group.querySelectorAll('.chip').forEach((c) => { c.classList.remove('on'); c.setAttribute('aria-pressed', 'false'); });
      chip.classList.add('on');
    } else chip.classList.toggle('on');
    chip.setAttribute('aria-pressed', chip.classList.contains('on'));
    haptic(5);
    group.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

export function readChips(root, name) {
  const group = root.querySelector(`[data-chips="${name}"]`);
  if (!group) return [];
  return [...group.querySelectorAll('.chip.on')].map((c) => c.dataset.v);
}

export function stepper(name, value = 0, { min = 0, max = 10, label = '' } = {}) {
  return `<div class="stepper" data-stepper="${esc(name)}" data-min="${min}" data-max="${max}">
    <span class="stepper-label">${esc(label)}</span>
    <div class="stepper-ctl">
      <button type="button" data-step="1" aria-label="زيادة">+</button>
      <output>${Number(value) || 0}</output>
      <button type="button" data-step="-1" aria-label="إنقاص">−</button>
    </div>
  </div>`;
}

export function bindSteppers(root) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-step]');
    if (!b) return;
    const st = b.closest('.stepper');
    const out = st.querySelector('output');
    const v = Math.min(+st.dataset.max, Math.max(+st.dataset.min, (+out.textContent || 0) + +b.dataset.step));
    out.textContent = v;
    haptic(5);
  });
}

export const readStepper = (root, name) => +(root.querySelector(`[data-stepper="${name}"] output`)?.textContent || 0);

export function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/);
  // ZWNJ keeps Arabic initials as separate letters instead of joining into a word.
  return (parts[0]?.[0] || '?') + (parts[1]?.[0] ? '\u200c' + parts[1][0] : '');
}

export function avatarColor(seed) {
  let h = 0;
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 45% 45%)`;
}
