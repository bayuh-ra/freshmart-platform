import type {
  AppState, Branch, Category, City, Customer, CutFeeType, CutOption, DeliveryZone, MovementType, Order, OrderItem, OrderStatus,
  PaymentMethod, PriceList, Product, Receiving, Rider, Role, Setting, StaffUser, StockMovement, Supplier, Voucher,
  Fulfillment, AuditLog, Banner, StorageType, CatalogFile, StockCount, StockCountDraft, CodRemittance,
} from './types';

// Bump when the seed shape changes: browsers holding an older version reseed once.
export const STATE_VERSION = 24;

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
  // Direct Receiving suppliers (seeded delivery history)
  { id: 's-6', name: 'Bansalan Hog Raisers', contact: 'Nestor Alba', phone: '0917 555 6606', email: 'sales@bansalanhog.ph', terms: 'COD', leadDays: 1 },
  { id: 's-7', name: 'Mintal Poultry Dressing', contact: 'Grace Yap', phone: '0918 555 7707', email: 'orders@mintalpoultry.ph', terms: 'COD', leadDays: 1 },
  { id: 's-8', name: 'Mati Smokehouse', contact: 'Dindo Ramos', phone: '0919 555 8808', email: 'hello@matismokehouse.ph', terms: 'Net 7', leadDays: 2 },
  { id: 's-9', name: 'Toril Cattle Co-op', contact: 'Ben Ocampo', phone: '0920 555 9909', email: 'coop@torilcattle.ph', terms: 'COD', leadDays: 2 },
  { id: 's-10', name: 'GenSan Tuna Hub', contact: 'Rey Dizon', phone: '0921 555 1010', email: 'orders@gensantuna.ph', terms: 'COD', leadDays: 1 },
  { id: 's-11', name: 'Tagum Meat Wholesale', contact: 'Cora Lim', phone: '0922 555 1111', email: 'sales@tagummeat.ph', terms: 'Net 7', leadDays: 2 },
  { id: 's-12', name: 'Hamonado House', contact: 'Tess Villar', phone: '0923 555 1212', email: 'orders@hamonadohouse.ph', terms: 'Net 7', leadDays: 2 },
  { id: 's-13', name: 'Marbel Pork Center', contact: 'Allan Cruz', phone: '0924 555 1313', email: 'sales@marbelpork.ph', terms: 'COD', leadDays: 2 },
  { id: 's-14', name: 'Malita Fresh Catch', contact: 'Nora Bautista', phone: '0925 555 1414', email: 'catch@malitafresh.ph', terms: 'COD', leadDays: 1 },
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

/**
 * Walk-in daily counts, returns, wastage, expiry write-offs, adjustments and count corrections at Digos.
 * The new totals are kept (not offset): a stock-out is skipped when it would leave a product within 4 units of its
 * reorder point, so no product changes stock status and no balance goes negative. The forced low items are left alone.
 */
