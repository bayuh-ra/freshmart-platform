// Core data entities for the Meat Shop Delivery & Ordering platform demo.
// Mirrors spec section 8 "Core Data Entities" (trimmed to what the demo uses).

export type ID = string;

export interface City {
  id: ID;
  name: string;
  region: string;
  status: 'active' | 'paused' | 'closed';
}

export interface Branch {
  id: ID;
  code: string;
  name: string;
  cityId: ID;
  address: string;
  phone: string;
  email: string;
  lat: number;
  lng: number;
  hours: string; // e.g. "7:00 AM – 10:00 PM"
  status: 'active' | 'paused' | 'closed';
  pausedMessage?: string;
  services: { delivery: boolean; pickup: boolean; walkIn: boolean; phone: boolean; picker: boolean };
  pickupInstructions: string;
}

export interface Category {
  id: ID;
  name: string;
  parentId?: ID;
  icon: string; // emoji
  sort: number;
  /** Optional photo URL for category tiles (falls back to the emoji). */
  photo?: string;
  /** Hex colour for the category dot / swatch (top-level categories). */
  color?: string;
  /** How products in this category are sold by default (top-level categories). */
  soldBy?: 'kg' | 'pack' | 'piece';
  /** Short line shown under the name in the customer app. */
  description?: string;
  /** Hidden categories (and their products) are not shown to shoppers. */
  hidden?: boolean;
  /** Adds the insulated-bag check at packing and the 60-min delivery limit (top-level categories). */
  coldChain?: boolean;
}

export type UnitOfMeasure = 'pc' | 'pack' | 'kg' | 'g' | 'L';
export type TaxType = 'vat' | 'exempt' | 'zero';

export interface Product {
  id: ID;
  sku: string;
  barcode: string;
  name: string;
  brand: string;
  categoryId: ID;
  /** Subcategory (a Category whose parentId is categoryId). */
  subcategoryId?: ID;
  unit: UnitOfMeasure;
  size: string; // "1 L", "500 g"
  description: string;
  /** Product photo URL ("/images/…" or an uploaded data: URL) — or an emoji when there is no photo. */
  image: string;
  basePrice: number; // per unit (per kg when soldByWeight)
  compareAt?: number;
  costPrice: number;
  soldByWeight: boolean;
  estWeightKg?: number; // estimated weight per piece for weighted items
  tags: string[]; // organic, halal, frozen, chilled ...
  status: 'draft' | 'active' | 'hidden' | 'discontinued';
  tax: TaxType;
  aisle: number; // pick-list sort order
  supplierId?: ID;
  reorderPoint: number;
  featured?: boolean;
  /** Fresh/chilled, frozen or shelf-stable: drives the label, packing and cold-chain rules. */
  storage?: StorageType;
  /** Cut & preparation options the shopper can choose (ids from AppState.cutOptions). */
  cutOptionIds?: ID[];
  /** Preset weights (kg) offered for items sold by weight, e.g. [0.5, 1, 1.5, 2]. */
  weightChoices?: number[];
  /** Smallest weight (kg) a shopper may order. */
  minWeightKg?: number;
}

export type StorageType = 'fresh' | 'frozen' | 'shelf';

/** A reusable cut / preparation option (e.g. "Sliced", "Ground", "For adobo"). */
export interface CutOption {
  id: ID;
  name: string;
  /** Price add-on amount (0 = free). Its unit comes from feeType. */
  fee: number;
  active: boolean;
  /** How the fee is charged: free, per kg of the line's weight, or per piece (× qty; weighed lines count as 1).
   *  Missing (older data) = a flat charge per order line. */
  feeType?: CutFeeType;
  /** Shown to pickers next to the cut on the pick list. */
  instructions?: string;
  /** Extra minutes added to the order's prep target when a line uses this option. */
  prepMins?: number;
  /** Top-level categories this option is offered on (missing = any category the product lists it for). */
  categoryIds?: ID[];
}

export type CutFeeType = 'free' | 'kg' | 'piece';

/** Direct Receiving: a supplier delivery recorded straight into stock, no purchase order. */
export interface Receiving {
  id: ID;
  number: string; // RCV-0001
  branchId: ID;
  supplierId?: ID;
  supplierName: string;
  receiptNo: string; // supplier delivery receipt (DR) number, e.g. DR-55120
  hasPhoto: boolean;
  /** Receipt photo URL or data URL, when one was stored. */
  photo?: string;
  at: string;
  by: string; // received by
  note?: string;
  /** awaiting = above the approval limit, no stock added yet; rejected = never added to stock. */
  status: 'posted' | 'awaiting' | 'rejected';
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectReason?: string;
  lines: { productId: ID; qty: number; weightKg?: number; cost: number; batch: string; producedOn?: string; expiresOn?: string }[];
}

