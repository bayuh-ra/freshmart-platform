import type {
  AppState, Branch, Category, City, Customer, CutFeeType, CutOption, DeliveryZone, Order, OrderItem, OrderStatus,
  PaymentMethod, PriceList, Product, Receiving, Rider, Role, Setting, StaffUser, StockMovement, Supplier, Voucher,
  Fulfillment, AuditLog, Banner, StorageType, CatalogFile,
} from './types';

// Bump when the seed shape changes: browsers holding an older version reseed once.
export const STATE_VERSION = 14;

// Deterministic pseudo-random so the seed looks the same on every reset.
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

const iso = (d: Date) => d.toISOString();
const minsAgo = (m: number) => iso(new Date(Date.now() - m * 60_000));
const daysAgo = (d: number, hour = 10, min = 0) => {
  const x = new Date();
  x.setDate(x.getDate() - d);
  x.setHours(hour, min, 0, 0);
  return iso(x);
};

// ---------- One meat shop branch around Digos City (spec v6 Project Summary) ----------
const cities: City[] = [{ id: 'c-dgs', name: 'Digos City', region: 'Davao del Sur', status: 'active' }];

const branches: Branch[] = [
  {
    id: 'b-dgs', code: 'DGS', name: 'Digos', cityId: 'c-dgs', address: 'Rizal Ave, Zone 1, Digos City, Davao del Sur',
    phone: '(082) 553-1001', email: 'digos@jovannesmeatshop.ph', lat: 6.7497, lng: 125.3572, hours: '6:00 AM – 8:00 PM', status: 'active',
    services: { delivery: true, pickup: true, walkIn: false, phone: false, picker: true }, pickupInstructions: 'Pickup counter beside the meat display',
  },
];

const topCategories: Category[] = [
  { id: 'cat-beef', name: 'Beef', icon: '🥩', sort: 1, photo: '/images/photos/beef-steak.jpg', color: '#c8151d', soldBy: 'kg', coldChain: true, description: 'Fresh local beef, cut to order.' },
  { id: 'cat-pork', name: 'Pork', icon: '🥓', sort: 2, photo: '/images/photos/cat-pork.jpg', color: '#a8612e', soldBy: 'kg', coldChain: true, description: 'Local pork, cut fresh every morning.' },
  { id: 'cat-chicken', name: 'Chicken', icon: '🍗', sort: 3, photo: '/images/photos/cat-chicken.jpg', color: '#e0a33a', soldBy: 'kg', coldChain: true, description: 'Farm-fresh chicken, whole or in parts.' },
  { id: 'cat-processed', name: 'Processed Meats', icon: '🌭', sort: 4, photo: '/images/photos/cat-processed.jpg', color: '#8b2f6e', soldBy: 'pack', coldChain: true, description: 'House-made longganisa, tocino and more.' },
  { id: 'cat-seafood', name: 'Seafood', icon: '🐟', sort: 5, photo: '/images/photos/cat-seafood.jpg', color: '#1f6f6a', soldBy: 'kg', coldChain: true, description: 'Fresh catch from the Digos fish port.' },
  { id: 'cat-grocery', name: 'Groceries', icon: '🛒', sort: 6, photo: '/images/photos/cat-grocery.jpg', color: '#6f6764', soldBy: 'piece', coldChain: false, description: 'Rice, sauces and everything for the pot.' },
];

// Subcategories: [id, parent, name, hidden, product ids]. Products keep categoryId = the top level.
const subcategorySeed: [string, string, string, boolean, string[]][] = [
  ['sub-beef-steaks', 'cat-beef', 'Steaks', false, ['p-beef-sirloin', 'p-beef-tenderloin', 'p-beef-ribeye', 'p-beef-tbone', 'p-beef-flank', 'p-beef-tapacut']],
  ['sub-beef-soup', 'cat-beef', 'Soup & stew cuts', false, ['p-beef-brisket', 'p-beef-shortribs', 'p-beef-shank', 'p-beef-kenchi', 'p-beef-chuck', 'p-beef-oxtail', 'p-beef-bones']],
  ['sub-beef-ground', 'cat-beef', 'Ground & cubes', false, ['p-beef-ground', 'p-beef-cubes', 'p-beef-round']],
  ['sub-beef-offal', 'cat-beef', 'Offal', false, ['p-beef-tripe', 'p-beef-liver']],
  ['sub-pork-belly', 'cat-pork', 'Belly & bones', false, ['p-pork-liempo', 'p-pork-belly', 'p-pork-kawali', 'p-pork-neckbones']],
  ['sub-pork-ribs', 'cat-pork', 'Ribs', false, ['p-pork-spareribs', 'p-pork-babyback']],
  ['sub-pork-chops', 'cat-pork', 'Chops & steaks', false, ['p-pork-chop', 'p-pork-tenderloin', 'p-pork-loin', 'p-pork-bbq']],
  ['sub-pork-roast', 'cat-pork', 'Roast & stew cuts', false, ['p-pork-kasim', 'p-pork-pigue', 'p-pork-shoulder', 'p-pork-sinigang']],
  ['sub-pork-ground', 'cat-pork', 'Ground', false, ['p-pork-ground']],
  ['sub-pork-pata', 'cat-pork', 'Pata & trotters', false, ['p-pork-pata']],
  ['sub-pork-offal', 'cat-pork', 'Offal', true, ['p-pork-ears', 'p-pork-liver', 'p-pork-intestine', 'p-pork-maskara']],
  ['sub-chicken-parts', 'cat-chicken', 'Whole & parts', false, ['p-chicken-whole', 'p-chicken-legquarter', 'p-chicken-drumstick', 'p-chicken-thigh', 'p-chicken-wings']],
  ['sub-chicken-fillets', 'cat-chicken', 'Breast & fillets', false, ['p-chicken-breast', 'p-chicken-fillet', 'p-chicken-thighfillet', 'p-chicken-ground']],
  ['sub-chicken-cuts', 'cat-chicken', 'Adobo & tinola cuts', false, ['p-chicken-tinola', 'p-chicken-adobo']],
  ['sub-chicken-offal', 'cat-chicken', 'Offal & extras', false, ['p-chicken-liver', 'p-chicken-gizzard', 'p-chicken-feet', 'p-chicken-neck', 'p-chicken-skin']],
  ['sub-proc-longganisa', 'cat-processed', 'Longganisa & tocino', false, ['p-longganisa', 'p-garlic-longganisa', 'p-skinless', 'p-tocino', 'p-chicken-tocino', 'p-beef-tapa']],
  ['sub-proc-ham', 'cat-processed', 'Ham, bacon & hotdogs', false, ['p-hotdog', 'p-ham', 'p-bacon', 'p-cornedbeef', 'p-embutido']],
  ['sub-proc-ready', 'cat-processed', 'Ready to cook', false, ['p-nuggets', 'p-bbq-skewers', 'p-siomai']],
  ['sub-sea-fish', 'cat-seafood', 'Fresh fish', false, ['p-tilapia', 'p-bangus', 'p-galunggong', 'p-tuna-belly', 'p-pompano', 'p-boneless-bangus', 'p-cream-dory']],
  ['sub-sea-shellfish', 'cat-seafood', 'Shellfish & squid', false, ['p-shrimp', 'p-squid', 'p-mussels']],
  ['sub-gro-pantry', 'cat-grocery', 'Rice & pantry', false, ['p-rice', 'p-eggs', 'p-oil', 'p-charcoal', 'p-cola']],
  ['sub-gro-sauces', 'cat-grocery', 'Sauces & condiments', false, ['p-soy', 'p-vinegar', 'p-patis', 'p-bbq-marinade', 'p-ketchup', 'p-oyster']],
  ['sub-gro-spices', 'cat-grocery', 'Spices & mixes', false, ['p-sinigang-mix', 'p-adobo-mix', 'p-pepper', 'p-salt', 'p-sugar']],
  ['sub-gro-produce', 'cat-grocery', 'Fresh produce', false, ['p-garlic', 'p-onion', 'p-calamansi', 'p-ginger', 'p-tomato', 'p-lemongrass']],
];
const subcategories: Category[] = subcategorySeed.map(([id, parentId, name, hidden], i) => ({
  id, name, parentId, icon: topCategories.find((c) => c.id === parentId)!.icon,
  sort: subcategorySeed.slice(0, i).filter((x) => x[1] === parentId).length + 1,
  ...(hidden ? { hidden: true } : {}),
}));
const SUBCATEGORY_OF: Record<string, string> = Object.fromEntries(subcategorySeed.flatMap(([id, , , , pids]) => pids.map((pid) => [pid, id])));
const categories: Category[] = [...topCategories, ...subcategories];

/** Cut & preparation options. Ids are kept from earlier versions where the option still exists, so old orders keep their references. */
const BEEF = 'cat-beef', PORK = 'cat-pork', CHICKEN = 'cat-chicken', SEAFOOD = 'cat-seafood';
const cutOptions: CutOption[] = [
  { id: 'co-whole', name: 'Whole / as is', fee: 0, feeType: 'free', prepMins: 0, categoryIds: [BEEF, PORK, CHICKEN, SEAFOOD], active: true },
  { id: 'co-cubed', name: 'Cubed (stew)', fee: 0, feeType: 'free', prepMins: 5, categoryIds: [BEEF, PORK], active: true, instructions: 'About 3 cm cubes. Trim large fat caps.' },
  { id: 'co-steak', name: 'Steak cut (thick)', fee: 0, feeType: 'free', prepMins: 5, categoryIds: [BEEF, PORK], active: true, instructions: 'About 2.5 cm thick, across the grain.' },
  { id: 'co-thin', name: 'Sliced thin (samgyup)', fee: 20, feeType: 'kg', prepMins: 10, categoryIds: [BEEF, PORK], active: true, instructions: '3 mm on the slicer. Layer flat on paper.' },
  { id: 'co-tinola', name: 'For tinola', fee: 0, feeType: 'free', prepMins: 5, categoryIds: [CHICKEN], active: true, instructions: 'Chop into serving pieces, bone in.' },
  { id: 'co-adobo', name: 'For adobo', fee: 0, feeType: 'free', prepMins: 5, categoryIds: [PORK, CHICKEN], active: true, instructions: 'Chop into 4-5 cm pieces, bone in.' },
  { id: 'co-ground', name: 'Ground (fresh)', fee: 10, feeType: 'kg', prepMins: 8, categoryIds: [BEEF, PORK, CHICKEN], active: true, instructions: 'Medium plate, ground once. Clean the grinder between meats.' },
  { id: 'co-deboned', name: 'Deboned', fee: 30, feeType: 'kg', prepMins: 10, categoryIds: [CHICKEN, SEAFOOD], active: true },
  { id: 'co-butterfly', name: 'Butterflied', fee: 15, feeType: 'piece', prepMins: 5, categoryIds: [SEAFOOD], active: true },
  { id: 'co-cleaned', name: 'Cleaned & scaled', fee: 0, feeType: 'free', prepMins: 8, categoryIds: [SEAFOOD], active: true, instructions: 'Scale, gut and rinse. Keep the head on unless asked.' },
  { id: 'co-skinless', name: 'Skin removed', fee: 0, feeType: 'free', prepMins: 5, categoryIds: [PORK, CHICKEN], active: false },
];

