export interface City {
  id: string;
  name: string;
  nameAr: string;
  region: string;
}

export const CITIES: City[] = [
  { id: 'cairo',           name: 'Cairo',              nameAr: 'القاهرة',        region: 'Greater Cairo' },
  { id: 'giza',            name: 'Giza',               nameAr: 'الجيزة',         region: 'Greater Cairo' },
  { id: 'alexandria',      name: 'Alexandria',          nameAr: 'الإسكندرية',    region: 'North Coast' },
  { id: 'north-coast',     name: 'North Coast (Sahel)', nameAr: 'الساحل الشمالي', region: 'North Coast' },
  { id: 'hurghada',        name: 'Hurghada',            nameAr: 'الغردقة',        region: 'Red Sea' },
  { id: 'el-gouna',        name: 'El Gouna',            nameAr: 'الجونة',         region: 'Red Sea' },
  { id: 'el-ain-el-sokhna', name: 'Ain Sokhna',         nameAr: 'العين السخنة',  region: 'Red Sea' },
  { id: 'marsa-alam',      name: 'Marsa Alam',          nameAr: 'مرسى علم',      region: 'Red Sea' },
  { id: 'sharm-el-sheikh', name: 'Sharm El Sheikh',     nameAr: 'شرم الشيخ',     region: 'Sinai' },
  { id: 'dahab',           name: 'Dahab',               nameAr: 'دهب',           region: 'Sinai' },
  { id: 'taba',            name: 'Taba',                nameAr: 'طابا',           region: 'Sinai' },
  { id: 'luxor',           name: 'Luxor',               nameAr: 'الأقصر',        region: 'Upper Egypt' },
  { id: 'aswan',           name: 'Aswan',               nameAr: 'أسوان',         region: 'Upper Egypt' },
  { id: 'faiyum',          name: 'Faiyum',              nameAr: 'الفيوم',        region: 'Upper Egypt' },
  { id: 'port-said',       name: 'Port Said',           nameAr: 'بور سعيد',      region: 'Canal Zone' },
  { id: 'suez',            name: 'Suez',                nameAr: 'السويس',        region: 'Canal Zone' },
  { id: 'ismailia',        name: 'Ismailia',            nameAr: 'الإسماعيلية',  region: 'Canal Zone' },
  { id: 'mansoura',        name: 'Mansoura',            nameAr: 'المنصورة',      region: 'Delta' },
  { id: 'tanta',           name: 'Tanta',               nameAr: 'طنطا',          region: 'Delta' },
  { id: 'cairo-airport',   name: 'Cairo Airport (CAI)', nameAr: 'مطار القاهرة', region: 'Greater Cairo' },
];

/** Look up a city by ID — used in validation */
export function getCityById(id: string): City | undefined {
  return CITIES.find((c) => c.id === id);
}