export interface PriceList {
  id: ID;
  name: string;
  scope: 'global' | 'city' | 'branch' | 'channel';
  scopeId?: ID; // cityId or branchId
  channel?: OrderChannel;
  startDate?: string; // ISO date; when set the list is "scheduled"
  endDate?: string;
  active: boolean;
  items: Record<ID, number>; // productId -> price
}

export type MovementType =
  | 'receiving'
  | 'online_sale'
  | 'walkin_sale'
  | 'return'
  | 'wastage'
  | 'expiry'
  | 'adjustment'
  | 'count_correction'
  | 'transfer_in'
  | 'transfer_out';

export interface StockMovement {
  id: ID;
  productId: ID;
  branchId: ID;
  qty: number; // + in, - out
  type: MovementType;
  reason: string;
  user: string;
  at: string; // ISO
  ref?: string; // order number, PO number, transfer number
}

export interface Supplier {
  id: ID;
  name: string;
  contact: string;
  phone: string;
  email: string;
  terms: string;
  leadDays: number;
}

export interface PurchaseOrder {
  id: ID;
  number: string;
  supplierId: ID;
  branchId: ID;
  status: 'draft' | 'sent' | 'partial' | 'received' | 'cancelled';
  createdAt: string;
  lines: { productId: ID; qty: number; cost: number; received: number }[];
}

export interface Transfer {
  id: ID;
  number: string;
  fromBranchId: ID;
  toBranchId: ID;
  /** requested → (approved) → dispatched → received, or cancelled when a request is declined. */
  status: 'requested' | 'approved' | 'dispatched' | 'received' | 'cancelled';
  createdAt: string;
  lines: { productId: ID; qty: number }[];
  /** Branch that started it: the receiving branch for a request, the sending branch for a send. Missing on older records (treated as toBranchId). */
  requestedBy?: ID;
  note?: string;
  /** Status changes after creation, oldest first (drawer timeline). */
  history?: { status: 'requested' | 'approved' | 'dispatched' | 'received' | 'cancelled'; at: string; by: string }[];
}

export interface Address {
  label: 'Home' | 'Work' | 'Office' | 'Other';
  line: string;
  landmark?: string;
  /** Person who receives the delivery at this address (shown on the Saved addresses card). */
  recipient?: string;
  /** Recipient's mobile number. */
  phone?: string;
  lat: number;
  lng: number;
}

export interface Customer {
  id: ID;
  name: string;
  mobile: string;
  email: string;
  cityId: ID;
  addresses: Address[];
  createdAt: string;
  blocked: boolean;
  blockReason?: string;
  storeCredit: number;
  points: number;
  source: 'app' | 'walk_in' | 'phone';
  group?: string;
  /** Staff-only note shown on the Customers page (e.g. "Prefers thin-cut liempo"). */
  note?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  /** Demo only: stored in the browser. Production stores a password hash on the server. */
  password?: string;
  /** Google account email when the shopper signed up or linked with Google. */
  googleEmail?: string;
  /** Required profile (name, username, password, phone, address) is filled in. */
  profileComplete?: boolean;
  /** "Customer since" date shown on My account (falls back to createdAt). */
  customerSince?: string;
  /** Optional birthday (YYYY-MM-DD) from Personal details. */
  birthday?: string;
  /** Product ids the customer follows for a one-time back-in-stock text. */
  stockAlerts?: ID[];
  /** Message preferences from My account > Notifications (order updates by text are always on). */
  notifyPrefs?: CustomerNotifyPrefs;
  /** Saved payment methods (demo: labels only, no card numbers). Missing = cash on delivery only. */
  paymentMethods?: SavedPaymentMethod[];
}

export interface CustomerNotifyPrefs {
  emailReceipts: boolean;
  backInStock: boolean;
  offers: boolean;
}

export interface SavedPaymentMethod {
  id: ID;
  kind: 'gcash' | 'maya' | 'card' | 'cod';
  /** e.g. "GCash" */
  label: string;
  /** e.g. "0917 ••• 4567" */
  detail?: string;
  isDefault?: boolean;
}