// Older option ids (v12 and before) -> the option that replaced them.
const LEGACY_CUT: Record<string, string> = {
  'co-sliced': 'co-thin', 'co-tapa': 'co-thin', 'co-bbq': 'co-thin',
  'co-sinigang': 'co-cubed', 'co-kawali': 'co-cubed', 'co-nilaga': 'co-cubed', 'co-cutup': 'co-adobo',
};
// Extra options per product on top of the row's list.
const EXTRA_CUTS: Record<string, string[]> = {
  'p-pork-liempo': ['co-skinless'], 'p-pork-belly': ['co-skinless'], 'p-pork-kasim': ['co-steak', 'co-skinless'], 'p-pork-pigue': ['co-skinless'],
  'p-pork-shoulder': ['co-steak'], 'p-pork-chop': ['co-steak'], 'p-pork-loin': ['co-steak'], 'p-pork-tenderloin': ['co-steak'],
  'p-chicken-whole': ['co-skinless'], 'p-chicken-breast': ['co-skinless'], 'p-chicken-thigh': ['co-skinless'], 'p-chicken-drumstick': ['co-skinless'],
  'p-chicken-legquarter': ['co-skinless'], 'p-chicken-fillet': ['co-adobo'],
  'p-tilapia': ['co-cleaned', 'co-butterfly', 'co-deboned'], 'p-bangus': ['co-cleaned', 'co-butterfly'], 'p-pompano': ['co-cleaned', 'co-butterfly'],
  'p-galunggong': ['co-cleaned'], 'p-squid': ['co-cleaned'], 'p-tuna-belly': ['co-deboned'],
};
/** Map a product row's cut list onto the current options: legacy ids remapped, extras added, only options offered on its category. */
function productCuts(id: string, categoryId: string, ids: string[] = []) {
  const want = new Set([...ids.map((x) => LEGACY_CUT[x] ?? x), ...(EXTRA_CUTS[id] ?? [])]);
  return cutOptions.filter((c) => want.has(c.id) && (!c.categoryIds || c.categoryIds.includes(categoryId))).map((c) => c.id);
}

const BEEF_CUTS = ['co-whole', 'co-sliced', 'co-cubed', 'co-ground', 'co-nilaga', 'co-steak', 'co-tapa'];
const PORK_CUTS = ['co-whole', 'co-sliced', 'co-thin', 'co-cubed', 'co-ground', 'co-adobo', 'co-sinigang', 'co-bbq', 'co-kawali'];
const CHICKEN_CUTS = ['co-whole', 'co-cutup', 'co-adobo', 'co-tinola', 'co-deboned', 'co-ground'];
const FISH_CUTS = ['co-whole', 'co-sliced', 'co-sinigang'];

const suppliers: Supplier[] = [
  { id: 's-1', name: 'Davao del Sur Meat Traders', contact: 'Rodel Santos', phone: '0917 555 1201', email: 'orders@dsmeat.ph', terms: 'COD', leadDays: 1 },
  { id: 's-2', name: 'Mindanao Poultry Farms', contact: 'Liza Uy', phone: '0918 555 2202', email: 'sales@minpoultry.ph', terms: 'Net 7', leadDays: 1 },
  { id: 's-3', name: 'Southern Pork Dealers', contact: 'Joy Navarro', phone: '0920 555 4404', email: 'orders@spork.ph', terms: 'COD', leadDays: 1 },
  { id: 's-4', name: 'Digos Fish Port Traders', contact: 'Ramil Abad', phone: '0921 555 5505', email: 'fishport@digos.ph', terms: 'COD', leadDays: 1 },
  { id: 's-5', name: 'Metro Grocers Distribution', contact: 'Paolo Reyes', phone: '0919 555 3303', email: 'po@metrogrocers.ph', terms: 'Net 30', leadDays: 3 },
];

// [id, name, brand, cat, unit, size, price, cost, emoji, weighted, storage, supplier, cuts?]
type P = [string, string, string, string, Product['unit'], string, number, number, string, boolean, StorageType, string, string[]?];
const kg = (id: string, name: string, cat: string, price: number, emoji: string, sup: string, cuts: string[], storage: StorageType = 'fresh'): P =>
  [id, name, 'Fresh cut', cat, 'kg', 'per kg', price, Math.round(price * 0.74), emoji, true, storage, sup, cuts];
const pk = (id: string, name: string, brand: string, cat: string, size: string, price: number, emoji: string, storage: StorageType, sup: string, unit: Product['unit'] = 'pack'): P =>
  [id, name, brand, cat, unit, size, price, Math.round(price * 0.72), emoji, false, storage, sup];

