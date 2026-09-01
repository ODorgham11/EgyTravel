# Limousine Intercity Booking Platform — Architecture & Build Spec

## 1. Product summary

A web app for a limousine/intercity car service in Egypt (Uber-like, but for
long-distance trips between cities — airport transfers, Alexandria↔Cairo, any
city to any city). The company currently owns ~4 cars but can source
additional cars through its network on demand, so there is **no live
fleet-matching**. Instead:

1. A rider fills out a public booking form (no account required).
2. The system saves the trip request and **automatically notifies the
   admin/owner via WhatsApp**, with a link to a dashboard.
3. The **admin manually decides** the car, driver, plate number, color,
   exact pickup time, and price via the dashboard.
4. The system **automatically sends a confirmation message to the rider**
   via WhatsApp with the full trip details and a confirm action.
5. The rider confirms (or the request expires if no admin response in a
   configurable window).
6. Payment is either **online (card/wallet via Paymob)** or **offline
   (pay on arrival/cash)**.

Non-functional priority: **durability and availability under bursty summer
traffic**. This drives an always-on backend rather than a serverless model.

---

## 2. High-level architecture

```
┌─────────────┐      HTTPS       ┌──────────────┐
│  React SPA  │ ───────────────▶ │    Nginx     │
│ (static,    │ ◀─────────────── │ reverse proxy│
│  CDN-served)│                  │  + TLS + LB  │
└─────────────┘                  └──────┬───────┘
                                         │
                     ┌───────────────────┼───────────────────┐
                     ▼                   ▼                   ▼
              ┌─────────────┐    ┌─────────────┐     ┌─────────────┐
              │  API server │    │  API server │     │  API server │
              │ (Node/      │    │  replica 2  │     │  replica N  │
              │  Express)   │    │             │     │             │
              └──────┬──────┘    └──────┬──────┘     └──────┬──────┘
                     └──────────────────┼───────────────────┘
                                         │
              ┌──────────────────────────┼──────────────────────────┐
              ▼                          ▼                          ▼
      ┌───────────────┐          ┌───────────────┐          ┌───────────────┐
      │  PostgreSQL    │          │     Redis     │          │   BullMQ      │
      │  (+PgBouncer)  │          │ (cache, rate  │          │   workers     │
      │                │          │  limit, queue)│          │ (WhatsApp,    │
      └───────────────┘          └───────────────┘          │  reminders,   │
                                                              │  payments)    │
                                                              └───────┬───────┘
                                                                      │
                                         ┌────────────────────────────┼───────────────────┐
                                         ▼                                                 ▼
                                ┌─────────────────┐                             ┌─────────────────┐
                                │ Meta WhatsApp    │                             │  Paymob payment  │
                                │ Cloud API        │                             │  gateway          │
                                └─────────────────┘                             └─────────────────┘
```

Everything runs in Docker containers, orchestrated with `docker-compose`
locally and in production (or promoted to a small Swarm/K8s setup later if
needed — compose is enough at this scale).

---

## 3. Repository layout

Monorepo, two deployable apps + shared package:

```
limo-platform/
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.example
├── frontend/                 # React (Vite) SPA — public site + admin dashboard
│   ├── Dockerfile
│   ├── src/
│   │   ├── booking/          # public multi-step booking form
│   │   ├── admin/            # admin dashboard (protected)
│   │   ├── shared/           # shared UI components, api client
│   │   └── main.tsx
│   └── nginx.conf            # serves static build
├── backend/                  # Node.js + Express API + workers
│   ├── Dockerfile
│   ├── src/
│   │   ├── modules/
│   │   │   ├── trips/        # booking CRUD, status lifecycle
│   │   │   ├── admin/        # admin auth + assignment endpoints
│   │   │   ├── whatsapp/     # Meta Cloud API integration
│   │   │   ├── payments/     # Paymob integration + webhooks
│   │   │   └── cities/       # static/cached city list
│   │   ├── jobs/             # BullMQ queues + workers
│   │   ├── db/                # Prisma schema + migrations
│   │   ├── middleware/        # auth, rate-limit, validation, error handling
│   │   └── server.ts
│   └── prisma/schema.prisma
├── nginx/                    # reverse proxy config (prod)
│   └── nginx.conf
└── docs/
    └── architecture.md       # this document
```