export type OrderChannel = 'app' | 'walk_in' | 'phone';
export type Fulfillment = 'delivery' | 'pickup';
export type PaymentMethod = 'gcash' | 'maya' | 'card' | 'cod' | 'pay_at_pickup' | 'cash';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'expired' | 'refunded' | 'partially_refunded';

export type OrderStatus =
  | 'placed'
  | 'awaiting_confirmation'
  | 'confirmed'
  | 'preparing'
  | 'awaiting_shopper'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'collected'
  | 'cancelled'
  | 'failed_delivery';

export type SubstitutionPref = 'similar' | 'ask' | 'refund';

export interface OrderItem {
  productId: ID;
  name: string;
  image: string;
  unitPrice: number; // frozen at placement (per kg for weighted)
  qty: number;
  soldByWeight: boolean;
  estWeightKg?: number; // estimated total weight
  actualWeightKg?: number; // set at packing
  note?: string;
  /** Cut / preparation chosen by the shopper — a snapshot at order time. See cutCharge() for how fee/feeType are charged. */
  cut?: { id: ID; name: string; fee: number; feeType?: CutFeeType; prepMins?: number };
  storage?: StorageType;
  subPref: SubstitutionPref;
  pickStatus: 'pending' | 'picked' | 'short' | 'out_of_stock' | 'substituted' | 'removed';
  substitute?: { productId: ID; name: string; image: string; unitPrice: number; status: 'proposed' | 'accepted' | 'rejected' };
}

export interface OrderEvent {
  status: OrderStatus | 'note' | 'edit' | 'refund' | 'payment' | 'rider';
  at: string;
  by: string;
  note?: string;
}

export interface Order {
  id: ID;
  number: string; // e.g. "MTN-10234"
  branchId: ID;
  customerId: ID;
  customerName: string;
  customerMobile: string;
  channel: OrderChannel;
  fulfillment: Fulfillment;
  address?: Address;
  slot: string; // "ASAP" or "Today 3:00–4:00 PM"
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  serviceFee: number; // gateway fee line
  discount: number;
  total: number;
  feeRule?: string; // description of the delivery fee rule applied
  voucherCode?: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  refundedAmount: number;
  status: OrderStatus;
  autoConfirmed: boolean;
  flagged?: boolean;
  riderId?: ID;
  pickerName?: string;
  pickupPin: string;
  prepMinutes: number;
  placedAt: string;
  updatedAt: string;
  outForDeliveryAt?: string;
  completedAt?: string;
  timeline: OrderEvent[];
  internalNotes: { at: string; by: string; text: string }[];
  riderInstructions?: string;
  rating?: { order: number; rider?: number; tags: string[]; comment?: string };
  rejectReason?: string;
  bagCount?: number;
  acknowledged: boolean; // staff has seen the new-order alert
  /** Order has fresh or frozen items: insulated bag + maximum delivery time apply. */
  coldChain?: boolean;
  /** Maximum minutes from rider pickup to delivery (cold chain). */
  maxDeliveryMins?: number;
  /** Packer confirmed insulated bag + ice packs. */
  insulatedPacked?: boolean;
  /** Rider confirmed the insulated bag at pickup. */
  riderBagConfirmed?: boolean;
}

export interface Rider {
  id: ID;
  name: string;
  phone: string;
  type: 'own' | 'freelance' | 'courier';
  vehicle: 'bicycle' | 'motorcycle' | 'car' | 'van';
  plate: string;
  branchIds: ID[];
  status: 'online' | 'offline' | 'suspended' | 'pending';
  /** When the rider went off shift (demo data; shown in the rider picker). */
  offlineSince?: string;
  rating: number;
  lat: number;
  lng: number;
  codHeld: number; // cash collected not yet remitted
  tripsToday: number;
  earningsToday: number;
  documents: { name: string; expires: string; status: 'approved' | 'pending' | 'expired' }[];
  /** Date the rider joined the shop (demo data). */
  joinedAt?: string;
  /** Rolling 7-day performance (demo data; the Rider App would report this). */
  stats7d?: { trips: number; onTimePct: number; avgMins: number; acceptancePct: number };
  /** On-time % of today's trips (demo data). */
  onTimeToday?: number;
  /** When the oldest unremitted COD cash was collected, and from how many orders (demo data). */
  codSince?: string;
  codOrders?: number;
  /** Rider App preferences: navigation app opened first, and the new-offer sound (default on). */
  navApp?: 'google' | 'waze';
  offerSound?: boolean;
}

