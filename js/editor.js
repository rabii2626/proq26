// Full-screen photo editor: presets, sliders, rotate, watermark, press-and-hold to compare.

import { getPhoto, replacePhoto, state } from './db.js';
import { DEFAULTS, loadImage, toCanvas, analyse, applyAdjustments, render, pick, drawWatermark } from './photo.js';
import { toast, esc, haptic } from './ui.js';

const PREVIEW = 1000;

const SLIDERS = [
  { k: 'brightness', label: 'السطوع', min: -60, max: 60 },
  { k: 'contrast', label: 'التباين', min: -50, max: 50 },
  { k: 'shadows', label: 'الظلال', min: 0, max: 80 },
  { k: 'saturation', label: 'الألوان', min: -60, max: 60 },
  { k: 'warmth', label: 'الدفء', min: -50, max: 50 },
  { k: 'sharpness', label: 'الحدة', min: 0, max: 100 },
];

function presets(auto) {
  const a = pick(auto);
  return [
    { id: 'orig', name: 'الأصلية', auto: false, p: { ...DEFAULTS } },
    { id: 'auto', name: '✨ تلقائي', auto: true, p: { ...DEFAULTS, ...a } },
    { id: 'bright', name: '☀️ داخلي مضيء', auto: true, p: { ...DEFAULTS, ...a, shadows: Math.max(a.shadows, 40), brightness: a.brightness + 10, saturation: 10 } },
    { id: 'vivid', name: '🌴 خارجي حيوي', auto: true, p: { ...DEFAULTS, ...a, saturation: 30, contrast: 14, warmth: 6 } },
    { id: 'warm', name: '🌅 دافئ', auto: true, p: { ...DEFAULTS, ...a, warmth: 22, saturation: 12 } },
    { id: 'crisp', name: '❄️ نقي', auto: true, p: { ...DEFAULTS, ...a, warmth: -12, contrast: 16, sharpness: 60 } },
  ];
}

