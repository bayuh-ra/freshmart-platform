# Tech Stack — Meat Shop Delivery & Ordering Platform (Production)

**Client:** JC Cusilit · **Built by:** LAP I.T. Solutions Inc.
**Status:** Proposed, 2026-11-26. Waiting for approval by the project lead.
**Scope source:** the client proposal dated 2026-11-20 (Phase 1, single branch).

---

## 1. Summary

| Layer | Choice |
|---|---|
| Language | TypeScript 5 |
| Web framework | Next.js 16 (App Router) + React 19 |
| Hosting | Cloudflare Workers, through the OpenNext adapter (`@opennextjs/cloudflare`) |
| Database | Cloudflare D1 (SQLite) |
| Database toolkit | Drizzle ORM + Drizzle Kit (migrations) |
| Login | Better Auth (username + password, Google sign-in) |
| File storage | Cloudflare R2 |
| Live updates | React Query polling every 5–10 s (Durable Objects later if needed) |
| Push notifications | Web Push (VAPID) |
| Email | Resend (transactional email over HTTP) |
| Payments | PayMongo (GCash, Maya, cards), confirmed. Cash on delivery first |
| Maps | Leaflet + OpenStreetMap; navigation by Google Maps or Waze links |
| UI | Tailwind CSS 4, shadcn/ui (Radix), lucide-react icons, sonner toasts, Recharts |
| Validation | Zod 4 |
| Domain, DNS, SSL | Cloudflare |

There are no iOS or Android apps. The customer site, Order Desk and rider portal are phone-friendly websites.

---

## 2. Why Cloudflare

The project lead chose Cloudflare in place of Vercel and Supabase. Each Vercel or Supabase job has a Cloudflare product that does it:

| Job | Vercel / Supabase | Cloudflare |
|---|---|---|
| Run the Next.js site | Vercel | Workers + OpenNext |
| Database | Supabase Postgres | D1 |
| Files and images | Supabase Storage | R2 |
| Real-time | Supabase Realtime | Polling now, Durable Objects later |
| Login | Supabase Auth | Not provided by Cloudflare. Better Auth runs inside our app |
| Scheduled jobs | Vercel Cron | Cron Triggers |

**Database choice: D1 (Option A).** It keeps everything on one provider with one bill. One branch with about 100 products is far below D1's 10 GB per database limit. The other option was Postgres (Neon) through Hyperdrive. It was not chosen because it adds a second provider.

---

## 3. Application

### 3.1 Front end (already built in the demo)

| Package | Version | Use |
|---|---|---|
| `next` | 16.2.x | Pages, routing, server code |
| `react`, `react-dom` | 19.2.x | UI |
| `tailwindcss` | 4.x | Styling |
| `@radix-ui/*` (shadcn/ui) | current | Dialogs, menus, selects, tabs, tooltips |
| `lucide-react` | current | Icons |
| `sonner` | 2.x | Toast messages |
| `recharts` | 3.x | Report charts |
| `leaflet` | 1.9.x | Maps (address pin, delivery zones, rider route) |
| `@tanstack/react-query` | 5.x | Fetching, caching, auto-refresh |
| `zod` | 4.x | Form and API input checks |

All screens in the demo are kept. Only the data layer changes. The demo reads and writes `localStorage` through `src/lib/store.tsx`. Production reads and writes the database through server code.

### 3.2 Server code

- **Next.js Route Handlers and Server Actions** run on Cloudflare Workers.
- **One data access layer** (`src/server/`) holds every database query. Pages never query the database directly.
- **Business rules are reused** from `src/lib/logic.ts`: prices, per-kg weight adjustment, rider pay (₱60 + ₱8/km), stock movements.
- **Every input is checked with Zod** before it reaches the database.
- **Every staff action is written to the activity log** (proposal: "Activity Logging").

### 3.3 Cloudflare-specific rules

1. Use `middleware.ts`, not Next 16's `proxy.ts`. `proxy.ts` is locked to the Node.js runtime, which Workers does not run.
2. Turn on the `nodejs_compat` flag in `wrangler.jsonc`.
3. Read D1, R2 and secrets through `getCloudflareContext()` from `@opennextjs/cloudflare`.
4. Keep the server bundle under 64 MiB uncompressed. Since September 2026 this is the only size limit, on both Free and Paid; the old 3 MB / 10 MB compressed limits were removed.
5. Use Cloudflare Images (or plain `<img>` with R2 URLs) for image resizing. The Vercel image optimizer is not available.

---

## 4. Database (D1 + Drizzle)

| Item | Choice |
|---|---|
| Engine | Cloudflare D1 (SQLite) |
| ORM | `drizzle-orm` (D1 driver) |
| Migrations | `drizzle-kit generate`, applied with `wrangler d1 migrations apply` |
| Money | Stored as integer centavos, never floating point |
| Weight | Stored as integer grams |
| Dates | Stored as UTC; shown in Asia/Manila time |
| IDs | Text IDs (for example `ord_…`) |

**Why Drizzle and not Prisma:** Drizzle has full D1 support and a small bundle. Prisma's D1 support is still marked preview, and its engine makes the bundle larger.