const productRows: P[] = [
  // Beef (18)
  kg('p-beef-brisket', 'Beef Brisket', 'cat-beef', 420, '🥩', 's-1', BEEF_CUTS),
  kg('p-beef-sirloin', 'Beef Sirloin', 'cat-beef', 560, '🥩', 's-1', BEEF_CUTS),
  kg('p-beef-tenderloin', 'Beef Tenderloin', 'cat-beef', 780, '🥩', 's-1', ['co-whole', 'co-steak', 'co-sliced']),
  kg('p-beef-ribeye', 'Beef Ribeye', 'cat-beef', 820, '🥩', 's-1', ['co-whole', 'co-steak']),
  kg('p-beef-shortribs', 'Beef Short Ribs', 'cat-beef', 480, '🍖', 's-1', ['co-whole', 'co-cubed', 'co-nilaga']),
  kg('p-beef-shank', 'Beef Shank (Bulalo)', 'cat-beef', 380, '🍖', 's-1', ['co-whole', 'co-nilaga']),
  kg('p-beef-kenchi', 'Beef Kenchi', 'cat-beef', 360, '🍖', 's-1', ['co-whole', 'co-nilaga']),
  kg('p-beef-round', 'Beef Round', 'cat-beef', 440, '🥩', 's-1', BEEF_CUTS),
  kg('p-beef-chuck', 'Beef Chuck', 'cat-beef', 430, '🥩', 's-1', BEEF_CUTS),
  kg('p-beef-ground', 'Ground Beef', 'cat-beef', 400, '🥩', 's-1', []),
  kg('p-beef-tripe', 'Beef Tripe (Tuwalya)', 'cat-beef', 280, '🥩', 's-1', ['co-whole', 'co-sliced']),
  kg('p-beef-oxtail', 'Beef Oxtail', 'cat-beef', 520, '🍖', 's-1', ['co-whole', 'co-cubed']),
  kg('p-beef-tapacut', 'Beef Tapa Cut', 'cat-beef', 470, '🥩', 's-1', ['co-tapa', 'co-sliced']),
  kg('p-beef-cubes', 'Beef Cubes (Kaldereta)', 'cat-beef', 450, '🥩', 's-1', ['co-cubed']),
  kg('p-beef-flank', 'Beef Flank', 'cat-beef', 410, '🥩', 's-1', BEEF_CUTS),
  kg('p-beef-tbone', 'Beef T-Bone', 'cat-beef', 690, '🥩', 's-1', ['co-whole', 'co-steak']),
  kg('p-beef-liver', 'Beef Liver', 'cat-beef', 260, '🥩', 's-1', ['co-whole', 'co-sliced']),
  kg('p-beef-bones', 'Beef Soup Bones', 'cat-beef', 120, '🦴', 's-1', ['co-whole', 'co-nilaga']),
  // Pork (20)
  kg('p-pork-liempo', 'Pork Liempo', 'cat-pork', 360, '🥓', 's-3', PORK_CUTS),
  kg('p-pork-kasim', 'Pork Kasim', 'cat-pork', 320, '🥓', 's-3', PORK_CUTS),
  kg('p-pork-pigue', 'Pork Pigue', 'cat-pork', 310, '🥓', 's-3', PORK_CUTS),
  kg('p-pork-belly', 'Pork Belly (skin-on)', 'cat-pork', 350, '🥓', 's-3', PORK_CUTS),
  kg('p-pork-chop', 'Pork Chop', 'cat-pork', 330, '🥩', 's-3', ['co-whole', 'co-sliced', 'co-thin']),
  kg('p-pork-spareribs', 'Pork Spare Ribs', 'cat-pork', 340, '🍖', 's-3', ['co-whole', 'co-sinigang', 'co-adobo', 'co-bbq']),
  kg('p-pork-babyback', 'Pork Baby Back Ribs', 'cat-pork', 390, '🍖', 's-3', ['co-whole', 'co-bbq']),
  kg('p-pork-shoulder', 'Pork Shoulder', 'cat-pork', 315, '🥩', 's-3', PORK_CUTS),
  kg('p-pork-ground', 'Ground Pork', 'cat-pork', 300, '🥩', 's-3', []),
  kg('p-pork-pata', 'Pork Pata (Hock)', 'cat-pork', 280, '🍖', 's-3', ['co-whole', 'co-cubed', 'co-sinigang']),
  kg('p-pork-tenderloin', 'Pork Tenderloin', 'cat-pork', 380, '🥩', 's-3', ['co-whole', 'co-sliced', 'co-cubed']),
  kg('p-pork-loin', 'Pork Loin', 'cat-pork', 345, '🥩', 's-3', ['co-whole', 'co-sliced', 'co-thin']),
  kg('p-pork-ears', 'Pork Ears', 'cat-pork', 180, '🥓', 's-3', ['co-whole', 'co-sliced']),
  kg('p-pork-liver', 'Pork Liver', 'cat-pork', 200, '🥩', 's-3', ['co-whole', 'co-sliced', 'co-cubed']),
  kg('p-pork-intestine', 'Pork Intestines', 'cat-pork', 160, '🥓', 's-3', ['co-whole', 'co-sliced']),
  kg('p-pork-maskara', 'Pork Maskara', 'cat-pork', 220, '🥓', 's-3', ['co-whole', 'co-sliced']),
  kg('p-pork-neckbones', 'Pork Neck Bones', 'cat-pork', 150, '🦴', 's-3', ['co-whole', 'co-sinigang']),
  kg('p-pork-kawali', 'Pork Lechon Kawali Cut', 'cat-pork', 365, '🥓', 's-3', ['co-kawali']),
  kg('p-pork-bbq', 'Pork BBQ Cut', 'cat-pork', 355, '🥓', 's-3', ['co-bbq', 'co-thin']),
  kg('p-pork-sinigang', 'Pork Sinigang Cut', 'cat-pork', 300, '🍖', 's-3', ['co-sinigang']),
  // Chicken (16)
  kg('p-chicken-whole', 'Whole Chicken', 'cat-chicken', 210, '🐔', 's-2', CHICKEN_CUTS),
  kg('p-chicken-breast', 'Chicken Breast', 'cat-chicken', 260, '🍗', 's-2', ['co-whole', 'co-deboned', 'co-sliced', 'co-cubed']),
  kg('p-chicken-fillet', 'Chicken Breast Fillet', 'cat-chicken', 290, '🍗', 's-2', ['co-whole', 'co-sliced', 'co-cubed', 'co-ground']),
  kg('p-chicken-thigh', 'Chicken Thigh', 'cat-chicken', 230, '🍗', 's-2', ['co-whole', 'co-deboned', 'co-adobo']),
  kg('p-chicken-thighfillet', 'Chicken Thigh Fillet', 'cat-chicken', 270, '🍗', 's-2', ['co-whole', 'co-cubed', 'co-sliced']),
  kg('p-chicken-drumstick', 'Chicken Drumstick', 'cat-chicken', 220, '🍗', 's-2', ['co-whole', 'co-adobo', 'co-tinola']),
  kg('p-chicken-wings', 'Chicken Wings', 'cat-chicken', 240, '🍗', 's-2', ['co-whole', 'co-cutup']),
  kg('p-chicken-legquarter', 'Chicken Leg Quarter', 'cat-chicken', 200, '🍗', 's-2', ['co-whole', 'co-adobo', 'co-tinola']),
  kg('p-chicken-liver', 'Chicken Liver', 'cat-chicken', 160, '🍗', 's-2', []),
  kg('p-chicken-gizzard', 'Chicken Gizzard', 'cat-chicken', 170, '🍗', 's-2', ['co-whole', 'co-sliced']),
  kg('p-chicken-feet', 'Chicken Feet', 'cat-chicken', 120, '🍗', 's-2', []),
  kg('p-chicken-ground', 'Ground Chicken', 'cat-chicken', 250, '🍗', 's-2', []),
  kg('p-chicken-neck', 'Chicken Neck', 'cat-chicken', 90, '🍗', 's-2', []),
  kg('p-chicken-tinola', 'Chicken Tinola Cut', 'cat-chicken', 215, '🍗', 's-2', ['co-tinola']),
  kg('p-chicken-adobo', 'Chicken Adobo Cut', 'cat-chicken', 220, '🍗', 's-2', ['co-adobo']),
  kg('p-chicken-skin', 'Chicken Skin', 'cat-chicken', 100, '🍗', 's-2', []),
  // Processed meats (14)
  pk('p-longganisa', 'Pork Longganisa (Hamonado)', 'House-made', 'cat-processed', '500 g', 160, '🌭', 'frozen', 's-3'),
  pk('p-garlic-longganisa', 'Garlic Longganisa', 'House-made', 'cat-processed', '500 g', 150, '🌭', 'frozen', 's-3'),
  pk('p-tocino', 'Pork Tocino', 'House-made', 'cat-processed', '500 g', 165, '🥓', 'frozen', 's-3'),
  pk('p-chicken-tocino', 'Chicken Tocino', 'House-made', 'cat-processed', '500 g', 155, '🍗', 'frozen', 's-2'),
  pk('p-beef-tapa', 'Beef Tapa (marinated)', 'House-made', 'cat-processed', '500 g', 210, '🥩', 'frozen', 's-1'),
  pk('p-skinless', 'Skinless Longganisa', 'House-made', 'cat-processed', '500 g', 145, '🌭', 'frozen', 's-3'),
  pk('p-hotdog', 'Jumbo Hotdog', 'Purefoods', 'cat-processed', '1 kg', 245, '🌭', 'frozen', 's-5'),
  pk('p-ham', 'Sweet Ham', 'Purefoods', 'cat-processed', '500 g', 220, '🍖', 'frozen', 's-5'),
  pk('p-bacon', 'Smoked Bacon', 'Purefoods', 'cat-processed', '250 g', 185, '🥓', 'frozen', 's-5'),
  pk('p-embutido', 'Pork Embutido', 'House-made', 'cat-processed', '1 roll', 140, '🍖', 'frozen', 's-3'),
  pk('p-nuggets', 'Chicken Nuggets', 'Tender Juicy', 'cat-processed', '400 g', 189, '🍗', 'frozen', 's-5'),
  pk('p-cornedbeef', 'Corned Beef (house-made)', 'House-made', 'cat-processed', '500 g', 230, '🥫', 'frozen', 's-1'),
  pk('p-bbq-skewers', 'Pork BBQ Skewers (ready to grill)', 'House-made', 'cat-processed', '10 pcs', 250, '🍢', 'fresh', 's-3'),
  pk('p-siomai', 'Pork Siomai', 'House-made', 'cat-processed', '20 pcs', 180, '🥟', 'frozen', 's-3'),
  // Seafood (10)
  kg('p-tilapia', 'Fresh Tilapia', 'cat-seafood', 160, '🐟', 's-4', FISH_CUTS),
  kg('p-bangus', 'Fresh Bangus', 'cat-seafood', 220, '🐟', 's-4', ['co-whole', 'co-sliced', 'co-deboned']),
  kg('p-galunggong', 'Galunggong', 'cat-seafood', 240, '🐟', 's-4', ['co-whole']),
  pk('p-shrimp', 'Shrimp (Medium)', 'Sea Catch', 'cat-seafood', '500 g', 295, '🦐', 'frozen', 's-4'),
  kg('p-squid', 'Squid (Pusit)', 'cat-seafood', 320, '🦑', 's-4', ['co-whole', 'co-sliced']),
  kg('p-tuna-belly', 'Tuna Belly', 'cat-seafood', 380, '🐟', 's-4', ['co-whole', 'co-sliced', 'co-bbq']),
  kg('p-pompano', 'Pompano', 'cat-seafood', 340, '🐟', 's-4', FISH_CUTS),
  pk('p-boneless-bangus', 'Boneless Bangus', 'Sea Catch', 'cat-seafood', '1 pc', 189, '🐟', 'frozen', 's-4', 'pc'),
  pk('p-cream-dory', 'Cream Dory Fillet', 'Sea Catch', 'cat-seafood', '500 g', 165, '🐟', 'frozen', 's-4'),
  kg('p-mussels', 'Mussels (Tahong)', 'cat-seafood', 140, '🦪', 's-4', ['co-whole']),
  // Groceries (22)
  pk('p-rice', 'Jasmine Rice', 'Doña Maria', 'cat-grocery', '5 kg', 385, '🍚', 'shelf', 's-5'),
  pk('p-eggs', 'Large Eggs', 'Bounty Fresh', 'cat-grocery', '12 pcs', 115, '🥚', 'shelf', 's-5'),
  pk('p-soy', 'Soy Sauce', 'Silver Swan', 'cat-grocery', '1 L', 72, '🫙', 'shelf', 's-5', 'L'),
  pk('p-vinegar', 'Cane Vinegar', 'Datu Puti', 'cat-grocery', '1 L', 58, '🫙', 'shelf', 's-5', 'L'),
  pk('p-patis', 'Fish Sauce (Patis)', 'Rufina', 'cat-grocery', '750 ml', 65, '🫙', 'shelf', 's-5', 'pc'),
  pk('p-oil', 'Cooking Oil', 'Baguio', 'cat-grocery', '2 L', 265, '🫒', 'shelf', 's-5', 'L'),
  pk('p-garlic', 'Native Garlic', 'Farm Fresh', 'cat-grocery', '250 g', 65, '🧄', 'shelf', 's-5'),
  kg('p-onion', 'Red Onion', 'cat-grocery', 140, '🧅', 's-5', [], 'shelf'),
  pk('p-calamansi', 'Calamansi', 'Farm Fresh', 'cat-grocery', '250 g', 45, '🍋', 'shelf', 's-5'),
  pk('p-ginger', 'Ginger', 'Farm Fresh', 'cat-grocery', '250 g', 40, '🫚', 'shelf', 's-5'),
  kg('p-tomato', 'Tomato', 'cat-grocery', 80, '🍅', 's-5', [], 'shelf'),
  pk('p-sinigang-mix', 'Sinigang Mix', 'Knorr', 'cat-grocery', '3 pcs', 55, '🍲', 'shelf', 's-5'),
  pk('p-bbq-marinade', 'BBQ Marinade', 'Mama Sita’s', 'cat-grocery', '340 g', 89, '🍯', 'shelf', 's-5', 'pc'),
  pk('p-adobo-mix', 'Adobo Mix', 'Mama Sita’s', 'cat-grocery', '50 g', 25, '🧂', 'shelf', 's-5', 'pc'),
  pk('p-pepper', 'Black Pepper', 'McCormick', 'cat-grocery', '50 g', 48, '🧂', 'shelf', 's-5', 'pc'),
  pk('p-salt', 'Iodized Salt', 'Datu Puti', 'cat-grocery', '1 kg', 30, '🧂', 'shelf', 's-5'),
  pk('p-sugar', 'Brown Sugar', 'Victorias', 'cat-grocery', '1 kg', 85, '🍬', 'shelf', 's-5'),
  pk('p-charcoal', 'Charcoal', 'Local', 'cat-grocery', '2 kg', 120, '🔥', 'shelf', 's-5'),
  pk('p-ketchup', 'Banana Ketchup', 'UFC', 'cat-grocery', '320 g', 42, '🥫', 'shelf', 's-5', 'pc'),
  pk('p-oyster', 'Oyster Sauce', 'Lee Kum Kee', 'cat-grocery', '405 g', 95, '🫙', 'shelf', 's-5', 'pc'),
  pk('p-lemongrass', 'Lemongrass (Tanglad)', 'Farm Fresh', 'cat-grocery', '1 bundle', 25, '🌿', 'shelf', 's-5', 'pc'),
  pk('p-cola', 'Cola', 'Coca-Cola', 'cat-grocery', '1.5 L', 85, '🥤', 'shelf', 's-5', 'L'),
];


