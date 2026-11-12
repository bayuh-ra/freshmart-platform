import type {
  AppState, Branch, Category, City, Conversation, Customer, DeliveryZone, Order, OrderItem, OrderStatus,
  PaymentMethod, PriceList, Product, Rider, Role, Setting, StaffUser, StockMovement, Supplier, Voucher,
  OrderChannel, Fulfillment, AuditLog, PurchaseOrder, Transfer, Banner,
} from './types';

export const STATE_VERSION = 4;

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

const cities: City[] = [
  { id: 'c-dvo', name: 'Davao City', region: 'Mindanao', status: 'active' },
  { id: 'c-ceb', name: 'Cebu City', region: 'Visayas', status: 'active' },
  { id: 'c-cdo', name: 'Cagayan de Oro', region: 'Mindanao', status: 'active' },
];

const allOn = { delivery: true, pickup: true, walkIn: true, phone: true, picker: true };

const branches: Branch[] = [
  { id: 'b-mtn', code: 'MTN', name: 'Matina', cityId: 'c-dvo', address: 'MacArthur Hwy, Matina, Davao City', phone: '(082) 297-1001', email: 'matina@freshmart.ph', lat: 7.0657, lng: 125.597, hours: '7:00 AM – 10:00 PM', status: 'active', services: { ...allOn }, pickupInstructions: 'Pickup counter beside Entrance 2' },
  { id: 'b-lng', code: 'LNG', name: 'Lanang', cityId: 'c-dvo', address: 'J.P. Laurel Ave, Lanang, Davao City', phone: '(082) 297-1002', email: 'lanang@freshmart.ph', lat: 7.1053, lng: 125.6461, hours: '8:00 AM – 9:00 PM', status: 'active', services: { ...allOn, picker: false }, pickupInstructions: 'Curbside pickup, parking bay P3' },
  { id: 'b-trl', code: 'TRL', name: 'Toril', cityId: 'c-dvo', address: 'Saavedra St, Toril, Davao City', phone: '(082) 297-1003', email: 'toril@freshmart.ph', lat: 7.019, lng: 125.496, hours: '8:00 AM – 8:00 PM', status: 'active', services: { delivery: false, pickup: true, walkIn: true, phone: true, picker: false }, pickupInstructions: 'Customer service desk' },
  { id: 'b-itp', code: 'ITP', name: 'IT Park', cityId: 'c-ceb', address: 'Geonzon St, Cebu IT Park, Cebu City', phone: '(032) 412-2001', email: 'itpark@freshmart.ph', lat: 10.3304, lng: 123.9058, hours: '24 hours', status: 'active', services: { ...allOn }, pickupInstructions: 'Lobby pickup lockers' },
  { id: 'b-mnd', code: 'MND', name: 'Mandaue', cityId: 'c-ceb', address: 'A.S. Fortuna St, Mandaue City', phone: '(032) 412-2002', email: 'mandaue@freshmart.ph', lat: 10.3236, lng: 123.942, hours: '8:00 AM – 9:00 PM', status: 'paused', pausedMessage: 'Temporarily paused for store renovation. Please order from IT Park.', services: { ...allOn }, pickupInstructions: 'Pickup counter' },
  { id: 'b-lmk', code: 'LMK', name: 'Limketkai', cityId: 'c-cdo', address: 'Limketkai Center, Cagayan de Oro', phone: '(088) 856-3001', email: 'limketkai@freshmart.ph', lat: 8.4793, lng: 124.6505, hours: '8:00 AM – 9:00 PM', status: 'active', services: { ...allOn }, pickupInstructions: 'Pickup counter near Exit B' },
];

const categories: Category[] = [
  { id: 'cat-fresh', name: 'Fresh Produce', icon: '🥬', sort: 1 },
  { id: 'cat-veg', name: 'Vegetables', parentId: 'cat-fresh', icon: '🥕', sort: 1 },
  { id: 'cat-fruit', name: 'Fruits', parentId: 'cat-fresh', icon: '🍎', sort: 2 },
  { id: 'cat-meat', name: 'Meat & Seafood', icon: '🥩', sort: 2 },
  { id: 'cat-dairy', name: 'Dairy & Eggs', icon: '🥛', sort: 3 },
  { id: 'cat-bakery', name: 'Bakery', icon: '🍞', sort: 4 },
  { id: 'cat-pantry', name: 'Pantry', icon: '🥫', sort: 5 },
  { id: 'cat-bev', name: 'Beverages', icon: '🧃', sort: 6 },
  { id: 'cat-snack', name: 'Snacks', icon: '🍪', sort: 7 },
  { id: 'cat-frozen', name: 'Frozen', icon: '🧊', sort: 8 },
  { id: 'cat-home', name: 'Household', icon: '🧴', sort: 9 },
];

const suppliers: Supplier[] = [
  { id: 's-1', name: 'Mindanao Fresh Farms Co.', contact: 'Rodel Santos', phone: '0917 555 1201', email: 'orders@mffarms.ph', terms: 'Net 15', leadDays: 1 },
  { id: 's-2', name: 'Visayas Dairy Corp.', contact: 'Liza Uy', phone: '0918 555 2202', email: 'sales@visdairy.ph', terms: 'Net 30', leadDays: 2 },
  { id: 's-3', name: 'Metro Grocers Distribution', contact: 'Paolo Reyes', phone: '0919 555 3303', email: 'po@metrogrocers.ph', terms: 'Net 30', leadDays: 3 },
  { id: 's-4', name: 'Southern Meats Inc.', contact: 'Joy Navarro', phone: '0920 555 4404', email: 'orders@smeats.ph', terms: 'COD', leadDays: 1 },
];