---

## 4. Data model (Prisma schema, PostgreSQL)

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")        // PgBouncer connection pool
  directUrl = env("DIRECT_DATABASE_URL") // Direct DB connection for migrations
}

generator client {
  provider = "prisma-client-js"
}

model Trip {
  id                 String   @id @default(uuid())
  pickupCity         String
  destinationCity    String
  requestedAt        DateTime          // when the rider wants to travel
  passengerCount     Int
  luggageSmall       Int      @default(0)
  luggageMedium      Int      @default(0)
  luggageLarge       Int      @default(0)
  luggageBackpack    Int      @default(0)
  luggageLaptop      Int      @default(0)
  extraPreferences   String?
  riderName          String
  riderPhone         String            // WhatsApp contact, no account needed
  status             TripStatus @default(PENDING)
  cancelledBy        CancelledBy?      // who initiated the cancellation
  cancellationReason String?
  cancelledAt        DateTime?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  assignment         TripAssignment?
  payment            Payment?
}

enum TripStatus {
  PENDING     // submitted, admin not yet responded
  ASSIGNED    // admin filled in car/driver/price, awaiting rider confirm
  CONFIRMED   // rider confirmed
  EXPIRED     // admin didn't respond in time / rider didn't confirm in time
  CANCELLED
  COMPLETED
}

enum CancelledBy {
  RIDER
  ADMIN
  SYSTEM   // e.g. expiry job converted to cancellation
}

model TripAssignment {
  id                         String   @id @default(uuid())
  trip                       Trip     @relation(fields: [tripId], references: [id])
  tripId                     String   @unique
  car                        Car      @relation(fields: [carId], references: [id])
  carId                      String
  driver                     Driver   @relation(fields: [driverId], references: [id])
  driverId                   String
  price                      Decimal
  currency                   String   @default("EGP")
  exactPickupTime            DateTime
  paymentMethod              PaymentMethod
  confirmationToken          String   @unique @default(uuid())
  confirmationTokenExpiresAt DateTime
  assignedBy                 Admin    @relation(fields: [assignedById], references: [id])
  assignedById               String
  assignedAt                 DateTime @default(now())
}

enum PaymentMethod {
  ONLINE
  OFFLINE
}

model Car {
  id           String   @id @default(uuid())
  model        String
  color        String
  plateNumber  String
  capacity     Int
  owned        Boolean  @default(true) // false = sourced from network
  assignments  TripAssignment[]
}

model Driver {
  id          String   @id @default(uuid())
  name        String
  phone       String
  isExternal  Boolean  @default(false) // true = external network driver
  assignments TripAssignment[]
}

model Admin {
  id           String   @id @default(uuid())
  phone        String   @unique
  passwordHash String
  assignments  TripAssignment[]
}

model Payment {
  id          String   @id @default(uuid())
  trip        Trip     @relation(fields: [tripId], references: [id])
  tripId      String   @unique
  method      PaymentMethod
  amount      Decimal
  currency    String   @default("EGP")
  status      PaymentStatus @default(PENDING)
  gatewayRef  String?       // Paymob transaction id
  paidAt      DateTime?
  refundedAt  DateTime?
}

