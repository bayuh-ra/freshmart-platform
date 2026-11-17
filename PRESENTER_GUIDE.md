# Jovanne’s Meat Shop — Presenter Guide (meat shop demo)

> **Addresses:** Customer website `http://localhost:3100/` · Rider website `http://localhost:3100/rider` · Staff sign-in `http://localhost:3100/staff` · Platform Owner `http://localhost:3100/platform`. Every page works on phone, tablet and desktop — open the customer site on your phone (same Wi-Fi: `http://<this-laptop-IP>:3100/`) to show it live.

## Before the meeting (5 minutes)

1. **After pulling new code, build once:** open a terminal in this folder and run `npm run build`. `start-demo.bat` only builds when no build exists yet, so without this step it would start the **old** build.
2. Double-click `start-demo.bat`. Wait until the browser opens `http://localhost:3100/staff`.
3. Click through each page once before the client joins, so you know every screen opens.
4. If data looks messy after rehearsing: top-right user menu → **Reset demo data**. (In the Customer website, sign out and sign in again with the demo login below.)
5. Keep the black command window open the whole time. Closing it stops the demo.

Needs internet only for the map tiles (OpenStreetMap). Everything else runs locally.

## What this is

A clickable, working prototype for **Jovanne’s Meat Shop**, one meat shop branch in **Digos City**. All screens share **one live data set**:

| App | Open | Shows |
|---|---|---|
| Admin Dashboard | `/dashboard` | Products & cut options, prices, stock & Direct Receiving, riders, settings, staff, reports |
| Order Desk | `/orders` | Digos branch, Cashier: confirm, actual weight, cut notes, insulated-bag pack check, assign rider, pickup |
| Customer website | `/` (the shop website) | Phone browser: sign up with Google, order meat by weight with cut options, pay, track |
| Rider website | `/rider` | Own riders: jobs, insulated-bag check at pickup, delivery countdown, proof of delivery, COD |
| Platform Owner | `/platform` | LAP IT Solutions only: module switches, plan limits, Super Admin access |

The admin screens also work on a phone or tablet: the sidebar becomes a menu button (☰) at the top left.

Same tech stack and look as our CRM: Next.js 16 + React 19, Tailwind CSS 4, shadcn/ui, lucide icons, Recharts, Sonner, LAP royal-blue design system.

Sample data: 1 branch (Digos), about 100 products (Beef, Pork, Chicken first, then Processed Meats, Seafood, Groceries), 15 cut & preparation options, own riders only, sample customers and about two weeks of order history.

## Demo script (about 15 minutes)

### 1. The big picture — 1 min
Login page → the four apps plus the dark **Platform Owner** card. "One live data set: what the customer does shows on the Order Desk at once."

### 2. Platform Owner controls the plan — 2 min
1. Login page → **Platform Owner** → **Sign in as LAP IT Owner (demo)**.
2. **Modules**: switch a module off (for example Promotions) → open the Admin Dashboard in another tab: the menu item is gone. Switch it back on.
3. **Limits**: show the product / staff / rider limits. Adding a product beyond the limit is blocked in the Admin Dashboard.
4. **Super Admin access**: the Platform Owner can sign the client's Super Admin out or lock permissions. Client users, including the Super Admin, cannot open this console.

### 3. A customer orders meat — 4 min (the "wow" moment)
1. Open **Order Desk** in one browser tab and **Customer website** in a second tab, side by side.
2. Customer website → **Sign up with Google** → pick the account → **complete the profile** (name, username, password, phone, address). No OTP code is needed.
   - Or sign in with the demo customer: **mariasantos / demo1234**.
3. Open **Pork Liempo** (or any Beef / Pork / Chicken item):
   - pick a **weight** (0.5 / 1 / 1.5 / 2 kg; minimum 0.25 kg),
   - pick a **cut option** (Sliced, Cubed, For adobo, For BBQ…; some have a small fee),
   - point out the **cold-chain notice**: fresh and frozen items travel in an insulated bag with ice packs and have a maximum delivery time.
4. Cart → Checkout → pay → place order. The Order Desk tab **beeps and shows the new order at once**.

### 4. The Order Desk prepares it — 3 min
Order Desk → open the order:
- **Pick list** shows each cut note (e.g. "Sliced", "For adobo") so the butcher cuts it right.
- Enter the **actual weight** of each weighted item. Within the **weight tolerance** (Settings → Meat & cold chain, default 10%) the new price is applied automatically; a bigger difference asks the customer first.
- **Pack check**: confirm the **insulated bag + ice packs** before the order can be marked Ready.
- **Assign an own rider** (distance, workload and rating are shown).

### 5. The rider delivers — 2 min
Rider website (Jomar Villar) → accept the job → **confirm the insulated bag** at pickup → the **delivery countdown** starts (maximum minutes for fresh/frozen orders) → the customer's map shows the rider moving → proof of delivery → Delivered.

### 6. Back office — 3 min
- **Inventory → Direct Receiving**: record a supplier delivery straight into stock (no purchase order): supplier, delivery receipt number, weight, cost, batch and expiry. Large receipts wait for approval.
- **Products**: edit a product → **Storage** (Fresh/chilled, Frozen, Shelf-stable), **Weight choices** and **Minimum weight** for items sold by weight, and the **Cut & preparation options** it offers. Then the **Cut & prep options** tab: add an option, change a fee, switch one off. Every change is in the **Audit Log**.
- **Settings → Meat & cold chain**: weight tolerance, maximum delivery time, insulated bag required.
- **Users & Roles**: three fixed roles: Super Admin, Admin, Cashier. Top-right menu → **View as → Ana Cruz (Cashier)**: the menu shrinks to what a cashier may see. Switch back to Hannah Admin.
- **Dashboard / Reports**: today's sales, sales by category (Beef, Pork, Chicken…), top sellers in kg, CSV export.

## Demo accounts

Staff (top-right menu → **View as**):

| Person | Role | Use it to show |
|---|---|---|
| Hannah Admin | Super Admin | Everything the plan allows (default) |
| Mark Lim | Admin | Runs the branch: orders, products and prices, stock and receiving, riders, reports, approvals |
| Ana Cruz | Cashier | Order Desk only: confirm, weigh, pack, assign rider; no prices or settings |

Customer website demo login: **mariasantos / demo1234** (Maria Santos). Rider website: **Jomar Villar** (own rider).

## Honest notes for Q&A

- This is a **prototype for scope sign-off**, not the production system. Data is stored in the browser, so the demo works from any laptop.
- Production plan: backend API with a database, real-time updates, payment gateway, SMS/push. The Customer website and Rider website run in the phone's browser; the screens and business rules shown here carry over.
- Phase 2 items to raise with the client: custom staff roles, more branches, courier partners.

## If something goes wrong

- Page blank or stuck → refresh the browser (F5).
- Data in a strange state → top-right menu → Reset demo data.
- Old screens or wording after pulling new code → close the black window, run `npm run build`, then double-click `start-demo.bat` again.
- Server not running → close the black window, double-click `start-demo.bat` again.
