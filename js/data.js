// Reference data for Qatar real-estate work: areas, types, features, pipeline stages.

export const AREAS = [
  { id: 'west-bay', name: 'الخليج الغربي (ويست باي)', lat: 25.3226, lng: 51.531 },
  { id: 'pearl', name: 'اللؤلؤة - قطر', lat: 25.37, lng: 51.55 },
  { id: 'lusail', name: 'لوسيل', lat: 25.43, lng: 51.49 },
  { id: 'dafna', name: 'الدفنة', lat: 25.318, lng: 51.522 },
  { id: 'msheireb', name: 'مشيرب', lat: 25.286, lng: 51.525 },
  { id: 'sadd', name: 'السد', lat: 25.285, lng: 51.505 },
  { id: 'bin-mahmoud', name: 'بن محمود', lat: 25.283, lng: 51.515 },
  { id: 'mansoura', name: 'المنصورة', lat: 25.27, lng: 51.535 },
  { id: 'najma', name: 'النجمة', lat: 25.275, lng: 51.548 },
  { id: 'old-airport', name: 'المطار القديم', lat: 25.255, lng: 51.555 },
  { id: 'hilal', name: 'الهلال', lat: 25.26, lng: 51.545 },
  { id: 'thumama', name: 'الثمامة', lat: 25.23, lng: 51.55 },
  { id: 'waab', name: 'الوعب', lat: 25.262, lng: 51.47 },
  { id: 'aziziya', name: 'العزيزية', lat: 25.248, lng: 51.448 },
  { id: 'ain-khaled', name: 'عين خالد', lat: 25.225, lng: 51.46 },
  { id: 'madinat-khalifa', name: 'مدينة خليفة', lat: 25.315, lng: 51.48 },
  { id: 'gharafa', name: 'الغرافة', lat: 25.335, lng: 51.435 },
  { id: 'duhail', name: 'الدحيل', lat: 25.35, lng: 51.47 },
  { id: 'rayyan', name: 'الريان', lat: 25.292, lng: 51.424 },
  { id: 'muaither', name: 'معيذر', lat: 25.26, lng: 51.41 },
  { id: 'umm-salal', name: 'أم صلال', lat: 25.415, lng: 51.4 },
  { id: 'wakrah', name: 'الوكرة', lat: 25.171, lng: 51.603 },
  { id: 'wukair', name: 'الوكير', lat: 25.14, lng: 51.54 },
  { id: 'khor', name: 'الخور', lat: 25.68, lng: 51.497 },
];

export const TYPES = [
  { id: 'apartment', name: 'شقة', icon: '🏢' },
  { id: 'studio', name: 'استوديو', icon: '🛏️' },
  { id: 'villa', name: 'فيلا', icon: '🏡' },
  { id: 'compound', name: 'فيلا في كمباوند', icon: '🏘️' },
  { id: 'penthouse', name: 'بنتهاوس', icon: '🌆' },
  { id: 'townhouse', name: 'تاون هاوس', icon: '🏠' },
  { id: 'office', name: 'مكتب', icon: '💼' },
  { id: 'shop', name: 'محل تجاري', icon: '🏪' },
  { id: 'building', name: 'عمارة', icon: '🏬' },
  { id: 'land', name: 'أرض', icon: '🗺️' },
];

export const FEATURES = [
  { id: 'bills', name: 'الكهرباء والماء مشمولة' },
  { id: 'pool', name: 'مسبح' },
  { id: 'gym', name: 'نادي رياضي' },
  { id: 'parking', name: 'موقف سيارات' },
  { id: 'balcony', name: 'بلكونة' },
  { id: 'sea-view', name: 'إطلالة بحرية' },
  { id: 'maid', name: 'غرفة خادمة' },
  { id: 'garden', name: 'حديقة' },
  { id: 'security', name: 'حراسة 24/7' },
  { id: 'elevator', name: 'مصعد' },
  { id: 'central-ac', name: 'تكييف مركزي' },
  { id: 'kids', name: 'منطقة ألعاب أطفال' },
  { id: 'metro', name: 'قريب من المترو' },
  { id: 'pets', name: 'يسمح بالحيوانات' },
];

export const FURNISHING = [
  { id: 'furnished', name: 'مفروش' },
  { id: 'semi', name: 'نصف مفروش' },
  { id: 'unfurnished', name: 'غير مفروش' },
];

export const DEALS = [
  { id: 'rent', name: 'إيجار' },
  { id: 'sale', name: 'بيع' },
];

export const PROPERTY_STATUS = [
  { id: 'available', name: 'متاح', tone: 'ok' },
  { id: 'reserved', name: 'محجوز', tone: 'warn' },
  { id: 'closed', name: 'مؤجر / مباع', tone: 'mute' },
];

export const STAGES = [
  { id: 'new', name: 'جديد', tone: 'info' },
  { id: 'contacted', name: 'تم التواصل', tone: 'info' },
  { id: 'viewing', name: 'معاينة', tone: 'warn' },
  { id: 'negotiation', name: 'تفاوض', tone: 'warn' },
  { id: 'won', name: 'تم الإغلاق', tone: 'ok' },
  { id: 'lost', name: 'خسارة', tone: 'mute' },
];

export const ACTIVE_STAGES = ['new', 'contacted', 'viewing', 'negotiation'];

export const SOURCES = ['واتساب', 'اتصال', 'Property Finder', 'Qatar Living', 'انستغرام', 'توصية', 'زيارة مكتب', 'أخرى'];

export const APPT_TYPES = [
  { id: 'viewing', name: 'معاينة', icon: '🔑' },
  { id: 'call', name: 'اتصال', icon: '📞' },
  { id: 'meeting', name: 'اجتماع', icon: '🤝' },
  { id: 'contract', name: 'توقيع عقد', icon: '✍️' },
];

const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
export const AREA = byId(AREAS);
export const TYPE = byId(TYPES);
export const FEATURE = byId(FEATURES);
export const FURN = byId(FURNISHING);
export const DEAL = byId(DEALS);
export const PSTATUS = byId(PROPERTY_STATUS);
export const STAGE = byId(STAGES);
export const APPT = byId(APPT_TYPES);