/** Product photos (free-licence, see /credits). Products not listed keep their emoji. */
const PHOTO: Record<string, string> = {
  'p-beef-brisket': 'beef-steak',
  'p-beef-sirloin': 'beef-steak',
  'p-beef-tenderloin': 'beef-steak',
  'p-beef-ribeye': 'beef-ribeye',
  'p-beef-shortribs': 'beef-ribs',
  'p-beef-shank': 'beef-shank',
  'p-beef-kenchi': 'beef-shank',
  'p-beef-round': 'beef-steak',
  'p-beef-chuck': 'beef-ribs',
  'p-beef-ground': 'beef-ground',
  'p-beef-tripe': 'beef-steak',
  'p-beef-oxtail': 'beef-oxtail',
  'p-beef-tapacut': 'beef-steak',
  'p-beef-cubes': 'beef-steak',
  'p-beef-flank': 'beef-steak',
  'p-beef-tbone': 'beef-tbone',
  'p-beef-liver': 'beef-liver',
  'p-beef-bones': 'beef-oxtail',
  'p-pork-liempo': 'pork-belly',
  'p-pork-kasim': 'cat-pork',
  'p-pork-pigue': 'cat-pork',
  'p-pork-belly': 'pork-belly',
  'p-pork-chop': 'pork-chop',
  'p-pork-spareribs': 'cat-pork',
  'p-pork-babyback': 'cat-pork',
  'p-pork-shoulder': 'cat-pork',
  'p-pork-ground': 'beef-ground',
  'p-pork-pata': 'pork-hock',
  'p-pork-tenderloin': 'pork-chop',
  'p-pork-loin': 'pork-chop',
  'p-pork-ears': 'cat-pork',
  'p-pork-liver': 'beef-liver',
  'p-pork-intestine': 'pork-offal',
  'p-pork-maskara': 'cat-pork',
  'p-pork-neckbones': 'cat-pork',
  'p-pork-kawali': 'pork-belly',
  'p-pork-bbq': 'pork-bbq',
  'p-pork-sinigang': 'pork-belly',
  'p-chicken-whole': 'chicken-whole',
  'p-chicken-breast': 'chicken-breast',
  'p-chicken-fillet': 'chicken-breast',
  'p-chicken-thigh': 'chicken-thigh',
  'p-chicken-thighfillet': 'chicken-thigh',
  'p-chicken-drumstick': 'chicken-drumstick',
  'p-chicken-wings': 'chicken-wings',
  'p-chicken-legquarter': 'cat-chicken',
  'p-chicken-liver': 'chicken-liver',
  'p-chicken-gizzard': 'chicken-liver',
  'p-chicken-feet': 'chicken-feet',
  'p-chicken-ground': 'chicken-breast',
  'p-chicken-neck': 'cat-chicken',
  'p-chicken-tinola': 'cat-chicken',
  'p-chicken-adobo': 'cat-chicken',
  'p-chicken-skin': 'cat-chicken',
  'p-longganisa': 'longganisa',
  'p-garlic-longganisa': 'longganisa',
  'p-tocino': 'tocino',
  'p-chicken-tocino': 'tocino',
  'p-beef-tapa': 'tapa',
  'p-skinless': 'longganisa',
  'p-hotdog': 'hotdog',
  'p-ham': 'ham',
  'p-bacon': 'bacon',
  'p-embutido': 'embutido',
  'p-nuggets': 'nuggets',
  'p-cornedbeef': 'corned-beef',
  'p-bbq-skewers': 'pork-bbq',
  'p-siomai': 'siomai',
  'p-tilapia': 'tilapia',
  'p-bangus': 'cat-seafood',
  'p-galunggong': 'galunggong',
  'p-shrimp': 'shrimp',
  'p-squid': 'squid',
  'p-tuna-belly': 'cat-seafood',
  'p-pompano': 'pompano',
  'p-boneless-bangus': 'fish-fillet',
  'p-cream-dory': 'fish-fillet',
  'p-mussels': 'cat-seafood',
  'p-rice': 'rice',
  'p-eggs': 'eggs',
  'p-soy': 'soy-sauce',
  'p-vinegar': 'vinegar',
  'p-patis': 'soy-sauce',
  'p-garlic': 'garlic',
  'p-onion': 'onion',
  'p-calamansi': 'calamansi',
  'p-ginger': 'ginger',
  'p-tomato': 'tomato',
  'p-sinigang-mix': 'sinigang-mix',
  'p-pepper': 'spices',
  'p-salt': 'salt',
  'p-sugar': 'sugar',
  'p-charcoal': 'charcoal',
  'p-ketchup': 'sauce',
  'p-lemongrass': 'lemongrass',
  'p-cola': 'soda',
};
const photo = (key: string) => `/images/photos/${key}.jpg`;
/** Products switched off in the customer app at Digos (offline:b-dgs tag). */
const HIDDEN_AT_DIGOS = ['p-pork-ears', 'p-chicken-skin'];

const products: Product[] = productRows.map((r, i) => ({
  id: r[0],
  sku: `SKU-${(1001 + i).toString()}`,
  barcode: `48000${(10000 + i * 37).toString()}`,
  name: r[1],
  brand: r[2],
  categoryId: r[3],
  subcategoryId: SUBCATEGORY_OF[r[0]],
  unit: r[4],
  size: r[5],
  description: r[9] ? `${r[1]}, cut fresh at the Digos branch. Price per kg; the final price is set when weighed.` : `${r[2]} ${r[1]} — ${r[5]}.`,
  image: PHOTO[r[0]] ? photo(PHOTO[r[0]]) : r[8],
  basePrice: r[6],
  costPrice: r[7],
  soldByWeight: r[9],
  estWeightKg: r[9] ? 1 : undefined,
  tags: [r[10] === 'fresh' ? 'chilled' : r[10] === 'frozen' ? 'frozen' : '', r[3] === 'cat-chicken' ? 'halal' : '', 'local', HIDDEN_AT_DIGOS.includes(r[0]) ? 'offline:b-dgs' : ''].filter(Boolean),
  status: 'active',
  tax: ['cat-beef', 'cat-pork', 'cat-chicken', 'cat-seafood'].includes(r[3]) || r[9] ? 'exempt' : 'vat',
  aisle: categories.find((c) => c.id === r[3])!.sort,
  supplierId: r[11],
  reorderPoint: r[9] ? 8 : 12,
  featured: ['p-pork-liempo', 'p-beef-shank', 'p-chicken-whole', 'p-pork-bbq', 'p-beef-sirloin', 'p-longganisa'].includes(r[0]),
  storage: r[10],
  cutOptionIds: ((ids) => (ids.length ? ids : undefined))(productCuts(r[0], r[3], r[12])),
  weightChoices: r[9] ? [0.5, 1, 1.5, 2] : undefined,
  minWeightKg: r[9] ? 0.25 : undefined,
}));

const priceLists: PriceList[] = [
  { id: 'pl-main', name: 'Main (Global)', scope: 'global', active: true, items: {} },
  // Digos branch overrides (shown as "Base ₱… · override" on the Products list).
  { id: 'pl-digos', name: 'Digos branch prices', scope: 'branch', scopeId: 'b-dgs', active: true, items: { 'p-beef-ribeye': 850, 'p-pork-liempo': 375, 'p-tilapia': 170 } },
];

function makeMovements(sales: StockMovement[] = []): StockMovement[] {
  const r = rng(7);
  const out: StockMovement[] = [];
  let n = 1;
  for (const b of branches) {
    for (const p of products) {
      const qty = p.soldByWeight ? Math.round(30 + r() * 50) : Math.round(20 + r() * 60);
      out.push({ id: `m-${n++}`, productId: p.id, branchId: b.id, qty, type: 'receiving', reason: 'Opening stock (CSV import)', user: 'System', at: daysAgo(20, 6), ref: 'OPENING' });
    }
  }
  // Force a few low / out-of-stock items for the demo (counted after sales).
  const lows: [string, number][] = [['p-beef-tenderloin', 4], ['p-pork-babyback', 5], ['p-chicken-gizzard', 0], ['p-bacon', 3], ['p-shrimp', 6]];
  for (const [pid, target] of lows) {
    const current = [...out, ...sales].filter((m) => m.productId === pid && m.branchId === 'b-dgs').reduce((s, m) => s + m.qty, 0);
    out.push({ id: `m-${n++}`, productId: pid, branchId: 'b-dgs', qty: target - current, type: 'walkin_sale', reason: 'In-store sales (daily count)', user: 'Ana Cruz', at: daysAgo(1, 19), ref: 'COUNT' });
  }
  out.push({ id: `m-${n++}`, productId: 'p-chicken-liver', branchId: 'b-dgs', qty: -2, type: 'wastage', reason: 'Discolored — not sellable', user: 'Mark Lim', at: daysAgo(0, 7, 10) });
  out.push({ id: `m-${n++}`, productId: 'p-pork-liempo', branchId: 'b-dgs', qty: 25, type: 'receiving', reason: 'Direct Receiving RCV-0002', user: 'Mark Lim', at: daysAgo(0, 6, 30), ref: 'RCV-0002' });
  out.push({ id: `m-${n++}`, productId: 'p-pork-kasim', branchId: 'b-dgs', qty: 15, type: 'receiving', reason: 'Direct Receiving RCV-0002', user: 'Mark Lim', at: daysAgo(0, 6, 30), ref: 'RCV-0002' });
  out.push({ id: `m-${n++}`, productId: 'p-chicken-whole', branchId: 'b-dgs', qty: 40, type: 'receiving', reason: 'Direct Receiving RCV-0001', user: 'Mark Lim', at: daysAgo(1, 6, 15), ref: 'RCV-0001' });
  out.push({ id: `m-${n++}`, productId: 'p-eggs', branchId: 'b-dgs', qty: -2, type: 'count_correction', reason: 'Daily mini-count variance', user: 'Mark Lim', at: daysAgo(2, 9) });
  return out;
}

