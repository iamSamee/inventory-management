# Inventory Management

A single-user, desktop-oriented inventory tracker: scan/type barcodes to move
stock in and out, and view a live overview with low-stock highlighting.

- **Framework:** Next.js (App Router) — React frontend + API routes in one project
- **Database:** PostgreSQL via [Neon](https://neon.tech)
- **ORM:** Prisma
- **Auth:** single hardcoded user (bcrypt-hashed password), JWT in an
  httpOnly + secure cookie, verified on every request via `src/proxy.ts`
  (Next.js's middleware/proxy convention)
- **Deployment target:** Vercel

## Project layout

- `prisma/schema.prisma` — `User`, `Item`, `Transaction` models
- `prisma/seed.ts` — creates the single user (run once against your DB)
- `src/proxy.ts` — verifies the session JWT on every request, redirects to
  `/login` (or returns 401 for `/api/*`) when missing/invalid
- `src/app/login` — login page
- `src/app/(dashboard)` — protected pages: `overview`, `in`, `out`
- `src/app/api` — auth, items, transactions, and CSV export routes

## Local setup

This project is linked to the Neon project **inventory-management**
(`rough-rice-20528201`, org `org-old-scene-56221479`) — see `.neon` (created
by `neon link`, gitignored). To work with it:

1. Install dependencies:

   ```bash
   npm install
   ```

2. Pull the branch's connection strings into `.env`:

   ```bash
   npx neon@latest env pull
   ```

   This writes `DATABASE_URL` (pooled, used at runtime) and
   `DATABASE_URL_UNPOOLED` (direct, used by `prisma migrate`) into `.env`.
   Add the two app-specific values it doesn't manage:

   - `JWT_SECRET` — generate with `openssl rand -base64 32`
   - `SEED_USERNAME` / `SEED_PASSWORD` — the one login this app will ever have

   (Working against a fresh Neon project instead? Copy `.env.example` to
   `.env` and fill in `DATABASE_URL`/`DATABASE_URL_UNPOOLED` by hand from
   Neon's Connect dialog — pooled and direct connection strings
   respectively.)

3. Apply the schema to the database (already applied on `production`; only
   needed again after a schema change or on a fresh branch):

   ```bash
   npx prisma migrate deploy
   ```

4. Create the user:

   ```bash
   npm run db:seed
   ```

5. Run the dev server:

   ```bash
   npm run dev
   ```

   Visit http://localhost:3000 and sign in with the `SEED_USERNAME` /
   `SEED_PASSWORD` you set above.

## Deploying to Vercel

1. Push this project to a Git repository and import it into Vercel.
2. In the Vercel project's Environment Variables, set `DATABASE_URL`,
   `DATABASE_URL_UNPOOLED`, and `JWT_SECRET` (same values as your local
   `.env`). `SEED_USERNAME`/`SEED_PASSWORD` are only needed locally to run
   the seed script, not in the deployed environment.
3. Deploy. Vercel runs `npm run build`, which runs `prisma generate`
   automatically before `next build`.
4. Before (or after) the first deploy, run the migration and seed against
   the same Neon database, from your machine:

   ```bash
   npx prisma migrate deploy
   npm run db:seed
   ```

   (Both commands read `DATABASE_URL`/`DATABASE_URL_UNPOOLED`/
   `SEED_USERNAME`/`SEED_PASSWORD` from your local `.env`, so point it at
   the same Neon database Vercel is using before running them.)

## Notes

- Failed logins lock the account for 15 minutes after 5 consecutive
  failures. The lockout state lives in the `users` table (`failed_attempts`,
  `locked_until`), not in server memory, so it works correctly across
  Vercel's stateless serverless functions.
- Inventory In/Out work in session (cart) mode: scans build up a list on
  screen, and nothing is written to the database until "Done — complete
  transaction" is clicked, which commits every line as one batch. "Undo
  last session" reverses every line from the most recently completed batch
  on that page (tracked in local page state, reset on navigation/reload) —
  it is not a global undo across all history.
- Full transaction history is stored in the `transactions` table and can be
  queried directly (via `prisma studio` or SQL) even though there's no
  dedicated history page yet.
