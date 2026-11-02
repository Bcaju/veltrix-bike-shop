# VELTRIX Admin Upgrade (v2)

## Included
- Mongolian storefront with product search and cart
- Order checkout, delivery fee, coupon discount
- Admin login (JWT token expires after 12 hours)
- Product create/edit/archive, stock and featured flag
- Order status and payment status management
- Sales overview and low-stock count
- Coupon create/delete
- MongoDB Atlas persistence
- Optional Cloudinary configuration fields and signed upload support

## Important setup
This version requires MongoDB Atlas. Create a database and set `MONGODB_URI` in Render.
Set `ADMIN_PASSWORD` and a long random `JWT_SECRET` in Render Environment.
Cloudinary is optional; without it, paste an image URL into the product form.
Do not paste passwords or API keys into chat or commit `.env` files.

## Deploy
1. Replace the contents of your project with these files (keep a backup of the old folder).
2. Push the updated files to GitHub `main`; Render auto-deploys.
3. In Render > your service > Environment, set:
   - `MONGODB_URI`
   - `ADMIN_PASSWORD`
   - `JWT_SECRET` (generate a long random value)
   - Cloudinary values only if using Cloudinary.
4. Open `https://veltrix-bike-shop.onrender.com/admin`.

## Notes
- Payment is recorded manually; this does not charge bank cards or integrate QPay/MonPay.
- Coupon discount is applied to the order total before delivery fee.
- Product delete archives the item instead of permanently deleting it.
- This is a starter production upgrade. Test checkout and admin flows before accepting real customer orders.