// [id, name, brand, cat, unit, size, price, cost, emoji, weighted, tags, aisle, supplier, compareAt?]
type P = [string, string, string, string, Product['unit'], string, number, number, string, boolean, string[], number, string, number?];
const productRows: P[] = [
  ['p-banana', 'Lakatan Banana', 'Farm Fresh', 'cat-fruit', 'kg', 'per kg', 95, 62, '🍌', true, ['local'], 1, 's-1'],
  ['p-mango', 'Carabao Mango', 'Farm Fresh', 'cat-fruit', 'kg', 'per kg', 180, 120, '🥭', true, ['local'], 1, 's-1'],
  ['p-apple', 'Fuji Apple', 'Imported', 'cat-fruit', 'pc', '1 pc', 35, 22, '🍎', false, ['imported'], 1, 's-3'],
  ['p-orange', 'Valencia Orange', 'Imported', 'cat-fruit', 'pack', '4 pcs', 149, 98, '🍊', false, ['imported'], 1, 's-3'],
  ['p-tomato', 'Tomato', 'Farm Fresh', 'cat-veg', 'kg', 'per kg', 80, 48, '🍅', true, ['local'], 2, 's-1'],
  ['p-onion', 'Red Onion', 'Farm Fresh', 'cat-veg', 'kg', 'per kg', 140, 95, '🧅', true, ['local'], 2, 's-1'],
  ['p-carrot', 'Carrots', 'Farm Fresh', 'cat-veg', 'pack', '500 g', 55, 32, '🥕', false, ['local'], 2, 's-1'],
  ['p-lettuce', 'Romaine Lettuce', 'Highland Greens', 'cat-veg', 'pc', '1 head', 89, 55, '🥬', false, ['organic', 'chilled'], 2, 's-1'],
  ['p-potato', 'Potatoes', 'Farm Fresh', 'cat-veg', 'kg', 'per kg', 110, 70, '🥔', true, ['local'], 2, 's-1'],
  ['p-garlic', 'Native Garlic', 'Farm Fresh', 'cat-veg', 'pack', '250 g', 65, 40, '🧄', false, ['local'], 2, 's-1'],
  ['p-chicken', 'Whole Chicken', 'Magnolia', 'cat-meat', 'kg', 'per kg', 220, 165, '🍗', true, ['chilled', 'halal'], 3, 's-4'],
  ['p-pork', 'Pork Liempo', 'Monterey', 'cat-meat', 'kg', 'per kg', 360, 280, '🥓', true, ['chilled'], 3, 's-4'],
  ['p-beef', 'Beef Sirloin', 'Monterey', 'cat-meat', 'kg', 'per kg', 520, 410, '🥩', true, ['chilled'], 3, 's-4'],
  ['p-tilapia', 'Fresh Tilapia', 'Sea Catch', 'cat-meat', 'kg', 'per kg', 160, 110, '🐟', true, ['chilled'], 3, 's-4'],
  ['p-shrimp', 'Shrimp (Medium)', 'Sea Catch', 'cat-meat', 'pack', '500 g', 295, 210, '🦐', false, ['frozen'], 3, 's-4'],
  ['p-milk', 'Fresh Milk', 'Magnolia', 'cat-dairy', 'L', '1 L', 105, 78, '🥛', false, ['chilled'], 4, 's-2'],
  ['p-eggs', 'Large Eggs', 'Bounty Fresh', 'cat-dairy', 'pack', '12 pcs', 115, 88, '🥚', false, [], 4, 's-2'],
  ['p-cheese', 'Cheddar Cheese', 'Eden', 'cat-dairy', 'pack', '440 g', 245, 190, '🧀', false, [], 4, 's-2', 269],
  ['p-butter', 'Salted Butter', 'Anchor', 'cat-dairy', 'pack', '227 g', 199, 150, '🧈', false, ['chilled', 'imported'], 4, 's-2'],
  ['p-yogurt', 'Greek Yogurt', 'Nestlé', 'cat-dairy', 'pack', '500 g', 189, 140, '🍶', false, ['chilled'], 4, 's-2'],
  ['p-pandesal', 'Pandesal', 'Gardenia', 'cat-bakery', 'pack', '10 pcs', 45, 28, '🥖', false, ['local'], 5, 's-3'],
  ['p-bread', 'Whole Wheat Bread', 'Gardenia', 'cat-bakery', 'pack', '600 g', 98, 70, '🍞', false, [], 5, 's-3'],
  ['p-croissant', 'Butter Croissant', 'In-store Bakery', 'cat-bakery', 'pack', '4 pcs', 160, 95, '🥐', false, [], 5, 's-3'],
  ['p-rice', 'Jasmine Rice', 'Doña Maria', 'cat-pantry', 'kg', '5 kg', 385, 300, '🍚', false, ['local'], 6, 's-3', 420],
  ['p-pasta', 'Spaghetti', 'Royal', 'cat-pantry', 'pack', '1 kg', 112, 80, '🍝', false, [], 6, 's-3'],
  ['p-sardines', 'Sardines in Tomato Sauce', 'Ligo', 'cat-pantry', 'pc', '155 g', 26, 18, '🥫', false, [], 6, 's-3'],
  ['p-soy', 'Soy Sauce', 'Silver Swan', 'cat-pantry', 'L', '1 L', 72, 50, '🫙', false, [], 6, 's-3'],
  ['p-oil', 'Cooking Oil', 'Baguio', 'cat-pantry', 'L', '2 L', 265, 205, '🫒', false, [], 6, 's-3'],
  ['p-coffee', '3-in-1 Coffee', 'Nescafé', 'cat-bev', 'pack', '30 sticks', 225, 170, '☕', false, [], 7, 's-3'],
  ['p-juice', 'Orange Juice', 'Del Monte', 'cat-bev', 'L', '1 L', 95, 68, '🧃', false, [], 7, 's-3'],
  ['p-water', 'Mineral Water', 'Nature Spring', 'cat-bev', 'pack', '6 x 500 ml', 90, 60, '💧', false, [], 7, 's-3'],
  ['p-cola', 'Cola', 'Coca-Cola', 'cat-bev', 'L', '1.5 L', 85, 62, '🥤', false, [], 7, 's-3'],
  ['p-chips', 'Potato Chips', 'Piattos', 'cat-snack', 'pack', '85 g', 42, 30, '🍟', false, [], 8, 's-3'],
  ['p-cookies', 'Chocolate Cookies', 'Fita', 'cat-snack', 'pack', '300 g', 89, 62, '🍪', false, [], 8, 's-3'],
  ['p-icecream', 'Vanilla Ice Cream', 'Selecta', 'cat-frozen', 'L', '1.5 L', 299, 215, '🍨', false, ['frozen'], 9, 's-2'],
  ['p-nuggets', 'Chicken Nuggets', 'Tender Juicy', 'cat-frozen', 'pack', '400 g', 189, 135, '🍗', false, ['frozen'], 9, 's-4'],
  ['p-hotdog', 'Jumbo Hotdog', 'Purefoods', 'cat-frozen', 'pack', '1 kg', 245, 180, '🌭', false, ['frozen'], 9, 's-4'],
  ['p-detergent', 'Laundry Detergent', 'Ariel', 'cat-home', 'pack', '1 kg', 210, 160, '🧺', false, [], 10, 's-3'],
  ['p-dish', 'Dishwashing Liquid', 'Joy', 'cat-home', 'pc', '495 ml', 99, 70, '🧽', false, [], 10, 's-3'],
  ['p-tissue', 'Toilet Tissue', 'Sanicare', 'cat-home', 'pack', '12 rolls', 185, 135, '🧻', false, [], 10, 's-3'],
];

const products: Product[] = productRows.map((r, i) => ({
  id: r[0],
  sku: `SKU-${(1001 + i).toString()}`,
  barcode: `48000${(10000 + i * 37).toString()}`,
  name: r[1],
  brand: r[2],
  categoryId: r[3],
  unit: r[4],
  size: r[5],
  description: `${r[2]} ${r[1]} — ${r[5]}. Carefully selected and stored for freshness.`,
  image: r[8],
  basePrice: r[6],
  costPrice: r[7],
  compareAt: r[13],
  soldByWeight: r[9],
  estWeightKg: r[9] ? (r[4] === 'kg' ? 1 : undefined) : undefined,
  tags: r[10],
  status: 'active',
  tax: ['cat-veg', 'cat-fruit', 'cat-meat'].includes(r[3]) ? 'exempt' : 'vat',
  aisle: r[11],
  supplierId: r[12],
  reorderPoint: 12,
  featured: ['p-mango', 'p-rice', 'p-cheese', 'p-chicken', 'p-icecream', 'p-coffee'].includes(r[0]),
}));

const priceLists: PriceList[] = [
  { id: 'pl-main', name: 'Main (Global)', scope: 'global', active: true, items: {} },
  { id: 'pl-cebu', name: 'Cebu City', scope: 'city', scopeId: 'c-ceb', active: true, items: { 'p-mango': 195, 'p-banana': 99, 'p-tilapia': 175, 'p-rice': 399 } },
  { id: 'pl-dvo', name: 'Davao City', scope: 'city', scopeId: 'c-dvo', active: true, items: { 'p-mango': 185, 'p-tilapia': 150 } },
  { id: 'pl-mtn', name: 'Branch Matina', scope: 'branch', scopeId: 'b-mtn', active: true, items: { 'p-pandesal': 42, 'p-mango': 175 } },
  { id: 'pl-weekend', name: 'Weekend Fresh Deals', scope: 'global', active: true, startDate: daysAgo(1).slice(0, 10), endDate: daysAgo(-3).slice(0, 10), items: { 'p-lettuce': 79, 'p-tomato': 72 } },
];

