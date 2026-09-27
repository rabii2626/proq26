import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreMatch, matchesForClient, matchesForProperty, normalizePhone, parseLocation, distanceKm } from '../js/match.js';

const flat = { id: 'p1', deal: 'rent', type: 'apartment', area: 'pearl', price: 12000, bedrooms: 2, furnishing: 'furnished', features: ['pool', 'gym'], status: 'available' };
const client = { id: 'c1', deal: 'rent', types: ['apartment'], areas: ['pearl'], budgetMin: 9000, budgetMax: 13000, bedrooms: 2, furnishing: 'furnished', features: ['pool'], stage: 'new' };

test('perfect match scores 100 with reasons', () => {
  const m = scoreMatch(flat, client);
  assert.equal(m.score, 100);
  assert.ok(m.good.includes('ضمن الميزانية'));
  assert.deepEqual(m.bad, []);
});

test('deal type mismatch and closed listings are excluded', () => {
  assert.equal(scoreMatch({ ...flat, deal: 'sale' }, client), null);
  assert.equal(scoreMatch({ ...flat, status: 'closed' }, client), null);
});

test('more than 20% over budget is excluded, slightly over is penalised', () => {
  assert.equal(scoreMatch({ ...flat, price: 16000 }, client), null);
  const m = scoreMatch({ ...flat, price: 14000 }, client);
  assert.ok(m.score < 100 && m.score >= 60);
  assert.ok(m.bad.some((b) => b.includes('أعلى من الميزانية')));
});

test('similar type gets partial credit, wrong area drops below threshold combined with other misses', () => {
  const studio = scoreMatch({ ...flat, type: 'studio' }, client);
  const villa = scoreMatch({ ...flat, type: 'villa' }, client);
  assert.ok(studio.score > villa.score);
  const far = scoreMatch({ ...flat, type: 'villa', area: 'wakrah' }, client);
  assert.ok(far.score < 60);
});

test('empty preferences are treated as flexible', () => {
  const m = scoreMatch(flat, { deal: 'rent' });
  assert.ok(m.score >= 90);
});

test('matchesForClient sorts, filters and respects dismissed', () => {
  const props = [flat, { ...flat, id: 'p2', price: 14000 }, { ...flat, id: 'p3', deal: 'sale' }];
  const ms = matchesForClient(client, props);
  assert.deepEqual(ms.map((m) => m.property.id), ['p1', 'p2']);
  assert.deepEqual(matchesForClient({ ...client, dismissed: ['p1'] }, props).map((m) => m.property.id), ['p2']);
});

test('matchesForProperty only includes active clients', () => {
  const clients = [client, { ...client, id: 'c2', stage: 'lost' }];
  assert.deepEqual(matchesForProperty(flat, clients, 60, ['new']).map((m) => m.client.id), ['c1']);
});

test('normalizePhone handles Qatari formats', () => {
  assert.equal(normalizePhone('5555 1234'), '97455551234');
  assert.equal(normalizePhone('+974 5555-1234'), '97455551234');
  assert.equal(normalizePhone('0097455551234'), '97455551234');
  assert.equal(normalizePhone('+44 7700 900123'), '447700900123');
});

test('parseLocation reads Google Maps links and raw coordinates', () => {
  assert.deepEqual(parseLocation('https://www.google.com/maps/place/X/@25.3701,51.5512,17z'), { lat: 25.3701, lng: 51.5512 });
  assert.deepEqual(parseLocation('https://maps.google.com/?q=25.28,51.53'), { lat: 25.28, lng: 51.53 });
  assert.deepEqual(parseLocation('https://www.google.com/maps/place/data=!3d25.1!4d51.6'), { lat: 25.1, lng: 51.6 });
  assert.deepEqual(parseLocation('25.2854, 51.5310'), { lat: 25.2854, lng: 51.531 });
  assert.equal(parseLocation('hello'), null);
});

test('distanceKm between West Bay and The Pearl is roughly 5-6 km', () => {
  const d = distanceKm({ lat: 25.3226, lng: 51.531 }, { lat: 25.37, lng: 51.55 });
  assert.ok(d > 4.5 && d < 6.5, String(d));
});
