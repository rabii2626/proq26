import { state, saveSettings, exportAll, importAll, wipeAll } from '../db.js';
import { AREA } from '../data.js';
import { esc, toast, confirmSheet, money } from '../ui.js';
import { allOpenMatches } from './home.js';
import {
  topbar, propertyRow, clientRow, matchBlock, bindMatchActions, propertyTitle, emptyState,
} from './common.js';
import { normalizePhone } from '../match.js';
import { I } from '../icons.js';

// ---------------- Matches ----------------

export function matchesView() {
  const all = allOpenMatches();
  const byClient = new Map();
  for (const m of all) {
    if (!byClient.has(m.client.id)) byClient.set(m.client.id, []);
    byClient.get(m.client.id).push(m);
  }
  const groups = [...byClient.values()].sort((a, b) => b[0].score - a[0].score);

  const html = `<div class="page">
    ${topbar('فرص التطابق', { back: '#/', sub: `${all.length} اقتراح لم يُرسل بعد` })}
    <p class="muted small" style="margin-top:0">يقارن التطبيق طلب كل عميل نشط (النوع، الميزانية، المنطقة، الغرف، الفرش، المزايا) مع العقارات المتاحة. أرسل العقار بضغطة أو استبعده.</p>
    ${groups.length ? groups.map((ms) => `<section class="match-group">
        ${clientRow(ms[0].client)}
        <div class="list mt">${ms.slice(0, 3).map((m) => matchBlock(m, 'property')).join('')}
          ${ms.length > 3 ? `<a class="link-btn" href="#/client/${ms[0].client.id}?tab=matches">+ ${ms.length - 3} عقار آخر ←</a>` : ''}
        </div></section>`).join('')
      : `<div class="card">${emptyState('🎯', 'لا توجد فرص جديدة', state.clients.length ? 'كل الاقتراحات أُرسلت أو استُبعدت. أضف عقارات جديدة لتظهر فرص أخرى.' : 'أضف عملاء وطلباتهم لتظهر الفرص هنا.')}</div>`}
  </div>`;

  return {
    html,
    mount(root, refresh) {
      bindMatchActions(root, refresh);
    },
  };
}

// ---------------- Global search ----------------

export function searchView() {
  const html = `<div class="page">
    ${topbar('بحث', { back: '#/' })}
    <label class="search">${I.search}<input type="search" placeholder="عميل، رقم، عقار، منطقة…" data-q autofocus enterkeyhint="search"></label>
    <div data-results class="mt"><p class="muted small" style="text-align:center">ابحث في كل العملاء والعقارات دفعة واحدة</p></div>
  </div>`;
  return {
    html,
    mount(root) {
      const input = root.querySelector('[data-q]');
      const out = root.querySelector('[data-results]');
      setTimeout(() => input.focus(), 50);
      input.addEventListener('input', () => {
        const q = input.value.trim().toLowerCase();
        if (!q) { out.innerHTML = ''; return; }
        const digits = q.replace(/\D/g, '');
        const cs = state.clients.filter((c) =>
          [c.name, c.notes, c.nationality].join(' ').toLowerCase().includes(q) || (digits.length >= 3 && (c.phone || '').includes(digits)));
        const ps = state.properties.filter((p) =>
          [propertyTitle(p), AREA[p.area]?.name, p.building, p.ownerName, p.description, p.notes].join(' ').toLowerCase().includes(q) ||
          (digits.length >= 3 && ((p.ownerPhone || '').includes(digits) || String(p.price).includes(digits))));
        out.innerHTML = (cs.length ? `<div class="section-h"><h2>العملاء (${cs.length})</h2></div><div class="list">${cs.slice(0, 20).map((c) => clientRow(c)).join('')}</div>` : '')
          + (ps.length ? `<div class="section-h"><h2>العقارات (${ps.length})</h2></div><div class="list">${ps.slice(0, 20).map((p) => propertyRow(p)).join('')}</div>` : '')
          + (!cs.length && !ps.length ? emptyState('🔍', 'لا نتائج', `لا شيء يطابق "${esc(input.value)}"`) : '');
        import('./common.js').then((m) => m.hydrate(out));
      });
    },
  };
}

// ---------------- Settings ----------------