function makeRecentMovements(existing: StockMovement[], skip: string[]): Omit<StockMovement, 'id'>[] {
  const r = rng(91);
  const pool = products.filter((p) => p.status !== 'discontinued' && !skip.includes(p.id));
  const bal = new Map<string, number>();
  for (const m of existing) if (m.branchId === 'b-dgs') bal.set(m.productId, (bal.get(m.productId) ?? 0) + m.qty);
  const out: Omit<StockMovement, 'id'>[] = [];
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  /** Weighed products move in 0.5 kg steps, others in whole units. */
  const amount = (p: Product, kg: [number, number], units: [number, number]) =>
    p.soldByWeight ? Math.max(0.5, Math.round((kg[0] + r() * (kg[1] - kg[0])) * 2) / 2) : Math.round(units[0] + r() * (units[1] - units[0]));
  /** Today uses "minutes ago" so nothing lands in the future; older days get a shop-hours time. */
  const when = (d: number, hour?: number) => (d === 0 ? minsAgo(20 + Math.floor(r() * 360)) : daysAgo(d, hour ?? 6 + Math.floor(r() * 14), Math.floor(r() * 60)));
  const add = (type: MovementType, d: number, qty: (p: Product) => number, reason: string, user: string, ref?: string, hour?: number) => {
    const p = pick(pool);
    const q = qty(p);
    const now = bal.get(p.id) ?? 0;
    if (q < 0 && now + q < p.reorderPoint + 4) return;
    bal.set(p.id, now + q);
    out.push({ productId: p.id, branchId: 'b-dgs', qty: q, type, reason, user, at: when(d, hour), ref });
  };
  const staff = ['Ana Cruz', 'Mark Lim', 'Jun D.', 'Marites R.'];
  for (let d = 0; d <= 17; d++) {
    for (let k = 0; k < 2; k++) add('walkin_sale', d, (p) => -amount(p, [1, 6], [2, 12]), 'In-store sales (daily count)', 'Ana Cruz', 'COUNT', 19);
  }
  // Phase 1 has one branch, so there are no transfers. These two loops used to seed fake "Transfer in/out" rows from a
  // branch that does not exist; they are now plain adjustments. The calls (and random draws) are unchanged, so every
  // product, quantity and date — and therefore every on-hand total — is the same as before. Reasons don't draw from r().
  for (let i = 0; i < 13; i++) add('adjustment', i === 0 ? 0 : 1 + Math.floor(r() * 17), (p) => amount(p, [5, 15], [6, 24]), i % 2 ? 'Found stock — back chiller recount' : 'Found stock', 'Jun D.');
  for (let i = 0; i < 4; i++) add('adjustment', 2 + Math.floor(r() * 15), (p) => -amount(p, [2, 6], [3, 10]), i % 2 ? 'Sample / demo use' : 'Staff meal', 'Jun D.');
  for (let i = 0; i < 15; i++) {
    add('wastage', i < 2 ? 0 : Math.floor(r() * 18), (p) => -amount(p, [0.5, 2], [1, 3]),
      pick(['Freezer burn', 'Dropped / damaged', 'Discolored — not sellable', 'Torn packaging']), pick(staff));
  }
  for (let i = 0; i < 13; i++) add('expiry', 1 + Math.floor(r() * 17), (p) => -amount(p, [0.5, 3], [1, 4]), pick(['Past use-by date', 'Near expiry — pulled from shelf']), pick(staff));
  for (let i = 0; i < 12; i++) {
    add('return', Math.floor(r() * 18), (p) => amount(p, [0.5, 1.5], [1, 2]),
      pick(['Returned — resellable', 'Wrong item delivered — restocked']), 'Ana Cruz', `RET-${String(212 - i).padStart(4, '0')}`);
  }
  for (let i = 0; i < 12; i++) {
    add('adjustment', 1 + Math.floor(r() * 17), (p) => (r() < 0.5 ? 1 : -1) * amount(p, [0.5, 2], [1, 3]),
      pick(['Found stock', 'System error correction', 'Sample / demo use']), 'Mark Lim');
  }
  for (let i = 0; i < 14; i++) {
    add('count_correction', i === 0 ? 0 : 1 + Math.floor(r() * 17), (p) => (r() < 0.35 ? 1 : -1) * amount(p, [0.5, 2], [1, 3]),
      'Stock take variance', pick(['Jun D.', 'Mark Lim']), `ST-${220 - i}`);
  }
  return out;
}

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
  // Everyday stock changes over the last 18 days (after opening stock), so the Movements ledger has every type.
  for (const m of makeRecentMovements([...out, ...sales], lows.map((x) => x[0]))) out.push({ ...m, id: `m-${n++}` });
  for (const [pid, target] of lows) {
    const current = [...out, ...sales].filter((m) => m.productId === pid && m.branchId === 'b-dgs').reduce((s, m) => s + m.qty, 0);
    out.push({ id: `m-${n++}`, productId: pid, branchId: 'b-dgs', qty: target - current, type: 'walkin_sale', reason: 'In-store sales (daily count)', user: 'Ana Cruz', at: daysAgo(1, 19), ref: 'COUNT' });
  }
  out.push({ id: `m-${n++}`, productId: 'p-chicken-liver', branchId: 'b-dgs', qty: -2, type: 'wastage', reason: 'Discolored — not sellable', user: 'Mark Lim', at: daysAgo(0, 7, 10) });
  // The two seeded deliveries that carry ledger movements (see LEDGER_DRS); every other posted delivery
  // in the seeded history is treated as already counted in the opening stock.
  for (const r of receivings.filter((x) => LEDGER_DRS.includes(x.receiptNo))) {
    for (const l of r.lines) {
      out.push({
        id: `m-${n++}`, productId: l.productId, branchId: r.branchId, qty: l.qty, type: 'receiving', user: r.by, at: r.at, ref: r.number,
        reason: `Direct Receiving · ${r.supplierName} · DR ${r.receiptNo} · Batch ${l.batch} · Produced ${l.producedOn} · Exp ${l.expiresOn}${l.weightKg ? ` · ${l.weightKg} kg` : ''}`,
      });
    }
  }
  out.push({ id: `m-${n++}`, productId: 'p-eggs', branchId: 'b-dgs', qty: -2, type: 'count_correction', reason: 'Daily mini-count variance', user: 'Mark Lim', at: daysAgo(2, 9) });
  return out;
}

