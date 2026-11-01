# VELTRIX BIKE SHOP — Монгол онлайн дугуйн дэлгүүр

Responsive storefront + Express API + JSON order storage + password-protected admin order panel.

## Run locally
1. Install Node.js 20 or newer.
2. In this folder run `npm install`.
3. Set `ADMIN_PASSWORD` environment variable (or create `.env` and use a dotenv loader if you add it).
4. Run `npm start`.
5. Open `http://localhost:3000` and admin at `http://localhost:3000/admin.html`.

For a quick local start on Linux/macOS:
`ADMIN_PASSWORD='your-long-password' npm start`

## Deploy on Render
- Create a new Web Service from this folder/repository.
- Build command: `npm install`
- Start command: `npm start`
- Add environment variable `ADMIN_PASSWORD` with a long private value.
- Important: JSON files on a free Render instance may reset on redeploy/restart. For real production orders, attach a persistent disk or move orders/products to MongoDB/PostgreSQL before taking live customer orders.

## Before public launch
- Replace demo product names/prices/stock in `data/products.json`.
- Add real product images and a real contact channel.
- Configure a persistent database/storage for orders.
- Confirm delivery, payment, refund and privacy terms.