function makeMovements(sales: StockMovement[] = []): StockMovement[] {
  const r = rng(7);
  const out: StockMovement[] = [];
  let n = 1;
  for (const b of branches) {
    for (const p of products) {
      const qty = Math.round(20 + r() * 80);
      out.push({ id: `m-${n++}`, productId: p.id, branchId: b.id, qty, type: 'receiving', reason: 'Opening stock (CSV import)', user: 'System', at: daysAgo(20, 6), ref: 'OPENING' });
    }
  }
  // Force a few low / out-of-stock items for the demo
  const lows: [string, string, number][] = [['p-butter', 'b-mtn', -62], ['p-shrimp', 'b-mtn', -40], ['p-croissant', 'b-lng', -200], ['p-yogurt', 'b-itp', -50], ['p-beef', 'b-mtn', -30]];
  for (const [pid, bid] of lows) {
    const current = [...out, ...sales].filter((m) => m.productId === pid && m.branchId === bid).reduce((s, m) => s + m.qty, 0);
    const target = pid === 'p-croissant' ? 0 : pid === 'p-beef' ? 9 : 5;
    out.push({ id: `m-${n++}`, productId: pid, branchId: bid, qty: target - current, type: 'walkin_sale', reason: 'In-store sales (daily count)', user: 'Ana Cruz', at: daysAgo(1, 20), ref: 'COUNT' });
  }
  out.push({ id: `m-${n++}`, productId: 'p-lettuce', branchId: 'b-mtn', qty: -4, type: 'wastage', reason: 'Wilted — not sellable', user: 'Mark Lim', at: daysAgo(0, 8, 15) });
  out.push({ id: `m-${n++}`, productId: 'p-yogurt', branchId: 'b-mtn', qty: -3, type: 'expiry', reason: 'Expired batch B-2210', user: 'Mark Lim', at: daysAgo(0, 8, 20) });
  out.push({ id: `m-${n++}`, productId: 'p-milk', branchId: 'b-mtn', qty: 48, type: 'receiving', reason: 'GRN against PO-0003', user: 'Mark Lim', at: daysAgo(0, 7, 30), ref: 'PO-0003' });
  out.push({ id: `m-${n++}`, productId: 'p-rice', branchId: 'b-lng', qty: -10, type: 'transfer_out', reason: 'Transfer to Matina', user: 'Grace Tan', at: daysAgo(1, 15), ref: 'TR-0001' });
  out.push({ id: `m-${n++}`, productId: 'p-rice', branchId: 'b-mtn', qty: 10, type: 'transfer_in', reason: 'Transfer from Lanang', user: 'Mark Lim', at: daysAgo(1, 17), ref: 'TR-0001' });
  out.push({ id: `m-${n++}`, productId: 'p-eggs', branchId: 'b-mtn', qty: -2, type: 'count_correction', reason: 'Cycle count variance (Dairy)', user: 'Mark Lim', at: daysAgo(2, 9) });
  return out;
}

const customerSeed: [string, string, string, string, number, number][] = [
  ['Maria Santos', '0917 123 4567', 'maria.santos@gmail.com', 'Ecoland Subd., Matina, Davao City', 7.0602, 125.5899],
  ['Juan dela Cruz', '0918 222 3344', 'juan.dc@yahoo.com', 'Bajada, Davao City', 7.0861, 125.6113],
  ['Angelica Reyes', '0919 333 4455', 'angel.reyes@gmail.com', 'Lanang Business Park, Davao City', 7.1012, 125.6382],
  ['Carlo Mendoza', '0920 444 5566', 'carlo.m@gmail.com', 'Juna Subd., Matina, Davao City', 7.0718, 125.5946],
  ['Patricia Lim', '0921 555 6677', 'pat.lim@outlook.com', 'Lahug, Cebu City', 10.3313, 123.8996],
  ['Miguel Tan', '0922 666 7788', 'miguel.tan@gmail.com', 'Banilad, Cebu City', 10.3445, 123.9119],
  ['Sofia Garcia', '0923 777 8899', 'sofia.g@gmail.com', 'Uptown, Cagayan de Oro', 8.4772, 124.6461],
  ['Rafael Bautista', '0924 888 9900', 'raf.bautista@gmail.com', 'Toril Proper, Davao City', 7.0205, 125.5004],
  ['Lea Villanueva', '0925 999 0011', 'lea.v@gmail.com', 'Damosa, Davao City', 7.1109, 125.6411],
  ['Mark Aquino', '0926 101 2121', 'mark.aquino@gmail.com', 'Talamban, Cebu City', 10.3601, 123.9142],
  ['Joy Castillo', '0927 202 3232', 'joy.castillo@gmail.com', 'Carmen, Cagayan de Oro', 8.4851, 124.6311],
  ['Daniel Ramos', '0928 303 4343', 'dan.ramos@gmail.com', 'Ma-a, Davao City', 7.0866, 125.5862],
];

const customers: Customer[] = customerSeed.map((c, i) => ({
  id: `cu-${i + 1}`,
  name: c[0],
  mobile: c[1],
  email: c[2],
  cityId: c[4] > 10 ? 'c-ceb' : c[4] > 8 ? 'c-cdo' : 'c-dvo',
  addresses: [{ label: 'Home', line: c[3], landmark: i === 0 ? 'Blue gate near the chapel' : undefined, lat: c[4], lng: c[5] }],
  createdAt: daysAgo(60 - i * 4),
  blocked: i === 11,
  blockReason: i === 11 ? 'Repeated COD no-shows (3x)' : undefined,
  storeCredit: i === 1 ? 150 : 0,
  points: 120 + i * 35,
  source: i === 9 ? 'phone' : 'app',
  group: i < 3 ? 'High spenders' : undefined,
}));

const riders: Rider[] = [
  { id: 'r-1', name: 'Jomar Villar', phone: '0917 800 0001', type: 'own', vehicle: 'motorcycle', plate: 'MDA 4521', branchIds: ['b-mtn', 'b-trl'], status: 'online', rating: 4.9, lat: 7.068, lng: 125.6, codHeld: 1250, tripsToday: 6, earningsToday: 540, documents: [{ name: "Driver's License", expires: daysAgo(-300), status: 'approved' }, { name: 'OR/CR', expires: daysAgo(-120), status: 'approved' }] },
  { id: 'r-2', name: 'Kevin Uy', phone: '0917 800 0002', type: 'own', vehicle: 'motorcycle', plate: 'MDB 1188', branchIds: ['b-mtn'], status: 'online', rating: 4.8, lat: 7.062, lng: 125.592, codHeld: 0, tripsToday: 4, earningsToday: 360, documents: [{ name: "Driver's License", expires: daysAgo(-20), status: 'approved' }] },
  { id: 'r-3', name: 'Ramon Diaz', phone: '0917 800 0003', type: 'freelance', vehicle: 'bicycle', plate: '—', branchIds: ['b-mtn', 'b-lng'], status: 'online', rating: 4.6, lat: 7.08, lng: 125.61, codHeld: 480, tripsToday: 3, earningsToday: 225, documents: [{ name: 'Valid ID', expires: daysAgo(-500), status: 'approved' }] },
  { id: 'r-4', name: 'Liza Fernandez', phone: '0917 800 0004', type: 'own', vehicle: 'car', plate: 'NBC 7712', branchIds: ['b-lng'], status: 'online', rating: 4.9, lat: 7.104, lng: 125.644, codHeld: 0, tripsToday: 5, earningsToday: 610, documents: [{ name: "Driver's License", expires: daysAgo(-200), status: 'approved' }] },
  { id: 'r-5', name: 'Paolo Garcia', phone: '0917 800 0005', type: 'freelance', vehicle: 'motorcycle', plate: 'MDC 9032', branchIds: ['b-mtn', 'b-lng'], status: 'offline', rating: 4.4, lat: 7.09, lng: 125.62, codHeld: 0, tripsToday: 0, earningsToday: 0, documents: [{ name: "Driver's License", expires: daysAgo(5), status: 'expired' }] },
  { id: 'r-6', name: 'Arnel Bacus', phone: '0917 800 0006', type: 'own', vehicle: 'motorcycle', plate: 'GAA 3321', branchIds: ['b-itp'], status: 'online', rating: 4.7, lat: 10.331, lng: 123.907, codHeld: 860, tripsToday: 7, earningsToday: 650, documents: [{ name: "Driver's License", expires: daysAgo(-90), status: 'approved' }] },
  { id: 'r-7', name: 'Cherry Lumapas', phone: '0917 800 0007', type: 'own', vehicle: 'motorcycle', plate: 'KAB 5510', branchIds: ['b-lmk'], status: 'online', rating: 4.8, lat: 8.479, lng: 124.65, codHeld: 0, tripsToday: 2, earningsToday: 180, documents: [{ name: "Driver's License", expires: daysAgo(-60), status: 'approved' }] },
  { id: 'r-8', name: 'Noel Pacquing', phone: '0917 800 0008', type: 'freelance', vehicle: 'motorcycle', plate: 'MDE 0091', branchIds: ['b-mtn'], status: 'pending', rating: 0, lat: 7.07, lng: 125.6, codHeld: 0, tripsToday: 0, earningsToday: 0, documents: [{ name: "Driver's License", expires: daysAgo(-700), status: 'pending' }, { name: 'NBI Clearance', expires: daysAgo(-150), status: 'pending' }] },
  { id: 'r-9', name: 'LalaGo Courier', phone: 'API', type: 'courier', vehicle: 'van', plate: 'Partner', branchIds: ['b-mtn', 'b-lng', 'b-itp', 'b-lmk'], status: 'online', rating: 4.5, lat: 7.07, lng: 125.61, codHeld: 0, tripsToday: 1, earningsToday: 0, documents: [] },
];

