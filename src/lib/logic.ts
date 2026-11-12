// Business rules layer (spec §8 "Configuration-Driven Design").
// Every rule reads admin settings; nothing is hard-coded per branch.

import type {
  AppState, Branch, DeliveryZone, Order, OrderChannel, OrderItem, OrderStatus, PaymentMethod, Product,
  SettingValue, Fulfillment, Address, SubstitutionPref, Voucher,
} from './types';
import { lineTotal } from './seed';
import { addAudit, addNotification, currentUserName, mutate, uid } from './store';

export { lineTotal };

// ---------------- Formatting ----------------
export function peso(n: number) {
  return `₱${(n ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export function pesoShort(n: number) {
  return `₱${Math.round(n ?? 0).toLocaleString('en-PH')}`;
}
export function timeAgo(isoStr: string) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
export function fmtDateTime(isoStr: string) {
  return new Date(isoStr).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
export function fmtDate(isoStr: string) {
  return new Date(isoStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
export function fmtTime(isoStr: string) {
  return new Date(isoStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
export function isToday(isoStr: string) {
  const d = new Date(isoStr);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

// ---------------- Labels & colors ----------------
export const STATUS_LABEL: Record<OrderStatus, string> = {
  placed: 'Placed',
  awaiting_confirmation: 'Awaiting confirmation',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  awaiting_shopper: 'Awaiting shopper reply',
  ready: 'Ready',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  collected: 'Collected',
  cancelled: 'Cancelled',
  failed_delivery: 'Failed delivery',
};
export const STATUS_CLASS: Record<OrderStatus, string> = {
  placed: 'bg-gray-100 text-gray-700',
  awaiting_confirmation: 'bg-red-100 text-red-700',
  confirmed: 'bg-blue-100 text-blue-800',
  preparing: 'bg-purple-100 text-purple-800',
  awaiting_shopper: 'bg-amber-100 text-amber-800',
  ready: 'bg-cyan-100 text-cyan-800',
  out_for_delivery: 'bg-indigo-100 text-indigo-800',
  delivered: 'bg-green-100 text-green-800',
  collected: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-200 text-gray-600',
  failed_delivery: 'bg-orange-100 text-orange-800',
};
export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  gcash: 'GCash', maya: 'Maya', card: 'Credit/Debit Card', cod: 'Cash on Delivery', pay_at_pickup: 'Pay at Pickup', cash: 'Cash',
};
export const CHANNEL_LABEL: Record<OrderChannel, string> = { app: 'App', walk_in: 'Walk-in', phone: 'Phone' };
export const ONLINE_METHODS: PaymentMethod[] = ['gcash', 'maya', 'card'];
export const OPEN_STATUSES: OrderStatus[] = ['placed', 'awaiting_confirmation', 'confirmed', 'preparing', 'awaiting_shopper', 'ready', 'out_for_delivery'];

// ---------------- Settings (global → city → branch; most specific wins) ----------------
export function getSetting(s: AppState, key: string, branchId?: string): SettingValue {
  const st = s.settings.find((x) => x.key === key);
  if (!st) return '';
  if (branchId) {
    if (st.branch[branchId] !== undefined) return st.branch[branchId];
    const b = s.branches.find((x) => x.id === branchId);
    if (b && st.city[b.cityId] !== undefined) return st.city[b.cityId];
  }
  return st.global;
}
export function settingSource(s: AppState, key: string, branchId?: string): 'branch' | 'city' | 'global' {
  const st = s.settings.find((x) => x.key === key);
  if (!st || !branchId) return 'global';
  if (st.branch[branchId] !== undefined) return 'branch';
  const b = s.branches.find((x) => x.id === branchId);
  if (b && st.city[b.cityId] !== undefined) return 'city';
  return 'global';
}
export const num = (v: SettingValue) => Number(v) || 0;

// ---------------- Pricing (branch list > city list > channel > global; scheduled beats default) ----------------
export function getPriceInfo(s: AppState, productId: string, branchId: string, channel: OrderChannel = 'app') {
  const p = s.products.find((x) => x.id === productId);
  if (!p) return { price: 0, source: 'Base price', compareAt: undefined as number | undefined };
  const b = s.branches.find((x) => x.id === branchId);
  const today = new Date().toISOString().slice(0, 10);
  const candidates = s.priceLists.filter((l) => {
    if (!l.active || l.items[productId] === undefined) return false;
    if (l.startDate && today < l.startDate) return false;
    if (l.endDate && today > l.endDate) return false;
    if (l.scope === 'branch') return l.scopeId === branchId;
    if (l.scope === 'city') return l.scopeId === b?.cityId;
    if (l.scope === 'channel') return l.channel === channel;
    return true;
  });
  const rank = (l: (typeof candidates)[number]) =>
    (l.scope === 'branch' ? 40 : l.scope === 'city' ? 30 : l.scope === 'channel' ? 20 : 10) + (l.startDate ? 5 : 0);
  candidates.sort((a, b2) => rank(b2) - rank(a));
  const best = candidates[0];
  const price = best ? best.items[productId] : p.basePrice;
  const compareAt = p.compareAt ?? (best && best.items[productId] < p.basePrice ? p.basePrice : undefined);
  return { price, source: best ? best.name : 'Base price', compareAt };
}
export const getPrice = (s: AppState, productId: string, branchId: string, channel: OrderChannel = 'app') =>
  getPriceInfo(s, productId, branchId, channel).price;

// ---------------- Stock ledger ----------------
export function onHand(s: AppState, productId: string, branchId: string) {
  let t = 0;
  for (const m of s.movements) if (m.productId === productId && m.branchId === branchId) t += m.qty;
  return t;
}
function itemUnits(i: OrderItem) {
  return i.soldByWeight ? 1 : i.qty;
}
export function reserved(s: AppState, productId: string, branchId: string) {
  let t = 0;
  for (const o of s.orders) {
    if (o.branchId !== branchId || !OPEN_STATUSES.includes(o.status)) continue;
    for (const i of o.items) {
      if (i.pickStatus === 'removed' || i.pickStatus === 'out_of_stock') continue;
      const pid = i.substitute?.status === 'accepted' ? i.substitute.productId : i.productId;
      if (pid === productId) t += itemUnits(i);
    }
  }
  return t;
}
/** Available-to-sell = on hand − reserved − safety buffer (spec §8 key rule). */
export function available(s: AppState, productId: string, branchId: string) {
  const buffer = num(getSetting(s, 'safetyBuffer', branchId));
  return Math.max(0, onHand(s, productId, branchId) - reserved(s, productId, branchId) - buffer);
}
export function stockSummary(s: AppState, productId: string, branchId: string) {
  const oh = onHand(s, productId, branchId);
  const rs = reserved(s, productId, branchId);
  const buffer = num(getSetting(s, 'safetyBuffer', branchId));
  return { onHand: oh, reserved: rs, buffer, available: Math.max(0, oh - rs - buffer) };
}

// ---------------- Geo & delivery fees ----------------
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(x)) * 10) / 10;
}

export function findZone(s: AppState, branch: Branch, addr?: { lat: number; lng: number }): DeliveryZone | undefined {
  const zs = s.zones.filter((z) => z.branchId === branch.id && z.active).sort((a, b) => a.radiusKm - b.radiusKm);
  if (!addr) return zs[0];
  const d = distanceKm(branch, addr);
  return zs.find((z) => d <= z.radiusKm);
}

export function calcDeliveryFee(s: AppState, branchId: string, subtotal: number, addr?: { lat: number; lng: number }) {
  const b = s.branches.find((x) => x.id === branchId)!;
  const zone = findZone(s, b, addr);
  if (!zone) return { fee: 0, rule: 'Outside delivery zones', zone: undefined, outside: true, distance: addr ? distanceKm(b, addr) : 0 };
  const d = addr ? distanceKm(b, addr) : 2;
  let fee = 0;
  let rule = '';
  if (zone.feeModel === 'flat') { fee = zone.flatFee; rule = `${zone.name} · Flat ${pesoShort(zone.flatFee)}`; }
  else if (zone.feeModel === 'distance') { fee = Math.round(zone.baseFee + zone.perKm * d); rule = `${zone.name} · ${pesoShort(zone.baseFee)} + ${pesoShort(zone.perKm)}/km × ${d} km`; }
  else { fee = subtotal >= 2000 ? 0 : subtotal >= 1000 ? 39 : zone.flatFee; rule = `${zone.name} · Order-value tiers`; }
  const hour = new Date().getHours();
  const peak = num(getSetting(s, 'peakSurcharge', branchId));
  if (hour >= 17 && hour < 19 && peak) { fee += peak; rule += ` + peak ${pesoShort(peak)}`; }
  const weather = num(getSetting(s, 'weatherSurcharge', branchId));
  if (weather) { fee += weather; rule += ` + weather ${pesoShort(weather)}`; }
  if (zone.freeAbove && subtotal >= zone.freeAbove) { fee = 0; rule += ` · Free above ${pesoShort(zone.freeAbove)}`; }
  return { fee, rule, zone, outside: false, distance: d };
}

/** Nearest open branch that delivers to this address (auto branch selection). */
export function nearestBranch(s: AppState, addr: { lat: number; lng: number }, fulfillment: Fulfillment = 'delivery') {
  const open = s.branches.filter((b) => b.status === 'active' && (fulfillment === 'delivery' ? b.services.delivery && getSetting(s, 'deliveryPaused', b.id) !== true : b.services.pickup));
  return open
    .map((b) => ({ b, d: distanceKm(b, addr), inZone: !!findZone(s, b, addr) }))
    .filter((x) => fulfillment === 'pickup' || x.inZone)
    .sort((a, c) => a.d - c.d)[0]?.b;
}

// ---------------- Vouchers ----------------
export function applyVoucher(s: AppState, code: string, subtotal: number, deliveryFee: number, fulfillment: Fulfillment) {
  const v: Voucher | undefined = s.vouchers.find((x) => x.code.toUpperCase() === code.trim().toUpperCase());
  if (!v) return { ok: false as const, reason: 'Code not found' };
  if (!v.active) return { ok: false as const, reason: 'This voucher is no longer active' };
  if (new Date(v.end) < new Date()) return { ok: false as const, reason: 'This voucher has expired' };
  if (v.used >= v.maxUses) return { ok: false as const, reason: 'Voucher fully redeemed' };
  if (subtotal < v.minBasket) return { ok: false as const, reason: `Minimum basket is ${pesoShort(v.minBasket)}` };
  if (v.fulfillment && v.fulfillment !== fulfillment) return { ok: false as const, reason: `Valid for ${v.fulfillment} orders only` };
  const discount = v.type === 'percent' ? Math.min(150, Math.round((subtotal * v.value) / 100)) : v.type === 'fixed' ? v.value : deliveryFee;
  return { ok: true as const, discount, voucher: v };
}

// ---------------- Order math ----------------
export function recalc(o: Order) {
  o.subtotal = Math.round(o.items.reduce((sum, i) => sum + lineTotal(i), 0) * 100) / 100;
  o.total = Math.max(0, Math.round((o.subtotal + o.deliveryFee + o.serviceFee - o.discount) * 100) / 100);
  o.updatedAt = new Date().toISOString();
}

// ---------------- Order actions (shared by Shopper App, Order Desk, Rider App) ----------------
export interface PlaceOrderInput {
  branchId: string;
  customerId: string;
  channel: OrderChannel;
  fulfillment: Fulfillment;
  address?: Address;
  slot: string;
  lines: { productId: string; qty: number; note?: string; subPref: SubstitutionPref; priceOverride?: number }[];
  paymentMethod: PaymentMethod;
  voucherCode?: string;
  riderInstructions?: string;
  by?: string;
  discountOverride?: number;
}

export function placeOrder(input: PlaceOrderInput): string {
  let newId = '';
  mutate((s) => {
    const b = s.branches.find((x) => x.id === input.branchId)!;
    const cu = s.customers.find((x) => x.id === input.customerId)!;
    const items: OrderItem[] = input.lines.map((l) => {
      const p = s.products.find((x) => x.id === l.productId)!;
      return {
        productId: p.id, name: p.name, image: p.image,
        unitPrice: l.priceOverride ?? getPrice(s, p.id, b.id, input.channel),
        qty: l.qty, soldByWeight: p.soldByWeight, estWeightKg: p.soldByWeight ? l.qty * (p.estWeightKg ?? 1) : undefined,
        note: l.note, subPref: l.subPref, pickStatus: 'pending',
      };
    });
    const subtotal = Math.round(items.reduce((sum, i) => sum + lineTotal(i), 0) * 100) / 100;
    const fee = input.fulfillment === 'delivery' ? calcDeliveryFee(s, b.id, subtotal, input.address) : { fee: 0, rule: undefined as string | undefined };
    const online = ONLINE_METHODS.includes(input.paymentMethod);
    const serviceFee = online ? Math.round((subtotal * num(getSetting(s, 'gatewayFeePct', b.id))) / 100) : 0;
    let discount = input.discountOverride ?? 0;
    if (input.voucherCode) {
      const v = applyVoucher(s, input.voucherCode, subtotal, fee.fee, input.fulfillment);
      if (v.ok) { discount += v.discount; v.voucher.used += 1; }
    }
    const pickupDisc = input.fulfillment === 'pickup' ? num(getSetting(s, 'pickupDiscountPct', b.id)) : 0;
    if (pickupDisc) discount += Math.round((subtotal * pickupDisc) / 100);
    const autoConfirm = online && getSetting(s, 'autoConfirmPaid', b.id) === true && getSetting(s, 'manualConfirmAll', b.id) !== true && !cu.blocked;
    const now = new Date().toISOString();
    s.counters.order += 1;
    const id = uid('o');
    newId = id;
    const by = input.by ?? cu.name;
    const order: Order = {
      id, number: `${b.code}-${s.counters.order}`, branchId: b.id, customerId: cu.id, customerName: cu.name, customerMobile: cu.mobile,
      channel: input.channel, fulfillment: input.fulfillment, address: input.address, slot: input.slot, items,
      subtotal, deliveryFee: fee.fee, serviceFee, discount, total: 0, feeRule: fee.rule, voucherCode: input.voucherCode,
      paymentMethod: input.paymentMethod, paymentStatus: online ? 'paid' : input.paymentMethod === 'cash' ? 'paid' : 'pending', refundedAmount: 0,
      status: autoConfirm ? 'preparing' : 'awaiting_confirmation', autoConfirmed: autoConfirm, pickupPin: String(1000 + Math.floor(Math.random() * 9000)),
      prepMinutes: num(getSetting(s, 'prepMinutes', b.id)) || 20, placedAt: now, updatedAt: now,
      timeline: [{ status: 'placed', at: now, by }], internalNotes: [], riderInstructions: input.riderInstructions, acknowledged: false,
    };
    if (autoConfirm) {
      order.timeline.push({ status: 'confirmed', at: now, by: 'System (auto-confirm: paid online)' });
      order.timeline.push({ status: 'preparing', at: now, by: 'System' });
    } else {
      order.timeline.push({ status: 'awaiting_confirmation', at: now, by: 'System', note: online ? 'Manual confirmation required by branch setting' : 'Unpaid order — needs staff confirmation' });
    }
    recalc(order);
    s.orders.unshift(order);
    addNotification(s, { audience: 'staff', targetId: b.id, title: `New ${CHANNEL_LABEL[input.channel]} order ${order.number}`, body: `${cu.name} · ${pesoShort(order.total)} · ${input.fulfillment}`, orderId: id });
    addNotification(s, { audience: 'shopper', targetId: cu.id, title: 'Order placed', body: `Your order ${order.number} was received by ${b.name}.`, orderId: id });
  });
  return newId;
}

const NEXT_NOTIFY: Partial<Record<OrderStatus, string>> = {
  confirmed: 'Your order was confirmed by the branch.',
  preparing: 'We are preparing your order.',
  ready: 'Your order is ready.',
  out_for_delivery: 'Your rider is on the way!',
  delivered: 'Your order was delivered. Enjoy!',
  collected: 'Order collected. Thank you!',
  cancelled: 'Your order was cancelled.',
  failed_delivery: 'Delivery attempt failed. We will contact you.',
};

/** Move an order to a new status, recording the timeline, notifications and stock effects. */
export function setOrderStatus(orderId: string, status: OrderStatus, opts: { by?: string; note?: string } = {}) {
  mutate((s) => applyStatus(s, orderId, status, opts));
}

export function applyStatus(s: AppState, orderId: string, status: OrderStatus, opts: { by?: string; note?: string } = {}) {
  const o = s.orders.find((x) => x.id === orderId);
  if (!o) return;
  const now = new Date().toISOString();
  const by = opts.by ?? currentUserName(s);
  o.status = status;
  o.acknowledged = true;
  o.updatedAt = now;
  o.timeline.push({ status, at: now, by, note: opts.note });
  if (status === 'out_for_delivery') o.outForDeliveryAt = now;
  if (status === 'delivered' || status === 'collected') {
    o.completedAt = now;
    if (o.paymentStatus === 'pending') {
      o.paymentStatus = 'paid';
      o.timeline.push({ status: 'payment', at: now, by, note: `${PAYMENT_LABEL[o.paymentMethod]} ${peso(o.total)} collected` });
      if (o.paymentMethod === 'cod' && o.riderId) {
        const r = s.riders.find((x) => x.id === o.riderId);
        if (r) r.codHeld += o.total;
      }
    }
    // Stock is deducted at delivery/collection (reservation released at the same time).
    for (const i of o.items) {
      if (i.pickStatus === 'removed' || i.pickStatus === 'out_of_stock') continue;
      const pid = i.substitute?.status === 'accepted' ? i.substitute.productId : i.productId;
      s.movements.push({ id: uid('m'), productId: pid, branchId: o.branchId, qty: -itemUnits(i), type: o.channel === 'app' ? 'online_sale' : 'walkin_sale', reason: 'Order completed', user: 'System', at: now, ref: o.number });
    }
    if (o.riderId) {
      const r = s.riders.find((x) => x.id === o.riderId);
      if (r) { r.tripsToday += 1; r.earningsToday += 60 + Math.round(o.deliveryFee * 0.5); }
    }
  }
  if (status === 'cancelled') {
    o.completedAt = now;
    if (o.paymentStatus === 'paid') {
      o.paymentStatus = 'refunded';
      o.refundedAmount = o.total;
      o.timeline.push({ status: 'refund', at: now, by: 'System', note: `Automatic refund ${peso(o.total)} to ${PAYMENT_LABEL[o.paymentMethod]}` });
    }
    addAudit(s, { module: 'Orders', action: 'Order cancelled', detail: `${o.number}${opts.note ? ` — ${opts.note}` : ''}`, branchId: o.branchId, user: by });
  }
  const msg = NEXT_NOTIFY[status];
  if (msg) addNotification(s, { audience: 'shopper', targetId: o.customerId, title: `${o.number}: ${STATUS_LABEL[status]}`, body: msg, orderId: o.id });
}

export function confirmOrder(orderId: string, by?: string) {
  mutate((s) => {
    applyStatus(s, orderId, 'confirmed', { by });
    applyStatus(s, orderId, 'preparing', { by });
  });
}

export function rejectOrder(orderId: string, reason: string, by?: string) {
  mutate((s) => {
    const o = s.orders.find((x) => x.id === orderId);
    if (o) o.rejectReason = reason;
    applyStatus(s, orderId, 'cancelled', { by, note: `Rejected: ${reason}` });
  });
}

export function assignRider(orderId: string, riderId: string, by?: string) {
  mutate((s) => {
    const o = s.orders.find((x) => x.id === orderId);
    const r = s.riders.find((x) => x.id === riderId);
    if (!o || !r) return;
    o.riderId = riderId;
    o.timeline.push({ status: 'rider', at: new Date().toISOString(), by: by ?? currentUserName(s), note: `Rider assigned: ${r.name} (${r.vehicle})` });
    addNotification(s, { audience: 'rider', targetId: riderId, title: 'New job offer', body: `${o.number} · ${s.branches.find((b) => b.id === o.branchId)?.name} → ${o.address?.line ?? 'pickup'}`, orderId });
    addNotification(s, { audience: 'shopper', targetId: o.customerId, title: 'Rider assigned', body: `${r.name} will deliver your order.`, orderId });
  });
}

/** Rider position during delivery: interpolated from branch to drop-off over ~3 minutes (demo speed). */
export function riderPosition(s: AppState, o: Order) {
  const b = s.branches.find((x) => x.id === o.branchId)!;
  const dest = o.address ?? b;
  if (o.status !== 'out_for_delivery' || !o.outForDeliveryAt) {
    const r = s.riders.find((x) => x.id === o.riderId);
    return { lat: r?.lat ?? b.lat, lng: r?.lng ?? b.lng, progress: o.status === 'delivered' ? 1 : 0, etaMins: 0 };
  }
  const DURATION = 180_000;
  const t = Math.min(0.97, (Date.now() - new Date(o.outForDeliveryAt).getTime()) / DURATION);
  const wiggle = Math.sin(t * Math.PI * 3) * 0.002;
  return {
    lat: b.lat + (dest.lat - b.lat) * t + wiggle,
    lng: b.lng + (dest.lng - b.lng) * t - wiggle,
    progress: t,
    etaMins: Math.max(1, Math.round((1 - t) * 15)),
  };
}

// ---------------- RBAC ----------------
export function currentUser(s: AppState) {
  return s.staff.find((u) => u.id === s.session.staffUserId) ?? s.staff[0];
}
export function currentRole(s: AppState) {
  const u = currentUser(s);
  return s.roles.find((r) => r.id === u.roleId) ?? s.roles[0];
}
/** Effective access = permission AND scope. */
export function can(s: AppState, permission: string, branchId?: string) {
  const role = currentRole(s);
  if (!role.permissions.includes(permission)) return false;
  if (!branchId) return true;
  return userBranchIds(s).includes(branchId);
}
export function userBranchIds(s: AppState) {
  const u = currentUser(s);
  if (u.scope.type === 'all') return s.branches.map((b) => b.id);
  if (u.scope.type === 'cities') return s.branches.filter((b) => u.scope.ids.includes(b.cityId)).map((b) => b.id);
  return u.scope.ids;
}

// ---------------- Misc helpers ----------------
export function branchName(s: AppState, id?: string) {
  return s.branches.find((b) => b.id === id)?.name ?? '—';
}
export function cityName(s: AppState, id?: string) {
  return s.cities.find((c) => c.id === id)?.name ?? '—';
}
export function productById(s: AppState, id: string): Product | undefined {
  return s.products.find((p) => p.id === id);
}

/** Download rows as CSV (Excel opens it). */
export function exportCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Short beep for new-order alerts (Web Audio, no asset needed). */
export function playAlert() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.18].forEach((d) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.15, ctx.currentTime + d);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + d + 0.15);
      o.start(ctx.currentTime + d);
      o.stop(ctx.currentTime + d + 0.16);
    });
  } catch {
    /* ignore */
  }
}
