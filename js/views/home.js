import { state } from '../db.js';
import { ACTIVE_STAGES } from '../data.js';
import { esc, fmtDay, dayDiff, toast, money } from '../ui.js';
import { matchesForClient } from '../match.js';
import {
  clientRow, apptRow, propertyTitle, bindAppointments, appointmentSheet, routeUrl, emptyState, telLink, waLink,
} from './common.js';
import { I } from '../icons.js';

export function allOpenMatches() {
  const out = [];
  for (const c of state.clients.filter((c) => ACTIVE_STAGES.includes(c.stage || 'new'))) {
    const sent = new Set(c.sent || []);
    for (const m of matchesForClient(c, state.properties)) if (!sent.has(m.property.id)) out.push(m);
  }
  return out.sort((a, b) => b.score - a.score);
}

export function todaysAppointments() {
  return state.appointments.filter((a) => dayDiff(a.date) === 0).sort((a, b) => a.date.localeCompare(b.date));
}

export function dueFollowUps() {
  return state.clients
    .filter((c) => ACTIVE_STAGES.includes(c.stage || 'new') && c.nextFollowUp && dayDiff(c.nextFollowUp) <= 0)
    .sort((a, b) => a.nextFollowUp.localeCompare(b.nextFollowUp));
}

export function homeView() {
  const s = state.settings;
  const today = todaysAppointments();
  const pending = today.filter((a) => !a.done);
  const follow = dueFollowUps();
  const matches = allOpenMatches();
  const activeClients = state.clients.filter((c) => ACTIVE_STAGES.includes(c.stage || 'new')).length;
  const available = state.properties.filter((p) => (p.status || 'available') === 'available').length;
  const firstRun = !state.properties.length && !state.clients.length;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'صباح الخير' : 'مساء الخير';

  const html = `<div class="page">
    <div class="topbar" style="margin-bottom:0">
      <div class="hello grow" style="margin:0">
        <p>${esc(fmtDay(new Date()))}</p>
        <h1>${greet}${s.agentName ? '، ' + esc(s.agentName.split(' ')[0]) : ''} 👋</h1>
      </div>
      <button type="button" class="icon-btn" data-go="#/search" aria-label="بحث">${I.search}</button>
      <button type="button" class="icon-btn" data-go="#/settings" aria-label="الإعدادات">⚙️</button>
    </div>

    ${!s.agentName ? `<div class="banner brand">✍️ أضف اسمك ورقمك ليظهرا في رسائل الواتساب وعلامة الصور
      <button type="button" class="btn btn-sm btn-primary" data-go="#/settings">إعداد</button></div>` : ''}

    ${firstRun ? `<div class="card">${emptyState('🏙️', 'أهلاً بك في وكيل', 'ابدأ بإضافة أول عقار أو عميل — أو جرّب التطبيق ببيانات تجريبية من مناطق الدوحة.',
      `<div class="row gap"><button type="button" class="btn btn-primary grow" data-go="#/property/new">+ عقار</button>
       <button type="button" class="btn btn-outline grow" data-go="#/client/new">+ عميل</button></div>
       <button type="button" class="link-btn mt" data-demo>تحميل بيانات تجريبية</button>`)}</div>` : ''}

    <div class="stats">
      <button type="button" class="stat ${pending.length ? 'hot' : ''}" data-go="#/agenda"><b class="num">${pending.length}</b><span>مواعيد اليوم</span></button>
      <button type="button" class="stat" data-go="#/clients?f=follow"><b class="num" ${follow.length ? 'style="color:var(--danger)"' : ''}>${follow.length}</b><span>متابعات مستحقة</span></button>
      <button type="button" class="stat" data-go="#/matches"><b class="num" style="color:var(--ok)">${matches.length}</b><span>فرص تطابق جديدة</span></button>
      <button type="button" class="stat" data-go="#/clients"><b class="num">${activeClients}</b><span>عملاء نشطون · ${available} عقار متاح</span></button>
    </div>

    <div class="quick">
      <button type="button" data-go="#/property/new"><i>🏢</i>عقار</button>
      <button type="button" data-go="#/client/new"><i>👤</i>عميل</button>
      <button type="button" data-new-appt><i>📅</i>موعد</button>
      <button type="button" data-route><i>🧭</i>مسار اليوم</button>
    </div>

    <div class="section-h"><h2>جدول اليوم</h2><a href="#/agenda">كل المواعيد</a></div>
    ${today.length ? `<div class="list">${today.map((a) => apptRow(a)).join('')}</div>`
      : `<div class="card empty" style="padding:20px">لا مواعيد اليوم. <button type="button" class="link-btn" data-new-appt>+ أضف موعداً</button></div>`}

    ${follow.length ? `<div class="section-h"><h2>تابِع اليوم</h2><a href="#/clients?f=follow">الكل</a></div>
      <div class="list">${follow.slice(0, 5).map((c) => clientRow(c, quickContact(c))).join('')}</div>` : ''}

    ${matches.length ? `<div class="section-h"><h2>أفضل الفرص</h2><a href="#/matches">عرض ${matches.length}</a></div>
      <div class="list">${matches.slice(0, 3).map(matchTeaser).join('')}</div>` : ''}
  </div>`;

  return {
    html,
    mount(root, refresh) {
      bindAppointments(root, refresh);
      root.querySelectorAll('[data-new-appt]').forEach((b) => (b.onclick = () => appointmentSheet({ onSaved: refresh })));
      root.querySelector('[data-route]').onclick = () => {
        const props = todaysAppointments().filter((a) => !a.done).map((a) => state.properties.find((p) => p.id === a.propertyId)).filter(Boolean);
        const url = routeUrl(props);
        if (!url) return toast('لا توجد معاينات بمواقع محددة اليوم');
        window.open(url, '_blank');
      };
      root.querySelector('[data-demo]')?.addEventListener('click', async () => {
        const { loadDemo } = await import('../demo.js');
        await loadDemo();
        toast('تم تحميل البيانات التجريبية');
        refresh();
      });
    },
  };
}

function quickContact(c) {
  if (!c.phone) return '';
  return `<div class="item-side">
    <a class="icon-btn" href="${waLink(c.phone)}" target="_blank" rel="noopener" aria-label="واتساب" data-stop style="color:var(--wa)">💬</a>
    <a class="icon-btn" href="${telLink(c.phone)}" aria-label="اتصال" data-stop>📞</a>
  </div>`;
}

function matchTeaser(m) {
  return `<div class="item" data-href="#/client/${m.client.id}?tab=matches" role="link" tabindex="0">
    <div class="item-main">
      <div class="item-title">👤 ${esc(m.client.name)}</div>
      <div class="item-sub">🏢 ${esc(propertyTitle(m.property))} · ${esc(money(m.property.price, m.property.deal))}</div>
    </div>
    <div class="score" style="--s:${m.score};--sc:${m.score >= 85 ? 'var(--ok)' : 'var(--info)'}"><span class="num">${m.score}%</span></div>
  </div>`;
}