export interface DeliveryZone {
  id: ID;
  branchId: ID;
  name: string;
  type: 'radius' | 'areas';
  /** Inner edge of the ring in km (default 0). The zone covers fromKm ≤ distance ≤ radiusKm. */
  fromKm?: number;
  radiusKm: number;
  areas?: string[];
  feeModel: 'flat' | 'distance' | 'tiers';
  flatFee: number;
  baseFee: number;
  perKm: number;
  freeAbove?: number;
  minOrder: number;
  etaMins: number;
  active: boolean;
}

export interface Voucher {
  id: ID;
  code: string;
  description: string;
  type: 'percent' | 'fixed' | 'free_delivery';
  value: number;
  minBasket: number;
  maxUses: number;
  used: number;
  start: string;
  end: string;
  active: boolean;
  firstOrderOnly?: boolean;
  fulfillment?: Fulfillment;
}

export interface ChatMessage {
  from: 'shopper' | 'agent' | 'rider' | 'system';
  name: string;
  text: string;
  at: string;
  internal?: boolean;
}

export interface Conversation {
  id: ID;
  kind: 'support' | 'rider';
  customerId: ID;
  customerName: string;
  orderId?: ID;
  branchId?: ID;
  category: 'Missing item' | 'Damaged item' | 'Late delivery' | 'Payment issue' | 'Rider behavior' | 'Other';
  status: 'open' | 'pending' | 'resolved';
  priority: 'low' | 'normal' | 'high';
  assignedTo?: string;
  messages: ChatMessage[];
  unreadStaff: number;
  unreadShopper: number;
  updatedAt: string;
}

export interface Role {
  id: ID;
  name: string;
  description: string;
  scopeType: 'all' | 'cities' | 'branches' | 'self';
  protected?: boolean;
  permissions: string[]; // e.g. "orders.view", "orders.approve"
}

export interface StaffUser {
  id: ID;
  name: string;
  email: string;
  roleId: ID;
  scope: { type: 'all' | 'cities' | 'branches'; ids: ID[] };
  status: 'active' | 'invited' | 'deactivated' | 'suspended';
  lastActive: string;
  twoFactor: boolean;
  /** When the password was last set (ISO). */
  passwordChangedAt?: string;
  /** Signed-in devices, e.g. "Android phone". Empty after "Sign out everywhere". */
  sessions?: string[];
}

export type SettingValue = string | number | boolean;

export interface Setting {
  key: string;
  label: string;
  group:
    | 'Order confirmation'
    | 'Order rules'
    | 'Fulfillment'
    | 'Delivery fees'
    | 'Payments'
    | 'Pricing & tax'
    | 'Inventory'
    | 'Riders'
    | 'Support'
    | 'Feature flags'
    | 'Meat & cold chain'
    | 'Security';
  type: 'boolean' | 'number' | 'text' | 'select';
  options?: string[];
  unit?: string;
  help?: string;
  global: SettingValue;
  city: Record<ID, SettingValue>;
  branch: Record<ID, SettingValue>;
}

export interface AuditLog {
  id: ID;
  at: string;
  user: string;
  module: 'Orders' | 'Catalog' | 'Pricing' | 'Inventory' | 'Riders' | 'Customers' | 'Promotions' | 'Settings' | 'Users & Roles' | 'Branches' | 'Support' | 'Payments';
  action: string;
  detail: string;
  branchId?: ID;
  oldValue?: string;
  newValue?: string;
}

export interface AppNotification {
  id: ID;
  at: string;
  audience: 'staff' | 'shopper' | 'rider';
  targetId?: ID; // customerId / riderId / branchId
  title: string;
  body: string;
  orderId?: ID;
  read: boolean;
}

export interface Banner {
  id: ID;
  title: string;
  subtitle: string;
  color: string; // tailwind gradient classes
  emoji: string;
  active: boolean;
  cityId?: ID;
  /** Optional background photo URL. */
  photo?: string;
}

export interface Session {
  staffUserId: ID; // "view as" user for RBAC demo
  branchId: ID; // order desk branch
  shopperId: ID; // signed-in shopper in the Shopper App demo
  /** Customer App demo: false shows the welcome / sign-in screens. */
  shopperSignedIn: boolean;
  riderId: ID; // signed-in rider in the Rider App demo
}

// ---------------- Platform Owner (LAP IT Solutions) ----------------
export type ModuleKey =
  | 'walkin' | 'endofday' | 'purchasing' | 'pricing' | 'inventory' | 'delivery' | 'customers'
  | 'promotions' | 'support' | 'reports' | 'branches' | 'content' | 'otp';
