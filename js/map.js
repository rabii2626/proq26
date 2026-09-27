// Lazy-loaded Leaflet maps (OpenStreetMap tiles) for the properties map and location picker.

const LEAFLET = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/';
const DOHA = [25.2854, 51.531];
let loading;

export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = LEAFLET + 'leaflet.css';
      document.head.appendChild(css);
      const js = document.createElement('script');
      js.src = LEAFLET + 'leaflet.js';
      js.onload = () => resolve(window.L);
      js.onerror = () => { loading = null; reject(new Error('map')); };
      document.head.appendChild(js);
    });
  }
  return loading;
}

export async function createMap(el, { center = DOHA, zoom = 11 } = {}) {
  const L = await loadLeaflet();
  const map = L.map(el, { zoomControl: false, attributionControl: true }).setView(center, zoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap',
  }).addTo(map);
  return { L, map };
}

export function priceIcon(L, label) {
  return L.divIcon({ className: '', html: `<span class="pin-price">${label}</span>`, iconSize: [0, 0] });
}

export function getPosition(opts = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('geo'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), acc: p.coords.accuracy }),
      reject,
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000, ...opts },
    );
  });
}

export { DOHA };
