import { load } from './db.js';
import { $, actionSheet, confirmSheet } from './ui.js';
import { I } from './icons.js';
import { hydrate, appointmentSheet } from './views/common.js';
import { homeView, todaysAppointments, dueFollowUps } from './views/home.js';
import { propertiesView, propertyDetailView, propertyFormView } from './views/properties.js';
import { clientsView, clientDetailView, clientFormView } from './views/clients.js';
import { agendaView } from './views/agenda.js';
import { matchesView, searchView, settingsView } from './views/more.js';

const routes = [
  [/^$/, () => homeView(), 'home'],
  [/^properties$/, () => propertiesView(), 'properties'],
  [/^property\/new$/, () => propertyFormView(), 'properties'],
  [/^property\/([\w-]+)\/edit$/, (m) => propertyFormView(m[1]), 'properties'],
  [/^property\/([\w-]+)$/, (m) => propertyDetailView(m[1]), 'properties'],
  [/^clients$/, (m, q) => clientsView(q), 'clients'],
  [/^client\/new$/, () => clientFormView(), 'clients'],
  [/^client\/([\w-]+)\/edit$/, (m) => clientFormView(m[1]), 'clients'],
  [/^client\/([\w-]+)$/, (m, q) => clientDetailView(m[1], q), 'clients'],
  [/^agenda$/, () => agendaView(), 'agenda'],
  [/^matches$/, () => matchesView(), 'home'],
  [/^search$/, () => searchView(), 'home'],
  [/^settings$/, () => settingsView(), 'home'],
];

const app = $('#app');
const scrollMemory = new Map();
let current = { hash: null, view: null };
let root = null;
const isDirty = () => !!root?.isDirty?.();

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  return { path, params: new URLSearchParams(query), key: raw };
}

function render({ keepScroll = false } = {}) {
  const { path, params, key } = parseHash();
  let view;
  let tab = 'home';
  for (const [re, fn, t] of routes) {
    const m = path.match(re);
    if (m) {
      view = fn(m, params);
      tab = t;
      break;
    }
  }
  if (!view) {
    location.replace('#/');
    return;
  }
  const y = keepScroll ? window.scrollY : scrollMemory.get(key.split('?')[0]) || 0;
  current = { hash: key, view };
  // A fresh root per render so listeners bound in mount() never accumulate.
  root = document.createElement('div');
  root.innerHTML = view.html;
  app.replaceChildren(root);
  document.body.classList.toggle('form-open', !!view.form);
  view.mount?.(root, () => render({ keepScroll: true }));
  hydrate(root);
  renderTabbar(tab);
  window.scrollTo(0, view.form ? 0 : y);
}

function renderTabbar(active) {
  const follow = dueFollowUps().length;
  const today = todaysAppointments().filter((a) => !a.done).length;
  const tab = (id, hash, icon, label, badge = 0) =>
    `<button type="button" class="tab ${active === id ? 'on' : ''}" data-go="${hash}" aria-label="${label}" ${active === id ? 'aria-current="page"' : ''}>
      ${icon}<span>${label}</span>${badge ? `<span class="badge">${badge}</span>` : ''}</button>`;
  $('#tabbar').innerHTML = [
    tab('home', '#/', I.home, 'الرئيسية'),
    tab('properties', '#/properties', I.building, 'العقارات'),
    `<button type="button" class="tab tab-add" data-quick-add aria-label="إضافة سريعة"><span>${I.plus}</span></button>`,
    tab('clients', '#/clients', I.users, 'العملاء', follow),
    tab('agenda', '#/agenda', I.calendar, 'المواعيد', today),
  ].join('');
}

function quickAdd() {
  actionSheet(
    [
      { icon: '🏢', label: 'عقار جديد', run: () => go('#/property/new') },
      { icon: '👤', label: 'عميل جديد', run: () => go('#/client/new') },
      { icon: '📅', label: 'موعد / معاينة', run: () => appointmentSheet({ onSaved: () => render({ keepScroll: true }) }) },
    ],
    'إضافة',
  );
}

async function go(hash) {
  if (isDirty() && !(await confirmSheet('لديك تغييرات غير محفوظة. الخروج بدون حفظ؟', { ok: 'خروج', danger: true }))) return;
  if (root) root.isDirty = null;
  location.hash = hash;
}

// Remember scroll per page so "back" returns the agent to where they were.
window.addEventListener('scroll', () => {
  if (current.hash != null) scrollMemory.set(current.hash.split('?')[0], window.scrollY);
}, { passive: true });

// In-app history stack, so the back arrow uses real history (keeps scroll/filters)
// and falls back to the parent page when the app was opened on a deep link.
const stack = [];
const isForm = (h) => /\/(new|edit)$/.test(h.split('?')[0]);

window.addEventListener('hashchange', () => {
  const h = location.hash;
  if (stack.length > 1 && stack[stack.length - 2] === h) stack.pop();
  else if (stack.length && isForm(stack[stack.length - 1])) stack[stack.length - 1] = h; // forms exit via replace()
  else stack.push(h);
  if (root) root.isDirty = null;
  render();
});

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-stop]')) {
    e.stopPropagation();
    return;
  }
  const t = e.target.closest('[data-go], [data-href], [data-back], [data-quick-add]');
  if (!t) return;
  if (t.hasAttribute('data-quick-add')) return quickAdd();
  if (t.dataset.back) {
    e.preventDefault();
    back(t.dataset.back);
    return;
  }
  go(t.dataset.go || t.dataset.href);
});

async function back(parent) {
  if (isDirty() && !(await confirmSheet('لديك تغييرات غير محفوظة. الخروج بدون حفظ؟', { ok: 'خروج', danger: true }))) return;
  if (root) root.isDirty = null;
  if (stack.length > 1) history.back();
  else location.replace(parent);
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const t = e.target.closest?.('[data-href]');
  if (t && e.target === t) go(t.dataset.href);
});

async function boot() {
  app.innerHTML = '<div class="page"><div class="empty">…</div></div>';
  try {
    await load();
  } catch (err) {
    app.innerHTML = `<div class="page"><div class="empty"><div class="big">⚠️</div><h3>تعذّر فتح قاعدة البيانات</h3><p>تأكد أن المتصفح ليس في وضع التصفح الخاص.</p></div></div>`;
    console.error(err);
    return;
  }
  if (!location.hash) history.replaceState(null, '', '#/');
  stack.push(location.hash);
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  // Ask the browser to keep our IndexedDB data even under storage pressure.
  navigator.storage?.persist?.();
}

// Re-render when the app returns to the foreground on a new day (today's agenda, badges).
let lastDay = new Date().toDateString();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || lastDay === new Date().toDateString()) return;
  lastDay = new Date().toDateString();
  if (!isDirty()) render({ keepScroll: true });
});

boot();