// [name, mobile, email, address, lat, lng, username]
const customerSeed: [string, string, string, string, number, number, string][] = [
  ['Maria Santos', '0917 123 4567', 'maria.santos@gmail.com', 'Purok 3, Aplaya, Digos City', 6.7381, 125.3653, 'mariasantos'],
  ['Juan dela Cruz', '0918 222 3344', 'juan.dc@yahoo.com', 'Tres de Mayo, Digos City', 6.7602, 125.3489, 'juandc'],
  ['Angelica Reyes', '0919 333 4455', 'angel.reyes@gmail.com', 'Zone 3, Digos City', 6.7531, 125.3594, 'angelreyes'],
  ['Carlo Mendoza', '0920 444 5566', 'carlo.m@gmail.com', 'San Jose, Digos City', 6.7449, 125.3511, 'carlom'],
  ['Patricia Lim', '0921 555 6677', 'pat.lim@outlook.com', 'Cogon, Digos City', 6.7568, 125.3637, 'patlim'],
  ['Miguel Tan', '0922 666 7788', 'miguel.tan@gmail.com', 'Matti, Digos City', 6.7692, 125.3447, 'migueltan'],
  ['Sofia Garcia', '0923 777 8899', 'sofia.g@gmail.com', 'Kiagot, Digos City', 6.7335, 125.3398, 'sofiag'],
  ['Rafael Bautista', '0924 888 9900', 'raf.bautista@gmail.com', 'Dawis, Digos City', 6.7419, 125.3712, 'rafb'],
  ['Lea Villanueva', '0925 999 0011', 'lea.v@gmail.com', 'Tiguman, Digos City', 6.7801, 125.3402, 'leav'],
  ['Daniel Ramos', '0928 303 4343', 'dan.ramos@gmail.com', 'Sinawilan, Digos City', 6.7253, 125.3524, 'danramos'],
];

const customers: Customer[] = customerSeed.map((c, i) => ({
  id: `cu-${i + 1}`,
  name: c[0],
  firstName: c[0].split(' ')[0],
  lastName: c[0].split(' ').slice(1).join(' '),
  username: c[6],
  password: 'demo1234',
  googleEmail: i % 2 === 0 ? c[2] : undefined,
  profileComplete: true,
  mobile: c[1],
  email: c[2],
  cityId: 'c-dgs',
  addresses: [{ label: 'Home', line: c[3], landmark: i === 0 ? 'Blue gate near the chapel' : undefined, lat: c[4], lng: c[5] }],
  createdAt: daysAgo(60 - i * 4),
  blocked: false,
  storeCredit: 0,
  points: 0,
  source: 'app',
  group: i < 3 ? 'Regulars' : undefined,
}));

// The company's own riders only (spec v6: no freelance riders, no courier partners).
const riders: Rider[] = [
  { id: 'r-1', name: 'Jomar Villar', phone: '0917 800 0001', type: 'own', vehicle: 'motorcycle', plate: 'MDA 4521', branchIds: ['b-dgs'], status: 'online', rating: 4.9, lat: 6.7505, lng: 125.358, codHeld: 1250, tripsToday: 6, earningsToday: 540, documents: [{ name: "Driver's License", expires: daysAgo(-300), status: 'approved' }, { name: 'OR/CR', expires: daysAgo(-120), status: 'approved' }] },
  { id: 'r-2', name: 'Kevin Uy', phone: '0917 800 0002', type: 'own', vehicle: 'motorcycle', plate: 'MDB 1188', branchIds: ['b-dgs'], status: 'online', rating: 4.8, lat: 6.746, lng: 125.355, codHeld: 0, tripsToday: 4, earningsToday: 360, documents: [{ name: "Driver's License", expires: daysAgo(-20), status: 'approved' }] },
  { id: 'r-3', name: 'Ramon Diaz', phone: '0917 800 0003', type: 'own', vehicle: 'motorcycle', plate: 'MDC 2210', branchIds: ['b-dgs'], status: 'offline', offlineSince: minsAgo(75), rating: 4.7, lat: 6.752, lng: 125.36, codHeld: 0, tripsToday: 0, earningsToday: 0, documents: [{ name: "Driver's License", expires: daysAgo(-500), status: 'approved' }] },
  { id: 'r-4', name: 'Liza Fernandez', phone: '0917 800 0004', type: 'own', vehicle: 'motorcycle', plate: 'NBC 7712', branchIds: ['b-dgs'], status: 'online', rating: 4.9, lat: 6.748, lng: 125.362, codHeld: 480, tripsToday: 5, earningsToday: 610, documents: [{ name: "Driver's License", expires: daysAgo(-200), status: 'approved' }] },  // More own riders for the Digos branch, spread within ~2.5 km of the shop.
  // [id, name, plate, rating, km from shop, bearing°, status, trips today, offline since (mins ago)]
  ...([
    ['r-5', 'Mae Santos', 'NBA 5512', 5.0, 0.9, 200, 'online', 4],
    ['r-6', 'Paolo Garcia', 'MDE 3307', 4.7, 1.1, 320, 'online', 3],
    ['r-7', 'Dennis Aquino', 'MDG 6671', 4.4, 1.4, 60, 'online', 5],
    ['r-8', 'Joel Reyes', 'MDF 8820', 4.5, 1.6, 150, 'online', 2],
    ['r-9', 'Elmer Sison', 'MDP 2245', 4.4, 1.7, 250, 'online', 3],
    ['r-10', 'Jessa Flores', 'NBF 9054', 4.7, 1.9, 20, 'online', 4],
    ['r-11', 'Arnel Dela Peña', 'MDJ 3381', 4.6, 2.0, 110, 'online', 3],
    ['r-12', 'Bong Navarro', 'MDL 7120', 4.3, 2.1, 280, 'online', 2],
    ['r-13', 'Carlo Dizon', 'NBD 2268', 4.5, 2.2, 340, 'online', 4],
    ['r-14', 'Rey Mercado', 'MDQ 5904', 4.6, 2.3, 190, 'online', 1],
    ['r-15', 'Nestor Gomez', 'MDR 1457', 4.2, 2.4, 80, 'online', 2],
    ['r-16', 'Allan Ramos', 'NBG 6633', 4.7, 2.5, 230, 'online', 3],
    ['r-17', 'Gina Torres', 'NBJ 4012', 4.8, 2.6, 130, 'online', 2],
    ['r-18', 'Ronnie Valdez', 'MDS 8876', 4.4, 2.7, 300, 'online', 1],
    // At capacity: each carries two of today's live deliveries (see makeOrders).
    ['r-19', 'Ren Abad', 'MDA 9031', 4.6, 0.2, 90, 'online', 5],
    ['r-20', 'Mark Lopez', 'MDH 7302', 4.6, 0.7, 170, 'online', 4],
    ['r-21', 'Rico Tan', 'MDB 4410', 4.8, 0.8, 30, 'online', 6],
    ['r-22', 'Rose Manalo', 'NBH 4407', 4.8, 1.0, 260, 'online', 5],
    ['r-23', 'Lito Pascual', 'MDK 5530', 4.5, 1.2, 120, 'offline', 0, 75],
    ['r-24', 'Vince Ocampo', 'MDN 1903', 4.3, 1.8, 210, 'offline', 0, 75],
  ] as [string, string, string, number, number, number, Rider['status'], number, number?][]).map(([id, name, plate, rating, km, deg, status, trips, offMins], i): Rider => ({
    id, name, phone: `0917 800 ${String(Number(id.slice(2))).padStart(4, '0')}`, type: 'own', vehicle: 'motorcycle', plate, branchIds: ['b-dgs'], status,
    offlineSince: offMins ? minsAgo(offMins) : undefined, rating,
    lat: Math.round((6.7497 + (km / 111) * Math.cos((deg * Math.PI) / 180)) * 10000) / 10000,
    lng: Math.round((125.3572 + (km / 110.4) * Math.sin((deg * Math.PI) / 180)) * 10000) / 10000,
    codHeld: i % 3 === 0 ? 300 + i * 40 : 0, tripsToday: trips, earningsToday: trips * 90,
    documents: [{ name: "Driver's License", expires: daysAgo(-(120 + i * 15)), status: 'approved' }, { name: 'OR/CR', expires: daysAgo(-(90 + i * 10)), status: 'approved' }],
  })),
];

const zones: DeliveryZone[] = [
  { id: 'z-1', branchId: 'b-dgs', name: 'Digos City 0–10 km', type: 'radius', radiusKm: 10, feeModel: 'distance', flatFee: 0, baseFee: 49, perKm: 10, freeAbove: 2500, minOrder: 500, etaMins: 45, active: true },
];

const vouchers: Voucher[] = [];

const P = (k: string) => k; // permission helper for readability
export const PERMISSION_MODULES = ['orders', 'catalog', 'pricing', 'inventory', 'riders', 'customers', 'promotions', 'support', 'reports', 'settings', 'users'] as const;
export const PERMISSION_ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'export'] as const;
const all = PERMISSION_MODULES.flatMap((m) => PERMISSION_ACTIONS.map((a) => `${m}.${a}`));
const pick = (mods: string[], acts: string[]) => mods.flatMap((m) => acts.map((a) => P(`${m}.${a}`)));