const zones: DeliveryZone[] = [
  { id: 'z-1', branchId: 'b-mtn', name: 'Matina 0–3 km', type: 'radius', radiusKm: 3, feeModel: 'flat', flatFee: 49, baseFee: 0, perKm: 0, freeAbove: 1500, minOrder: 300, etaMins: 45, active: true },
  { id: 'z-2', branchId: 'b-mtn', name: 'Matina 3–8 km', type: 'radius', radiusKm: 8, feeModel: 'distance', flatFee: 0, baseFee: 49, perKm: 12, freeAbove: 2500, minOrder: 500, etaMins: 60, active: true },
  { id: 'z-3', branchId: 'b-lng', name: 'Lanang Metro', type: 'radius', radiusKm: 7, feeModel: 'distance', flatFee: 0, baseFee: 59, perKm: 10, freeAbove: 2000, minOrder: 400, etaMins: 50, active: true },
  { id: 'z-4', branchId: 'b-itp', name: 'Cebu North', type: 'areas', radiusKm: 6, areas: ['Lahug', 'Banilad', 'Talamban', 'Apas'], feeModel: 'flat', flatFee: 69, baseFee: 0, perKm: 0, freeAbove: 1800, minOrder: 400, etaMins: 45, active: true },
  { id: 'z-5', branchId: 'b-lmk', name: 'CDO Central', type: 'radius', radiusKm: 6, feeModel: 'tiers', flatFee: 79, baseFee: 0, perKm: 0, freeAbove: 1200, minOrder: 300, etaMins: 50, active: true },
];

const vouchers: Voucher[] = [
  { id: 'v-1', code: 'WELCOME100', description: '₱100 off your first order', type: 'fixed', value: 100, minBasket: 800, maxUses: 5000, used: 1240, start: daysAgo(30), end: daysAgo(-60), active: true, firstOrderOnly: true },
  { id: 'v-2', code: 'FREEDEL', description: 'Free delivery on orders ₱1,000+', type: 'free_delivery', value: 0, minBasket: 1000, maxUses: 2000, used: 612, start: daysAgo(10), end: daysAgo(-20), active: true, fulfillment: 'delivery' },
  { id: 'v-3', code: 'FRESH10', description: '10% off (max ₱150)', type: 'percent', value: 10, minBasket: 500, maxUses: 1000, used: 233, start: daysAgo(5), end: daysAgo(-10), active: true },
  { id: 'v-4', code: 'PAYDAY50', description: '₱50 off on payday weekend', type: 'fixed', value: 50, minBasket: 600, maxUses: 800, used: 800, start: daysAgo(20), end: daysAgo(15), active: false },
];

const P = (k: string) => k; // permission helper for readability
export const PERMISSION_MODULES = ['orders', 'catalog', 'pricing', 'inventory', 'riders', 'customers', 'promotions', 'support', 'reports', 'settings', 'users'] as const;
export const PERMISSION_ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'export'] as const;
const all = PERMISSION_MODULES.flatMap((m) => PERMISSION_ACTIONS.map((a) => `${m}.${a}`));
const pick = (mods: string[], acts: string[]) => mods.flatMap((m) => acts.map((a) => P(`${m}.${a}`)));

const roles: Role[] = [
  { id: 'role-super', name: 'Super Admin', description: 'Everything: cities, branches, catalog, pricing, settings, roles and users, riders, finance, all reports, audit log.', scopeType: 'all', protected: true, permissions: all },
  { id: 'role-city', name: 'City / Area Manager', description: 'Manages the branches of their city: branch settings within limits, pricing within the city, staff, reports, approvals.', scopeType: 'cities', permissions: [...pick(['orders', 'catalog', 'pricing', 'inventory', 'riders', 'customers', 'promotions', 'support', 'reports'], ['view', 'create', 'edit', 'approve', 'export']), 'settings.view', 'settings.edit', 'users.view'] },
  { id: 'role-branch', name: 'Branch Manager', description: 'Orders, stock, staff, riders at the branch, refunds, price overrides within limits, approvals, branch reports.', scopeType: 'branches', permissions: [...pick(['orders', 'inventory', 'riders', 'customers', 'support'], ['view', 'create', 'edit', 'approve', 'export']), 'catalog.view', 'pricing.view', 'reports.view', 'reports.export', 'users.view'] },
  { id: 'role-cashier', name: 'Cashier', description: 'Order desk: view and confirm orders, edit and substitute items, create walk-in and phone orders, take payments on pickup, mark ready, verify pickup.', scopeType: 'branches', permissions: ['orders.view', 'orders.create', 'orders.edit', 'customers.view', 'customers.create', 'catalog.view', 'support.view'] },
  { id: 'role-picker', name: 'Picker / Packer', description: 'Sees pick lists, marks items picked, short or out of stock, packs and marks ready.', scopeType: 'branches', permissions: ['orders.view', 'orders.edit'] },
  { id: 'role-inv', name: 'Inventory Clerk', description: 'Receives stock, adjusts, counts, records wastage, transfers and purchase receipts.', scopeType: 'branches', permissions: [...pick(['inventory'], ['view', 'create', 'edit', 'export']), 'catalog.view'] },
  { id: 'role-dispatch', name: 'Dispatcher', description: 'Assigns and monitors riders, handles delays and failed deliveries, manages the dispatch map.', scopeType: 'cities', permissions: ['orders.view', 'orders.edit', ...pick(['riders'], ['view', 'create', 'edit'])] },
  { id: 'role-support', name: 'Support Agent', description: 'Chat inbox, order lookup, issues approved refunds and vouchers, escalates cases.', scopeType: 'all', permissions: [...pick(['support'], ['view', 'create', 'edit']), 'orders.view', 'customers.view', 'promotions.view'] },
  { id: 'role-marketing', name: 'Marketing / Content', description: 'Banners, promotions, vouchers, notification campaigns, app content.', scopeType: 'all', permissions: [...pick(['promotions'], ['view', 'create', 'edit', 'delete', 'export']), 'customers.view', 'reports.view'] },
  { id: 'role-finance', name: 'Finance', description: 'Payments, refunds, COD remittance, rider payouts, financial reports and exports.', scopeType: 'all', permissions: ['orders.view', 'orders.approve', 'riders.view', 'riders.approve', 'reports.view', 'reports.export', 'customers.view'] },
];