**Main tables** (taken from the demo's `src/lib/types.ts`):

- **People:** users, roles, permissions, customers, customer addresses, riders, staff
- **Catalog:** categories, products, product cut/preparation options, prices
- **Inventory:** stock levels, inventory ledger (every in/out movement), receiving, adjustments
- **Orders:** orders, order items (ordered weight and actual packed weight), order status history, proof of delivery, cash-on-delivery collections
- **Delivery:** zones, delivery fees, rider assignments
- **System:** settings, platform modules and plan limits, notifications, push subscriptions, activity log

**Rows-read rule:** D1 bills and limits by rows *scanned*, not rows returned (Free: 5 million read / 100,000 written a day). Every query that runs on a refresh timer must use an index and a small result set (for example "open orders of this branch", or "orders changed since the last refresh"). One unindexed scan of a few thousand orders every 5 seconds would pass the Free daily limit within hours.

**Backups:** D1 Time Travel (restore to any minute in the last 30 days on Workers Paid), plus a nightly export to R2 by a Cron Trigger.

---

## 5. Login and access (Better Auth)

| Need (from proposal / spec v6) | How |
|---|---|
| Customer registration and login | Username + password |
| Google authentication | Better Auth Google provider. Google sign-ups must still set a username and password |
| Required customer profile | First name, last name, phone, address with map pin |
| No OTP | No SMS or email codes at launch |
| Staff, rider, admin, super admin | Same login, role-based access |
| Platform owner (LAP) | Highest role: modules on/off and plan limits |

- Sessions are stored in D1 and sent as secure, HTTP-only cookies.
- Passwords are hashed by Better Auth.
- `middleware.ts` blocks pages by role. Every server action checks the role again.

---

## 6. Files (R2)

| What | Bucket path |
|---|---|
| Product images | `products/…` |
| Proof-of-delivery photos | `pod/…` |
| CSV product imports | `imports/…` |
| Nightly database exports | `backups/…` (private) |

Uploads go through signed URLs. Proof-of-delivery photos are private and visible only to staff.

---

## 7. Live updates and notifications

| Need | How |
|---|---|
| Real-time order monitoring (Order Desk) | React Query refresh every 5 s on open order screens |
| Rider live status | Rider app sends status changes; Order Desk refreshes every 5–10 s |
| Customer order tracking | Order page refreshes every 10 s |
| Push notifications | Web Push (VAPID keys) to the customer's and rider's browser |
| Low-stock alerts | Cron Trigger checks stock against the reorder point; alerts admins |
| Email (receipts of order, password reset) | Resend |

If polling becomes too slow or costly, live updates move to Durable Objects (WebSockets) without changing the screens.

---

## 8. Payments

1. **Launch:** cash on delivery and cash on pickup. Riders record collected cash; the Order Desk reconciles it.
2. **When the client's PayMongo merchant account is approved (PayMongo confirmed 2026-11-26):** PayMongo checkout for GCash, Maya, debit and credit cards. A PayMongo webhook marks the order as paid.
3. Refunds are done by hand in the PayMongo dashboard (budget trade-off, spec v6).
4. **Not included:** BIR-accredited receipts, invoicing or any POS. The store's existing cashier system issues official receipts.

---

## 9. Environments and deployment

| Environment | Git branch | Worker | D1 database | R2 bucket |
|---|---|---|---|---|
| Local | any | `wrangler dev` / `next dev` | local D1 | local R2 |
| Staging | `dev` | `meatshop-staging` | `meatshop-staging` | `meatshop-staging` |
| Production | `main` | `meatshop-prod` | `meatshop-prod` | `meatshop-prod` |

- **Deploy:** Cloudflare Workers Builds (connected to GitHub), or `opennextjs-cloudflare build && opennextjs-cloudflare deploy`.
- **Database migrations are applied by hand**, staging first, then production. Deploys never change the database on their own.
- **Secrets** (Google client secret, Better Auth secret, VAPID keys, Resend key, PayMongo keys) are stored with `wrangler secret put`, never in the repo.

---

## 10. Quality and monitoring

| Area | Tool |
|---|---|
| Type checks | `tsc --noEmit` |
| Linting | ESLint 9 (`eslint-config-next`) |
| Unit tests | Vitest for business rules and server code |
| Logs and errors | Cloudflare Workers Logs (Observability) |
| Uptime | Cloudflare health checks |

---

## 11. Monthly cost estimate

| Service | Estimate |
|---|---|
| Cloudflare Workers Paid (includes D1, R2 base, Cron) | US$5 (about ₱300) |
| R2 storage over the free tier | ₱0–₱100 |
| Resend email | Free tier (3,000 emails a month) |
| Domain (Cloudflare Registrar, at cost, from US$7.85 a year) | about ₱40–₱60 a month equivalent |
| **Total** | **about ₱350–₱500 a month** |

This is well under the ₱4,500–₱12,000 a month estimate in the client proposal. PayMongo fees are separate and paid by the client.

---

## 12. Build order

| Step | Work | Target |
|---|---|---|
| 1 | Cloudflare setup, D1 tables, login | Week 1 |
| 2 | Products, pricing, inventory | Week 2 |
| 3 | Customer ordering and checkout (cash on delivery) | Weeks 3–4 |
| 4 | Order Desk and rider portal | Weeks 4–5 |
| — | **Mid-development milestone** | **Jan 10, 2027** |
| 5 | Admin, reports, push notifications, PayMongo, platform owner controls | Jan–Feb 2027 |
| 6 | UAT | Feb 10, 2027 |
| 7 | Go-live | 4th week of March 2027 |

Later (client request): rename the shop and change the brand colors.

---

## 13. Open items

1. Project lead approval of this stack.
2. Domain name for the shop.
3. Three budget trade-offs from spec v6 ("Budget Scope") still need the boss's confirmation:
   - **Manual refunds:** refunds are done by staff in the PayMongo dashboard, not by a Refund button in our system.
   - **Unavailable items:** staff mark the item unavailable and phone the customer. There is no in-app "accept substitute / refund" approval.
   - **No chat:** the branch phone number is shown instead of support chat and customer-to-rider chat.

**Decided (2026-11-26):**
- Payment gateway: **PayMongo**.
- Cloudflare account: **owned by the client** (proposal Option A). LAP creates and sets it up for them.