export type LimitKey = 'cities' | 'branches' | 'staff' | 'riders' | 'products' | 'smsPerMonth';
export interface ModuleState { on: boolean; reason?: string; changedAt?: string }
export interface PlatformLog { id: ID; at: string; user: string; action: string; detail: string; oldValue?: string; newValue?: string }
export interface PlatformState {
  /** Demo sign-in for the Platform Owner console (no real auth in the demo). */
  signedIn: boolean;
  ownerName: string;
  modules: Record<ModuleKey, ModuleState>;
  limits: Record<LimitKey, number>;
  smsUsed: number;
  /** Super Admin accounts signed out by the Platform Owner (must sign in again). */
  forcedSignOut: ID[];
  /** Permissions the Platform Owner removed from the client (a ceiling for every client role, including Super Admin). */
  blockedPermissions: string[];
  log: PlatformLog[];
}

/** A Customer App cart line. Weighted items use weightKg (qty stays 1); cutId picks a cut option. */
export interface CartLine {
  productId: ID;
  qty: number;
  weightKg?: number;
  cutId?: ID;
  note?: string;
  subPref: SubstitutionPref;
}

export interface AppState {
  version: number;
  seededAt: string;
  cities: City[];
  branches: Branch[];
  categories: Category[];
  products: Product[];
  priceLists: PriceList[];
  movements: StockMovement[];
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  transfers: Transfer[];
  customers: Customer[];
  orders: Order[];
  riders: Rider[];
  zones: DeliveryZone[];
  vouchers: Voucher[];
  conversations: Conversation[];
  roles: Role[];
  staff: StaffUser[];
  settings: Setting[];
  audit: AuditLog[];
  notifications: AppNotification[];
  banners: Banner[];
  rejectReasons: string[];
  /** product ids the shopper has in their cart (Shopper App demo) */
  cart: CartLine[];
  session: Session;
  counters: { order: number; po: number; transfer: number; receiving: number };
  platform: PlatformState;
  cutOptions: CutOption[];
  receivings: Receiving[];
  /** Catalog Import / export history (the demo keeps each file's text so it can be downloaded again). */
  catalogFiles?: CatalogFile[];
  /** Finished stock takes, newest first (Inventory › Stock take › Recent counts). */
  stockCounts?: StockCount[];
  /** The physical count in progress, if any. Kept here so it survives reloads and tab switches. */
  stockCountDraft?: StockCountDraft;
  /** COD cash handed over by riders (Riders › COD remittance), newest first. */
  remittances?: CodRemittance[];
  /** Delivery slots closed by staff (Delivery › Zones & fees), keyed `branchId|YYYY-MM-DD|hour`. */
  closedSlots?: string[];
}

/** One COD hand-over from a rider to the branch. */
export interface CodRemittance {
  id: ID;
  riderId?: ID;
  riderName: string;
  amount: number;
  method: 'cash' | 'gcash';
  /** Number of COD orders covered. */
  orders: number;
  at: string;
  by: string;
  /** Amount still held after this hand-over (shortfall), if any. */
  shortBy?: number;
}

/** One submitted stock take. */
export interface StockCount {
  id: ID;
  branchId: ID;
  /** 'all' or a top-level category id. */
  scope: string;
  scopeName: string;
  startedAt?: string; // ISO
  at: string; // ISO, when submitted
  by: string;
  counted: number;
  variances: number;
  /** Net variance at cost price (₱); negative = stock missing. */
  value: number;
}

/** A stock take that has been started but not submitted. */
export interface StockCountDraft {
  branchId: ID;
  /** 'all' or a top-level category id. */
  scope: string;
  startedAt: string; // ISO
  startedBy: string;
  /** Counted quantity per product id, as typed. Products without an entry are not counted yet. */
  counts: Record<ID, string>;
}

/** One file imported into or exported from the catalog. */
export interface CatalogFile {
  id: ID;
  kind: 'import' | 'export';
  fileName: string;
  at: string; // ISO
  user: string;
  /** Export: rows in the file. */
  rows?: number;
  /** Import: rows applied / skipped. */
  applied?: number;
  skipped?: number;
  /** Import that could not be read, e.g. "columns not recognised". */
  failed?: string;
  /** File contents (CSV text, or the Excel-compatible HTML table for .xls). */
  content: string;
}