enum PaymentStatus {
  PENDING
  PAID
  FAILED
  REFUNDED
}
```

---

## 5. Backend module responsibilities

### `modules/trips`
- `POST /api/trips` — public, rate-limited, validated. Creates a `Trip` with
  status `PENDING`. Enqueues a `whatsapp:notify-admin` job.
- `GET /api/trips/:id` — public, for the rider to check status via a link.
- `POST /api/trips/:id/confirm` — public (token-protected via secure
  `confirmationToken` query param / body payload, checked against
  `confirmationTokenExpiresAt`), moves `ASSIGNED` → `CONFIRMED`.
- `POST /api/trips/:id/cancel` — public (same token-protected pattern as
  confirm). Rider-initiated cancellation. Requires `reason` in body.
  Allowed transitions: `PENDING` → `CANCELLED`, `ASSIGNED` → `CANCELLED`.
  Sets `cancelledBy: RIDER`. If an online payment is already `PAID`,
  enqueues `payment:refund` job. Enqueues `whatsapp:notify-admin-cancelled`.

### `modules/admin`
- `POST /api/admin/login` — rate-limited, issues a JWT/session.
- `GET /api/admin/trips` — list pending/assigned/confirmed trips.
- `POST /api/admin/trips/:id/assign` — creates `TripAssignment` with a generated
  `confirmationToken` and expiry window. Validates car/driver availability to prevent
  overlapping trip double-bookings. Moves trip to `ASSIGNED`, enqueues
  `whatsapp:notify-rider` job.
- `POST /api/admin/trips/:id/cancel` — admin-initiated cancellation. Requires
  `reason` in body. Allowed from any active status (`PENDING`, `ASSIGNED`,
  `CONFIRMED`). Sets `cancelledBy: ADMIN`. If an online payment is `PAID`,
  enqueues `payment:refund` job. Enqueues `whatsapp:notify-rider-cancelled`.
- All routes behind auth middleware; passwords hashed with bcrypt/argon2.

### `modules/whatsapp`
Wraps the Meta WhatsApp Cloud API.
- `sendTripNotification(trip)` — uses a pre-approved message **template**
  (required for business-initiated messages), includes trip summary + admin
  dashboard link.
- `sendConfirmationRequest(trip, assignment)` — template message to rider
  with car/driver/price/time + tokenized confirm link.
- `sendCancellationNotice(trip, cancelledBy)` — template message to the
  other party (admin-cancelled → notify rider, rider-cancelled → notify
  admin) with trip reference and reason.
- `POST /api/webhooks/whatsapp` — receives delivery/read receipts and
  inbound messages; **verify Meta's webhook signature** on every request.

### `modules/payments`
Wraps Paymob (supports cards, mobile wallets, and Fawry cash references —
one integration covers both your online and offline-but-trackable needs).
- `POST /api/payments/:tripId/initiate` — for online payments, returns a
  Paymob iframe/checkout URL.
- `POST /api/webhooks/paymob` — payment status callback; **verify HMAC
  signature** before trusting the payload.
- `POST /api/payments/:tripId/refund` — handles refunds for online payments if a
  trip is cancelled or expired post-payment, updating status to `REFUNDED`.
- Offline payments just record `method: OFFLINE`, `status: PENDING` and get
  marked `PAID` manually by the admin on trip completion.

### `jobs/` (BullMQ, Redis-backed)
- `whatsapp:notify-admin`, `whatsapp:notify-rider` — retryable sends.
- `whatsapp:notify-admin-cancelled`, `whatsapp:notify-rider-cancelled` —
  cancellation notice sends (retryable).
- `payment:refund` — initiates Paymob refund for paid online trips that get
  cancelled; updates `Payment.status` → `REFUNDED`, sets `refundedAt`.
- `trip:expire-check` — scheduled job, expires `PENDING` trips with no admin
  response after N minutes (configurable), and `ASSIGNED` trips with no
  rider confirmation after N minutes. Optionally re-notifies admin/rider
  before expiry.

### `middleware/`
- `rateLimiter` — Redis-backed, applied to public endpoints (especially
  `POST /api/trips`).
- `validateRequest` — schema validation (zod/joi) on every input, server-side,
  independent of client-side validation.
- `authGuard` — JWT verification for admin routes.
- `errorHandler` — centralized, never leaks stack traces or internals to
  the client in production.

---

## 6. Frontend structure

### Public booking flow (`frontend/src/booking/`)
Multi-step form matching the 6 steps:
1. Pickup city (searchable dropdown, fixed list of major Egyptian cities)
2. Destination city (same list, excludes pickup city)
3. Date & time picker
4. Passenger count (stepper input)
5. Luggage — count per type: small, medium, large, backpack, laptop bag
6. Extra preferences (optional free text)

Then rider name + phone number (used as the WhatsApp contact — no
account/password). Submits to `POST /api/trips`, then shows a "request
sent, we'll message you on WhatsApp" confirmation screen with a status link.

### Admin dashboard (`frontend/src/admin/`)
- Login screen.
- List view: pending / assigned / confirmed trips, filterable.
- Assignment form: pick car (dropdown of owned cars + "external/network"
  option with free-text plate/model/color/driver), driver, price, exact
  pickup time, payment method.
- Trip history / completed trips view.

Both are React + Vite, built to static assets, served by Nginx — cheap to
scale, no server compute per page view.

---

## 7. WhatsApp integration notes (Meta Cloud API)

- Requires a Meta Business account + WhatsApp Business Platform access, a
  verified phone number, and **pre-approved message templates** for any
  business-initiated message outside a 24-hour customer service window
  (which applies to both the admin notification and the rider confirmation).
- Template approval can take from a few hours to a few days — start this
  early, in parallel with development, since it's the main external
  dependency/bottleneck.
- Store the access token and phone number ID as environment variables,
  never in code.
- Always verify inbound webhook signatures (`X-Hub-Signature-256`) using
  your app secret.

---

## 8. Payments (Paymob) notes

- Paymob is a standard Egyptian payment gateway supporting cards, mobile
  wallets (Vodafone Cash etc.), and Fawry cash-in references — all through
  one integration, which fits both your online and offline flows.
- Flow: create a Paymob "order" → get a payment token → redirect to Paymob's
  iframe/checkout → Paymob calls your webhook with the result → verify HMAC
  → update `Payment.status`.
- Never trust a client-side "payment succeeded" redirect alone — always
  confirm status via the server-to-server webhook.

---

## 9. Security checklist

- [ ] Server-side validation on every input (never trust client validation)
- [ ] Rate limiting on public endpoints (Redis-backed, e.g. 5 requests/min/IP
      on `POST /api/trips` and login routes, and on the `confirm`/`cancel`
      token endpoints to prevent token brute-forcing)
- [ ] Admin auth: hashed passwords (bcrypt/argon2), JWT with short expiry +
      refresh, no shared/hardcoded credentials
- [ ] Confirmation links secured with single-use high-entropy `confirmationToken`
      and expiry check (`confirmationTokenExpiresAt`)
- [ ] Double-booking check: validate car and driver schedule availability before
      confirming assignment
- [ ] Webhook signature verification for both Meta and Paymob callbacks
- [ ] HTTPS everywhere (TLS termination at Nginx, HTTP→HTTPS redirect)
- [ ] Dual DB URL configuration for Prisma (`DATABASE_URL` via PgBouncer, `DIRECT_DATABASE_URL` for migrations)
- [ ] All secrets (DB creds, WhatsApp token, Paymob keys, JWT secret) in
      environment variables / a secrets manager — never committed to git
- [ ] `.env` files gitignored; `.env.example` committed with placeholder keys
- [ ] SQL injection prevented by using Prisma's parameterized queries (no
      raw string-built SQL)
- [ ] CORS locked down to the actual frontend origin(s)
- [ ] No sensitive data (phone numbers, prices, tokens) in client-side
      console logs or error messages shown to users
- [ ] Database backups scheduled (daily, retained e.g. 14 days)
- [ ] Structured logging (no PII in plaintext logs) + basic monitoring/alerts

---

## 10. Docker & deployment

`docker-compose.yml` services: `frontend`, `backend`, `postgres`,
`pgbouncer`, `redis`, `nginx`. Backend service scaled via
`docker-compose up --scale backend=3` (or a `deploy.replicas` block if using
Swarm mode) so traffic spreads across replicas behind Nginx.

Suggested hosting: DigitalOcean / Hetzner / AWS EC2 with Docker + Docker
Compose (or promote to managed Kubernetes later if scale demands it) —
avoids serverless cold starts and gives predictable performance during the
summer rush.

Recommended environment separation:
- `docker-compose.yml` — local dev (hot reload, exposed DB port for
  debugging)
- `docker-compose.prod.yml` — production overrides (replicas, restart
  policies, no exposed DB port, resource limits)

---

## 11. Suggested build order

1. **Backend skeleton**: Express app, Prisma schema + migrations, Docker
   Compose with Postgres + Redis running locally.
2. **Trips module**: create trip endpoint + validation + rate limiting.
3. **Admin module**: auth, list trips, assignment endpoint.
4. **Frontend booking form**: wire to the trips API.
5. **Frontend admin dashboard**: wire to the admin API.
6. **WhatsApp integration**: start template approval process in parallel
   early; wire notification + confirmation sends once approved.
7. **Payments (Paymob)**: online payment flow + webhook.
8. **Background jobs**: BullMQ queues for WhatsApp sends + expiry checks.
9. **Security hardening pass** against the checklist in Section 9.
10. **Load testing** ahead of summer season (e.g. k6 or Artillery) against
    the containerized stack, tune replica count and DB connection pool size.

See [limo-implementation-phases.md](./limo-implementation-phases.md) for the
detailed phase-by-phase breakdown of each step above.

---

## 12. Production readiness definition

"Done" for this project means the app is not just feature-complete locally,
but genuinely ready to run on a live server without further setup work.
Concretely, before calling v1 finished, all of the following must hold:

- [ ] `docker-compose.prod.yml` builds and runs the full stack (frontend,
      backend, postgres, pgbouncer, redis, nginx) on a clean VPS with no
      manual patching
- [ ] Every secret (DB creds, JWT secret, WhatsApp token, Paymob keys) is
      read from environment variables set on the server — none hardcoded,
      none left as dev defaults
- [ ] Prisma migrations run cleanly against the production database via
      `prisma migrate deploy` (not `migrate dev`)
- [ ] TLS is live (Let's Encrypt/certbot or equivalent) and HTTP redirects
      to HTTPS
- [ ] DNS points at the server and the domain resolves correctly
- [ ] WhatsApp webhook URL and Paymob callback URL are registered against
      the live domain (not localhost/ngrok)
- [ ] `docker-compose.prod.yml` has no exposed database/Redis ports, sets
      container restart policies (`restart: unless-stopped` or `always`),
      and sets resource limits per service
- [ ] A database backup job is scheduled and has been tested by actually
      restoring from a backup at least once
- [ ] Structured logs are being written and are reachable (e.g. `docker
      logs`, or shipped to a log service) without exposing PII in plaintext
- [ ] Basic uptime/health monitoring is active (e.g. an external check
      hitting `GET /api/health`, plus a container-restart alert)
- [ ] A full real-world dry run has been completed on the live server: a
      real booking submitted, a real WhatsApp notification received, a real
      admin assignment made, a real rider confirmation, and (if applicable)
      a real or test-mode Paymob payment — not just tested locally
- [ ] A rollback plan exists: either a tagged previous Docker image/commit
      to redeploy, or a documented manual rollback procedure

This maps directly onto Phase 10 of the implementation phases doc — treat
that phase as mandatory, not optional polish, since it's what turns "runs
on my machine" into "ready for a server."

## 13. Open items to revisit later (out of v1 scope but worth noting)

- Driver-facing app/notification (currently drivers are just data fields).
- Rider accounts / trip history (explicitly out of scope for v1 — guest
  booking only).
- Multi-admin support (schema already supports it via the `Admin` model).
- Dynamic pricing/estimates before admin assignment.
