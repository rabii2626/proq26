import { state, get } from '../db.js';
import { esc, dayDiff, startOfDay, toast } from '../ui.js';
import { topbar, apptRow, bindAppointments, appointmentSheet, routeUrl, emptyState } from './common.js';
import { I } from '../icons.js';

const ui = { day: 0 };
const wd = new Intl.DateTimeFormat('ar-QA-u-nu-latn', { weekday: 'short' });
const dn = new Intl.DateTimeFormat('ar-QA-u-nu-latn', { day: 'numeric' });
const full = new Intl.DateTimeFormat('ar-QA-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' });

export function agendaView() {
  const days = [];
  for (let i = -3; i <= 13; i++) {
    const d = startOfDay();
    d.setDate(d.getDate() + i);
    days.push({ i, d, n: state.appointments.filter((a) => dayDiff(a.date) === i && !a.done).length });
  }
  const list = state.appointments.filter((a) => dayDiff(a.date) === ui.day).sort((a, b) => a.date.localeCompare(b.date));
  const overdue = state.appointments.filter((a) => !a.done && dayDiff(a.date) < 0).length;
  const sel = days.find((x) => x.i === ui.day)?.d || startOfDay();

  const html = `<div class="page">
    ${topbar('المواعيد', {
      actions: `<button type="button" class="icon-btn" data-add aria-label="موعد جديد" style="background:var(--brand);color:#fff">${I.plus}</button>`,
    })}
    <div class="filterbar" data-days style="gap:6px">
      ${days.map((x) => `<button type="button" class="fchip ${x.i === ui.day ? 'on' : ''}" data-day="${x.i}" style="flex-direction:column;gap:0;padding:6px 12px;border-radius:14px;min-width:56px">
        <span class="small">${x.i === 0 ? 'اليوم' : esc(wd.format(x.d))}</span><b class="num" style="font-size:18px">${esc(dn.format(x.d))}</b>
        <span style="height:6px;display:flex;gap:2px">${'<i style="width:5px;height:5px;border-radius:50%;background:var(--brand);display:block"></i>'.repeat(Math.min(3, x.n))}</span>
      </button>`).join('')}
    </div>
    ${overdue ? `<div class="banner">⚠️ لديك ${overdue} موعد سابق لم يُعلَّم كمنجز</div>` : ''}
    <div class="row gap" style="margin:6px 2px 12px">
      <h2 class="grow" style="margin:0;font-size:17px">${esc(full.format(sel))}</h2>
      ${list.some((a) => get('properties', a.propertyId)?.lat != null) ? `<button type="button" class="btn btn-sm btn-outline" data-route>🧭 مسار المعاينات</button>` : ''}
    </div>
    ${list.length ? `<div class="list">${list.map((a) => apptRow(a)).join('')}</div>`
      : `<div class="card">${emptyState('📅', 'لا مواعيد', 'يوم هادئ! أضف معاينة أو اتصالاً.', '<button type="button" class="btn btn-primary" data-add>+ موعد جديد</button>')}</div>`}
  </div>`;

  return {
    html,
    mount(root, refresh) {
      bindAppointments(root, refresh);
      root.querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => {
        const d = new Date();
        d.setDate(d.getDate() + ui.day);
        d.setHours(ui.day === 0 ? d.getHours() + 1 : 10, 0, 0, 0);
        appointmentSheet({ appt: { date: d.toISOString() }, onSaved: refresh });
      }));
      root.querySelectorAll('[data-day]').forEach((b) => (b.onclick = () => { ui.day = +b.dataset.day; refresh(); }));
      root.querySelector('[data-route]')?.addEventListener('click', () => {
        const props = list.filter((a) => !a.done).map((a) => get('properties', a.propertyId)).filter(Boolean);
        const url = routeUrl(props);
        if (!url) return toast('لا توجد مواقع محددة');
        window.open(url, '_blank');
      });
      // Center the selected day inside the strip without scrolling the page itself.
      requestAnimationFrame(() => {
        const strip = root.querySelector('[data-days]');
        const on = strip.querySelector('.on');
        if (on) strip.scrollLeft += on.getBoundingClientRect().left - strip.getBoundingClientRect().left - (strip.clientWidth - on.offsetWidth) / 2;
      });
    },
  };
}
