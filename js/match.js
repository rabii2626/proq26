// Property ↔ client matching. Pure functions so they can be unit-tested in Node.

export const MATCH_THRESHOLD = 60;

const WEIGHTS = { budget: 30, type: 25, area: 20, beds: 15, furnishing: 5, features: 5 };

/**
 * Score how well a property fits a client's request.
 * Returns null when a hard requirement fails (deal type, unavailable, far over budget),
 * otherwise { score: 0-100, good: [...reasons], bad: [...reasons] }.
 */
export function scoreMatch(property, client) {
  if (!property || !client) return null;
  if (property.status === 'closed') return null;
  if (client.deal && property.deal && client.deal !== property.deal) return null;

  const good = [];
  const bad = [];
  let score = 0;

  // Budget
  const price = Number(property.price) || 0;
  const min = Number(client.budgetMin) || 0;
  const max = Number(client.budgetMax) || 0;
  if (!price || (!min && !max)) {
    score += WEIGHTS.budget * 0.7;
  } else if (max && price > max) {
    const over = (price - max) / max;
    if (over > 0.2) return null;
    if (over <= 0.1) {
      score += WEIGHTS.budget * 0.5;
      bad.push(`أعلى من الميزانية ${Math.round(over * 100)}%`);
    } else {
      score += WEIGHTS.budget * 0.2;
      bad.push(`أعلى من الميزانية ${Math.round(over * 100)}%`);
    }
  } else if (min && price < min * 0.7) {
    score += WEIGHTS.budget * 0.6;
    bad.push('أقل بكثير من الميزانية');
  } else {
    score += WEIGHTS.budget;
    good.push('ضمن الميزانية');
  }

  // Property type
  const types = client.types || [];
  if (!types.length) score += WEIGHTS.type;
  else if (types.includes(property.type)) {
    score += WEIGHTS.type;
    good.push('النوع المطلوب');
  } else if (isSimilarType(property.type, types)) {
    score += WEIGHTS.type * 0.5;
    bad.push('نوع قريب');
  } else {
    bad.push('نوع مختلف');
  }

  // Area
  const areas = client.areas || [];
  if (!areas.length) score += WEIGHTS.area;
  else if (areas.includes(property.area)) {
    score += WEIGHTS.area;
    good.push('المنطقة المفضلة');
  } else {
    bad.push('منطقة أخرى');
  }

  // Bedrooms
  const want = Number(client.bedrooms) || 0;
  const has = Number(property.bedrooms) || 0;
  if (!want || has >= want) {
    score += WEIGHTS.beds;
    if (want) good.push(`${has} غرف`);
  } else if (has === want - 1) {
    score += WEIGHTS.beds * 0.4;
    bad.push('غرفة أقل');
  } else {
    bad.push('غرف أقل');
  }

  // Furnishing
  if (!client.furnishing || client.furnishing === 'any' || client.furnishing === property.furnishing) {
    score += WEIGHTS.furnishing;
  } else if (client.furnishing === 'semi' || property.furnishing === 'semi') {
    score += WEIGHTS.furnishing * 0.5;
  } else {
    bad.push('الفرش مختلف');
  }

  // Features
  const wanted = client.features || [];
  if (!wanted.length) score += WEIGHTS.features;
  else {
    const have = new Set(property.features || []);
    const hit = wanted.filter((f) => have.has(f)).length;
    score += WEIGHTS.features * (hit / wanted.length);
    if (hit === wanted.length) good.push('كل المزايا');
  }

  if (property.status === 'reserved') bad.push('محجوز حالياً');

  return { score: Math.round(score), good, bad };
}

const TYPE_GROUPS = [
  ['apartment', 'studio', 'penthouse'],
  ['villa', 'compound', 'townhouse'],
  ['office', 'shop', 'building'],
];

function isSimilarType(type, wanted) {
  const group = TYPE_GROUPS.find((g) => g.includes(type));
  return !!group && wanted.some((w) => group.includes(w));
}

/** Properties matching a client, best first. Skips dismissed ones. */
export function matchesForClient(client, properties, threshold = MATCH_THRESHOLD) {
  const dismissed = new Set(client.dismissed || []);
  return properties
    .filter((p) => !dismissed.has(p.id))
    .map((p) => ({ property: p, client, ...scoreMatch(p, client) }))
    .filter((m) => m.score >= threshold)
    .sort((a, b) => b.score - a.score);
}

/** Clients interested in a property, best first. Only active pipeline clients. */
export function matchesForProperty(property, clients, threshold = MATCH_THRESHOLD, activeStages) {
  return clients
    .filter((c) => !activeStages || activeStages.includes(c.stage))
    .filter((c) => !(c.dismissed || []).includes(property.id))
    .map((c) => ({ property, client: c, ...scoreMatch(property, c) }))
    .filter((m) => m.score >= threshold)
    .sort((a, b) => b.score - a.score);
}

/** Great-circle distance in km. */
export function distanceKm(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Normalise a Qatari phone number to international digits (974XXXXXXXX). */
export function normalizePhone(raw) {
  let d = String(raw || '').replace(/[^\d+]/g, '');
  d = d.replace(/^\+/, '').replace(/^00/, '');
  if (/^[3-7]\d{7}$/.test(d)) d = '974' + d;
  return d;
}

/** Extract coordinates from a pasted Google Maps / Waze link or "lat, lng" text. */
export function parseLocation(text) {
  if (!text) return null;
  const s = decodeURIComponent(String(text));
  const patterns = [
    /@(-?\d+\.\d+),\s*(-?\d+\.\d+)/,
    /[?&](?:q|query|ll|destination|daddr)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/,
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
    /^\s*(-?\d+\.\d+)\s*[, ]\s*(-?\d+\.\d+)\s*$/,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
    }
  }
  return null;
}
