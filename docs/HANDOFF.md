# Handoff Notes (Nov 14, 2026)

## What exists

- **Demo app (this repo):** a clickable Next.js 16 prototype of the original *supermarket* spec. It has 4 parts that share one browser-stored data set:
  - Admin Dashboard
  - Order Desk
  - Shopper App
  - Rider App
- **Stack and design:** the same stack and design as the LAP CRM (Tailwind 4, shadcn/ui).
- **Starting the demo:** run `npm install` once, then double-click `start-demo.bat`. It opens http://localhost:3100/login.
- **Presenting:** `PRESENTER_GUIDE.md` has the demo script and the demo accounts.
- **Latest spec:** `docs/Meat-Shop-Platform-Specification-v6.docx`. The code has **not** been updated to this spec yet.

## Spec decisions since the demo (all in the v6 document)

1. **Business:** a meat shop selling mainly beef, pork and chicken, plus other groceries.
   - About 100 products.
   - 1 branch, around Digos City.
   - Budget: PHP 500,000.
2. **Websites only:** no iOS or Android apps. The Customer App and Rider App are phone-friendly websites. Every screen for every user must work on phones and tablets.
3. **Platform Owner (LAP IT Solutions):**
   - A new role above the Super Admin.
   - Switches modules on or off.
   - Sets plan limits: branches, cities, staff, riders, products and the SMS allowance.
4. **Modules OFF at launch:** Purchase Orders, Walk-in orders, Phone orders and Phone OTP.
   - Stock comes in through **Direct Receiving**, which needs no purchase order.
5. **No "POS" wording:** use "Order Desk" and "Order Management".
   - The store's existing cashier system issues receipts.
   - The Order Desk is for monitoring, confirming, preparing and tracking orders.
6. **Riders:** the company's own riders only. No freelance riders or courier partners.
7. **Shopper accounts:**
   - **Sign-up:** with Google or with a username and password. Google sign-ups must still create a username and password.
   - **Required profile:** first name, last name, phone number, and address with a map pin.
   - **Log-in:** with either Google or the username and password.
   - **No OTP.**
8. **Meat features:**
   - Meat is sold per kg, and the actual weight is entered at packing.
   - Cut and preparation options (sliced, cubed, ground, etc.).
   - Fresh or frozen labels, insulated bags, and a maximum delivery time.
9. **Budget scope:** Phase 1 is trimmed to one branch. Everything else is Phase 2. See "Budget Scope" in the v6 document.

## Open items

- Confirm three budget trade-offs with the boss:
  - Refunds are done by hand in the payment gateway's dashboard.
  - Staff call the shopper about unavailable items.
  - The branch phone number is shown instead of support chat.
- Confirm the example values: weight tolerance ±10% and a 60-minute maximum delivery time.
- Updating the demo code to the meat-shop spec has **not started**.
