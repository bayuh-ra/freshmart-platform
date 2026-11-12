# FreshMart Platform — Presenter Guide (11:00 client demo)

## Before the meeting (5 minutes)

1. Double-click `start-demo.bat` in this folder. Wait until the browser opens `http://localhost:3100/login` (first page load takes ~10–20 seconds while it compiles).
2. Click through each page once before the client joins, so every page is already compiled and opens instantly.
3. If data looks messy after rehearsing: top-right user menu → **Reset demo data**.
4. Keep the black command window open the whole time. Closing it stops the demo.

Needs internet only for the map tiles (OpenStreetMap). Everything else runs locally.

## What this is

A clickable, working prototype of all four applications in the spec, sharing **one live data set**:

| App | Open | Shows |
|---|---|---|
| Admin Dashboard | `/dashboard` | Head office: catalog, pricing, inventory, riders, settings, roles, reports |
| Order Desk (POS) | `/orders` | Branch: live board, confirm, pick, substitute, walk-in/phone orders, pickup |
| Shopper App | `/shopper` | Phone preview: browse, cart, checkout, pay, live tracking, chat |
| Rider App | `/rider` | Phone preview: job offers, pickup, navigation, proof of delivery, COD |

Same tech stack and look as our CRM: Next.js 16 + React 19, Tailwind CSS 4, shadcn/ui, lucide icons, Recharts, Sonner, LAP royal-blue design system (Inter + IBM Plex Sans).

Sample data: 3 cities (Davao, Cebu, CDO), 6 branches (one pickup-only: Toril; one paused: Mandaue), 40 products, 9 riders, 12 customers, ~300 orders of history.

## Demo script (about 15 minutes)

### 1. The big picture — 1 min
Login page → explain the four apps and "one live data set".

### 2. A shopper places an order — 3 min  (the "wow" moment)
1. Open **Order Desk** in one browser tab, **Shopper App** in a second tab. Put them side by side.
2. In the Shopper App: Home → add items → Cart → Checkout.
3. Show: delivery fee calculated by admin rules, voucher code `FRESH10` (works) and `PAYDAY50` (expired, shows reason), GCash payment.
4. Place order → the Order Desk tab **beeps and shows the new order instantly**.
   - Paid online (GCash/Maya/Card) → **auto-confirmed**, goes straight to Preparing.
   - Cash on delivery → waits in **Awaiting confirmation** for the cashier.

### 3. The branch prepares it — 3 min
Order Desk → open the order:
- Mark items picked; enter the actual weight of a weighted item (bananas) → total recalculates.
- Mark one item short → propose a substitute → shopper sees an approval card in the app.
- Pack check → Mark Ready → assign a rider (distance, workload, rating shown).
- Print pick list / receipt ("not an official receipt", per decision).

### 4. The rider delivers — 2 min
Rider App → accept job → confirm pickup → the shopper's map shows the rider **moving live** with ETA → proof of delivery → Delivered. Stock is deducted from the ledger at this moment.

### 5. Head office controls everything — 4 min
- **Settings**: switch scope Global → City → Branch; change "Auto-confirm orders paid online" for one branch; show the override badge. "Most specific setting wins."
- **Users & Roles**: permission matrix. Then top-right menu → **View as → Ana Cruz (Cashier)**: sidebar shrinks to what a cashier may see. Switch back to Hannah Admin.
- **Cities & Branches**: add a new branch in a new city with no code change (Chain C).
- **Price Lists**: price resolution explorer → pick **Carabao Mango**: Matina ₱175 (branch list) beats Lanang ₱185 (Davao city list) beats CDO ₱180 (global base price); Cebu ₱195 (Cebu city list).
- **Inventory**: stock ledger, available = on hand − reserved − safety buffer.
- **Audit Log**: every change you just made is recorded with who and when.

### 6. Reports & support — 2 min
Dashboard KPIs and charts, Reports with CSV export, Support Inbox reply to a shopper (appears in the Shopper App chat).

## Demo accounts (top-right menu → View as)

| Person | Role | Use it to show |
|---|---|---|
| Hannah Admin | Super Admin | Everything (default) |
| Mark Lim | Branch Manager, Matina | Manager-only actions: discounts, price overrides, large refunds, End-of-Day sign-off |
| Ana Cruz | Cashier, Matina | Order Desk only; no pricing or settings in the sidebar |
| Rhea Gomez | Support Agent | Support Inbox |
| Grace Tan | City Manager, Davao | Only Davao branches in the branch switcher |

Handy codes in the Shopper App checkout: `FRESH10` (works), `FREEDEL` (needs ₱1,000+), `WELCOME100` (needs ₱800+), `PAYDAY50` (expired).

## Honest notes for Q&A

- This is a **prototype for scope sign-off**, not the production system. Data is stored in the browser so the demo works offline from any laptop.
- Production plan (per spec §8): backend API with PostgreSQL, Redis, WebSockets, payment gateway (PayMongo/Xendit), SMS/push, native mobile apps (Flutter or React Native). The screens and business rules shown here carry over.
- Open items from the spec to raise with the client: courier partners, default confirmation timeout, stock-accuracy approach, team size/timeline for the February 2027 launch.

## If something goes wrong

- Page blank or stuck → refresh the browser (F5).
- Data in a strange state → top-right menu → Reset demo data.
- Server not running → close the black window, double-click `start-demo.bat` again.