/** Open the editor for a stored photo. Resolves true if saved. */
export function openEditor(photoId) {
  return new Promise(async (resolve) => {
    const rec = await getPhoto(photoId);
    if (!rec) return resolve(false);
    const img = await loadImage(rec.original || rec.blob);
    const base = toCanvas(img, PREVIEW);
    const auto = analyse(base.getContext('2d').getImageData(0, 0, base.width, base.height));
    const list = presets(auto);
    const saved = rec.params || null;
    let useAuto = saved ? saved.auto !== false : true;
    let params = saved ? { ...DEFAULTS, ...saved } : { ...list[1].p };
    const same = (a, b) => ['brightness', 'contrast', 'shadows', 'saturation', 'warmth', 'sharpness'].every((k) => (a[k] || 0) === (b[k] || 0));
    let preset = saved ? list.find((pr) => pr.auto === useAuto && same(pr.p, params))?.id || '' : 'auto';
    const hasName = !!(state.settings.agentName || state.settings.agentPhone);
    let watermark = !!state.settings.watermark && hasName;

    const el = document.createElement('div');
    el.className = 'editor';
    el.innerHTML = `
      <div class="editor-top">
        <button type="button" data-cancel>إلغاء</button>
        <h3>تحسين الصورة</h3>
        <button type="button" data-rotate aria-label="تدوير">↻</button>
        <button type="button" class="save" data-save>حفظ</button>
      </div>
      <div class="editor-stage"><canvas></canvas><span class="compare-hint">اضغط مطولاً على الصورة للمقارنة بالأصل</span></div>
      <div class="editor-tools">
        <div class="editor-presets">${list.map((p) => `<button type="button" data-preset="${p.id}">${esc(p.name)}</button>`).join('')}</div>
        ${SLIDERS.map((s) => `<label class="slider"><span>${s.label}</span>
          <input type="range" min="${s.min}" max="${s.max}" step="1" data-k="${s.k}"><output data-o="${s.k}"></output></label>`).join('')}
        <div class="slider" style="grid-template-columns:1fr auto">
          <span>علامة مائية باسمك${state.settings.agentName ? '' : ' (أضف اسمك من الإعدادات)'}</span>
          <label class="switch"><input type="checkbox" data-wm ${watermark ? 'checked' : ''} ${hasName ? '' : 'disabled'}><span></span></label>
        </div>
      </div>`;
    document.body.appendChild(el);
    history.pushState({ editor: 1 }, '');

    const canvas = el.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    let comparing = false;
    let raf = 0;

    const wmText = () => [state.settings.agentName, state.settings.agentPhone].filter(Boolean).join(' · ');

    function draw() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const src = params.rotate ? toCanvas(base, PREVIEW, params.rotate) : base;
        canvas.width = src.width;
        canvas.height = src.height;
        ctx.drawImage(src, 0, 0);
        if (comparing) return;
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        applyAdjustments(data, params, useAuto ? auto : null);
        ctx.putImageData(data, 0, 0);
        if (watermark) drawWatermark(canvas, wmText());
      });
    }

    function syncControls() {
      el.querySelectorAll('[data-k]').forEach((inp) => {
        inp.value = params[inp.dataset.k] || 0;
        el.querySelector(`[data-o="${inp.dataset.k}"]`).textContent = params[inp.dataset.k] || 0;
      });
      el.querySelectorAll('[data-preset]').forEach((b) => b.classList.toggle('on', b.dataset.preset === preset));
    }

    function close(result) {
      el.remove();
      window.removeEventListener('popstate', onPop);
      resolve(result);
    }
    const onPop = () => close(false);
    window.addEventListener('popstate', onPop);

    el.querySelector('.editor-presets').addEventListener('click', (e) => {
      const b = e.target.closest('[data-preset]');
      if (!b) return;
      const pr = list.find((x) => x.id === b.dataset.preset);
      params = { ...pr.p, rotate: params.rotate };
      useAuto = pr.auto;
      preset = pr.id;
      haptic(5);
      syncControls();
      draw();
    });
    el.querySelectorAll('[data-k]').forEach((inp) =>
      inp.addEventListener('input', () => {
        params[inp.dataset.k] = +inp.value;
        el.querySelector(`[data-o="${inp.dataset.k}"]`).textContent = inp.value;
        preset = '';
        el.querySelectorAll('[data-preset]').forEach((b) => b.classList.remove('on'));
        draw();
      }),
    );
    el.querySelector('[data-wm]').addEventListener('change', (e) => { watermark = e.target.checked; draw(); });
    el.querySelector('[data-rotate]').onclick = () => { params.rotate = ((params.rotate || 0) + 90) % 360; draw(); };

    const stage = el.querySelector('.editor-stage');
    const hint = el.querySelector('.compare-hint');
    const startCompare = () => { comparing = true; hint.textContent = 'الأصل'; draw(); };
    const endCompare = () => { if (!comparing) return; comparing = false; hint.textContent = 'بعد التحسين'; draw(); };
    stage.addEventListener('pointerdown', startCompare);
    stage.addEventListener('pointerup', endCompare);
    stage.addEventListener('pointerleave', endCompare);
    stage.addEventListener('pointercancel', endCompare);
    stage.addEventListener('contextmenu', (e) => e.preventDefault());

    el.querySelector('[data-cancel]').onclick = () => history.back();
    el.querySelector('[data-save]').onclick = async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = '...جارٍ الحفظ';
      try {
        const out = await render(img, params, useAuto ? auto : null, watermark ? wmText() : '');
        await replacePhoto(photoId, { ...out, original: rec.original || rec.blob, params: { ...params, auto: useAuto } });
        toast('تم حفظ الصورة المحسّنة');
        window.removeEventListener('popstate', onPop);
        el.remove();
        history.back();
        resolve(true);
      } catch {
        btn.disabled = false;
        btn.textContent = 'حفظ';
        toast('تعذّر حفظ الصورة');
      }
    };

    syncControls();
    draw();
  });
}