// Phase 1 uses fixed roles: Admin and Cashier (riders sign in to the Rider App). Custom roles are Phase 2.
const roles: Role[] = [
  { id: 'role-super', name: 'Super Admin', description: 'Everything the plan allows: branch, catalog, prices, stock, riders, staff, settings, reports.', scopeType: 'all', protected: true, permissions: all },
  { id: 'role-admin', name: 'Admin', description: 'Runs the branch: orders, products and prices, stock and Direct Receiving, riders, reports, refunds and approvals.', scopeType: 'branches', permissions: [...pick(['orders', 'catalog', 'pricing', 'inventory', 'riders', 'customers'], ['view', 'create', 'edit', 'approve', 'export']), 'reports.view', 'reports.export', 'settings.view', 'users.view'] },
  { id: 'role-cashier', name: 'Cashier', description: 'Order Desk: view and confirm orders, enter actual weights, butcher prep, mark ready, assign riders, pickup handover. No prices or settings.', scopeType: 'branches', permissions: ['orders.view', 'orders.create', 'orders.edit', 'customers.view', 'catalog.view', 'riders.view', 'inventory.view'] },
];

const staff: StaffUser[] = [
  { id: 'u-1', name: 'Hannah Admin', email: 'admin@jovannesmeatshop.ph', roleId: 'role-super', scope: { type: 'all', ids: [] }, status: 'active', lastActive: minsAgo(1), twoFactor: true },
  { id: 'u-2', name: 'Mark Lim', email: 'mark.lim@jovannesmeatshop.ph', roleId: 'role-admin', scope: { type: 'branches', ids: ['b-dgs'] }, status: 'active', lastActive: minsAgo(4), twoFactor: true },
  { id: 'u-3', name: 'Ana Cruz', email: 'ana.cruz@jovannesmeatshop.ph', roleId: 'role-cashier', scope: { type: 'branches', ids: ['b-dgs'] }, status: 'active', lastActive: minsAgo(2), twoFactor: false },
  { id: 'u-4', name: 'Ben Torres', email: 'ben.torres@jovannesmeatshop.ph', roleId: 'role-cashier', scope: { type: 'branches', ids: ['b-dgs'] }, status: 'active', lastActive: minsAgo(8), twoFactor: false },
];

const S = (s: Omit<Setting, 'city' | 'branch'> & Partial<Pick<Setting, 'city' | 'branch'>>): Setting => ({ city: {}, branch: {}, ...s });
const settings: Setting[] = [
  S({ key: 'autoConfirmPaid', label: 'Auto-confirm orders paid online', group: 'Order confirmation', type: 'boolean', global: true }),
  S({ key: 'manualConfirmAll', label: 'Require manual confirmation for all orders', group: 'Order confirmation', type: 'boolean', global: false }),
  S({ key: 'confirmTimeoutMins', label: 'Confirmation timeout', group: 'Order confirmation', type: 'number', unit: 'min', global: 10 }),
  S({ key: 'timeoutAction', label: 'Timeout action', group: 'Order confirmation', type: 'select', options: ['Remind', 'Auto-cancel with notice', 'Alert manager'], global: 'Alert manager' }),
  S({ key: 'codLimit', label: 'Cash on delivery limit', group: 'Payments', type: 'number', unit: '₱', global: 5000 }),
  S({ key: 'gatewayFeePct', label: 'Gateway fee charged to shopper', group: 'Payments', type: 'number', unit: '%', global: 2 }),
  S({ key: 'refundApprovalAbove', label: 'Refund manager approval above', group: 'Payments', type: 'number', unit: '₱', global: 1000 }),
  S({ key: 'minOrder', label: 'Minimum order amount', group: 'Order rules', type: 'number', unit: '₱', global: 500 }),
  S({ key: 'cancelWindowStatus', label: 'Shopper can cancel until', group: 'Order rules', type: 'select', options: ['Placed', 'Confirmed', 'Preparing'], global: 'Confirmed' }),
  S({ key: 'maxItems', label: 'Maximum items per order', group: 'Order rules', type: 'number', global: 60 }),
  S({ key: 'prepMinutes', label: 'Default preparation time', group: 'Fulfillment', type: 'number', unit: 'min', global: 25 }),
  S({ key: 'pickupHoldHours', label: 'Pickup hold time', group: 'Fulfillment', type: 'number', unit: 'hours', global: 3 }),
  S({ key: 'noShowPolicy', label: 'Pickup no-show policy', group: 'Fulfillment', type: 'select', options: ['Cancel & restock', 'Cancel, restock & refund', 'Charge no-show fee'], global: 'Cancel, restock & refund' }),
  S({ key: 'pickupDiscountPct', label: 'Pickup discount', group: 'Fulfillment', type: 'number', unit: '%', global: 0 }),
  S({ key: 'smallBasketFee', label: 'Small-basket fee (under minimum)', group: 'Delivery fees', type: 'number', unit: '₱', global: 0 }),
  S({ key: 'peakSurcharge', label: 'Peak-hour surcharge (5–7 PM)', group: 'Delivery fees', type: 'number', unit: '₱', global: 0 }),
  S({ key: 'weatherSurcharge', label: 'Bad-weather surcharge', group: 'Delivery fees', type: 'number', unit: '₱', global: 0 }),
  S({ key: 'deliveryPaused', label: 'Delivery paused', group: 'Delivery fees', type: 'boolean', global: false }),
  S({ key: 'vatRate', label: 'VAT rate', group: 'Pricing & tax', type: 'number', unit: '%', global: 12 }),
  S({ key: 'pricesTaxInclusive', label: 'Show prices tax-inclusive', group: 'Pricing & tax', type: 'boolean', global: true }),
  S({ key: 'rounding', label: 'Price rounding', group: 'Pricing & tax', type: 'select', options: ['None', 'Nearest 0.25', 'Nearest 0.50', 'Nearest 1.00'], global: 'Nearest 0.25' }),
  S({ key: 'safetyBuffer', label: 'Online safety buffer (units held back)', group: 'Inventory', type: 'number', unit: 'units', global: 2 }),
  S({ key: 'lowStockThreshold', label: 'Low-stock alert threshold', group: 'Inventory', type: 'number', unit: 'units', global: 8 }),
  S({ key: 'receivingApprovalAbove', label: 'Direct Receiving manager approval above', group: 'Inventory', type: 'number', unit: '₱', global: 20000 }),
  S({ key: 'dispatchRule', label: 'Rider suggestion order (manual assignment)', group: 'Riders', type: 'select', options: ['Nearest available', 'Lowest workload', 'Highest rating'], global: 'Nearest available' }),
  S({ key: 'maxActiveOrders', label: 'Max active orders per rider', group: 'Riders', type: 'number', global: 2 }),
  S({ key: 'podMethod', label: 'Proof of delivery', group: 'Riders', type: 'select', options: ['Photo', 'PIN', 'Photo + PIN'], global: 'Photo' }),
  S({ key: 'weightTolerancePct', label: 'Weight tolerance at packing (auto-apply within)', group: 'Meat & cold chain', type: 'number', unit: '%', global: 10 }),
  S({ key: 'meatMaxDeliveryMins', label: 'Maximum delivery time for fresh/frozen orders', group: 'Meat & cold chain', type: 'number', unit: 'min', global: 60 }),
  S({ key: 'insulatedBagRequired', label: 'Insulated bag required for meat orders', group: 'Meat & cold chain', type: 'boolean', global: true }),
  S({ key: 'sessionHours', label: 'Staff session length', group: 'Security', type: 'number', unit: 'hours', global: 12 }),
  S({ key: 'admin2fa', label: 'Require 2FA for admin roles', group: 'Security', type: 'boolean', global: true }),
];

const banners: Banner[] = [
  { id: 'bn-1', title: 'Fresh pork liempo today', subtitle: 'Cut the way you like it · ₱360/kg', color: 'from-rose-500 to-red-600', emoji: '🥓', active: true, photo: '/images/photos/pork-belly.jpg' },
  { id: 'bn-2', title: 'Bulalo weekend', subtitle: 'Beef shank & kenchi, cut for nilaga', color: 'from-amber-500 to-orange-600', emoji: '🍖', active: true, photo: '/images/photos/banner-bulalo.jpg' },
  { id: 'bn-3', title: 'Delivered cold', subtitle: 'Insulated bags + ice packs on every meat order', color: 'from-[#c8151d] to-[#ec1b26]', emoji: '🧊', active: true, photo: '/images/photos/hero-butcher.jpg' },
];

// ---------- Orders ----------
const PIN = (r: () => number) => String(1000 + Math.floor(r() * 9000));

function buildItems(r: () => number, count: number): OrderItem[] {
  const picked = new Set<string>();
  const items: OrderItem[] = [];
  // Meat-first baskets: about 70% of lines come from Beef / Pork / Chicken.
  const meat = products.filter((p) => ['cat-beef', 'cat-pork', 'cat-chicken'].includes(p.categoryId));
  while (items.length < count) {
    const pool = r() < 0.7 ? meat : products;
    const p = pool[Math.floor(r() * pool.length)];
    if (picked.has(p.id)) continue;
    picked.add(p.id);
    const cutId = p.cutOptionIds?.[Math.floor(r() * p.cutOptionIds.length)];
    const cut = cutId ? cutOptions.find((c) => c.id === cutId && c.active) : undefined;
    items.push({
      productId: p.id, name: p.name, image: p.image, unitPrice: p.basePrice, qty: p.soldByWeight ? 1 : 1 + Math.floor(r() * 2), soldByWeight: p.soldByWeight,
      estWeightKg: p.soldByWeight ? [0.5, 1, 1, 1.5, 2][Math.floor(r() * 5)] : undefined,
      cut: cut ? cutSnapshot(cut) : undefined, storage: p.storage,
      subPref: (['similar', 'ask', 'refund'] as const)[Math.floor(r() * 3)], pickStatus: 'pending',
    });
  }
  return items;
}

/** Order-item snapshot of a cut option (keeps the price rule and prep time it was ordered with). */
export function cutSnapshot(c: CutOption): NonNullable<OrderItem['cut']> {
  return { id: c.id, name: c.name, fee: c.feeType === 'free' ? 0 : c.fee, feeType: c.feeType, prepMins: c.prepMins || undefined };
}

/** Cut / preparation charge for one line.
 *  'kg': fee x the line's weight (weighed items) | 'piece': fee x qty (weighed lines have qty 1, so once per line)
 *  | 'free': 0 | no feeType (older data): flat fee per line. A per-kg fee on an item not sold by weight is charged x qty. */