const staff: StaffUser[] = [
  { id: 'u-1', name: 'Hannah Admin', email: 'admin@freshmart.ph', roleId: 'role-super', scope: { type: 'all', ids: [] }, status: 'active', lastActive: minsAgo(1), twoFactor: true },
  { id: 'u-2', name: 'Grace Tan', email: 'grace.tan@freshmart.ph', roleId: 'role-city', scope: { type: 'cities', ids: ['c-dvo'] }, status: 'active', lastActive: minsAgo(25), twoFactor: true },
  { id: 'u-3', name: 'Mark Lim', email: 'mark.lim@freshmart.ph', roleId: 'role-branch', scope: { type: 'branches', ids: ['b-mtn'] }, status: 'active', lastActive: minsAgo(4), twoFactor: false },
  { id: 'u-4', name: 'Ana Cruz', email: 'ana.cruz@freshmart.ph', roleId: 'role-cashier', scope: { type: 'branches', ids: ['b-mtn'] }, status: 'active', lastActive: minsAgo(2), twoFactor: false },
  { id: 'u-5', name: 'Ben Torres', email: 'ben.torres@freshmart.ph', roleId: 'role-picker', scope: { type: 'branches', ids: ['b-mtn'] }, status: 'active', lastActive: minsAgo(8), twoFactor: false },
  { id: 'u-6', name: 'Rhea Gomez', email: 'rhea.gomez@freshmart.ph', roleId: 'role-support', scope: { type: 'all', ids: [] }, status: 'active', lastActive: minsAgo(12), twoFactor: false },
  { id: 'u-7', name: 'Leo Ramos', email: 'leo.ramos@freshmart.ph', roleId: 'role-dispatch', scope: { type: 'cities', ids: ['c-dvo'] }, status: 'active', lastActive: minsAgo(6), twoFactor: false },
  { id: 'u-8', name: 'Ivy Santos', email: 'ivy.santos@freshmart.ph', roleId: 'role-finance', scope: { type: 'all', ids: [] }, status: 'active', lastActive: daysAgo(1), twoFactor: true },
  { id: 'u-9', name: 'Carl Yap', email: 'carl.yap@freshmart.ph', roleId: 'role-cashier', scope: { type: 'branches', ids: ['b-itp'] }, status: 'invited', lastActive: daysAgo(2), twoFactor: false },
];

const S = (s: Omit<Setting, 'city' | 'branch'> & Partial<Pick<Setting, 'city' | 'branch'>>): Setting => ({ city: {}, branch: {}, ...s });
const settings: Setting[] = [
  S({ key: 'autoConfirmPaid', label: 'Auto-confirm orders paid online', group: 'Order confirmation', type: 'boolean', global: true, branch: { 'b-lng': false } }),
  S({ key: 'manualConfirmAll', label: 'Require manual confirmation for all orders', group: 'Order confirmation', type: 'boolean', global: false }),
  S({ key: 'confirmTimeoutMins', label: 'Confirmation timeout', group: 'Order confirmation', type: 'number', unit: 'min', global: 10, city: { 'c-ceb': 8 } }),
  S({ key: 'timeoutAction', label: 'Timeout action', group: 'Order confirmation', type: 'select', options: ['Remind', 'Auto-cancel with notice', 'Escalate to another branch', 'Alert manager'], global: 'Alert manager' }),
  S({ key: 'codLimit', label: 'Cash on delivery limit', group: 'Payments', type: 'number', unit: '₱', global: 5000, city: { 'c-cdo': 3000 } }),
  S({ key: 'gatewayFeePct', label: 'Gateway fee charged to shopper', group: 'Payments', type: 'number', unit: '%', global: 2 }),
  S({ key: 'paymentLinkExpiryMins', label: 'Payment link expiry', group: 'Payments', type: 'number', unit: 'min', global: 30 }),
  S({ key: 'refundApprovalAbove', label: 'Refund manager approval above', group: 'Payments', type: 'number', unit: '₱', global: 1000 }),
  S({ key: 'minOrder', label: 'Minimum order amount', group: 'Order rules', type: 'number', unit: '₱', global: 300, branch: { 'b-itp': 400 } }),
  S({ key: 'cancelWindowStatus', label: 'Shopper can cancel until', group: 'Order rules', type: 'select', options: ['Placed', 'Confirmed', 'Preparing'], global: 'Confirmed' }),
  S({ key: 'subResponseMins', label: 'Substitution response time', group: 'Order rules', type: 'number', unit: 'min', global: 5 }),
  S({ key: 'maxItems', label: 'Maximum items per order', group: 'Order rules', type: 'number', global: 80 }),
  S({ key: 'slotCapacity', label: 'Orders per delivery slot', group: 'Order rules', type: 'number', global: 10, branch: { 'b-mtn': 15 } }),
  S({ key: 'prepMinutes', label: 'Default preparation time', group: 'Fulfillment', type: 'number', unit: 'min', global: 20 }),
  S({ key: 'pickupHoldHours', label: 'Pickup hold time', group: 'Fulfillment', type: 'number', unit: 'hours', global: 4 }),
  S({ key: 'noShowPolicy', label: 'Pickup no-show policy', group: 'Fulfillment', type: 'select', options: ['Cancel & restock', 'Cancel, restock & refund', 'Charge no-show fee'], global: 'Cancel, restock & refund' }),
  S({ key: 'pickupDiscountPct', label: 'Pickup discount', group: 'Fulfillment', type: 'number', unit: '%', global: 0, city: { 'c-cdo': 3 } }),
  S({ key: 'peakSurcharge', label: 'Peak-hour surcharge (5–7 PM)', group: 'Delivery fees', type: 'number', unit: '₱', global: 20 }),
  S({ key: 'weatherSurcharge', label: 'Bad-weather surcharge', group: 'Delivery fees', type: 'number', unit: '₱', global: 0 }),
  S({ key: 'smallBasketFee', label: 'Small-basket fee (under minimum)', group: 'Delivery fees', type: 'number', unit: '₱', global: 30 }),
  S({ key: 'deliveryPaused', label: 'Delivery paused', group: 'Delivery fees', type: 'boolean', global: false }),
  S({ key: 'vatRate', label: 'VAT rate', group: 'Pricing & tax', type: 'number', unit: '%', global: 12 }),
  S({ key: 'pricesTaxInclusive', label: 'Show prices tax-inclusive', group: 'Pricing & tax', type: 'boolean', global: true }),
  S({ key: 'rounding', label: 'Price rounding', group: 'Pricing & tax', type: 'select', options: ['None', 'Nearest 0.25', 'Nearest 0.50', 'Nearest 1.00'], global: 'Nearest 0.25' }),
  S({ key: 'priceApprovalPct', label: 'Price change approval above', group: 'Pricing & tax', type: 'number', unit: '%', global: 15 }),
  S({ key: 'safetyBuffer', label: 'Online safety buffer (units held back)', group: 'Inventory', type: 'number', unit: 'units', global: 3, branch: { 'b-itp': 5 } }),
  S({ key: 'lowStockThreshold', label: 'Low-stock alert threshold', group: 'Inventory', type: 'number', unit: 'units', global: 12 }),
  S({ key: 'expiryAlertDays', label: 'Near-expiry alert window', group: 'Inventory', type: 'number', unit: 'days', global: 5 }),
  S({ key: 'adjustApprovalUnits', label: 'Stock adjustment approval above', group: 'Inventory', type: 'number', unit: 'units', global: 20 }),
  S({ key: 'dispatchRule', label: 'Auto-dispatch rule', group: 'Riders', type: 'select', options: ['Manual only', 'Nearest available', 'Lowest workload', 'Highest rating', 'Own → Freelance → Courier'], global: 'Own → Freelance → Courier' }),
  S({ key: 'offerTimeoutSecs', label: 'Rider offer timeout', group: 'Riders', type: 'number', unit: 'sec', global: 45 }),
  S({ key: 'maxActiveOrders', label: 'Max active orders per rider', group: 'Riders', type: 'number', global: 2 }),
  S({ key: 'podMethod', label: 'Proof of delivery', group: 'Riders', type: 'select', options: ['Photo', 'PIN', 'Signature', 'Photo + PIN'], global: 'Photo' }),
  S({ key: 'supportHours', label: 'Support business hours', group: 'Support', type: 'text', global: '8:00 AM – 9:00 PM' }),
  S({ key: 'supportSlaMins', label: 'First-response target (SLA)', group: 'Support', type: 'number', unit: 'min', global: 5 }),
  S({ key: 'ff_loyalty', label: 'Loyalty points', group: 'Feature flags', type: 'boolean', global: true }),
  S({ key: 'ff_scheduled', label: 'Scheduled delivery slots', group: 'Feature flags', type: 'boolean', global: true }),
  S({ key: 'ff_ratings', label: 'Order & rider ratings', group: 'Feature flags', type: 'boolean', global: true }),
  S({ key: 'ff_riderChat', label: 'Shopper ↔ rider chat', group: 'Feature flags', type: 'boolean', global: true }),
  S({ key: 'ff_batched', label: 'Batched deliveries (Phase 2)', group: 'Feature flags', type: 'boolean', global: false }),
  S({ key: 'sessionHours', label: 'Staff session length', group: 'Security', type: 'number', unit: 'hours', global: 12 }),
  S({ key: 'admin2fa', label: 'Require 2FA for admin roles', group: 'Security', type: 'boolean', global: true }),
];

