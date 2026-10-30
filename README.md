# SabbyBestCollection storefront

A polished, responsive Next.js ecommerce storefront with customer shopping and a private product-management workspace.

## Run locally

```bash
npm run dev
```

Visit `http://localhost:3000` for the customer storefront.

Without `DATABASE_URL`, local development shows the sample product catalogue. Database-backed features, including customer accounts, orders, and product management, require PostgreSQL to be configured as described below.

## Private admin workspace

The admin workspace is intentionally unlinked from the storefront and excluded from search indexing. Its route is `/admin`. From the dashboard, admins can update the three home-page hero images by uploading replacements and saving the changes.

Before using it, copy `.env.example` to `.env.local` and set the admin and PostgreSQL values:

```bash
ADMIN_USERNAME=your-admin-username
ADMIN_PASSWORD=use-a-long-unique-password
ADMIN_SESSION_SECRET=use-a-random-secret-with-at-least-32-characters
DATABASE_URL=postgresql://postgres.project-ref:URL-ENCODED-PASSWORD@pooler-host:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.project-ref:URL-ENCODED-PASSWORD@pooler-host:5432/postgres
```

You can generate a suitable session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Set `DATABASE_URL` and `DIRECT_URL` to PostgreSQL connection strings. For Supabase-hosted PostgreSQL, use the pooler connection on port `6543` with `pgbouncer=true` for `DATABASE_URL`, and port `5432` for `DIRECT_URL`. URL-encode reserved characters in the password (for example, `@` becomes `%40`). Apply the Prisma schema and generate its client with:

```bash
npx prisma db push
npx prisma generate
npx prisma db execute --schema prisma/schema.prisma --file prisma/enable-rls.sql
npm run db:seed
```

The seed command removes the six retired skincare demo products by their original IDs, adds the current starter catalogue, and leaves other products unchanged. You can remove the sample products from the admin workspace as you replace them with your own catalogue. The application connects to PostgreSQL only from server routes through Prisma. Do not expose database credentials to browser code. Restart the development server after editing `.env.local`.

After applying the schema, admins can change their password from the dashboard. The new password is scrypt-hashed in the `admin_credentials` table; `ADMIN_PASSWORD` remains the bootstrap password until the first change. Changing it signs out other admin sessions while keeping the current session active. For password recovery, delete the `admin` row from `public.admin_credentials` in a trusted database console; the configured `ADMIN_PASSWORD` can then be used to sign in again.

On Vercel or another serverless host, add these variables in the project’s production environment settings. The admin username and password never reach the browser as configuration values. A successful sign-in creates an HMAC-signed, HTTP-only, SameSite-Strict session cookie containing the signed-in username; it expires after eight hours, and production cookies are HTTPS-only.

## Database-backed store

Products, product images, customer profiles, sessions, carts, wishlists, and orders are stored in PostgreSQL. Customer sign-up and login use database-backed accounts with scrypt-hashed passwords and HTTP-only session cookies. Phone sign-in requires both the account password and a fresh SMS verification code before a session is created; email sign-in continues to use the password. Email-based password recovery is not available until an email delivery provider is configured. Orders use server-calculated prices and totals and proceed to an in-app payment screen after checkout. Orders remain `awaiting_payment` until Paystack is integrated and payment can be verified; the current screen does not collect payment or redirect customers to an external page. Guest cart and wishlist data are kept only in page memory and are merged into the account after sign-in; they are not saved in browser storage. No card details are collected or processed.

The API validates the HTTP-only customer session cookie and only returns orders belonging to that customer. The admin dashboard has a separate admin-session-protected orders view, polls for new orders every 30 seconds while open, and can show browser notifications after the admin enables them. Browser notifications require the dashboard to remain open and permission to be granted. Database tables have row-level security enabled; all database access stays in server routes. Do not add public RLS policies for these tables.

Before accepting real payments, connect a payment provider and implement verified payment callbacks and order status updates.

Customer sign-up verifies the chosen email or phone number before allowing account creation. Configure `RESEND_API_KEY` and `RESEND_FROM_EMAIL` for email verification, and `ARKESEL_API_KEY` plus a registered `ARKESEL_SENDER_ID` for SMS verification. These values must be server-side environment variables; do not expose or commit provider keys. After verifying contact and creating a password, customers are sent to password-only login.

Add these values to `.env.local` for local development and to the deployment environment for production:

```dotenv
RESEND_API_KEY=your-resend-api-key
RESEND_FROM_EMAIL=SabbyBestCollection <verified-sender@example.com>
ARKESEL_API_KEY=your-arkesel-main-api-key
ARKESEL_SENDER_ID=your-registered-sender-id
```

## Checks

```bash
npm run lint
npm run build
```

`npm run build` automatically runs `prisma db push` and regenerates Prisma Client when
`DATABASE_URL` is configured. The command does not accept destructive changes
automatically; it fails and requires explicit review if Prisma detects potential data loss.
