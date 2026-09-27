// Sample data so a new agent can explore the app before entering real listings.
import { save, state } from './db.js';
import { AREA } from './data.js';
import { localInput } from './ui.js';

const jitter = (v) => +(v + (Math.random() - 0.5) * 0.01).toFixed(6);
const at = (area) => ({ lat: jitter(AREA[area].lat), lng: jitter(AREA[area].lng) });

const PROPERTIES = [
  { deal: 'rent', type: 'apartment', area: 'pearl', price: 13500, bedrooms: 2, bathrooms: 3, size: 145, furnishing: 'furnished', features: ['pool', 'gym', 'sea-view', 'balcony', 'parking', 'security'], building: 'Porto Arabia – Tower 12', ownerName: 'أبو خالد', ownerPhone: '97455512345', description: 'شقة بإطلالة بحرية كاملة على المارينا، تشطيب فاخر.' },
  { deal: 'rent', type: 'apartment', area: 'lusail', price: 9000, bedrooms: 2, bathrooms: 2, size: 120, furnishing: 'semi', features: ['bills', 'pool', 'gym', 'parking', 'metro'], building: 'Fox Hills', ownerName: 'شركة الريان العقارية', ownerPhone: '97444412345' },
  { deal: 'rent', type: 'compound', area: 'waab', price: 22000, bedrooms: 4, bathrooms: 5, size: 380, furnishing: 'unfurnished', features: ['pool', 'gym', 'garden', 'kids', 'maid', 'security', 'central-ac'], ownerName: 'مكتب الوعب', ownerPhone: '97466612345', description: 'فيلا في كمباوند عائلي هادئ، قريب من المدارس الدولية.' },
  { deal: 'rent', type: 'studio', area: 'bin-mahmoud', price: 4200, bedrooms: 1, bathrooms: 1, size: 45, furnishing: 'furnished', features: ['bills', 'metro', 'elevator'], ownerName: 'حارس العمارة', ownerPhone: '97433312345' },
  { deal: 'sale', type: 'apartment', area: 'lusail', price: 1650000, bedrooms: 2, bathrooms: 3, size: 150, furnishing: 'unfurnished', features: ['sea-view', 'pool', 'gym', 'parking'], building: 'Waterfront', description: 'تملك حر للأجانب، تسليم فوري.' },
  { deal: 'sale', type: 'villa', area: 'gharafa', price: 4200000, bedrooms: 6, bathrooms: 7, size: 600, furnishing: 'unfurnished', features: ['garden', 'maid', 'parking', 'central-ac'], ownerName: 'أبو محمد', ownerPhone: '97455598765' },
  { deal: 'rent', type: 'office', area: 'west-bay', price: 18000, bedrooms: 0, bathrooms: 2, size: 200, furnishing: 'semi', features: ['parking', 'elevator', 'security', 'metro'], building: 'Tornado Tower' },
  { deal: 'rent', type: 'apartment', area: 'sadd', price: 7500, bedrooms: 3, bathrooms: 2, size: 160, furnishing: 'unfurnished', features: ['parking', 'elevator', 'central-ac'], status: 'reserved' },
];

const CLIENTS = [
  { name: 'أحمد المنصوري', phone: '97450011223', deal: 'rent', types: ['apartment'], areas: ['pearl', 'lusail'], budgetMin: 10000, budgetMax: 14000, bedrooms: 2, furnishing: 'furnished', stage: 'contacted', source: 'Property Finder', nationality: 'قطر', followIn: 0 },
  { name: 'Sarah Johnson', phone: '97450022334', deal: 'rent', types: ['compound', 'villa'], areas: ['waab', 'aziziya', 'gharafa'], budgetMax: 24000, bedrooms: 4, furnishing: 'any', features: ['pool', 'kids'], stage: 'viewing', source: 'توصية', nationality: 'بريطانيا', followIn: 1 },
  { name: 'محمد عبدالله', phone: '97450033445', deal: 'rent', types: ['studio', 'apartment'], areas: ['bin-mahmoud', 'sadd', 'mansoura'], budgetMax: 5000, bedrooms: 1, furnishing: 'furnished', stage: 'new', source: 'واتساب', nationality: 'مصر', followIn: -1 },
  { name: 'Rajesh Kumar', phone: '97450044556', deal: 'sale', types: ['apartment'], areas: ['lusail', 'pearl'], budgetMin: 1200000, budgetMax: 1800000, bedrooms: 2, stage: 'negotiation', source: 'Qatar Living', nationality: 'الهند', followIn: 2 },
  { name: 'شركة النخبة للتجارة', phone: '97444455667', deal: 'rent', types: ['office'], areas: ['west-bay', 'dafna'], budgetMax: 20000, stage: 'contacted', source: 'اتصال', followIn: 3 },
  { name: 'فاطمة الكواري', phone: '97450066778', deal: 'sale', types: ['villa'], areas: ['gharafa', 'duhail', 'rayyan'], budgetMax: 4500000, bedrooms: 5, stage: 'new', source: 'انستغرام', nationality: 'قطر', followIn: 0 },
];

export async function loadDemo() {
  const props = [];
  for (const p of PROPERTIES) props.push(await save('properties', { status: 'available', photos: [], ...p, ...at(p.area) }));
  const clients = [];
  for (const { followIn, ...c } of CLIENTS) {
    const d = new Date();
    d.setDate(d.getDate() + followIn);
    clients.push(await save('clients', { ...c, nextFollowUp: localInput(d), log: [{ at: new Date().toISOString(), text: 'تمت إضافة العميل' }] }));
  }
  const when = (dayOffset, h, m = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };
  const appts = [
    { type: 'viewing', date: when(0, 10, 30), clientId: clients[0].id, propertyId: props[0].id, note: 'المفتاح عند الاستقبال' },
    { type: 'viewing', date: when(0, 12), clientId: clients[0].id, propertyId: props[1].id },
    { type: 'call', date: when(0, 15), clientId: clients[3].id, note: 'متابعة العرض النهائي' },
    { type: 'viewing', date: when(0, 17, 30), clientId: clients[1].id, propertyId: props[2].id },
    { type: 'contract', date: when(1, 11), clientId: clients[3].id, propertyId: props[4].id },
  ];
  for (const a of appts) await save('appointments', { done: false, ...a });
  return state;
}