const banners: Banner[] = [
  { id: 'bn-1', title: 'Mango Season is here', subtitle: 'Carabao mangoes from ₱180/kg', color: 'from-amber-400 to-orange-500', emoji: '🥭', active: true },
  { id: 'bn-2', title: 'Free delivery ₱1,000+', subtitle: 'Use code FREEDEL at checkout', color: 'from-[#1e40af] to-[#2563eb]', emoji: '🛵', active: true },
  { id: 'bn-3', title: 'Weekend Fresh Deals', subtitle: 'Lettuce & tomatoes on sale', color: 'from-emerald-500 to-teal-500', emoji: '🥬', active: true },
];

// ---------- Orders ----------
const PIN = (r: () => number) => String(1000 + Math.floor(r() * 9000));

function buildItems(r: () => number, count: number): OrderItem[] {
  const picked = new Set<number>();
  const items: OrderItem[] = [];
  while (items.length < count) {
    const idx = Math.floor(r() * products.length);
    if (picked.has(idx)) continue;
    picked.add(idx);
    const p = products[idx];
    const qty = p.soldByWeight ? 1 : 1 + Math.floor(r() * 3);
    items.push({
      productId: p.id, name: p.name, image: p.image, unitPrice: p.basePrice, qty, soldByWeight: p.soldByWeight,
      estWeightKg: p.soldByWeight ? Math.round((0.5 + r() * 1.5) * 10) / 10 : undefined,
      subPref: (['similar', 'ask', 'refund'] as const)[Math.floor(r() * 3)], pickStatus: 'pending',
    });
  }
  return items;
}

export function lineTotal(i: OrderItem) {
  if (i.pickStatus === 'removed' || i.pickStatus === 'out_of_stock') return 0;
  const price = i.substitute?.status === 'accepted' ? i.substitute.unitPrice : i.unitPrice;
  if (i.soldByWeight) return Math.round(price * (i.actualWeightKg ?? i.estWeightKg ?? 1) * 100) / 100;
  return price * i.qty;
}