export function settingsView() {
  const s = state.settings;
  const totalValue = state.properties.filter((p) => p.status !== 'closed').reduce((a, p) => a + (p.deal === 'sale' ? +p.price || 0 : 0), 0);
  const won = state.clients.filter((c) => c.stage === 'won').length;
  const html = `<div class="page">
    ${topbar('الإعدادات', { back: '#/' })}
    <form class="card" data-profile>
      <h3 style="margin-top:0">👤 بياناتك</h3>
      <p class="muted small">تظهر في توقيع رسائل الواتساب وفي العلامة المائية على الصور.</p>
      <div class="form" style="padding:0;gap:12px">
        <div class="field"><label for="s-name">اسمك</label><input id="s-name" class="input" name="agentName" value="${esc(s.agentName)}" autocomplete="name"></div>
        <div class="field"><label for="s-phone">رقم جوالك</label><input id="s-phone" class="input num" name="agentPhone" type="tel" value="${esc(s.agentPhone)}" style="text-align:right"></div>
        <div class="field"><label for="s-agency">اسم الشركة / المكتب</label><input id="s-agency" class="input" name="agency" value="${esc(s.agency)}"></div>
        <div class="field"><label for="s-comm">عمولة البيع %</label><input id="s-comm" class="input num" name="saleCommission" inputmode="decimal" value="${esc(s.saleCommission)}" style="text-align:right"></div>
        <button class="btn btn-primary" type="submit">حفظ</button>
      </div>
    </form>

    <div class="card">
      <h3 style="margin-top:0">📷 الصور</h3>
      <div class="set-row"><div><b>تحسين تلقائي عند الإضافة</b><div class="muted small">إضاءة، توازن ألوان، حدة</div></div>
        <label class="switch"><input type="checkbox" data-set="autoEnhance" ${s.autoEnhance !== false ? 'checked' : ''}><span></span></label></div>
      <div class="set-row"><div><b>علامة مائية باسمك</b><div class="muted small">تحمي صورك عند مشاركتها</div></div>
        <label class="switch"><input type="checkbox" data-set="watermark" ${s.watermark ? 'checked' : ''}><span></span></label></div>
    </div>

    <div class="card">
      <h3 style="margin-top:0">📊 ملخص</h3>
      <div class="kv">
        <div><b class="num">${state.properties.length}</b><span>عقار</span></div>
        <div><b class="num">${state.clients.length}</b><span>عميل</span></div>
        <div><b class="num">${won}</b><span>صفقة مغلقة</span></div>
      </div>
      ${totalValue ? `<p class="muted small mt">قيمة العقارات المعروضة للبيع: <b>${money(totalValue)}</b></p>` : ''}
    </div>

    <div class="card">
      <h3 style="margin-top:0">💾 النسخ الاحتياطي</h3>
      <p class="muted small">بياناتك محفوظة على هذا الجهاز فقط. صدّر نسخة احتياطية بانتظام واحفظها في مكان آمن (Google Drive / iCloud).</p>
      ${s.lastBackup ? `<p class="small">آخر نسخة: ${esc(new Date(s.lastBackup).toLocaleDateString('ar-QA-u-nu-latn'))}</p>` : '<div class="banner">لم تُصدَّر أي نسخة احتياطية بعد</div>'}
      <div class="row gap">
        <button type="button" class="btn btn-primary grow" data-export>⬇️ تصدير</button>
        <label class="btn btn-outline grow">⬆️ استيراد<input type="file" accept="application/json,.json" hidden data-import></label>
      </div>
    </div>

    <div class="card">
      <button type="button" class="btn btn-ghost" style="width:100%" data-demo>تحميل بيانات تجريبية</button>
      <button type="button" class="btn btn-ghost mt" style="width:100%;color:var(--danger)" data-wipe>مسح كل البيانات</button>
    </div>
    <p class="muted small" style="text-align:center">وكيل · يعمل بدون إنترنت · ثبّته من قائمة المتصفح ← "إضافة إلى الشاشة الرئيسية"</p>
  </div>`;

  return {
    html,
    mount(root, refresh) {
      root.querySelector('[data-profile]').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target;
        await saveSettings({
          agentName: f.agentName.value.trim(),
          agentPhone: f.agentPhone.value.trim() ? normalizePhone(f.agentPhone.value) : '',
          agency: f.agency.value.trim(),
          saleCommission: parseFloat(f.saleCommission.value) || 0,
        });
        toast('تم الحفظ');
        refresh();
      });
      root.querySelectorAll('[data-set]').forEach((inp) => inp.addEventListener('change', async () => {
        await saveSettings({ [inp.dataset.set]: inp.checked });
        toast('تم الحفظ');
      }));
      root.querySelector('[data-export]').onclick = async (e) => {
        const b = e.currentTarget;
        b.disabled = true;
        try {
          const data = await exportAll();
          const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
          const name = `wakeel-backup-${new Date().toISOString().slice(0, 10)}.json`;
          const file = new File([blob], name, { type: 'application/json' });
          if (navigator.canShare?.({ files: [file] })) {
            try { await navigator.share({ files: [file], title: name }); } catch (err) { if (err.name === 'AbortError') { b.disabled = false; return; } download(blob, name); }
          } else download(blob, name);
          await saveSettings({ lastBackup: new Date().toISOString() });
          toast('تم تصدير النسخة الاحتياطية');
          refresh();
        } finally {
          b.disabled = false;
        }
      };
      root.querySelector('[data-import]').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!(await confirmSheet('استيراد النسخة سيدمجها مع بياناتك الحالية. متابعة؟', { ok: 'استيراد' }))) return;
        try {
          await importAll(JSON.parse(await file.text()));
          toast('تم الاستيراد بنجاح');
          refresh();
        } catch {
          toast('الملف غير صالح');
        }
      });
      root.querySelector('[data-demo]').onclick = async () => {
        const { loadDemo } = await import('../demo.js');
        await loadDemo();
        toast('تم تحميل البيانات التجريبية');
        location.hash = '#/';
      };
      root.querySelector('[data-wipe]').onclick = async () => {
        if (!(await confirmSheet('سيتم حذف كل العملاء والعقارات والصور نهائياً. هل صدّرت نسخة احتياطية؟', { ok: 'مسح نهائي', danger: true }))) return;
        await wipeAll();
        toast('تم مسح البيانات');
        location.hash = '#/';
      };
    },
  };
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
