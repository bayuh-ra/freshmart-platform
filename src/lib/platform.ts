// Platform Owner rules: which modules the client may use and how much it may create.
// The Platform Owner (LAP IT Solutions) sits above the client's Super Admin.
// In production these checks run on the server for every API call; the demo
// applies the same rules in the browser.

import { toast } from 'sonner';
import type { AppState, LimitKey, ModuleKey } from './types';
import { getState, uid } from './store';

export interface ModuleDef {
  key: ModuleKey;
  label: string;
  description: string;
  /** Route prefixes that belong to this module (client side). */
  paths: string[];
}

export const MODULES: ModuleDef[] = [
  { key: 'walkin', label: 'Walk-in & Phone orders', description: 'Staff create orders for customers who are not using the website.', paths: ['/orders/new'] },
  { key: 'purchasing', label: 'Purchase Orders', description: 'Suppliers, purchase orders and receiving against a PO.', paths: ['/purchasing'] },
  { key: 'endofday', label: 'End-of-Day Summary', description: 'Daily branch summary, cash accountability and manager sign-off.', paths: ['/orders/end-of-day'] },
  { key: 'inventory', label: 'Inventory Monitoring', description: 'Stock ledger, receiving, adjustments and low-stock alerts.', paths: ['/inventory'] },
  { key: 'pricing', label: 'Price Lists', description: 'City, branch and scheduled price lists.', paths: ['/catalog/pricing'] },
  { key: 'delivery', label: 'Delivery & Riders', description: 'Dispatch map, riders, zones and fees, and the Rider App.', paths: ['/delivery', '/rider'] },
  { key: 'customers', label: 'Customer Management', description: 'Customer list, profiles and groups.', paths: ['/customers'] },
  { key: 'promotions', label: 'Vouchers & Promotions', description: 'Vouchers, promotions and campaigns.', paths: ['/promotions'] },
  { key: 'support', label: 'Support Chat', description: 'Support inbox and shopper chat.', paths: ['/support'] },
  { key: 'reports', label: 'Reports', description: 'Sales, product, delivery and finance reports with exports.', paths: ['/reports'] },
  { key: 'branches', label: 'Cities & Branches management', description: 'Add and edit cities and branches.', paths: ['/admin/branches'] },
  { key: 'content', label: 'App Content', description: 'Banners, home sections and help pages.', paths: ['/admin/content'] },
  { key: 'otp', label: 'Phone OTP verification', description: 'One-time code by SMS at sign-up and log-in.', paths: [] },
];

/** Screens that are always on (the core of the platform). */
export const CORE_SCREENS = ['Dashboard', 'Live Orders', 'Products', 'Shopper App', 'Users & Roles', 'Settings', 'Audit Log'];

export const LIMITS: { key: LimitKey; label: string; unit: string }[] = [
  { key: 'branches', label: 'Branches', unit: 'branches' },
  { key: 'cities', label: 'Cities', unit: 'cities' },
  { key: 'staff', label: 'Staff accounts', unit: 'accounts' },
  { key: 'riders', label: 'Active riders', unit: 'riders' },
  { key: 'products', label: 'Products', unit: 'products' },
  { key: 'smsPerMonth', label: 'SMS per month', unit: 'SMS' },
];

export const PERMISSION_MODULE_LABEL: Record<string, string> = {
  orders: 'Orders', catalog: 'Catalog', pricing: 'Pricing', inventory: 'Inventory', riders: 'Riders', customers: 'Customers',
  promotions: 'Promotions', support: 'Support', reports: 'Reports', settings: 'Settings', users: 'Users & Roles',
};

export function moduleDef(key: ModuleKey) {
  return MODULES.find((m) => m.key === key)!;
}

export function moduleOn(s: AppState, key?: ModuleKey) {
  if (!key) return true;
  return s.platform?.modules[key]?.on ?? true;
}

/** The module a client path belongs to (longest matching prefix), if any. */
export function moduleForPath(path: string): ModuleKey | undefined {
  let best: { key: ModuleKey; len: number } | undefined;
  for (const m of MODULES) {
    for (const p of m.paths) {
      if ((path === p || path.startsWith(p + '/')) && (!best || p.length > best.len)) best = { key: m.key, len: p.length };
    }
  }
  return best?.key;
}

export function limitUsage(s: AppState, key: LimitKey) {
  const used =
    key === 'cities' ? s.cities.length
    : key === 'branches' ? s.branches.length
    : key === 'staff' ? s.staff.filter((u) => u.status !== 'deactivated').length
    : key === 'riders' ? s.riders.filter((r) => r.status !== 'pending').length
    : key === 'products' ? s.products.length
    : s.platform.smsUsed;
  const max = s.platform.limits[key];
  return { used, max, reached: used >= max, pct: max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 100 };
}

/**
 * Call before an "add" action. Returns false (and tells the user) when the plan
 * limit set by the Platform Owner is reached. `adding` = how many will be added.
 */
export function guardLimit(key: LimitKey, adding = 1) {
  const s = getState();
  const { used, max } = limitUsage(s, key);
  if (used + adding <= max) return true;
  const def = LIMITS.find((l) => l.key === key)!;
  toast.error(`Plan limit reached: ${used} of ${max} ${def.unit}`, {
    description: 'Your plan does not allow more. Contact LAP IT Solutions to raise the limit.',
  });
  return false;
}

/** Append a Platform Owner change-log entry inside a mutate() recipe. */
export function addPlatformLog(draft: AppState, e: { action: string; detail: string; oldValue?: string; newValue?: string }) {
  draft.platform.log.unshift({ id: uid('pl'), at: new Date().toISOString(), user: draft.platform.ownerName, ...e });
}