// [name, mobile, email, address, lat, lng, username]
const customerSeed: [string, string, string, string, number, number, string][] = [
  ['Maria Santos', '0917 123 4567', 'maria.santos@gmail.com', 'Purok 3, Dawis, Digos City', 6.7381, 125.3653, 'mariasantos'],
  ['Juan dela Cruz', '0918 222 3344', 'juan.dc@yahoo.com', 'Tres de Mayo, Digos City', 6.7602, 125.3489, 'juandc'],
  ['Angelica Reyes', '0919 333 4455', 'angel.reyes@gmail.com', 'Zone 3, Digos City', 6.7531, 125.3594, 'angelreyes'],
  ['Carlo Mendoza', '0920 444 5566', 'carlo.m@gmail.com', 'San Jose, Digos City', 6.7449, 125.3511, 'carlom'],
  ['Patricia Lim', '0921 555 6677', 'pat.lim@outlook.com', 'Cogon, Digos City', 6.7568, 125.3637, 'patlim'],
  ['Miguel Tan', '0922 666 7788', 'miguel.tan@gmail.com', 'Matti, Digos City', 6.7692, 125.3447, 'migueltan'],
  ['Sofia Garcia', '0923 777 8899', 'sofia.g@gmail.com', 'Kiagot, Digos City', 6.7335, 125.3398, 'sofiag'],
  ['Rafael Bautista', '0924 888 9900', 'raf.bautista@gmail.com', 'Dawis, Digos City', 6.7419, 125.3712, 'rafb'],
  ['Lea Villanueva', '0925 999 0011', 'lea.v@gmail.com', 'Tiguman, Digos City', 6.7801, 125.3402, 'leav'],
  ['Daniel Ramos', '0928 303 4343', 'dan.ramos@gmail.com', 'Sinawilan, Digos City', 6.7253, 125.3524, 'danramos'],
  // More Digos shoppers so the live Dispatch demo has one customer per delivery.
  ['Mylene Torres', '0929 410 1010', 'mylene.t@gmail.com', 'Purok 5, San Miguel, Digos City', 6.7655, 125.354, 'mylenet'],
  ['Rodel Cabrera', '0929 410 1011', 'rodel.cabrera@gmail.com', 'Colorado, Digos City', 6.736, 125.359, 'rodelc'],
  ['Jenny Abella', '0929 410 1012', 'jenny.abella@gmail.com', 'Ruparan, Digos City', 6.759, 125.375, 'jennya'],
  ['Noel Pacheco', '0929 410 1013', 'noel.pacheco@gmail.com', 'Igpit, Digos City', 6.723, 125.366, 'noelp'],
  ['Grace Ybañez', '0929 410 1014', 'grace.ybanez@gmail.com', 'Mahayahay, Digos City', 6.772, 125.362, 'gracey'],
  ['Arvin Lacson', '0929 410 1015', 'arvin.lacson@gmail.com', 'Soong, Digos City', 6.776, 125.335, 'arvinl'],
  ['Cherry Mabini', '0929 410 1016', 'cherry.mabini@gmail.com', 'Balabag, Digos City', 6.728, 125.342, 'cherrym'],
  ['Dante Ilagan', '0929 410 1017', 'dante.ilagan@gmail.com', 'Binaton, Digos City', 6.714, 125.37, 'dantei'],
  ['Fe Sarmiento', '0929 410 1018', 'fe.sarmiento@gmail.com', 'Goma, Digos City', 6.785, 125.35, 'fesarmiento'],
  ['Lourdes Quijano', '0929 410 1019', 'lourdes.q@gmail.com', 'San Roque, Digos City', 6.747, 125.366, 'lourdesq'],
  ['Ian Robles', '0929 410 1020', 'ian.robles@gmail.com', 'Purok 2, Dulangan, Digos City', 6.7947, 125.3322, 'ianrobles'],
  ['Tess Aguirre', '0929 410 1021', 'tess.aguirre@gmail.com', 'Lungag, Digos City', 6.74, 125.38, 'tessa'],
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

// Demo extras for the Riders page: joining date, 7-day performance, today's on-time %, COD details and a full
// document set. Deterministic per rider; dates are relative to today so the alerts stay valid.
riders.forEach((r, n) => {
  const h = (n * 37 + 11) % 10;
  r.joinedAt = daysAgo(90 + ((n * 53) % 640));
  const onTimePct = Math.min(98, Math.round(58 + (r.rating - 4) * 38 + h));
  r.stats7d = {
    trips: r.status === 'offline' ? 14 + h : 22 + ((n * 7) % 15),
    onTimePct,
    avgMins: Math.round(40 - (r.rating - 4) * 16 + (h % 5)),
    acceptancePct: Math.min(100, 92 + (h % 7) + (r.rating >= 4.6 ? 1 : 0)),
  };
  r.onTimeToday = r.tripsToday ? Math.min(100, Math.max(50, onTimePct + ((n * 13) % 11) - 5)) : undefined;
  if (r.codHeld > 0) {
    r.codOrders = r.codHeld >= 600 ? 2 : 1;
    // Collected before the rider went offline (Lito Pascual: ~11:20 AM, offline ~1:15 PM).
    r.codSince = minsAgo(r.status === 'offline' ? 190 : 50 + ((n * 23) % 150));
  }
  if (!r.documents.some((d) => d.name === 'OR/CR')) r.documents.push({ name: 'OR/CR', expires: daysAgo(-(180 + ((n * 41) % 300))), status: 'approved' });
  r.documents.push({ name: 'NBI clearance', expires: daysAgo(-(150 + ((n * 29) % 300))), status: 'approved' });
  // Vince Ocampo joined this Monday, so last week's payout statement has one rider with no trips.
  if (r.id === 'r-24') r.joinedAt = daysAgo((new Date().getDay() + 6) % 7, 8);
  // Bong Navarro's OR/CR runs out in 11 days (Kevin Uy's license, 20 days, is set above).
  if (r.id === 'r-12') r.documents.find((d) => d.name === 'OR/CR')!.expires = daysAgo(-11);
});

const zones: DeliveryZone[] = [
  { id: 'z-1', branchId: 'b-dgs', name: 'Digos City 0–6 km', type: 'radius', fromKm: 0, radiusKm: 6, feeModel: 'distance', flatFee: 0, baseFee: 49, perKm: 10, freeAbove: 2500, minOrder: 500, etaMins: 45, active: true },
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
  S({ key: 'slotCapacity', label: 'Orders per delivery slot', group: 'Fulfillment', type: 'number', unit: 'orders', global: 8 }),
  S({ key: 'vatRate', label: 'VAT rate', group: 'Pricing & tax', type: 'number', unit: '%', global: 12 }),
  S({ key: 'pricesTaxInclusive', label: 'Show prices tax-inclusive', group: 'Pricing & tax', type: 'boolean', global: true }),
  S({ key: 'rounding', label: 'Price rounding', group: 'Pricing & tax', type: 'select', options: ['None', 'Nearest 0.25', 'Nearest 0.50', 'Nearest 1.00'], global: 'Nearest 0.25' }),
  S({ key: 'safetyBuffer', label: 'Online safety buffer (units held back)', group: 'Inventory', type: 'number', unit: 'units', global: 2 }),
  S({ key: 'lowStockThreshold', label: 'Low-stock alert threshold', group: 'Inventory', type: 'number', unit: 'units', global: 8 }),
  S({ key: 'adjustApprovalUnits', label: 'Manager approval for adjustments / count variances above', group: 'Inventory', type: 'number', unit: 'units', global: 5 }),
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
      const cu = customers[Math.floor(r() * 10)]; // history uses the first ten (regular) shoppers
      const ful: Fulfillment = r() > 0.3 ? 'delivery' : 'pickup';
      const pm0 = ful === 'pickup' && r() > 0.5 ? 'pay_at_pickup' : payMethods[Math.floor(r() * payMethods.length)];
      // Maria Santos (Customers demo) usually pays cash on delivery. Overridden after the draws so the random sequence is unchanged.
      const pm: PaymentMethod = cu === customers[0] && ful === 'delivery' ? 'cod' : pm0;
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
  // status, fulfillment, pay, minutesAgo, customerIdx, riderId?, dispatch timing?
  // Dispatch timing (for the live Dispatch board): minutes since packed, minutes since the rider left, bags, rider note.
  type Timing = { packed: number; out?: number; bags?: number; note?: string };
  const live: [OrderStatus, Fulfillment, PaymentMethod, number, number, string?, Timing?][] = [
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
    // Dispatch demo (appended so the order numbers above stay the same). With the two live
    // delivery orders above this gives 6 waiting for a rider, 2 awaiting pickup and 14 on the road
    // (2 past the 60-min cold-chain limit). Riders r-19..r-22 carry two orders each (2/2).
    // Waiting for a rider (no rider yet):
    ['ready', 'delivery', 'gcash', 0, 20, undefined, { packed: 41, bags: 2, note: 'Leave with the guard' }],
    ['ready', 'delivery', 'cod', 0, 8, undefined, { packed: 26, bags: 2 }],
    ['ready', 'delivery', 'maya', 0, 10, undefined, { packed: 9, bags: 1 }],
    ['ready', 'delivery', 'cod', 0, 11, undefined, { packed: 6, bags: 1, note: 'Call when outside, dogs in the yard' }],
    ['ready', 'delivery', 'gcash', 0, 12, undefined, { packed: 3, bags: 2 }],
    // Awaiting pickup (rider on the way to the shop):
    ['ready', 'delivery', 'gcash', 0, 13, 'r-5', { packed: 8, bags: 1 }],
    ['ready', 'delivery', 'cod', 0, 14, 'r-7', { packed: 5, bags: 2 }],
    // On the road:
    ['out_for_delivery', 'delivery', 'gcash', 0, 1, 'r-19', { packed: 12, out: 4, bags: 1 }],
    ['out_for_delivery', 'delivery', 'cod', 0, 5, 'r-19', { packed: 12, out: 4, bags: 2 }],
    ['out_for_delivery', 'delivery', 'gcash', 0, 9, 'r-20', { packed: 14, out: 5, bags: 1 }],
    ['out_for_delivery', 'delivery', 'card', 0, 17, 'r-20', { packed: 14, out: 5, bags: 2 }],
    ['out_for_delivery', 'delivery', 'cod', 0, 4, 'r-21', { packed: 9, out: 2, bags: 1 }],
    ['out_for_delivery', 'delivery', 'gcash', 0, 19, 'r-21', { packed: 9, out: 2, bags: 1, note: 'Blue gate beside the sari-sari store' }],
    ['out_for_delivery', 'delivery', 'maya', 0, 6, 'r-22', { packed: 17, out: 7, bags: 2 }],
    ['out_for_delivery', 'delivery', 'gcash', 0, 16, 'r-22', { packed: 17, out: 7, bags: 1 }],
    ['out_for_delivery', 'delivery', 'maya', 0, 3, 'r-9', { packed: 11, out: 3, bags: 1 }],
    ['out_for_delivery', 'delivery', 'gcash', 0, 2, 'r-12', { packed: 7, out: 2, bags: 1 }],
    ['out_for_delivery', 'delivery', 'cod', 0, 15, 'r-14', { packed: 13, out: 4, bags: 2 }],
    // Delayed: waited too long at the shop, now past the 60-min cold-chain limit.
    ['out_for_delivery', 'delivery', 'gcash', 0, 18, 'r-6', { packed: 64, out: 6, bags: 2, note: 'Leave at the store beside the church' }],
    ['out_for_delivery', 'delivery', 'cod', 0, 21, 'r-8', { packed: 62, out: 3, bags: 1 }],
  ];
  for (const [status, ful, pm, agoIn, cIdx, rid, t] of live) {
    // Timed dispatch orders were placed 16 min before packing.
    const ago = t ? t.packed + 16 : agoIn;
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
    const stepAgo = (st: string, i: number) => !t ? ago - i * Math.max(1, Math.floor(ago / (reached.length + 1)))
      : st === 'placed' ? ago : st === 'confirmed' ? t.packed + 14 : st === 'preparing' ? t.packed + 12 : st === 'ready' ? t.packed : t.out ?? 3;
    const timeline: Order['timeline'] = reached.map((st, i) => ({ status: st as OrderStatus, at: minsAgo(stepAgo(st, i)), by: i === 0 ? cu.name : st === 'confirmed' && paid ? 'System (auto-confirm)' : st === 'out_for_delivery' || st === 'delivered' ? 'Rider' : 'Ana Cruz' }));
    const riderId = rid ?? (['out_for_delivery', 'delivered'].includes(status) ? 'r-1' : undefined);
    const cold = isCold(items);
    const bags = t?.bags ?? 1;
    if (status === 'ready' || (t && status === 'out_for_delivery')) {
      // Pack check logged just before "ready", as the Order Desk does when staff mark an order ready.
      const ri = timeline.findIndex((e) => e.status === 'ready');
      const readyAt = timeline[ri].at;
      timeline.splice(ri, 0, { status: 'edit', at: new Date(new Date(readyAt).getTime() - 2 * 60_000).toISOString(), by: 'Ana Cruz', note: `Pack check: ${bags} bag(s)${cold ? ', packed in insulated bag with ice packs' : ''}, labeled` });
    }
    if (t && rid) timeline.splice(timeline.findIndex((e) => e.status === 'ready') + 1, 0, { status: 'rider', at: minsAgo(t.packed), by: 'Ana Cruz', note: `Rider assigned: ${riders.find((x) => x.id === rid)?.name} (motorcycle)` });
    orders.push({
      id, number, branchId: b.id, customerId: cu.id, customerName: cu.name, customerMobile: cu.mobile, channel: 'app', fulfillment: ful,
      address: ful === 'delivery' ? cu.addresses[0] : undefined, slot: !t && ago === 12 ? 'Today 2:00–3:00 PM' : 'ASAP', items,
      subtotal, deliveryFee: fee, serviceFee, discount: 0, total: subtotal + fee + serviceFee, feeRule: ful === 'delivery' ? 'Digos City 0–6 km · ₱49 + ₱10/km' : undefined,
      paymentMethod: pm, paymentStatus: status === 'cancelled' ? 'refunded' : paid ? 'paid' : 'pending', refundedAmount: status === 'cancelled' ? subtotal + fee + serviceFee : 0,
      status, autoConfirmed: ['gcash', 'maya', 'card'].includes(pm) && status !== 'awaiting_confirmation', riderId, pickerName: status === 'preparing' ? 'Ben Torres' : undefined,
      pickupPin: PIN(r), prepMinutes: 25, placedAt: placed, updatedAt: placed,
      outForDeliveryAt: status === 'out_for_delivery' ? minsAgo(t?.out ?? 3) : undefined,
      completedAt: ['delivered', 'collected', 'cancelled'].includes(status) ? minsAgo(ago - 30) : undefined,
      timeline, internalNotes: !t && ago === 22 ? [{ at: minsAgo(15), by: 'Ana Cruz', text: 'Customer called — slice the liempo thin, for samgyup.' }] : [],
      riderInstructions: t ? t.note : ful === 'delivery' ? 'Please call when outside the gate.' : undefined,
      rejectReason: status === 'cancelled' ? 'Item(s) out of stock' : undefined,
      acknowledged: status !== 'awaiting_confirmation',
      coldChain: cold, maxDeliveryMins: ful === 'delivery' && cold ? 60 : undefined,
      insulatedPacked: ['ready', 'out_for_delivery', 'delivered', 'collected'].includes(status) ? true : undefined,
      bagCount: status === 'ready' || t ? bags : undefined,
      riderBagConfirmed: ['out_for_delivery', 'delivered'].includes(status) ? true : undefined,
    });
    if (['delivered', 'collected'].includes(status)) {
      for (const i of items) saleMovements.push({ id: `ms-${id}-${i.productId}`, productId: i.productId, branchId: b.id, qty: -sold(i), type: 'online_sale', reason: 'Order completed', user: 'System', at: placed, ref: number });
    }
  }

  // Delivered cash-on-delivery orders whose cash the rider still holds (Riders › COD remittance).
  // Each holding rider's orders add up to their codHeld (Lito Pascual: 2 × ₱510 = ₱1,020).
  for (const rd of riders.filter((x) => x.codHeld > 0)) {
    const n = rd.codOrders ?? 1;
    const firstAgo = rd.codSince ? Math.round((Date.now() - Date.parse(rd.codSince)) / 60_000) : 60;
    for (let k = 0; k < n; k++) {
      const amount = k < n - 1 ? Math.round(rd.codHeld / n) : rd.codHeld - Math.round(rd.codHeld / n) * (n - 1);
      const doneAgo = Math.max(5, firstAgo - k * 35);
      const cu = customers[(Number(rd.id.slice(2)) * 3 + k) % customers.length];
      const items = buildItems(r, 2).map((i) => ({ ...i, pickStatus: 'picked' as const, actualWeightKg: i.soldByWeight ? i.estWeightKg ?? 1 : undefined }));
      // Scale prices so the order total is exactly `amount`; the delivery fee takes the rounding.
      const f = (amount - 59) / items.reduce((s, i) => s + lineTotal(i), 0);
      items.forEach((i) => { i.unitPrice = Math.round(i.unitPrice * f * 100) / 100; });
      const subtotal = Math.round(items.reduce((s, i) => s + lineTotal(i), 0) * 100) / 100;
      const fee = Math.round((amount - subtotal) * 100) / 100;
      const id = `o-${num}`;
      const number = `${b.code}-${num++}`;
      const at = (m: number) => minsAgo(doneAgo + m);
      const cold = isCold(items);
      orders.push({
        id, number, branchId: b.id, customerId: cu.id, customerName: cu.name, customerMobile: cu.mobile, channel: 'app', fulfillment: 'delivery',
        address: cu.addresses[0], slot: 'ASAP', items, subtotal, deliveryFee: fee, serviceFee: 0, discount: 0, total: amount,
        feeRule: 'Digos City 0–6 km · ₱49 + ₱10/km', paymentMethod: 'cod', paymentStatus: 'paid', refundedAmount: 0, status: 'delivered',
        autoConfirmed: false, riderId: rd.id, pickupPin: PIN(r), prepMinutes: 25, placedAt: at(70), updatedAt: at(0), outForDeliveryAt: at(28), completedAt: at(0),
        timeline: [
          { status: 'placed', at: at(70), by: cu.name }, { status: 'confirmed', at: at(66), by: 'Ana Cruz' }, { status: 'preparing', at: at(60), by: 'Ana Cruz' },
          { status: 'ready', at: at(40), by: 'Ana Cruz' }, { status: 'rider', at: at(38), by: 'Ana Cruz', note: `Rider assigned: ${rd.name} (motorcycle)` },
          { status: 'out_for_delivery', at: at(28), by: 'Rider' }, { status: 'delivered', at: at(0), by: 'Rider' },
          { status: 'payment', at: at(0), by: 'Rider', note: `Cash on delivery ${amount.toFixed(2)} collected` },
        ],
        internalNotes: [], acknowledged: true, coldChain: cold, maxDeliveryMins: cold ? 60 : undefined, insulatedPacked: true, bagCount: 1, riderBagConfirmed: true,
      });
      for (const i of items) saleMovements.push({ id: `ms-${id}-${i.productId}`, productId: i.productId, branchId: b.id, qty: -sold(i), type: 'online_sale', reason: 'Order completed', user: 'System', at: at(0), ref: number });
    }
  }
  return { orders, saleMovements };
}

/** COD handed over earlier today (Riders › COD remittance › Handed over today). */
const remittances: CodRemittance[] = [
  { id: 'rem-1', riderName: 'Joy Salazar', amount: 1180, method: 'cash', orders: 3, at: daysAgo(0, 12, 40), by: 'Ana Cruz' },
  { id: 'rem-2', riderName: 'Bea Navarro', amount: 620, method: 'gcash', orders: 1, at: daysAgo(0, 10, 5), by: 'Ana Cruz' },
];

const audit: AuditLog[] = [
  { id: 'a-1', at: minsAgo(40), user: 'Liza P.', module: 'Inventory', action: 'Direct Receiving submitted for approval', detail: 'RCV-0122 · Mintal Poultry Dressing · DR DR-55114 · 3 line(s) · ₱34,490.39 (above ₱20,000)', branchId: 'b-dgs' },
  { id: 'a-2', at: minsAgo(90), user: 'Hannah Admin', module: 'Settings', action: 'Setting changed', detail: 'Maximum delivery time for fresh/frozen orders', oldValue: '75 min', newValue: '60 min' },
  { id: 'a-3', at: minsAgo(95), user: 'Ana Cruz', module: 'Orders', action: 'Order cancelled', detail: 'Item(s) out of stock — auto refund issued', branchId: 'b-dgs' },
  { id: 'a-4', at: daysAgo(1, 18), user: 'Mark Lim', module: 'Pricing', action: 'Base price changed', detail: 'Pork Liempo', oldValue: '₱350.00', newValue: '₱360.00' },
];

// ---------- Direct Receiving history: ~124 supplier deliveries over the last 30 days ----------
type RcvLine = Receiving['lines'][number];
const RECEIVERS = ['Marites R.', 'Jun D.', 'Liza P.', 'Ronnie A.'];
/** Local calendar day `d` days ago as YYYY-MM-DD (negative = days ahead). */
const ymd = (d: number) => {
  const x = new Date();
  x.setDate(x.getDate() - d);
  return x.toLocaleDateString('en-CA');
};
/** Days from production to expiry for a delivered lot. */
const shelfDays = (p: Product) =>
  p.storage === 'frozen' ? 60 : p.storage === 'shelf' ? 180 : p.categoryId === 'cat-seafood' ? 3 : p.categoryId === 'cat-chicken' ? 5 : 6;

// [supplierId, short code for lot numbers, products they deliver]
const RCV_SUPPLIERS: [string, string, string[]][] = [
  ['s-1', 'DSM', ['p-beef-brisket', 'p-beef-sirloin', 'p-beef-shank', 'p-beef-round', 'p-beef-chuck', 'p-beef-ground', 'p-beef-cubes', 'p-beef-tripe']],
  ['s-6', 'BHR', ['p-pork-liempo', 'p-pork-kasim', 'p-pork-chop', 'p-pork-pata', 'p-pork-belly', 'p-pork-ground', 'p-pork-pigue', 'p-pork-shoulder']],
  ['s-7', 'MPD', ['p-chicken-whole', 'p-chicken-breast', 'p-chicken-thigh', 'p-chicken-wings', 'p-chicken-feet', 'p-chicken-tinola', 'p-chicken-liver', 'p-chicken-drumstick']],
  ['s-8', 'MSH', ['p-embutido', 'p-bacon', 'p-longganisa', 'p-tocino', 'p-ham']],
  ['s-9', 'TCC', ['p-beef-oxtail', 'p-beef-shortribs', 'p-beef-kenchi', 'p-beef-bones', 'p-beef-flank', 'p-beef-liver']],
  ['s-10', 'GTH', ['p-tuna-belly', 'p-boneless-bangus', 'p-squid', 'p-pompano', 'p-bangus']],
  ['s-11', 'TMW', ['p-beef-brisket', 'p-beef-shank', 'p-pork-liempo', 'p-pork-spareribs', 'p-beef-tapacut', 'p-pork-loin']],
  ['s-12', 'HMH', ['p-ham', 'p-longganisa', 'p-tocino', 'p-skinless', 'p-garlic-longganisa', 'p-cornedbeef', 'p-beef-tapa']],
  ['s-13', 'MPC', ['p-pork-spareribs', 'p-pork-babyback', 'p-pork-bbq', 'p-pork-kawali', 'p-pork-sinigang', 'p-pork-neckbones']],
  ['s-14', 'MFC', ['p-mussels', 'p-shrimp', 'p-tilapia', 'p-galunggong', 'p-cream-dory']],
];
const REJECT_REASONS = [
  'Temperature above 4°C on arrival', 'Short weight against the DR', 'Lot past its use-by date', 'Wrong cut delivered',
  'Damaged packaging, leaking', 'Off smell on two crates', 'No DR copy from the driver',
];
const RCV_NOTES = ['Chilled on arrival, 2°C', 'Two crates re-weighed at the counter', 'Driver arrived 30 min late', 'Ice packs replaced on arrival'];

/** One delivered line. `producedAgo` / `expiresAgo` are days before today (negative = after today). */
function rcvLine(pid: string, amount: number, cost: number, batch: string, producedAgo: number, expiresAgo?: number): RcvLine {
  const p = products.find((x) => x.id === pid)!;
  return {
    productId: pid, qty: p.soldByWeight ? Math.max(1, Math.round(amount)) : amount, weightKg: p.soldByWeight ? amount : undefined,
    cost, batch, producedOn: ymd(producedAgo), expiresOn: ymd(expiresAgo ?? producedAgo - shelfDays(p)),
  };
}
const lineValue = (l: RcvLine) => (l.weightKg ?? l.qty) * l.cost;
/** Scale line costs so the delivery adds up to `target` (the last line takes the rounding). */
function fitTotal(lines: RcvLine[], target: number) {
  const f = target / lines.reduce((t, l) => t + lineValue(l), 0);
  lines.forEach((l) => { l.cost = Math.round(l.cost * f * 100) / 100; });
  const last = lines[lines.length - 1];
  const rest = lines.slice(0, -1).reduce((t, l) => t + lineValue(l), 0);
  last.cost = Math.round(((target - rest) / (last.weightKg ?? last.qty)) * 100) / 100;
  return lines;
}

/** The seeded deliveries whose stock movements are in the ledger (the rest are counted in opening stock). */
const LEDGER_DRS = ['DR-55084', 'DR-55078'];

function makeReceivings(): Receiving[] {
  const r = rng(23);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const supName = (id: string) => suppliers.find((x) => x.id === id)!.name;
  const code = (id: string) => RCV_SUPPLIERS.find((x) => x[0] === id)![1];
  type Row = Omit<Receiving, 'id' | 'number' | 'branchId' | 'supplierName' | 'receiptNo' | 'hasPhoto'> & { supplierId: string; hasPhoto?: boolean };

  // The ten newest deliveries, as on the Receiving mockup (DR numbers step down by 3).
  const top: Row[] = [
    { supplierId: 's-1', at: daysAgo(0, 6, 0), by: 'Marites R.', status: 'awaiting',
      lines: [rcvLine('p-beef-brisket', 72, 302, 'DSM-1117A', 1)] },
    { supplierId: 's-6', at: daysAgo(0, 7, 13), by: 'Jun D.', status: 'awaiting',
      lines: [rcvLine('p-pork-chop', 58, 223, 'BHR-1107A', 2, -4), rcvLine('p-pork-pata', 81, 187, 'BHR-1110B', 3, -4)] },
    { supplierId: 's-7', at: daysAgo(0, 8, 26), by: 'Liza P.', status: 'awaiting',
      lines: fitTotal([rcvLine('p-chicken-feet', 67, 85, 'MPD-1117A', 1), rcvLine('p-chicken-tinola', 85, 152, 'MPD-1117B', 1), rcvLine('p-chicken-whole', 103, 155, 'MPD-1117C', 1)], 34490) },
    { supplierId: 's-8', at: daysAgo(1, 9, 39), by: 'Ronnie A.', status: 'posted',
      lines: fitTotal([rcvLine('p-embutido', 30, 101, 'MSH-1110A', 7), rcvLine('p-bacon', 25, 133, 'MSH-1110B', 7), rcvLine('p-longganisa', 20, 115, 'MSH-1112C', 5), rcvLine('p-tocino', 18, 119, 'MSH-1112D', 5)], 10020) },
    { supplierId: 's-9', at: daysAgo(1, 10, 52), by: 'Marites R.', status: 'posted', note: RCV_NOTES[0],
      lines: fitTotal([rcvLine('p-beef-oxtail', 28, 385, 'TCC-1116A', 2)], 10472) },
    { supplierId: 's-10', at: daysAgo(1, 11, 5), by: 'Jun D.', status: 'posted',
      lines: fitTotal([rcvLine('p-tuna-belly', 15, 281, 'GTH-1117A', 1), rcvLine('p-boneless-bangus', 15, 136, 'GTH-1103B', 15)], 6230) },
    { supplierId: 's-11', at: daysAgo(1, 12, 18), by: 'Liza P.', status: 'posted', approvedBy: 'Hannah Admin', approvedAt: daysAgo(1, 12, 40),
      lines: fitTotal([rcvLine('p-beef-brisket', 30, 311, 'TMW-1116A', 2), rcvLine('p-beef-shank', 30, 281, 'TMW-1116B', 2), rcvLine('p-pork-liempo', 22, 266, 'TMW-1116C', 2)], 23508) },
    { supplierId: 's-12', at: daysAgo(2, 13, 31), by: 'Ronnie A.', status: 'posted',
      lines: fitTotal([rcvLine('p-ham', 30, 158, 'HMH-1101A', 16), rcvLine('p-longganisa', 40, 115, 'HMH-1109B', 8), rcvLine('p-tocino', 30, 119, 'HMH-1109C', 8), rcvLine('p-skinless', 25, 104, 'HMH-1109D', 8)], 15384) },
    { supplierId: 's-13', at: daysAgo(2, 14, 44), by: 'Marites R.', status: 'posted',
      lines: fitTotal([rcvLine('p-pork-spareribs', 25, 252, 'MPC-1115A', 3)], 6188) },
    { supplierId: 's-14', at: daysAgo(2, 6, 57), by: 'Jun D.', status: 'rejected', rejectReason: REJECT_REASONS[0], rejectedBy: 'Hannah Admin', rejectedAt: daysAgo(2, 7, 20),
      lines: fitTotal([rcvLine('p-mussels', 30, 104, 'MFC-1116A', 2), rcvLine('p-shrimp', 15, 212, 'MFC-1110B', 8)], 6145) },
  ];

  // 114 older deliveries: 108 posted, 6 rejected (with the rows above: 114 posted, 3 awaiting, 7 rejected).
  const REJECTED_AT = [19, 33, 48, 66, 85, 104];
  const rows: Row[] = [...top];
  for (let i = 10; i < 124; i++) {
    const day = 2 + Math.floor((i - 10) / 4);
    const at = daysAgo(day, 6 + Math.floor(r() * 9), Math.floor(r() * 60));
    const [sid, , pool] = pick(RCV_SUPPLIERS);
    const dr = 55120 - 3 * i;
    const n = 1 + Math.floor(r() * 3);
    const pids = [...pool].sort(() => r() - 0.5).slice(0, n);
    let lines = pids.map((pid, j) => {
      const p = products.find((x) => x.id === pid)!;
      const amount = p.soldByWeight ? Math.round(20 + r() * 70) : Math.round(20 + r() * 80);
      const produced = day + (p.storage === 'frozen' ? 3 + Math.floor(r() * 10) : Math.floor(r() * 2) + 1);
      return rcvLine(pid, amount, Math.round(p.costPrice * (0.92 + r() * 0.08)), `${code(sid)}-${String(dr).slice(-4)}${'ABC'[j]}`, produced);
    });
    let supplierId = sid;
    // These two match the receiving movements in the stock ledger.
    if (`DR-${dr}` === 'DR-55084') { supplierId = 's-6'; lines = [rcvLine('p-pork-liempo', 25, 265, 'BHR-5084A', day + 1), rcvLine('p-pork-kasim', 15, 236, 'BHR-5084B', day + 1)]; }
    if (`DR-${dr}` === 'DR-55078') { supplierId = 's-7'; lines = [rcvLine('p-chicken-whole', 40, 155, 'MPD-5078A', day + 1)]; }
    const value = lines.reduce((t, l) => t + lineValue(l), 0);
    const rejected = REJECTED_AT.includes(i);
    rows.push({
      supplierId, at, by: pick(RECEIVERS), lines, note: r() < 0.18 ? pick(RCV_NOTES) : undefined, hasPhoto: r() > 0.08,
      status: rejected ? 'rejected' : 'posted',
      ...(rejected ? { rejectReason: pick(REJECT_REASONS), rejectedBy: 'Hannah Admin', rejectedAt: new Date(new Date(at).getTime() + 25 * 60_000).toISOString() } : {}),
      ...(!rejected && value > 20000 ? { approvedBy: 'Hannah Admin', approvedAt: new Date(new Date(at).getTime() + 40 * 60_000).toISOString() } : {}),
    });
  }

  return rows.map((x, i) => ({
    ...x,
    id: `rcv-${rows.length - i}`, number: `RCV-${String(rows.length - i).padStart(4, '0')}`, branchId: 'b-dgs',
    supplierName: supName(x.supplierId), receiptNo: `DR-${55120 - 3 * i}`, hasPhoto: x.hasPhoto ?? true,
  }));
}
const receivings: Receiving[] = makeReceivings();

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

// ---------- Stock take: recent counts and today's Beef count in progress ----------
function makeStockCounts(): StockCount[] {
  const rows: [string, string, number, number, number, string, number, number, number][] = [
    // [scope, name, days ago, hour, min, by, counted, variances, value at cost]
    ['cat-beef', 'Beef', 3, 6, 10, 'Marites R.', 18, 3, -1240],
    ['cat-chicken', 'Chicken', 4, 6, 2, 'Jun D.', 16, 2, -380],
    ['cat-pork', 'Pork', 6, 6, 15, 'Liza P.', 20, 4, -920],
    ['all', 'All products', 10, 5, 40, 'Marites R.', 100, 11, -3150],
    ['cat-seafood', 'Seafood', 12, 6, 5, 'Ronnie A.', 10, 1, 210],
  ];
  return rows.map(([scope, scopeName, d, h, m, by, counted, variances, value], i) => ({
    id: `sc-${i + 1}`, branchId: 'b-dgs', scope, scopeName, startedAt: daysAgo(d, h, m - 5 < 0 ? 0 : m - 5), at: daysAgo(d, h, m), by, counted, variances, value,
  }));
}

/** Beef count started today at 6:05 AM with 7 entries; the matches copy the seeded on-hand so they really match. */
function makeStockCountDraft(movements: StockMovement[]): StockCountDraft {
  const have = (pid: string) => movements.filter((m) => m.productId === pid && m.branchId === 'b-dgs').reduce((n, m) => n + m.qty, 0);
  const txt = (n: number) => String(Math.max(0, Number(n.toFixed(2))));
  const counts: Record<string, string> = {};
  for (const pid of ['p-beef-brisket', 'p-beef-sirloin', 'p-beef-ribeye', 'p-beef-shortribs', 'p-beef-kenchi']) counts[pid] = txt(have(pid));
  counts['p-beef-tenderloin'] = txt(have('p-beef-tenderloin') - 1.5);
  counts['p-beef-shank'] = txt(have('p-beef-shank') + 0.5);
  return { branchId: 'b-dgs', scope: 'cat-beef', startedAt: daysAgo(0, 6, 5), startedBy: 'Marites R.', counts };
}

export function createSeed(): AppState {
  const { orders, saleMovements } = makeOrders();
  const movements = [...makeMovements(saleMovements), ...saleMovements];
  return {
    version: STATE_VERSION,
    seededAt: new Date().toISOString(),
    cities, branches, categories, products, priceLists,
    movements,
    suppliers, purchaseOrders: [], transfers: [], customers, orders, riders, zones, vouchers,
    conversations: [],
    roles, staff, settings, audit, remittances,
    notifications: [],
    banners,
    rejectReasons: ['Item(s) out of stock', 'Outside delivery hours', 'Address outside delivery zone', 'Suspected fraud', 'Branch overloaded', 'Customer requested cancellation'],
    cart: [
      { productId: 'p-pork-liempo', qty: 1, weightKg: 1, cutId: 'co-adobo', subPref: 'ask', note: 'Less fat, please' },
      { productId: 'p-chicken-whole', qty: 1, weightKg: 1.5, cutId: 'co-tinola', subPref: 'similar' },
      { productId: 'p-sinigang-mix', qty: 2, subPref: 'similar' },
    ],
    session: { staffUserId: 'u-1', branchId: 'b-dgs', shopperId: 'cu-1', shopperSignedIn: false, riderId: 'r-1' },
    counters: { order: 10200 + orders.length + 10, po: 1, transfer: 1, receiving: receivings.length + 1 },
    cutOptions,
    receivings,
    catalogFiles: makeCatalogFiles(),
    stockCounts: makeStockCounts(),
    stockCountDraft: makeStockCountDraft(movements),
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
