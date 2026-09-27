// Photo enhancement for property listings: auto levels, white balance, shadow lift,
// saturation, sharpening, rotation and an agent watermark — all client-side on canvas.

export const DEFAULTS = { brightness: 0, contrast: 0, shadows: 0, saturation: 0, warmth: 0, sharpness: 0, rotate: 0 };

const MAX_FULL = 1920;
const MAX_THUMB = 480;

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = typeof src === 'string' ? src : URL.createObjectURL(src);
  });
}

/** Draw an image (rotated) into a new canvas no larger than maxSide. */
export function toCanvas(img, maxSide, rotate = 0) {
  const w0 = img.naturalWidth || img.width;
  const h0 = img.naturalHeight || img.height;
  const scale = Math.min(1, maxSide / Math.max(w0, h0));
  const w = Math.round(w0 * scale);
  const h = Math.round(h0 * scale);
  const swap = rotate % 180 !== 0;
  const c = document.createElement('canvas');
  c.width = swap ? h : w;
  c.height = swap ? w : h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((rotate * Math.PI) / 180);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  return c;
}

/** Analyse an image and propose "auto enhance" settings. */
export function analyse(imageData) {
  const d = imageData.data;
  const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  const lum = new Uint32Array(256);
  let sumR = 0, sumG = 0, sumB = 0, n = 0;
  const step = Math.max(1, Math.floor(d.length / 4 / 200000)) * 4;
  for (let i = 0; i < d.length; i += step) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    hist[0][r]++; hist[1][g]++; hist[2][b]++;
    lum[(r * 0.299 + g * 0.587 + b * 0.114) | 0]++;
    sumR += r; sumG += g; sumB += b; n++;
  }
  const clip = n * 0.005;
  const levels = hist.map((h) => {
    let lo = 0, hi = 255, acc = 0;
    while (lo < 254 && (acc += h[lo]) < clip) lo++;
    acc = 0;
    while (hi > lo + 1 && (acc += h[hi]) < clip) hi--;
    return [lo, hi];
  });
  let meanL = 0;
  for (let i = 0; i < 256; i++) meanL += i * lum[i];
  meanL /= n;
  const avg = (sumR + sumG + sumB) / 3 / n;
  // Gray-world white balance, applied at half strength to keep the mood of the room.
  const wb = [sumR, sumG, sumB].map((s) => 1 + ((avg / (s / n || 1)) - 1) * 0.5);
  return {
    levels,
    wb,
    // Interiors are usually under-exposed: lift shadows and brightness when the image is dark.
    shadows: meanL < 110 ? Math.round(Math.min(45, (110 - meanL) * 0.6)) : 8,
    brightness: meanL < 100 ? Math.round(Math.min(18, (100 - meanL) * 0.25)) : 0,
    contrast: 8,
    saturation: 14,
    sharpness: 35,
    warmth: 0,
  };
}

/**
 * Apply adjustments to an ImageData in place.
 * p: { brightness, contrast, shadows, saturation, warmth, sharpness } in -100..100 (sharpness 0..100)
 * auto: result of analyse() or null.
 */
