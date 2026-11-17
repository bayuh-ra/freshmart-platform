# Platform Owner Side — Design (short)

Date: 2026-11-14 · Approved approach: **A — whole-module control**

## Intent
LAP IT Solutions needs its own login, above the client's Super Admin. From it, LAP IT decides which modules the client can use and how much the client can create. This follows spec v6, "Platform Owner & Module Control".

## Goals
- A separate `/platform` area with its own menu. Client users, including the Super Admin, cannot open it.
- **Module Control:** an on/off switch per module, with a reason note.
  - A module that is off is removed from the client sidebar and from in-page buttons.
  - Opening its address directly shows "Switched off by Platform Owner".
- **OFF at launch:** Purchase Orders and Walk-in/Phone orders. Phone OTP is listed as a module, but there is no screen behind it.
- **Plan Limits:** maximum branches, cities, staff accounts, riders and products, plus the monthly SMS allowance.
  - Each limit has a usage bar.
  - When a limit is reached, the "Add" action is blocked with a message to contact LAP IT Solutions.
- **Client Admins:** suspend or reactivate Super Admin accounts, and force a sign-out. A suspended account sees an "Account suspended" screen.
- **Change log:** every Platform Owner change, with who and when.
- **Responsive:** every `/platform` page works on phone, tablet and desktop.

## Non-goals
- Per-action control of the Super Admin (option B, later).
- Real authentication. The demo uses a login card, the same way the existing portals do.
- Maintenance mode, and updating the demo to the meat-shop spec.

## Approaches considered
- **A. Whole modules (chosen):** matches the spec, fast to build, and easy to demo.
- **B. Module switches plus a per-action matrix for the Super Admin:** more control, but it duplicates role permissions. Deferred.

## Design
- **Data:** `AppState.platform = { signedIn, modules: Record<ModuleKey, {on, reason?, changedAt?}>, limits: Record<LimitKey, number>, smsUsed, log: PlatformLog[] }`.
  - `STATE_VERSION` goes from 4 to 5, so the demo data reseeds once.
- **Module catalog** (`src/lib/platform.ts`): each module has a key, label, description and route prefixes.
  - Core screens are always on: Dashboard, Live Orders, Products, Users & Roles, Settings and Audit Log.
- **Enforcement:**
  - `moduleOn(s, key)` and `moduleForPath(path)` decide what is available.
  - Sidebar items carry a `module`, and switched-off items are filtered out.
  - `DashboardLayout` shows a ModuleOff screen when the current path belongs to a module that is off.
  - The Shopper App and Rider App pages check their own module.
  - The login page hides portals whose module is off.
- **Limits:** `guardLimit(key)` runs before each add action: add city, add branch, invite staff, approve rider, create product and CSV import. It shows a toast and returns false when the limit is reached.
- **Suspended Super Admin:** `DashboardLayout` shows an "Account suspended by Platform Owner" screen.

## Builder's calls (mine)
- **Demo limits:** cities 4, branches 8, staff 15, riders 12, products 100, SMS 1,000 per month.
- **Platform look:** a dark slate sidebar, so it reads as a different console from the blue client one. On phones the sidebar becomes a top bar.