export function cutCharge(cut: { fee: number; feeType?: CutFeeType } | undefined, soldByWeight: boolean, qty: number, kg?: number) {
  if (!cut || !cut.fee || cut.feeType === 'free') return 0;
  if (cut.feeType === 'kg' && soldByWeight) return Math.round(cut.fee * (kg ?? 1) * 100) / 100;
  if (cut.feeType === 'kg' || cut.feeType === 'piece') return cut.fee * qty;
  return cut.fee;
}

/** Extra prep minutes from the cuts chosen on an order: only the longest one counts (not summed). */
export function cutPrepMins(items: OrderItem[]) {
  return items.reduce((n, i) => Math.max(n, i.cut?.prepMins ?? 0), 0);
}

export function lineTotal(i: OrderItem) {
  if (i.pickStatus === 'removed' || i.pickStatus === 'out_of_stock') return 0;
  const price = i.substitute?.status === 'accepted' ? i.substitute.unitPrice : i.unitPrice;
  if (i.soldByWeight) {
    const kg = i.actualWeightKg ?? i.estWeightKg ?? 1;
    return Math.round((price * kg + cutCharge(i.cut, true, 1, kg)) * 100) / 100;
  }
  return price * i.qty + cutCharge(i.cut, false, i.qty);
}

const STATUS_FLOW: OrderStatus[] = ['placed', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered'];
const isCold = (items: OrderItem[]) => items.some((i) => i.storage === 'fresh' || i.storage === 'frozen');

function makeOrders(): { orders: Order[]; saleMovements: StockMovement[] } {
  const r = rng(42);
  const orders: Order[] = [];
  const saleMovements: StockMovement[] = [];
  let num = 10200;
  const b = branches[0];
  const payMethods: PaymentMethod[] = ['gcash', 'maya', 'card', 'cod', 'gcash', 'cod'];
  const sold = (i: OrderItem) => (i.soldByWeight ? Math.max(1, Math.round(i.actualWeightKg ?? i.estWeightKg ?? 1)) : i.qty);

  // History: last 13 days of completed orders for the dashboard and reports.
  for (let d = 13; d >= 1; d--) {
    const perDay = 12 + Math.floor(r() * 8) + (d % 7 === 0 || d % 7 === 1 ? 6 : 0);
    for (let k = 0; k < perDay; k++) {
      const cu = customers[Math.floor(r() * customers.length)];
      const ful: Fulfillment = r() > 0.3 ? 'delivery' : 'pickup';
      const pm = ful === 'pickup' && r() > 0.5 ? 'pay_at_pickup' : payMethods[Math.floor(r() * payMethods.length)];
      const items = buildItems(r, 2 + Math.floor(r() * 4)).map((i) => ({ ...i, pickStatus: 'picked' as const, actualWeightKg: i.soldByWeight ? Math.round((i.estWeightKg ?? 1) * (0.95 + r() * 0.1) * 100) / 100 : undefined }));
      const subtotal = Math.round(items.reduce((s, i) => s + lineTotal(i), 0) * 100) / 100;
      const fee = ful === 'delivery' ? (subtotal > 2500 ? 0 : 49 + Math.floor(r() * 5) * 10) : 0;
      const cancelled = r() < 0.04;
      const placed = daysAgo(d, 7 + Math.floor(r() * 12), Math.floor(r() * 60));
      const status: OrderStatus = cancelled ? 'cancelled' : ful === 'delivery' ? 'delivered' : 'collected';
      const id = `o-${num}`;
      const number = `${b.code}-${num++}`;
      const serviceFee = ['gcash', 'maya', 'card'].includes(pm) ? Math.round(subtotal * 0.02) : 0;
      const total = subtotal + fee + serviceFee;
      const cold = isCold(items);
      orders.push({
        id, number, branchId: b.id, customerId: cu.id, customerName: cu.name, customerMobile: cu.mobile,
        channel: 'app', fulfillment: ful, address: ful === 'delivery' ? cu.addresses[0] : undefined,
        slot: 'ASAP', items, subtotal, deliveryFee: fee, serviceFee, discount: 0, total,
        paymentMethod: pm, paymentStatus: cancelled ? 'refunded' : 'paid', refundedAmount: cancelled ? total : 0,
        status, autoConfirmed: ['gcash', 'maya', 'card'].includes(pm), riderId: ful === 'delivery' ? riders[Math.floor(r() * 4)].id : undefined,
        pickupPin: PIN(r), prepMinutes: 25, placedAt: placed, updatedAt: placed, completedAt: placed,
        timeline: [{ status: 'placed', at: placed, by: cu.name }, { status, at: placed, by: 'System' }], internalNotes: [],
        rating: !cancelled && r() > 0.4 ? { order: r() > 0.15 ? 5 : 3, rider: r() > 0.2 ? 5 : 4, tags: r() > 0.7 ? ['Great service'] : [] } : undefined,
        rejectReason: cancelled ? 'Customer requested cancellation' : undefined, acknowledged: true,
        coldChain: cold, maxDeliveryMins: ful === 'delivery' && cold ? 60 : undefined, insulatedPacked: true, riderBagConfirmed: ful === 'delivery' ? true : undefined,
      });
      if (!cancelled) {
        for (const i of items) saleMovements.push({ id: `ms-${id}-${i.productId}`, productId: i.productId, branchId: b.id, qty: -sold(i), type: 'online_sale', reason: 'Order completed', user: 'System', at: placed, ref: number });
      }
    }
  }

  // Today: live orders across every status so the Order Desk demo is rich.
  const live: [OrderStatus, Fulfillment, PaymentMethod, number, number, string?][] = [
    // status, fulfillment, pay, minutesAgo, customerIdx, riderId (optional)
    ['awaiting_confirmation', 'delivery', 'cod', 3, 0],
    ['awaiting_confirmation', 'pickup', 'pay_at_pickup', 8, 3],
    ['confirmed', 'delivery', 'gcash', 12, 1],
    ['preparing', 'delivery', 'maya', 22, 9],
    ['preparing', 'pickup', 'gcash', 18, 4],
    ['ready', 'delivery', 'gcash', 35, 7],
    ['ready', 'pickup', 'pay_at_pickup', 40, 2],
    ['out_for_delivery', 'delivery', 'cod', 50, 0],
    ['delivered', 'delivery', 'gcash', 120, 5],
    ['collected', 'pickup', 'gcash', 150, 6],
    ['cancelled', 'delivery', 'card', 95, 8],
    // Rider workload for the dispatch demo (appended so the order numbers above stay the same):
    // three riders on their way to collect one order, four riders at capacity (two deliveries each).
    ['ready', 'delivery', 'gcash', 30, 3, 'r-5'],
    ['ready', 'delivery', 'cod', 28, 5, 'r-7'],
    ['ready', 'delivery', 'maya', 26, 8, 'r-10'],
    ['out_for_delivery', 'delivery', 'gcash', 44, 1, 'r-19'],
    ['out_for_delivery', 'delivery', 'cod', 41, 9, 'r-19'],
    ['out_for_delivery', 'delivery', 'gcash', 47, 4, 'r-20'],
    ['out_for_delivery', 'delivery', 'card', 43, 6, 'r-20'],
    ['out_for_delivery', 'delivery', 'cod', 46, 2, 'r-21'],
    ['out_for_delivery', 'delivery', 'gcash', 42, 7, 'r-21'],
    ['out_for_delivery', 'delivery', 'maya', 48, 0, 'r-22'],
    ['out_for_delivery', 'delivery', 'gcash', 45, 3, 'r-22'],
  ];
  for (const [status, ful, pm, ago, cIdx, rid] of live) {
    const cu = customers[cIdx];
    const items = buildItems(r, 2 + Math.floor(r() * 4));
    if (['ready', 'out_for_delivery', 'delivered', 'collected'].includes(status)) items.forEach((i) => { i.pickStatus = 'picked'; if (i.soldByWeight) i.actualWeightKg = Math.round((i.estWeightKg ?? 1) * 1.04 * 100) / 100; });
    if (status === 'preparing') items.slice(0, 1).forEach((i) => { i.pickStatus = 'picked'; if (i.soldByWeight) i.actualWeightKg = Math.round((i.estWeightKg ?? 1) * 1.04 * 100) / 100; });
    const subtotal = Math.round(items.reduce((s, i) => s + lineTotal(i), 0) * 100) / 100;
    const fee = ful === 'delivery' ? 59 : 0;
    const serviceFee = ['gcash', 'maya', 'card'].includes(pm) ? Math.round(subtotal * 0.02) : 0;
    const placed = minsAgo(ago);
    const id = `o-${num}`;
    const number = `${b.code}-${num++}`;
    const paid = ['gcash', 'maya', 'card'].includes(pm) || ['delivered', 'collected'].includes(status);
    const flow = ful === 'pickup' ? ['placed', 'confirmed', 'preparing', 'ready', 'collected'] : STATUS_FLOW;
    const reached = status === 'awaiting_confirmation' ? ['placed', 'awaiting_confirmation'] : status === 'cancelled' ? ['placed', 'confirmed', 'cancelled'] : flow.slice(0, flow.indexOf(status) + 1);
    const timeline: Order['timeline'] = reached.map((st, i) => ({ status: st as OrderStatus, at: minsAgo(ago - i * Math.max(1, Math.floor(ago / (reached.length + 1)))), by: i === 0 ? cu.name : st === 'confirmed' && paid ? 'System (auto-confirm)' : st === 'out_for_delivery' || st === 'delivered' ? 'Rider' : 'Ana Cruz' }));
    const riderId = rid ?? (['out_for_delivery', 'delivered'].includes(status) ? 'r-1' : undefined);
    const cold = isCold(items);
    if (status === 'ready') {
      // Pack check logged just before "ready", as the Order Desk does when staff mark an order ready.
      const readyAt = timeline[timeline.length - 1].at;
      timeline.splice(timeline.length - 1, 0, { status: 'edit', at: new Date(new Date(readyAt).getTime() - 2 * 60_000).toISOString(), by: 'Ana Cruz', note: `Pack check: 1 bag(s)${cold ? ', packed in insulated bag with ice packs' : ''}, labeled` });
    }
    orders.push({
      id, number, branchId: b.id, customerId: cu.id, customerName: cu.name, customerMobile: cu.mobile, channel: 'app', fulfillment: ful,
      address: ful === 'delivery' ? cu.addresses[0] : undefined, slot: ago === 12 ? 'Today 2:00–3:00 PM' : 'ASAP', items,
      subtotal, deliveryFee: fee, serviceFee, discount: 0, total: subtotal + fee + serviceFee, feeRule: ful === 'delivery' ? 'Digos City 0–10 km · ₱49 + ₱10/km' : undefined,
      paymentMethod: pm, paymentStatus: status === 'cancelled' ? 'refunded' : paid ? 'paid' : 'pending', refundedAmount: status === 'cancelled' ? subtotal + fee + serviceFee : 0,
      status, autoConfirmed: ['gcash', 'maya', 'card'].includes(pm) && status !== 'awaiting_confirmation', riderId, pickerName: status === 'preparing' ? 'Ben Torres' : undefined,
      pickupPin: PIN(r), prepMinutes: 25, placedAt: placed, updatedAt: placed,
      outForDeliveryAt: status === 'out_for_delivery' ? minsAgo(3) : undefined,
      completedAt: ['delivered', 'collected', 'cancelled'].includes(status) ? minsAgo(ago - 30) : undefined,
      timeline, internalNotes: ago === 22 ? [{ at: minsAgo(15), by: 'Ana Cruz', text: 'Customer called — slice the liempo thin, for samgyup.' }] : [],
      riderInstructions: ful === 'delivery' ? 'Please call when outside the gate.' : undefined,
      rejectReason: status === 'cancelled' ? 'Item(s) out of stock' : undefined,
      acknowledged: status !== 'awaiting_confirmation',
      coldChain: cold, maxDeliveryMins: ful === 'delivery' && cold ? 60 : undefined,
      insulatedPacked: ['ready', 'out_for_delivery', 'delivered', 'collected'].includes(status) ? true : undefined,
      bagCount: status === 'ready' ? 1 : undefined,
      riderBagConfirmed: ['out_for_delivery', 'delivered'].includes(status) ? true : undefined,
    });
    if (['delivered', 'collected'].includes(status)) {
      for (const i of items) saleMovements.push({ id: `ms-${id}-${i.productId}`, productId: i.productId, branchId: b.id, qty: -sold(i), type: 'online_sale', reason: 'Order completed', user: 'System', at: placed, ref: number });
    }
  }
  return { orders, saleMovements };
}

const audit: AuditLog[] = [
  { id: 'a-1', at: minsAgo(40), user: 'Mark Lim', module: 'Inventory', action: 'Direct Receiving posted', detail: 'RCV-0002 · Southern Pork Dealers · 2 items', branchId: 'b-dgs' },
  { id: 'a-2', at: minsAgo(90), user: 'Hannah Admin', module: 'Settings', action: 'Setting changed', detail: 'Maximum delivery time for fresh/frozen orders', oldValue: '75 min', newValue: '60 min' },
  { id: 'a-3', at: minsAgo(95), user: 'Ana Cruz', module: 'Orders', action: 'Order cancelled', detail: 'Item(s) out of stock — auto refund issued', branchId: 'b-dgs' },
  { id: 'a-4', at: daysAgo(1, 18), user: 'Mark Lim', module: 'Pricing', action: 'Base price changed', detail: 'Pork Liempo', oldValue: '₱350.00', newValue: '₱360.00' },
];

const receivings: Receiving[] = [
  {
    id: 'rcv-1', number: 'RCV-0001', branchId: 'b-dgs', supplierId: 's-2', supplierName: 'Mindanao Poultry Farms', receiptNo: 'DR-55120', hasPhoto: true,
    at: daysAgo(1, 6, 15), by: 'Mark Lim', status: 'posted',
    lines: [{ productId: 'p-chicken-whole', qty: 40, weightKg: 40, cost: 155, batch: 'MPF-1115', producedOn: daysAgo(1).slice(0, 10), expiresOn: daysAgo(-4).slice(0, 10) }],
  },
  {
    id: 'rcv-2', number: 'RCV-0002', branchId: 'b-dgs', supplierId: 's-3', supplierName: 'Southern Pork Dealers', receiptNo: 'SPD-8841', hasPhoto: true,
    at: daysAgo(0, 6, 30), by: 'Mark Lim', status: 'posted',
    lines: [
      { productId: 'p-pork-liempo', qty: 25, weightKg: 25, cost: 265, batch: 'SPD-1117A', producedOn: daysAgo(0).slice(0, 10), expiresOn: daysAgo(-4).slice(0, 10) },
      { productId: 'p-pork-kasim', qty: 15, weightKg: 15, cost: 236, batch: 'SPD-1117B', producedOn: daysAgo(0).slice(0, 10), expiresOn: daysAgo(-4).slice(0, 10) },
    ],
  },
];

// ---------- Catalog Import / export history (files kept with their contents) ----------
const csvText = (rows: (string | number)[][]) =>
  rows.map((r) => r.map((c) => { const v = String(c); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }).join(',')).join('\n');
/** "nov-15" style date for file names. */
const fileDay = (at: string) => new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toLowerCase().replace(' ', '-');

function makeCatalogFiles(): CatalogFile[] {
  const digos = priceLists.find((l) => l.id === 'pl-digos')!;
  const digosPrice = (p: Product) => digos.items[p.id] ?? p.basePrice;
  const inApp = (p: Product) => (p.tags.includes('offline:b-dgs') ? 'no' : 'yes');
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? '';
  const at1 = daysAgo(3, 16, 12);
  const at2 = daysAgo(3, 16, 5);
  const at3 = daysAgo(8, 19, 48);
  const at4 = daysAgo(15, 9, 20);
  const imported = products.slice(0, 96);
  return [
    {
      id: 'cf-1', kind: 'import', fileName: `digos-prices-${fileDay(at1)}.csv`, at: at1, user: 'Hannah Admin', applied: imported.length, skipped: 1,
      content: csvText([['SKU', 'Name', 'Digos price', 'In app'], ...imported.map((p) => [p.sku, p.name, digosPrice(p), inApp(p)]), ['SKU-0999', 'Old promo pack', 'abc', 'yes']]),
    },
    {
      id: 'cf-2', kind: 'export', fileName: `products-digos-${new Date(at2).toLocaleDateString('en-CA')}.csv`, at: at2, user: 'Hannah Admin', rows: products.length,
      content: csvText([['SKU', 'Name', 'Category', 'Base price', 'Digos price', 'In app'], ...products.map((p) => [p.sku, p.name, catName(p.categoryId), p.basePrice, digosPrice(p), inApp(p)])]),
    },
    {
      id: 'cf-3', kind: 'import', fileName: `stock-count-${fileDay(at3)}.csv`, at: at3, user: 'Ana Cruz', failed: 'columns not recognised',
      content: csvText([['Item code', 'Description', 'Qty counted'], ...products.slice(0, 12).map((p, i) => [p.barcode, p.name, 10 + ((i * 7) % 25)])]),
    },
    {
      id: 'cf-4', kind: 'export', fileName: 'cut-options.csv', at: at4, user: 'Hannah Admin', rows: cutOptions.length,
      content: csvText([['Name', 'Add-on price', 'Charged', 'Prep time (min)', 'Categories', 'Offered'],
        ...cutOptions.map((c) => [c.name, c.fee, c.feeType ?? 'piece', c.prepMins ?? 0, (c.categoryIds ?? []).map(catName).join('; '), c.active ? 'yes' : 'no'])]),
    },
  ];
}

export function createSeed(): AppState {
  const { orders, saleMovements } = makeOrders();
  return {
    version: STATE_VERSION,
    seededAt: new Date().toISOString(),
    cities, branches, categories, products, priceLists,
    movements: [...makeMovements(saleMovements), ...saleMovements],
    suppliers, purchaseOrders: [], transfers: [], customers, orders, riders, zones, vouchers,
    conversations: [],
    roles, staff, settings, audit,
    notifications: [],
    banners,
    rejectReasons: ['Item(s) out of stock', 'Outside delivery hours', 'Address outside delivery zone', 'Suspected fraud', 'Branch overloaded', 'Customer requested cancellation'],
    cart: [
      { productId: 'p-pork-liempo', qty: 1, weightKg: 1, cutId: 'co-adobo', subPref: 'ask', note: 'Less fat, please' },
      { productId: 'p-chicken-whole', qty: 1, weightKg: 1.5, cutId: 'co-tinola', subPref: 'similar' },
      { productId: 'p-sinigang-mix', qty: 2, subPref: 'similar' },
    ],
    session: { staffUserId: 'u-1', branchId: 'b-dgs', shopperId: 'cu-1', shopperSignedIn: false, riderId: 'r-1' },
    counters: { order: 10200 + orders.length + 10, po: 1, transfer: 1, receiving: 3 },
    cutOptions,
    receivings,
    catalogFiles: makeCatalogFiles(),
    platform: {
      signedIn: false,
      ownerName: 'LAP IT Owner',
      // Phase 1 (PHP 500,000) scope: everything listed under "Moved to Phase 2" starts OFF.
      modules: {
        walkin: { on: false, reason: 'Not part of the launch scope', changedAt: daysAgo(3) },
        endofday: { on: false, reason: 'Phase 2', changedAt: daysAgo(3) },
        purchasing: { on: false, reason: 'Stock comes in through Direct Receiving', changedAt: daysAgo(3) },
        pricing: { on: false, reason: 'Phase 2: one price per product at launch', changedAt: daysAgo(3) },
        inventory: { on: true },
        delivery: { on: true },
        customers: { on: true },
        promotions: { on: false, reason: 'Phase 2', changedAt: daysAgo(3) },
        support: { on: false, reason: 'Phase 2: branch phone number shown instead', changedAt: daysAgo(3) },
        reports: { on: true },
        branches: { on: false, reason: 'One branch at launch', changedAt: daysAgo(3) },
        content: { on: true },
        otp: { on: false, reason: 'No OTP at launch', changedAt: daysAgo(3) },
      },
      limits: { cities: 1, branches: 1, staff: 10, riders: 30, products: 120, smsPerMonth: 500 },
      smsUsed: 0,
      forcedSignOut: [],
      blockedPermissions: [],
      log: [
        { id: 'pl-1', at: daysAgo(3), user: 'LAP IT Owner', action: 'Plan set up', detail: 'Phase 1 (PHP 500,000): 1 branch, Phase 2 modules switched off' },
      ],
    },
  };
}