export function applyAdjustments(imageData, p, auto) {
  const d = imageData.data;
  const lut = [new Uint8ClampedArray(256), new Uint8ClampedArray(256), new Uint8ClampedArray(256)];
  const bright = (p.brightness || 0) * 1.2;
  const cf = (259 * ((p.contrast || 0) * 1.28 + 255)) / (255 * (259 - (p.contrast || 0) * 1.28));
  const shadows = (p.shadows || 0) / 100;
  const warm = (p.warmth || 0) * 0.3;
  for (let c = 0; c < 3; c++) {
    const [lo, hi] = auto ? auto.levels[c] : [0, 255];
    const wb = auto ? auto.wb[c] : 1;
    for (let v = 0; v < 256; v++) {
      let x = ((v - lo) * 255) / Math.max(1, hi - lo);
      x *= wb;
      // Shadow lift: raise dark tones along a smooth curve, leave highlights alone.
      const t = Math.max(0, Math.min(1, x / 255));
      x += shadows * 110 * Math.pow(1 - t, 2) * t * 2.2;
      x += bright;
      x = (x - 128) * cf + 128;
      if (c === 0) x += warm;
      if (c === 2) x -= warm;
      lut[c][v] = x;
    }
  }
  const sat = 1 + (p.saturation || 0) / 100;
  for (let i = 0; i < d.length; i += 4) {
    let r = lut[0][d[i]], g = lut[1][d[i + 1]], b = lut[2][d[i + 2]];
    if (sat !== 1) {
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      r = l + (r - l) * sat;
      g = l + (g - l) * sat;
      b = l + (b - l) * sat;
    }
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  if (p.sharpness > 0) sharpen(imageData, p.sharpness / 100);
  return imageData;
}

/** Unsharp mask with a 3x3 kernel. amount 0..1 */
function sharpen(imageData, amount) {
  const { width: w, height: h, data: d } = imageData;
  const src = new Uint8ClampedArray(d);
  const k = amount * 0.9;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const blur =
          (src[i - 4 + c] + src[i + 4 + c] + src[i - w * 4 + c] + src[i + w * 4 + c] + src[i + c] * 4) / 8;
        d[i + c] = src[i + c] + (src[i + c] - blur) * k * 2;
      }
    }
  }
}

export function drawWatermark(canvas, text) {
  if (!text) return;
  const ctx = canvas.getContext('2d');
  const size = Math.max(14, Math.round(canvas.width / 38));
  ctx.save();
  ctx.font = `600 ${size}px Tajawal, system-ui, sans-serif`;
  ctx.direction = 'rtl';
  const pad = size * 0.6;
  const tw = ctx.measureText(text).width;
  const x = canvas.width - pad;
  const y = canvas.height - pad;
  ctx.fillStyle = 'rgba(0,0,0,.38)';
  const r = size * 0.4;
  const bx = x - tw - pad, by = y - size - pad * 0.6, bw = tw + pad * 2, bh = size + pad * 1.2;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(bx, by, bw, bh, r) : ctx.rect(bx, by, bw, bh);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.92)';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(text, x, y);
  ctx.restore();
}

export const canvasToBlob = (canvas, quality = 0.86) =>
  new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

/** Render the final full-size photo + thumbnail. */
export async function render(img, params, auto, watermark) {
  const full = toCanvas(img, MAX_FULL, params.rotate || 0);
  const ctx = full.getContext('2d', { willReadFrequently: true });
  const data = ctx.getImageData(0, 0, full.width, full.height);
  applyAdjustments(data, params, auto);
  ctx.putImageData(data, 0, 0);
  if (watermark) drawWatermark(full, watermark);
  const thumb = toCanvas(full, MAX_THUMB);
  return { blob: await canvasToBlob(full), thumb: await canvasToBlob(thumb, 0.8) };
}

/** Import a raw camera photo: downscale + thumbnail, optionally auto-enhanced. */
export async function importPhoto(file, { enhance = true, watermark = '' } = {}) {
  const img = await loadImage(file);
  const original = await canvasToBlob(toCanvas(img, MAX_FULL), 0.9);
  const probe = toCanvas(img, 400);
  const auto = analyse(probe.getContext('2d').getImageData(0, 0, probe.width, probe.height));
  const params = enhance ? { ...DEFAULTS, ...pick(auto), auto: true } : { ...DEFAULTS, auto: false };
  const out = await render(img, params, enhance ? auto : null, watermark);
  URL.revokeObjectURL(img.src);
  return { ...out, original, params };
}

export const pick = (a) => ({
  brightness: a.brightness, contrast: a.contrast, shadows: a.shadows,
  saturation: a.saturation, warmth: a.warmth, sharpness: a.sharpness,
});