const STATUS_FLOW: OrderStatus[] = ['placed', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered'];

function makeOrders(): { orders: Order[]; saleMovements: StockMovement[] } {
  const r = rng(42);
  const orders: Order[] = [];
  const saleMovements: StockMovement[] = [];
  let num = 10200;
  const activeBranches = branches.filter((b) => b.status === 'active');
  const payMethods: PaymentMethod[] = ['gcash', 'maya', 'card', 'cod', 'gcash', 'cod'];
  const channels: OrderChannel[] = ['app', 'app', 'app', 'app', 'walk_in', 'phone'];

  // History: last 13 days, completed orders for reports/charts.
  for (let d = 13; d >= 1; d--) {
    const perDay = 14 + Math.floor(r() * 10) + (d % 7 === 0 || d % 7 === 1 ? 8 : 0);
    for (let k = 0; k < perDay; k++) {
      const b = activeBranches[Math.floor(r() * activeBranches.length)];
      const cu = customers[Math.floor(r() * customers.length)];
      const ful: Fulfillment = b.services.delivery && r() > 0.3 ? 'delivery' : 'pickup';
      const pm = ful === 'pickup' && r() > 0.5 ? 'pay_at_pickup' : payMethods[Math.floor(r() * payMethods.length)];
      const items = buildItems(r, 2 + Math.floor(r() * 6));
      const subtotal = items.reduce((s, i) => s + lineTotal(i), 0);
      const fee = ful === 'delivery' ? (subtotal > 1500 ? 0 : 49 + Math.floor(r() * 4) * 10) : 0;
      const cancelled = r() < 0.05;
      const placed = daysAgo(d, 8 + Math.floor(r() * 12), Math.floor(r() * 60));
      const status: OrderStatus = cancelled ? 'cancelled' : ful === 'delivery' ? 'delivered' : 'collected';
      const id = `o-${num}`;
      const number = `${b.code}-${num++}`;
      const total = subtotal + fee;
      const serviceFee = ['gcash', 'maya', 'card'].includes(pm) ? Math.round(subtotal * 0.02) : 0;
      orders.push({
        id, number, branchId: b.id, customerId: cu.id, customerName: cu.name, customerMobile: cu.mobile,
        channel: channels[Math.floor(r() * channels.length)], fulfillment: ful, address: ful === 'delivery' ? cu.addresses[0] : undefined,
        slot: 'ASAP', items: items.map((i) => ({ ...i, pickStatus: 'picked' })), subtotal, deliveryFee: fee, serviceFee, discount: 0, total: total + serviceFee,
        paymentMethod: pm, paymentStatus: cancelled ? 'refunded' : 'paid', refundedAmount: cancelled ? total + serviceFee : 0,
        status, autoConfirmed: ['gcash', 'maya', 'card'].includes(pm), riderId: ful === 'delivery' ? riders[Math.floor(r() * 4)].id : undefined,
        pickupPin: PIN(r), prepMinutes: 20, placedAt: placed, updatedAt: placed, completedAt: placed,
        timeline: [{ status: 'placed', at: placed, by: cu.name }, { status, at: placed, by: 'System' }], internalNotes: [],
        rating: !cancelled && r() > 0.4 ? { order: r() > 0.15 ? 5 : 3, rider: r() > 0.2 ? 5 : 4, tags: r() > 0.7 ? ['Great service'] : r() > 0.9 ? ['Late'] : [] } : undefined,
        rejectReason: cancelled ? 'Customer requested cancellation' : undefined, acknowledged: true,
      });
      if (!cancelled) {
        for (const i of items) {
          saleMovements.push({ id: `ms-${id}-${i.productId}`, productId: i.productId, branchId: b.id, qty: -(i.soldByWeight ? 1 : i.qty), type: 'online_sale', reason: 'Order completed', user: 'System', at: placed, ref: number });
        }
      }
    }
  }

  // Today: live orders across every status, mostly at Matina so the Order Desk demo is rich.
  const live: [OrderStatus, string, Fulfillment, PaymentMethod, OrderChannel, number, number][] = [
    // status, branch, fulfillment, pay, channel, minutesAgo, customerIdx
    ['awaiting_confirmation', 'b-mtn', 'delivery', 'cod', 'app', 3, 0],
    ['awaiting_confirmation', 'b-mtn', 'pickup', 'pay_at_pickup', 'app', 8, 3],
    ['confirmed', 'b-mtn', 'delivery', 'gcash', 'app', 12, 1],
    ['preparing', 'b-mtn', 'delivery', 'maya', 'app', 22, 9 - 9],
    ['awaiting_shopper', 'b-mtn', 'delivery', 'card', 'app', 28, 3],
    ['preparing', 'b-mtn', 'pickup', 'gcash', 'phone', 18, 11 - 10],
    ['ready', 'b-mtn', 'delivery', 'gcash', 'app', 35, 7],
    ['ready', 'b-mtn', 'pickup', 'pay_at_pickup', 'walk_in', 40, 1],
    ['out_for_delivery', 'b-mtn', 'delivery', 'cod', 'app', 50, 0],
    ['delivered', 'b-mtn', 'delivery', 'gcash', 'app', 120, 3],
    ['collected', 'b-mtn', 'pickup', 'cash', 'walk_in', 150, 1],
    ['cancelled', 'b-mtn', 'delivery', 'gcash', 'app', 95, 7],
    ['awaiting_confirmation', 'b-lng', 'delivery', 'gcash', 'app', 6, 2],
    ['preparing', 'b-lng', 'delivery', 'cod', 'app', 25, 8],
    ['out_for_delivery', 'b-lng', 'delivery', 'card', 'app', 40, 8],
    ['confirmed', 'b-itp', 'delivery', 'gcash', 'app', 9, 4],
    ['ready', 'b-itp', 'pickup', 'maya', 'app', 30, 5],
    ['delivered', 'b-itp', 'delivery', 'cod', 'app', 140, 9],
    ['preparing', 'b-lmk', 'delivery', 'gcash', 'app', 15, 6],
    ['delivered', 'b-lmk', 'delivery', 'gcash', 'app', 200, 10],
    ['collected', 'b-trl', 'pickup', 'pay_at_pickup', 'app', 100, 7],
    ['preparing', 'b-trl', 'pickup', 'gcash', 'phone', 14, 7],
  ];
  for (const [status, bid, ful, pm, ch, ago, cIdx] of live) {
    const b = branches.find((x) => x.id === bid)!;
    const cu = customers[cIdx];
    const items = buildItems(r, 3 + Math.floor(r() * 5));
    if (status === 'awaiting_shopper') {
      const it = items[0];
      it.pickStatus = 'substituted';
      const alt = products.find((p) => p.categoryId === products.find((q) => q.id === it.productId)!.categoryId && p.id !== it.productId)!;
      it.substitute = { productId: alt.id, name: alt.name, image: alt.image, unitPrice: alt.basePrice, status: 'proposed' };
    }
    if (['ready', 'out_for_delivery', 'delivered', 'collected'].includes(status)) items.forEach((i) => { i.pickStatus = 'picked'; if (i.soldByWeight) i.actualWeightKg = i.estWeightKg; });
    if (status === 'preparing') items.slice(0, 2).forEach((i) => (i.pickStatus = 'picked'));
    const subtotal = items.reduce((s, i) => s + lineTotal(i), 0);
    const fee = ful === 'delivery' ? 49 : 0;
    const serviceFee = ['gcash', 'maya', 'card'].includes(pm) ? Math.round(subtotal * 0.02) : 0;
    const placed = minsAgo(ago);
    const id = `o-${num}`;
    const number = `${b.code}-${num++}`;
    const paid = ['gcash', 'maya', 'card'].includes(pm) || ['delivered', 'collected'].includes(status);
    const flow = ful === 'pickup' ? ['placed', 'confirmed', 'preparing', 'ready', 'collected'] : STATUS_FLOW;
    const reached = status === 'awaiting_confirmation' ? ['placed', 'awaiting_confirmation'] : status === 'awaiting_shopper' ? ['placed', 'confirmed', 'preparing', 'awaiting_shopper'] : status === 'cancelled' ? ['placed', 'confirmed', 'cancelled'] : flow.slice(0, flow.indexOf(status) + 1);
    const timeline = reached.map((s, i) => ({ status: s as OrderStatus, at: minsAgo(ago - i * Math.max(1, Math.floor(ago / (reached.length + 1)))), by: i === 0 ? cu.name : s === 'confirmed' && paid ? 'System (auto-confirm)' : s === 'out_for_delivery' || s === 'delivered' ? 'Rider' : 'Ana Cruz' }));
    const riderId = ['out_for_delivery', 'delivered'].includes(status) || (status === 'ready' && ful === 'delivery' && bid !== 'b-mtn') ? (bid === 'b-lng' ? 'r-4' : bid === 'b-itp' ? 'r-6' : bid === 'b-lmk' ? 'r-7' : 'r-1') : undefined;
    orders.push({
      id, number, branchId: bid, customerId: cu.id, customerName: cu.name, customerMobile: cu.mobile, channel: ch, fulfillment: ful,
      address: ful === 'delivery' ? cu.addresses[0] : undefined, slot: ago === 12 ? 'Today 2:00–3:00 PM' : 'ASAP', items,
      subtotal, deliveryFee: fee, serviceFee, discount: 0, total: subtotal + fee + serviceFee, feeRule: ful === 'delivery' ? 'Matina 0–3 km · Flat ₱49' : undefined,
      paymentMethod: pm, paymentStatus: status === 'cancelled' ? 'refunded' : paid ? 'paid' : 'pending', refundedAmount: status === 'cancelled' ? subtotal + fee + serviceFee : 0,
      status, autoConfirmed: ['gcash', 'maya', 'card'].includes(pm) && status !== 'awaiting_confirmation', riderId, pickerName: ['preparing', 'awaiting_shopper'].includes(status) && bid === 'b-mtn' ? 'Ben Torres' : undefined,
      pickupPin: PIN(r), prepMinutes: 20, placedAt: placed, updatedAt: placed,
      outForDeliveryAt: status === 'out_for_delivery' ? minsAgo(ago === 50 ? 1 : 3) : undefined,
      completedAt: ['delivered', 'collected', 'cancelled'].includes(status) ? minsAgo(ago - 30) : undefined,
      timeline, internalNotes: ago === 22 ? [{ at: minsAgo(15), by: 'Ana Cruz', text: 'Customer called — ring the doorbell twice.' }] : [],
      riderInstructions: ful === 'delivery' ? 'Please call when outside the gate.' : undefined,
      rejectReason: status === 'cancelled' ? 'Item out of stock' : undefined,
      acknowledged: status !== 'awaiting_confirmation',
    });
    if (['delivered', 'collected'].includes(status)) {
      for (const i of items) saleMovements.push({ id: `ms-${id}-${i.productId}`, productId: i.productId, branchId: bid, qty: -(i.soldByWeight ? 1 : i.qty), type: 'online_sale', reason: 'Order completed', user: 'System', at: placed, ref: number });
    }
  }
  return { orders, saleMovements };
}

function makeConversations(orders: Order[]): Conversation[] {
  const mtn = orders.filter((o) => o.branchId === 'b-mtn');
  const delivered = mtn.find((o) => o.status === 'delivered')!;
  const ofd = mtn.find((o) => o.status === 'out_for_delivery')!;
  return [
    {
      id: 'cv-1', kind: 'support', customerId: delivered.customerId, customerName: delivered.customerName, orderId: delivered.id, branchId: 'b-mtn', category: 'Missing item', status: 'open', priority: 'high', assignedTo: 'Rhea Gomez', unreadStaff: 2, unreadShopper: 0, updatedAt: minsAgo(4),
      messages: [
        { from: 'system', name: 'System', text: `Problem reported on order ${delivered.number}: 1 item missing.`, at: minsAgo(9) },
        { from: 'shopper', name: delivered.customerName, text: `Hi, my order ${delivered.number} arrived but the ${delivered.items[0].name} is missing.`, at: minsAgo(8) },
        { from: 'shopper', name: delivered.customerName, text: 'Can I get a refund for that item please?', at: minsAgo(4) },
      ],
    },
    {
      id: 'cv-2', kind: 'support', customerId: ofd.customerId, customerName: ofd.customerName, orderId: ofd.id, branchId: 'b-mtn', category: 'Late delivery', status: 'pending', priority: 'normal', assignedTo: 'Rhea Gomez', unreadStaff: 0, unreadShopper: 1, updatedAt: minsAgo(15),
      messages: [
        { from: 'shopper', name: ofd.customerName, text: 'Where is my rider? It has been almost an hour.', at: minsAgo(20) },
        { from: 'agent', name: 'Rhea Gomez', text: 'Hi! Your rider Jomar has picked up your order and is about 10 minutes away. You can follow him live on the tracking map.', at: minsAgo(15) },
      ],
    },
    {
      id: 'cv-3', kind: 'support', customerId: 'cu-5', customerName: 'Patricia Lim', branchId: 'b-itp', category: 'Payment issue', status: 'open', priority: 'normal', unreadStaff: 1, unreadShopper: 0, updatedAt: minsAgo(32),
      messages: [{ from: 'shopper', name: 'Patricia Lim', text: 'My GCash was charged twice for one order. Please check.', at: minsAgo(32) }],
    },
    {
      id: 'cv-4', kind: 'support', customerId: 'cu-7', customerName: 'Sofia Garcia', branchId: 'b-lmk', category: 'Damaged item', status: 'resolved', priority: 'low', assignedTo: 'Rhea Gomez', unreadStaff: 0, unreadShopper: 0, updatedAt: daysAgo(1, 16),
      messages: [
        { from: 'shopper', name: 'Sofia Garcia', text: 'The eggs were cracked (3 pcs).', at: daysAgo(1, 15) },
        { from: 'agent', name: 'Rhea Gomez', text: 'Sorry about that! We have added ₱30 store credit to your account.', at: daysAgo(1, 16) },
        { from: 'system', name: 'System', text: 'Store credit ₱30.00 issued by Rhea Gomez.', at: daysAgo(1, 16) },
      ],
    },
  ];
}

const audit: AuditLog[] = [
  { id: 'a-1', at: minsAgo(30), user: 'Grace Tan', module: 'Pricing', action: 'Price list updated', detail: 'Cebu City · Carabao Mango', oldValue: '₱189.00', newValue: '₱195.00' },
  { id: 'a-2', at: minsAgo(60), user: 'Mark Lim', module: 'Inventory', action: 'Stock received', detail: 'Fresh Milk +48 (PO-0003)', branchId: 'b-mtn' },
  { id: 'a-3', at: minsAgo(90), user: 'Hannah Admin', module: 'Settings', action: 'Setting changed', detail: 'Confirmation timeout (Cebu City override)', oldValue: '10 min', newValue: '8 min' },
  { id: 'a-4', at: minsAgo(95), user: 'Ana Cruz', module: 'Orders', action: 'Order cancelled', detail: 'Item out of stock — auto refund issued', branchId: 'b-mtn' },
  { id: 'a-5', at: daysAgo(1, 18), user: 'Hannah Admin', module: 'Users & Roles', action: 'Role created', detail: 'Finance role with reports.export' },
  { id: 'a-6', at: daysAgo(1, 9), user: 'Hannah Admin', module: 'Branches', action: 'Branch paused', detail: 'Mandaue — store renovation', branchId: 'b-mnd' },
  { id: 'a-7', at: daysAgo(2, 14), user: 'Rhea Gomez', module: 'Payments', action: 'Store credit issued', detail: 'Sofia Garcia ₱30.00 (damaged item)' },
];

const purchaseOrders: PurchaseOrder[] = [
  { id: 'po-1', number: 'PO-0001', supplierId: 's-2', branchId: 'b-mtn', status: 'received', createdAt: daysAgo(6), lines: [{ productId: 'p-cheese', qty: 24, cost: 190, received: 24 }, { productId: 'p-butter', qty: 24, cost: 150, received: 22 }] },
  { id: 'po-2', number: 'PO-0002', supplierId: 's-4', branchId: 'b-mtn', status: 'sent', createdAt: daysAgo(1), lines: [{ productId: 'p-beef', qty: 30, cost: 410, received: 0 }, { productId: 'p-shrimp', qty: 40, cost: 210, received: 0 }] },
  { id: 'po-3', number: 'PO-0003', supplierId: 's-2', branchId: 'b-mtn', status: 'partial', createdAt: daysAgo(2), lines: [{ productId: 'p-milk', qty: 60, cost: 78, received: 48 }, { productId: 'p-yogurt', qty: 20, cost: 140, received: 0 }] },
  { id: 'po-4', number: 'PO-0004', supplierId: 's-3', branchId: 'b-lng', status: 'draft', createdAt: daysAgo(0), lines: [{ productId: 'p-croissant', qty: 40, cost: 95, received: 0 }] },
];

const transfers: Transfer[] = [
  { id: 'tr-1', number: 'TR-0001', fromBranchId: 'b-lng', toBranchId: 'b-mtn', status: 'received', createdAt: daysAgo(1), lines: [{ productId: 'p-rice', qty: 10 }] },
  { id: 'tr-2', number: 'TR-0002', fromBranchId: 'b-mtn', toBranchId: 'b-trl', status: 'requested', createdAt: daysAgo(0), lines: [{ productId: 'p-eggs', qty: 12 }, { productId: 'p-milk', qty: 12 }] },
];

export function createSeed(): AppState {
  const { orders, saleMovements } = makeOrders();
  return {
    version: STATE_VERSION,
    seededAt: new Date().toISOString(),
    cities, branches, categories, products, priceLists,
    movements: [...makeMovements(saleMovements), ...saleMovements],
    suppliers, purchaseOrders, transfers, customers, orders, riders, zones, vouchers,
    conversations: makeConversations(orders),
    roles, staff, settings, audit,
    notifications: [],
    banners,
    rejectReasons: ['Item(s) out of stock', 'Outside delivery hours', 'Address outside delivery zone', 'Suspected fraud', 'Branch overloaded', 'Customer requested cancellation'],
    cart: [
      { productId: 'p-banana', qty: 1, subPref: 'similar', note: 'Ripe bananas, please' },
      { productId: 'p-milk', qty: 2, subPref: 'similar' },
      { productId: 'p-eggs', qty: 1, subPref: 'ask' },
    ],
    session: { staffUserId: 'u-1', branchId: 'b-mtn', shopperId: 'cu-1', riderId: 'r-1' },
    counters: { order: 10200 + orders.length + 10, po: 5, transfer: 3 },
  };
}
