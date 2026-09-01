# Limousine Booking Platform — Implementation Phases

> **Purpose**: A step-by-step reference to follow before and during implementation.
> Every phase lists exactly what to build, in what order, what files to create,
> what to test, and what the "done" criteria look like — so you never have to
> guess what comes next.
>
> **Reference**: This document is a companion to
> [limo-webapp-architecture.md](./limo-webapp-architecture.md)
> which contains the full data model, endpoint specs, and security checklist.
>
> **The project is not considered finished until it is deployed and
> verified on a live server** — see Phase 10, which is a required final
> phase, not optional polish.

---

## Phase 0 — External Dependencies & Accounts (Do First, In Parallel)

These are **non-code tasks** with external lead times. Start them on Day 1 while
you scaffold code in Phases 1–3.

### 0.1 Meta WhatsApp Business Setup
- [ ] Create a Meta Business account (or use existing) at
      [business.facebook.com](https://business.facebook.com)
- [ ] Apply for WhatsApp Business Platform access
- [ ] Register and verify a dedicated business phone number (this number will
      send all automated messages — it cannot be your personal WhatsApp number)
- [ ] Create a Meta App → Add WhatsApp product → Generate a permanent access
      token (the test token expires in 24h, don't rely on it)
- [ ] Submit **message templates** for approval (this can take hours to days):
  - `trip_new_admin` — Notifies admin of a new booking request (trip summary +
    dashboard link)
  - `trip_assigned_rider` — Sends rider the car/driver/price/time details +
    confirm link
  - `trip_cancelled_rider` — Notifies rider their trip was cancelled by admin
    (includes reason)
  - `trip_cancelled_admin` — Notifies admin a rider cancelled (includes reason)
  - `trip_expiry_warning` — Optional: warns admin/rider before auto-expiry
- [ ] Note down: **Phone Number ID**, **WhatsApp Business Account ID**, **App
      Secret** (for webhook signature verification), **Access Token**

### 0.2 Paymob Account Setup
- [ ] Register at [accept.paymob.com](https://accept.paymob.com)
- [ ] Complete business verification / KYC
- [ ] Create integration IDs for the payment methods you need:
  - **Card payments** (Visa/Mastercard) — get the integration ID
  - **Mobile wallets** (Vodafone Cash, Orange Money, Etisalat Cash) — get the
    integration ID
  - **Fawry** (optional, for cash-at-kiosk references) — get the integration ID
- [ ] Note down: **API Key**, **Integration IDs** (one per payment method),
      **HMAC Secret** (for webhook signature verification)
- [ ] Configure the **Transaction Processed Callback URL** in the Paymob
      dashboard (will point to `https://yourdomain.com/api/webhooks/paymob` once
      deployed — use ngrok for dev)

### 0.3 Domain & Hosting
- [ ] Purchase/configure domain name
- [ ] Provision a VPS (DigitalOcean Droplet / Hetzner CX21 / AWS EC2 t3.small
      — 2 vCPU, 4 GB RAM is plenty to start)
- [ ] Point DNS A record to the server IP
- [ ] Set up SSH key access (disable password auth)

> [!IMPORTANT]
> **Don't block on this phase.** Template approvals and KYC can take days. Start
> coding Phase 1 immediately and circle back to wire the live credentials once
> approved.

---

## Phase 1 — Project Skeleton & Infrastructure

**Goal**: A running monorepo with Docker Compose, database, Redis, and the
Express app booting and responding to a health check. No business logic yet.

### 1.1 Initialize Monorepo

```
limo-platform/
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.example
├── .gitignore
├── README.md
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       └── server.ts           # Express app entry point
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── src/
│       └── main.tsx            # React entry point
└── nginx/
    └── nginx.conf              # reverse proxy config
```

**Steps**:
1. Create the root directory and initialize git
2. Scaffold `backend/` with `npm init`, install core dependencies:
   - `express`, `cors`, `helmet`, `compression`, `dotenv`
   - `typescript`, `ts-node-dev`, `@types/express`, `@types/node`
3. Scaffold `frontend/` using `npx -y create-vite@latest ./ --template react-ts`
4. Create `.env.example` with all placeholder keys:
   ```env
   # Database
   DATABASE_URL=postgresql://limo:limo@localhost:6432/limo
   DIRECT_DATABASE_URL=postgresql://limo:limo@localhost:5432/limo

   # Redis
   REDIS_URL=redis://localhost:6379

   # JWT
   JWT_SECRET=change-me
   JWT_EXPIRY=15m
   JWT_REFRESH_EXPIRY=7d

   # WhatsApp (Meta Cloud API)
   WHATSAPP_ACCESS_TOKEN=
   WHATSAPP_PHONE_NUMBER_ID=
   WHATSAPP_APP_SECRET=
   WHATSAPP_WEBHOOK_VERIFY_TOKEN=

   # Paymob
   PAYMOB_API_KEY=
   PAYMOB_CARD_INTEGRATION_ID=
   PAYMOB_WALLET_INTEGRATION_ID=
   PAYMOB_HMAC_SECRET=

   # App
   FRONTEND_URL=http://localhost:5173
   ADMIN_WHATSAPP_PHONE=          # admin's personal WhatsApp to receive notifications
   TRIP_PENDING_EXPIRY_MINUTES=60
   TRIP_ASSIGNED_EXPIRY_MINUTES=30
   ```
5. Create `.gitignore` (node_modules, .env, dist, .prisma)

### 1.2 Docker Compose (Dev)

Write `docker-compose.yml` with these services:

| Service      | Image                   | Ports (host:container)    | Notes                                    |
|-------------|-------------------------|---------------------------|------------------------------------------|
| `postgres`  | `postgres:16-alpine`    | `5432:5432`               | Volume for data persistence              |
| `pgbouncer` | `edoburu/pgbouncer`     | `6432:6432`               | Transaction pooling mode, max 100 conns  |
| `redis`     | `redis:7-alpine`        | `6379:6379`               | Persistence via appendonly                |
| `backend`   | Build from `./backend`  | `3000:3000`               | `ts-node-dev --respawn` for hot reload   |
| `frontend`  | Build from `./frontend` | `5173:5173`               | Vite dev server with HMR                 |

- Backend depends on `postgres`, `pgbouncer`, `redis`
- Frontend has no service dependencies (calls API via browser)
- All services share a custom Docker network

### 1.3 Express App Skeleton (`backend/src/server.ts`)

Create the bare Express app with:
- `helmet()` for security headers
- `cors()` configured with `FRONTEND_URL` from env
- `compression()` for response compression
- `express.json()` body parser
- Health check: `GET /api/health` → `{ status: "ok", timestamp: ... }`
- Placeholder 404 handler
- Centralized error handler (no stack traces in non-dev environments)

### 1.4 Prisma Setup

1. Install: `prisma`, `@prisma/client`
2. Run `npx prisma init` inside `backend/`
3. Copy the full schema from the architecture doc (Section 4) into
   `backend/prisma/schema.prisma` — including the `datasource` block with
   `url` + `directUrl`
4. Run `npx prisma migrate dev --name init` to generate the initial migration
5. Verify tables exist: connect to Postgres and check

### 1.5 Done Criteria
- [ ] `docker-compose up` boots all 5 services without errors
- [ ] `curl http://localhost:3000/api/health` returns `200 OK`
- [ ] Prisma migration applied, tables visible in Postgres
- [ ] Frontend Vite dev server loads at `http://localhost:5173`
- [ ] `.env.example` committed, `.env` gitignored

---

## Phase 2 — Trips Module (Backend)

**Goal**: The core booking endpoint — a rider can create a trip, and the system
stores it. No WhatsApp yet, no admin, just the data pipeline.

### 2.1 Module Structure

```
backend/src/
├── modules/
│   ├── trips/
│   │   ├── trips.router.ts       # Express router with route definitions
│   │   ├── trips.controller.ts   # Request handlers (thin — delegates to service)
│   │   ├── trips.service.ts      # Business logic (creates trip, status transitions)
│   │   ├── trips.validation.ts   # Zod schemas for input validation
│   │   └── trips.types.ts        # TypeScript interfaces/types
│   └── cities/
│       ├── cities.router.ts
│       ├── cities.controller.ts
│       └── cities.data.ts        # Static list of Egyptian cities
├── middleware/
│   ├── validateRequest.ts        # Generic Zod validation middleware
│   ├── rateLimiter.ts            # Redis-backed rate limiting
│   └── errorHandler.ts           # Centralized error handler
├── lib/
│   ├── prisma.ts                 # Prisma client singleton
│   └── redis.ts                  # Redis client singleton
└── server.ts
```

### 2.2 Cities Module

Create `cities.data.ts` with a curated static list of major Egyptian cities:
- Cairo, Alexandria, Giza, Hurghada, Sharm El Sheikh, Luxor, Aswan, Port Said,
  Suez, Ismailia, Ain Sokhna, El Gouna, Marsa Alam, Dahab, Taba, North Coast
  (Sahel), Mansoura, Tanta, Faiyum

Expose via:
- `GET /api/cities` → returns the full list `[{ id: "cairo", name: "Cairo",
  nameAr: "القاهرة" }, ...]`

### 2.3 Trips Endpoints

#### `POST /api/trips` — Create a new trip request
- **Middleware**: `rateLimiter` (5 req/min/IP), `validateRequest(createTripSchema)`
- **Validation** (Zod schema `createTripSchema`):
  ```
  pickupCity:       string, must be a valid city ID
  destinationCity:  string, must be a valid city ID, ≠ pickupCity
  requestedAt:      ISO datetime, must be in the future (≥ 2 hours from now)
  passengerCount:   int, 1–10
  luggageSmall:     int, 0–20, default 0
  luggageMedium:    int, 0–10, default 0
  luggageLarge:     int, 0–10, default 0
  luggageBackpack:  int, 0–10, default 0
  luggageLaptop:    int, 0–10, default 0
  extraPreferences: string, optional, max 500 chars
  riderName:        string, 2–100 chars
  riderPhone:       string, Egyptian phone format (+201XXXXXXXXX)
  ```
- **Service logic**:
  1. Create `Trip` record with `status: PENDING`
  2. (Placeholder) Log "Would enqueue whatsapp:notify-admin job" — actual
     enqueue comes in Phase 6
  3. Return `201` with `{ tripId, status, statusUrl }`
- **Response**: `{ tripId: "uuid", status: "PENDING",
  statusUrl: "/trip/uuid" }`

#### `GET /api/trips/:id` — Check trip status
- **Middleware**: `validateRequest` (UUID param check)
- **Service logic**: Fetch trip + assignment (if exists) from DB
- **Response**: Trip summary with status, assigned car/driver/time (if
  assigned), payment status (if exists). **Never expose** internal IDs, admin
  info, or confirmation tokens in this public response.

#### `POST /api/trips/:id/confirm` — Rider confirms assigned trip
- **Middleware**: `rateLimiter` (10 req/min/IP), `validateRequest`
- **Input**: `{ confirmationToken: string }`
- **Service logic**:
  1. Find trip, verify `status === ASSIGNED`
  2. Find assignment, verify `confirmationToken` matches
  3. Verify `confirmationTokenExpiresAt > now()`
  4. Transition trip to `CONFIRMED`
  5. If `paymentMethod === ONLINE`, return the Paymob checkout URL (Phase 7)
  6. If `paymentMethod === OFFLINE`, return confirmation success
- **Error cases**: Invalid token → 403, expired → 410 Gone, wrong status → 409

#### `POST /api/trips/:id/cancel` — Rider cancels trip
- **Middleware**: `rateLimiter` (10 req/min/IP), `validateRequest`
- **Input**: `{ confirmationToken: string, reason: string }` — reason is
  **required**, min 5 chars
- **Service logic**:
  1. Find trip, verify status is `PENDING` or `ASSIGNED`
  2. If `ASSIGNED`, verify `confirmationToken` matches
  3. Transition to `CANCELLED`, set `cancelledBy: RIDER`, `cancellationReason`,
     `cancelledAt`
  4. If payment exists and `status === PAID`, enqueue `payment:refund` job
  5. Enqueue `whatsapp:notify-admin-cancelled`
- **Error cases**: `CONFIRMED` status → 409 ("contact us to cancel"),
  `COMPLETED`/`CANCELLED`/`EXPIRED` → 409

### 2.4 Middleware Implementation

#### `validateRequest.ts`
- Generic middleware factory: takes a Zod schema, validates `req.body` /
  `req.params` / `req.query`
- Returns 400 with structured error messages on validation failure
- Strips unknown fields (Zod `.strict()` or `.strip()`)

#### `rateLimiter.ts`
- Uses `rate-limiter-flexible` with Redis store
- Configurable points/duration per route
- Returns 429 with `Retry-After` header on limit exceeded
- Applied to: `POST /api/trips` (5/min/IP), `POST /api/admin/login`
  (10/min/IP), `POST /api/trips/:id/confirm` and `POST /api/trips/:id/cancel`
  (10/min/IP each — prevents brute-forcing `confirmationToken` values even
  though tokens are single-use and expiring)

#### `errorHandler.ts`
- Catches all unhandled errors
- In development: return full error + stack trace
- In production: return generic message + error code, log full error server-side
- Handle Prisma-specific errors (unique constraint, not found, etc.) with
  appropriate HTTP status codes

### 2.5 Done Criteria
- [ ] `POST /api/trips` creates a trip in the DB and returns 201
- [ ] Invalid input returns 400 with clear error messages
- [ ] Rate limiter blocks the 6th request within 1 minute from same IP
- [ ] `GET /api/trips/:id` returns trip details
- [ ] `GET /api/cities` returns the city list
- [ ] Confirm and cancel endpoints return appropriate errors when called on a
      `PENDING` trip (no assignment yet)
- [ ] All error responses are structured, no stack traces leaked

---

## Phase 3 — Admin Module (Backend)

**Goal**: Admin can log in, see trips, assign a car/driver/price to a pending
trip, cancel trips, and manage cars/drivers.

### 3.1 Module Structure

```
backend/src/modules/admin/
├── admin.router.ts
├── admin.controller.ts
├── admin.service.ts
├── admin.validation.ts
├── auth.service.ts             # JWT issuance, refresh, password hashing
└── admin.types.ts
```

### 3.2 Auth

#### `POST /api/admin/login`
- **Middleware**: `rateLimiter` (10 req/min/IP)
- **Input**: `{ phone: string, password: string }`
- **Service logic**:
  1. Find admin by phone
  2. Verify password with `argon2.verify()` (prefer argon2 over bcrypt for new
     projects — better resistance to GPU attacks)
  3. Issue JWT access token (15 min expiry) + refresh token (7 day expiry,
     stored in httpOnly cookie)
  4. Return `{ accessToken, admin: { id, phone } }`
- **Error cases**: Invalid credentials → 401 (generic message, don't reveal
  whether phone exists)

#### `POST /api/admin/refresh`
- **Input**: Refresh token from httpOnly cookie
- **Service logic**: Verify refresh token, issue new access + refresh token pair
- **Error cases**: Invalid/expired refresh → 401

#### `authGuard` Middleware
- Extracts `Authorization: Bearer <token>` header
- Verifies JWT signature and expiry
- Attaches `req.admin = { id, phone }` to the request
- Returns 401 on missing/invalid/expired token

#### Admin Seed Script
- Create a one-time seed script (`backend/prisma/seed.ts`) that hashes a
  password and inserts the first admin record
- Run via `npx prisma db seed`
- **Never** hardcode the password — read from environment variable or prompt

### 3.3 Trip Management

#### `GET /api/admin/trips`
- **Middleware**: `authGuard`
- **Query params**: `status` (filter), `page`, `limit`, `sortBy`, `sortOrder`
- **Response**: Paginated list with total count:
  ```json
  {
    "trips": [...],
    "pagination": { "page": 1, "limit": 20, "total": 47, "totalPages": 3 }
  }
  ```
- Each trip includes rider info, assignment (if exists), payment (if exists)

#### `GET /api/admin/trips/:id`
- **Middleware**: `authGuard`
- Full trip detail including all relations (assignment, car, driver, payment)

#### `POST /api/admin/trips/:id/assign`
- **Middleware**: `authGuard`, `validateRequest(assignTripSchema)`
- **Input**:
  ```
  carId:           string (UUID)
  driverId:        string (UUID)
  price:           number (positive decimal, in EGP)
  exactPickupTime: ISO datetime (must be in the future)
  paymentMethod:   "ONLINE" | "OFFLINE"
  ```
- **Service logic**:
  1. Verify trip `status === PENDING`
  2. **Double-booking check**: Query for any `TripAssignment` where:
     - Same `carId` OR same `driverId`
     - AND associated trip status is `ASSIGNED` or `CONFIRMED`
     - AND `exactPickupTime` overlaps within a configurable buffer window
       (e.g., trip duration estimate + 2 hours). For v1, use a flat 6-hour
       buffer window since intercity trips vary in duration.
     - If overlap found → return 409 with details of the conflicting trip
  3. Create `TripAssignment` record (auto-generates `confirmationToken`)
  4. Set `confirmationTokenExpiresAt` = now + `TRIP_ASSIGNED_EXPIRY_MINUTES`
  5. Transition trip to `ASSIGNED`
  6. (Placeholder) Log "Would enqueue whatsapp:notify-rider" — Phase 6
  7. Return the assignment details

#### `POST /api/admin/trips/:id/cancel`
- **Middleware**: `authGuard`, `validateRequest(cancelTripSchema)`
- **Input**: `{ reason: string }` — required, min 5 chars
- **Service logic**:
  1. Verify trip status is `PENDING`, `ASSIGNED`, or `CONFIRMED`
  2. Transition to `CANCELLED`, set `cancelledBy: ADMIN`, `cancellationReason`,
     `cancelledAt`
  3. If payment exists and `status === PAID`, enqueue `payment:refund`
  4. Enqueue `whatsapp:notify-rider-cancelled`
  5. Return updated trip

#### `POST /api/admin/trips/:id/complete`
- **Middleware**: `authGuard`
- **Service logic**:
  1. Verify trip status is `CONFIRMED`
  2. Transition to `COMPLETED`
  3. If payment method is `OFFLINE` and payment status is `PENDING`, update
     payment to `PAID`, set `paidAt`
  4. Return updated trip

### 3.4 Car & Driver Management

#### Cars
- `GET /api/admin/cars` — list all cars (owned + external)
- `POST /api/admin/cars` — create a car
  - Input: `{ model, color, plateNumber, capacity, owned }`
- `PUT /api/admin/cars/:id` — update car details
- `DELETE /api/admin/cars/:id` — soft delete or prevent if active assignments

#### Drivers
- `GET /api/admin/drivers` — list all drivers
- `POST /api/admin/drivers` — create a driver
  - Input: `{ name, phone, isExternal }`
- `PUT /api/admin/drivers/:id` — update driver details
- `DELETE /api/admin/drivers/:id` — soft delete or prevent if active assignments

### 3.5 Done Criteria
- [ ] Admin login returns a JWT, invalid credentials return 401
- [ ] Protected routes reject requests without a valid token
- [ ] `GET /api/admin/trips` returns paginated, filterable trip list
- [ ] Assigning a trip transitions it to `ASSIGNED` and creates a `TripAssignment`
- [ ] Double-booking check returns 409 when car/driver has overlapping trips
- [ ] Admin cancel sets `cancelledBy: ADMIN` and transitions correctly
- [ ] Trip completion with offline payment auto-marks payment as `PAID`
- [ ] Car and driver CRUD endpoints work
- [ ] Seed script creates the first admin successfully

---

## Phase 4 — Frontend: Public Booking Form

**Goal**: A polished, mobile-first multi-step booking form that a rider uses to
submit a trip request. Plus a trip status page they can check via a link.

### 4.1 Project Structure

```
frontend/src/
├── booking/
│   ├── BookingPage.tsx           # Main multi-step form container
│   ├── steps/
│   │   ├── PickupCityStep.tsx    # Step 1: searchable city dropdown
│   │   ├── DestinationStep.tsx   # Step 2: destination city (excludes pickup)
│   │   ├── DateTimeStep.tsx      # Step 3: date & time picker
│   │   ├── PassengersStep.tsx    # Step 4: passenger count stepper
│   │   ├── LuggageStep.tsx       # Step 5: luggage per type
│   │   ├── PreferencesStep.tsx   # Step 6: optional free text
│   │   └── RiderInfoStep.tsx     # Step 7: name + phone (final step)
│   ├── BookingConfirmation.tsx   # "Request sent" success screen
│   └── TripStatusPage.tsx        # Public trip status check page
├── shared/
│   ├── components/
│   │   ├── StepIndicator.tsx     # Progress bar/dots for multi-step form
│   │   ├── CitySearchDropdown.tsx
│   │   ├── StepperInput.tsx      # +/- stepper for counts
│   │   ├── PhoneInput.tsx        # Egyptian phone format input
│   │   └── Button.tsx
│   ├── api/
│   │   └── client.ts             # Axios/fetch wrapper for API calls
│   ├── hooks/
│   │   └── useMultiStepForm.ts   # Step navigation state management
│   └── styles/
│       └── index.css             # Global styles, design tokens, animations
├── App.tsx                        # Router setup
└── main.tsx
```

### 4.2 Routing

| Path                   | Component             | Access  |
|------------------------|-----------------------|---------|
| `/`                    | `BookingPage`         | Public  |
| `/trip/:id`            | `TripStatusPage`      | Public  |
| `/trip/:id/confirm`    | (handled via token)   | Public  |
| `/admin/*`             | Admin routes (Phase 5)| Auth'd  |

Use React Router v6. The root `/` is the booking form — this is the primary
user-facing page.

### 4.3 Multi-Step Form UX

- **Step indicator**: Visual progress bar showing current step (1 of 7), with
  ability to go back to previous steps
- **Validation per step**: Each step validates its own input before allowing
  next. Show inline errors.
- **State management**: Use a custom `useMultiStepForm` hook with `useReducer`
  to manage form data across steps. No external state library needed.
- **Animations**: Smooth slide transitions between steps (CSS transform +
  transition, or Framer Motion)
- **Mobile-first**: The booking form is primarily used on phones (rider gets a
  link via WhatsApp). Design for 375px width first, scale up.

### 4.4 Step Details

1. **Pickup City**: Searchable dropdown. Fetch cities from `GET /api/cities`.
   Cache in memory (static list). Show Arabic name alongside English.
2. **Destination City**: Same dropdown, filtered to exclude the selected pickup
   city. Show an estimated distance/duration if you want (static lookup table,
   not a Maps API call).
3. **Date & Time**: Native date picker (or a lightweight library like
   react-datepicker). Enforce minimum 2 hours in the future. Show Egypt
   timezone (Africa/Cairo, UTC+2).
4. **Passengers**: Stepper input (1–10). Default 1. Show car capacity hint
   ("up to 4 passengers in a sedan, up to 7 in a van").
5. **Luggage**: Five stepper inputs (small, medium, large, backpack, laptop).
   All default 0. Include size reference labels/icons.
6. **Preferences**: Optional textarea, max 500 chars. Placeholder: "Special
   requests, pickup notes, accessibility needs..."
7. **Rider Info**: Name (text input) + Phone (formatted input with +20 prefix,
   validates Egyptian mobile format). Clear note: "We'll send trip details to
   this number on WhatsApp."

### 4.5 Submission & Confirmation Screen

- On submit: call `POST /api/trips`
- Show loading spinner during API call
- On success: navigate to `BookingConfirmation` screen showing:
  - ✅ "Your trip request has been sent!"
  - "We'll message you on WhatsApp at +20XXXXXXXXX with car and price details."
  - A link to check status: `/trip/:id`
  - Summary of what they submitted
- On error: show error message, allow retry (don't lose form data)

### 4.6 Trip Status Page (`/trip/:id`)

- Calls `GET /api/trips/:id`
- Shows a card with current status and visual status timeline:
  - `PENDING` → "Waiting for our team to assign a car..."
  - `ASSIGNED` → "A car has been assigned! Check your WhatsApp for details."
  - `CONFIRMED` → "Trip confirmed! See you on [date]."
  - `CANCELLED` → "This trip was cancelled. Reason: ..."
  - `EXPIRED` → "This trip request has expired."
  - `COMPLETED` → "Trip completed. Thank you!"
- Auto-refresh every 30 seconds while status is `PENDING` or `ASSIGNED`

### 4.7 Design & Styling

- **Design language**: Clean, modern, with a warm Egyptian travel vibe
- **Color palette**: Define CSS custom properties in `index.css`
- **Typography**: Google Fonts — use Inter or Cairo (Arabic-friendly)
- **Responsive**: Mobile-first, single column on mobile, centered card on desktop
- **Micro-animations**: Step transitions, button hover states, loading states
- **RTL consideration**: If Arabic support is planned later, use logical
  properties (`margin-inline-start` instead of `margin-left`)

### 4.8 Done Criteria
- [ ] Full 7-step booking form works end-to-end, creates a trip in the DB
- [ ] Validation prevents invalid submissions at each step
- [ ] Confirmation screen shows with status link after successful submission
- [ ] Trip status page displays correct status for all 6 states
- [ ] Form is mobile-responsive and looks polished on 375px–1440px screens
- [ ] No console errors, no leaked sensitive data in network tab

---

## Phase 5 — Frontend: Admin Dashboard

**Goal**: The admin can log in, view all trips, assign cars/drivers/price to
pending trips, cancel trips, manage fleet, and mark trips as completed.

### 5.1 Project Structure

```
frontend/src/admin/
├── AdminLayout.tsx               # Sidebar/nav + content area
├── LoginPage.tsx
├── DashboardPage.tsx             # Overview: counts by status, recent trips
├── TripsListPage.tsx             # Filterable trip list
├── TripDetailPage.tsx            # Single trip detail + actions
├── AssignTripModal.tsx           # Assignment form (car, driver, price, time)
├── CancelTripModal.tsx           # Cancel with reason
├── CarsPage.tsx                  # Car fleet management
├── DriversPage.tsx               # Driver roster management
├── components/
│   ├── TripCard.tsx
│   ├── StatusBadge.tsx
│   ├── AssignmentForm.tsx
│   └── DataTable.tsx             # Reusable sortable/filterable table
└── hooks/
    ├── useAuth.ts                # JWT storage, refresh, logout
    ├── useTrips.ts               # Trip fetching with SWR/React Query
    └── useAdmin.ts               # Admin-specific API calls
```

### 5.2 Auth Flow

- `LoginPage`: Phone + password form → `POST /api/admin/login`
- Store access token in memory (not localStorage — XSS risk), refresh token in
  httpOnly cookie (set by backend)
- `useAuth` hook: provides `login()`, `logout()`, `isAuthenticated`, `admin`
- Auth context wraps all `/admin/*` routes
- On 401 response: attempt silent refresh → if that fails, redirect to login
- On logout: clear tokens, redirect to login

### 5.3 Dashboard Page

A quick-glance overview:
- **Status cards**: Count of trips per status (Pending, Assigned, Confirmed,
  today's trips, this week's completed)
- **Urgent items**: Trips pending for > 30 min (highlight in red/orange)
- **Recent trips**: Last 10 trips as a compact list with quick-assign action

### 5.4 Trips List Page

- **Filters**: Status dropdown, date range, search by rider name/phone
- **Sorting**: By date, status, pickup city
- **Pagination**: Server-side, 20 per page
- **Row actions**: View detail, Assign (if PENDING), Cancel, Complete (if
  CONFIRMED)
- **Real-time feel**: Poll `GET /api/admin/trips` every 15 seconds while the
  page is focused (or use Server-Sent Events for push updates in a later phase)

### 5.5 Trip Detail Page

Full trip info panel:
- Rider info (name, phone — clickable to open WhatsApp)
- Trip details (pickup → destination, date/time, passengers, luggage,
  preferences)
- Status timeline (visual progression of status changes with timestamps)
- Assignment info (if assigned): car, driver, price, pickup time
- Payment info (if exists): method, amount, status
- **Actions bar**:
  - `PENDING` → "Assign Car" button → opens `AssignTripModal`
  - `PENDING` / `ASSIGNED` / `CONFIRMED` → "Cancel Trip" button → opens
    `CancelTripModal`
  - `CONFIRMED` → "Mark Completed" button

### 5.6 Assignment Modal

Form fields:
- **Car**: Dropdown of existing cars (from `GET /api/admin/cars`), grouped by
  "Owned Fleet" and "Network/External". Option to add a new car inline.
- **Driver**: Dropdown of drivers (from `GET /api/admin/drivers`). Option to add
  a new driver inline (with `isExternal` flag).
- **Price**: Number input in EGP. No auto-calculation in v1 (admin sets it
  manually).
- **Exact Pickup Time**: Date+time picker, pre-filled with the rider's
  `requestedAt` value.
- **Payment Method**: Radio — "Online (card/wallet)" or "Offline (cash on
  arrival)".
- **Availability warning**: If the selected car or driver has another trip
  within 6 hours, show a yellow warning banner (frontend check before submit,
  backend enforces).

On submit: `POST /api/admin/trips/:id/assign` → on success, close modal,
refresh trip detail, show success toast.

### 5.7 Fleet Management Pages

**Cars Page** (`/admin/cars`):
- Table: model, color, plate number, capacity, owned/network, # of active trips
- Add / Edit / Delete actions
- Delete blocked if car has `ASSIGNED` or `CONFIRMED` trips

**Drivers Page** (`/admin/drivers`):
- Table: name, phone, internal/external, # of active trips
- Add / Edit / Delete actions
- Delete blocked if driver has `ASSIGNED` or `CONFIRMED` trips

### 5.8 Done Criteria
- [ ] Admin can log in with phone + password
- [ ] Dashboard shows trip counts and urgent pending items
- [ ] Trip list is filterable by status and searchable by rider name/phone
- [ ] Assigning a trip opens a modal, submits successfully, and trip transitions
      to ASSIGNED
- [ ] Double-booking warning appears when selecting a busy car/driver
- [ ] Cancel modal requires a reason, trip transitions to CANCELLED
- [ ] Mark complete works for CONFIRMED trips
- [ ] Car and driver CRUD pages work
- [ ] Token refresh happens silently, 401 redirects to login
- [ ] Dashboard is responsive (tablet-friendly minimum — admin likely uses
      laptop or tablet)

---

## Phase 6 — WhatsApp Integration

**Goal**: Automated WhatsApp messages fire when trips are created, assigned, and
cancelled. The full notification loop is live.

> [!IMPORTANT]
> This phase **requires** approved message templates from Phase 0.1. If
> templates are still pending, build the integration with console.log stubs and
> swap in real sends once approved.

### 6.1 Module Structure

```
backend/src/modules/whatsapp/
├── whatsapp.service.ts           # Core API wrapper
├── whatsapp.templates.ts         # Template name mapping + parameter builders
├── whatsapp.webhook.ts           # Webhook handler (delivery receipts, inbound)
└── whatsapp.router.ts            # Webhook route only
```

### 6.2 WhatsApp Service (`whatsapp.service.ts`)

Core function: `sendTemplateMessage(to, templateName, languageCode, components)`

- Uses Meta Cloud API `POST /v17.0/{phoneNumberId}/messages`
- Sets `Authorization: Bearer {accessToken}`
- Handles rate limiting (Meta allows 80 msgs/sec for standard tier — not an
  issue at this scale, but implement exponential backoff for transient errors)
- Returns message ID on success, throws typed error on failure
- Logs send attempts (success/failure) for audit — **redact phone numbers in
  logs**

### 6.3 Template Parameter Builders (`whatsapp.templates.ts`)

Map internal data to template variables:

#### `trip_new_admin`
- `{{1}}` = Rider name
- `{{2}}` = Pickup city
- `{{3}}` = Destination city
- `{{4}}` = Requested date/time
- `{{5}}` = Passenger count
- Button URL: `{{1}}` = trip ID (appended to dashboard base URL)

#### `trip_assigned_rider`
- `{{1}}` = Rider name
- `{{2}}` = Car model + color
- `{{3}}` = Plate number
- `{{4}}` = Driver name
- `{{5}}` = Price + "EGP"
- `{{6}}` = Exact pickup date/time
- Button URL: `{{1}}` = confirmation token (appended to confirm base URL)

#### `trip_cancelled_rider`
- `{{1}}` = Rider name
- `{{2}}` = Pickup city → Destination city
- `{{3}}` = Cancellation reason

#### `trip_cancelled_admin`
- `{{1}}` = Rider name + phone
- `{{2}}` = Pickup city → Destination city
- `{{3}}` = Cancellation reason

### 6.4 Webhook Handler

`POST /api/webhooks/whatsapp`:
- **Verify signature**: Compute HMAC-SHA256 of raw request body using app
  secret, compare with `X-Hub-Signature-256` header. Reject if mismatch.
- **GET handler** (webhook verification): Meta sends a GET request with
  `hub.mode`, `hub.verify_token`, `hub.challenge` when you register the webhook.
  Respond with `hub.challenge` if `hub.verify_token` matches your configured
  token.
- Handle delivery status updates (`statuses` array): log delivery
  confirmations (sent, delivered, read, failed)
- Handle inbound messages (`messages` array): log for now, no automated
  reply in v1

### 6.5 Wire Into Trip Lifecycle

Replace all the placeholder logs from Phases 2–3 with actual BullMQ job
enqueues (Phase 8 sets up the queues, but define the enqueue calls now):

| Event                        | Job name                          | Payload             |
|------------------------------|-----------------------------------|---------------------|
| Trip created                 | `whatsapp:notify-admin`           | `{ tripId }`        |
| Trip assigned by admin       | `whatsapp:notify-rider`           | `{ tripId }`        |
| Trip cancelled by rider      | `whatsapp:notify-admin-cancelled` | `{ tripId }`        |
| Trip cancelled by admin      | `whatsapp:notify-rider-cancelled` | `{ tripId }`        |

### 6.6 Dev/Test Without Live WhatsApp

- Use the Meta WhatsApp test phone number (available in the Meta Developer
  dashboard) during development — messages can only be sent to numbers added as
  test recipients
- Alternatively, create a `WHATSAPP_DRY_RUN=true` env flag that logs the
  message payload to console instead of calling the API
- Set up ngrok (`ngrok http 3000`) to receive webhook callbacks locally during
  development

### 6.7 Done Criteria
- [ ] Creating a trip sends a WhatsApp notification to the admin's phone
- [ ] Assigning a trip sends a WhatsApp message to the rider with car details
      and a confirm link
- [ ] Cancelling a trip notifies the other party via WhatsApp
- [ ] Webhook endpoint verifies Meta's signature and handles the verification
      challenge
- [ ] Delivery receipts are logged
- [ ] `WHATSAPP_DRY_RUN` mode works for development without live API calls

---

## Phase 7 — Payments (Paymob)

**Goal**: Online payment via Paymob for trips where the admin selects "Online"
payment method. Refunds for cancelled paid trips.

### 7.1 Module Structure

```
backend/src/modules/payments/
├── payments.router.ts
├── payments.controller.ts
├── payments.service.ts           # Paymob API wrapper + payment lifecycle
├── payments.webhook.ts           # Paymob callback handler
├── payments.validation.ts
└── paymob.client.ts              # Low-level Paymob API HTTP client
```

### 7.2 Paymob Client (`paymob.client.ts`)

Wraps the Paymob Accept API:

1. **`authenticate()`** → `POST /api/auth/tokens`
   - Input: `{ api_key }`
   - Returns: auth token (valid for ~1 hour, cache and refresh)

2. **`createOrder(authToken, amount, currency, merchantOrderId)`** →
   `POST /api/ecommerce/orders`
   - Returns: order ID

3. **`getPaymentKey(authToken, orderId, amount, currency, billingData,
   integrationId)`** → `POST /api/acceptance/payment_keys`
   - Returns: payment key (embed in iframe URL or redirect)

4. **`refund(authToken, transactionId, amount)`** →
   `POST /api/acceptance/void_refund/refund`
   - Returns: refund status

### 7.3 Payment Flow

#### Initiation: `POST /api/payments/:tripId/initiate`
- **Middleware**: Validate that trip exists, status is `CONFIRMED` or `ASSIGNED`,
  and `paymentMethod === ONLINE`
- **Service logic**:
  1. Authenticate with Paymob (use cached token if still valid)
  2. Create Paymob order with `amount = assignment.price`, `currency = "EGP"`
  3. Get payment key for the appropriate integration (card or wallet — choose
     based on request param or default to card)
  4. Create `Payment` record: `method: ONLINE`, `status: PENDING`, `amount`
  5. Return checkout URL: `https://accept.paymob.com/api/acceptance/iframes/{iframeId}?payment_token={paymentKey}`
- **Frontend flow**: Rider is redirected to the Paymob checkout page → enters
  card details → Paymob processes → redirects back to your status page

#### Webhook: `POST /api/webhooks/paymob`
- **Signature verification**: Paymob sends an HMAC of specific fields. Compute
  the HMAC using your `PAYMOB_HMAC_SECRET` and compare. **Reject if mismatch.**
- **On success** (`success: true`, `is_voided: false`, `is_refunded: false`):
  1. Find `Payment` by `merchant_order_id` or `order_id`
  2. Update `status: PAID`, set `paidAt`, store `gatewayRef` (transaction ID)
  3. Log successful payment
- **On failure** (`success: false`):
  1. Update `status: FAILED`
  2. Log failure reason
- **Idempotency**: Paymob may send duplicate callbacks. Check if payment is
  already `PAID` before processing again.

#### Refund: `POST /api/payments/:tripId/refund`
- **Middleware**: `authGuard` (admin only)
- **Service logic**:
  1. Find payment, verify `status === PAID` and `method === ONLINE`
  2. Call Paymob refund API with the stored `gatewayRef` (transaction ID)
  3. Update `status: REFUNDED`, set `refundedAt`
- **Error handling**: If Paymob refund fails, log the error, keep status as
  `PAID`, and alert admin to handle manually

#### Offline Payments
- No Paymob interaction needed
- `Payment` record created with `method: OFFLINE`, `status: PENDING`
- Admin manually marks as `PAID` via `POST /api/admin/trips/:id/complete`

### 7.4 Frontend Integration

- When rider confirms a trip with `paymentMethod: ONLINE`, the confirm
  response includes a `checkoutUrl`
- Frontend redirects to the Paymob checkout URL
- Paymob redirects back to `/trip/:id?payment=success` or `?payment=failed`
- Trip status page checks the payment status and shows appropriate message
- **Never trust the redirect URL parameters** — always fetch fresh status from
  your backend

### 7.5 Done Criteria
- [ ] `POST /api/payments/:tripId/initiate` returns a valid Paymob checkout URL
- [ ] Completing payment on the Paymob checkout updates `Payment.status` to
      `PAID` via webhook
- [ ] Failed payments update status to `FAILED`
- [ ] Refund endpoint triggers Paymob refund and updates status to `REFUNDED`
- [ ] Webhook rejects requests with invalid HMAC signature
- [ ] Duplicate webhook callbacks are handled idempotently
- [ ] Offline payment flow works without any Paymob calls
- [ ] Trip status page shows payment status correctly

---

## Phase 8 — Background Jobs (BullMQ)

**Goal**: All WhatsApp sends, payment refunds, and trip expiry checks run as
retryable background jobs via BullMQ, not inline in API request handlers.

### 8.1 Module Structure

```
backend/src/jobs/
├── queue.ts                      # Queue definitions + shared config
├── workers/
│   ├── whatsapp.worker.ts        # Processes all WhatsApp send jobs
│   ├── payment.worker.ts         # Processes refund jobs
│   └── tripExpiry.worker.ts      # Scheduled: checks and expires stale trips
└── schedulers/
    └── tripExpiry.scheduler.ts   # Repeatable job schedule setup
```

### 8.2 Queue Definitions (`queue.ts`)

Define these BullMQ queues (all backed by the same Redis instance):

| Queue name         | Purpose                                      |
|-------------------|----------------------------------------------|
| `whatsapp`        | All WhatsApp template message sends          |
| `payment`         | Paymob refund processing                     |
| `trip-lifecycle`  | Trip expiry checks (repeatable/scheduled)    |

Shared config:
- Default job options: `attempts: 3`, `backoff: { type: 'exponential', delay: 5000 }`
- Remove completed jobs after 24 hours, failed jobs after 7 days
- Concurrency: 5 for WhatsApp (respect API rate limits), 2 for payment, 1 for
  trip-lifecycle

### 8.3 WhatsApp Worker (`whatsapp.worker.ts`)

Processes jobs with names:
- `notify-admin` → calls `whatsappService.sendTripNotification()`
- `notify-rider` → calls `whatsappService.sendConfirmationRequest()`
- `notify-admin-cancelled` → calls `whatsappService.sendCancellationNotice()`
  with target = admin
- `notify-rider-cancelled` → calls `whatsappService.sendCancellationNotice()`
  with target = rider

Error handling:
- Meta API 429 (rate limited) → let BullMQ retry with exponential backoff
- Meta API 400 (bad template/params) → don't retry, log error, mark job failed
- Network errors → retry (default behavior)

### 8.4 Payment Worker (`payment.worker.ts`)

Processes jobs with names:
- `refund` → calls `paymobClient.refund()`, updates `Payment.status`

Error handling:
- Paymob API failure → retry up to 3 times, then mark failed + log for manual
  admin intervention
- Already refunded → mark job as complete (idempotent)

### 8.5 Trip Expiry Scheduler (`tripExpiry.scheduler.ts`)

- On app startup, register a **repeatable job** on the `trip-lifecycle` queue:
  `{ every: 60000 }` (runs every 60 seconds)
- The worker queries for:
  1. `PENDING` trips where `createdAt + TRIP_PENDING_EXPIRY_MINUTES < now()`
     → transition to `EXPIRED`
  2. `ASSIGNED` trips where `confirmationTokenExpiresAt < now()`
     → transition to `EXPIRED`
- Optionally: 5 minutes before expiry, enqueue a `whatsapp:expiry-warning` job
  to remind the admin or rider

### 8.6 Wire Everything Together

Update all service methods from Phases 2–3 that had placeholder logs:

| Service method                     | Replace placeholder with                  |
|------------------------------------|--------------------------------------------|
| `tripsService.createTrip()`        | `whatsappQueue.add('notify-admin', {...})` |
| `adminService.assignTrip()`        | `whatsappQueue.add('notify-rider', {...})` |
| `tripsService.cancelTrip()`        | `whatsappQueue.add('notify-admin-cancelled', {...})` + conditionally `paymentQueue.add('refund', {...})` |
| `adminService.cancelTrip()`        | `whatsappQueue.add('notify-rider-cancelled', {...})` + conditionally `paymentQueue.add('refund', {...})` |

### 8.7 Monitoring

- Use BullMQ's built-in events to log job lifecycle (started, completed,
  failed, retrying)
- Consider adding [Bull Board](https://github.com/felixmosh/bull-board) as a
  dev-only admin UI to monitor queues:
  - Mount at `/admin/queues` behind `authGuard`
  - Shows job counts, failed jobs, retry history

### 8.8 Done Criteria
- [ ] WhatsApp messages are sent via background jobs, not inline
- [ ] Failed WhatsApp sends retry 3 times with exponential backoff
- [ ] Refund jobs process correctly and update payment status
- [ ] Trip expiry job runs every 60 seconds and expires stale trips
- [ ] Bull Board (or equivalent monitoring) shows queue status
- [ ] No job processing happens in the API request/response cycle — all async
- [ ] App startup registers the repeatable expiry job without duplicating it

---

## Phase 9 — Security Hardening

**Goal**: Go through every item in the Security Checklist (architecture doc
Section 9) and verify it's properly implemented. Fix anything that was deferred
or overlooked.

### 9.1 Input Validation Audit
- [ ] Every endpoint has a Zod schema — no endpoint accepts unvalidated input
- [ ] All Zod schemas use `.strict()` to reject unexpected fields
- [ ] Phone number validation enforces Egyptian format (`+201[0125]\d{8}`)
- [ ] Date/time inputs are validated against timezone-aware bounds
- [ ] String inputs have max length limits to prevent payload abuse

### 9.2 Rate Limiting Audit
- [ ] `POST /api/trips` — 5 req/min/IP
- [ ] `POST /api/admin/login` — 10 req/min/IP
- [ ] `POST /api/trips/:id/confirm` — 10 req/min/IP
- [ ] `POST /api/trips/:id/cancel` — 10 req/min/IP
- [ ] Webhook endpoints (`/api/webhooks/*`) — exempt from rate limiting (but
      signature-verified)
- [ ] Rate limiter returns proper `429` status with `Retry-After` header

### 9.3 Authentication & Authorization Audit
- [ ] Admin passwords hashed with argon2 (not plaintext, not md5, not sha256)
- [ ] JWT access tokens expire in 15 minutes
- [ ] Refresh tokens stored in httpOnly, Secure, SameSite=Strict cookies
- [ ] Refresh token rotation: old refresh token invalidated when new one issued
- [ ] No admin endpoint accessible without valid JWT
- [ ] Confirmation tokens are UUID v4 (128 bits of entropy)
- [ ] Confirmation tokens have enforced expiry
- [ ] Confirmation tokens are single-use (optional: invalidate after confirm)

### 9.4 Webhook Security Audit
- [ ] WhatsApp webhook verifies `X-Hub-Signature-256` using HMAC-SHA256 with
      app secret — computed against the **raw request body** (not parsed JSON)
- [ ] Paymob webhook verifies HMAC signature against the documented field
      concatenation order
- [ ] Both webhooks reject requests with missing or invalid signatures (return
      403, log the attempt)
- [ ] Webhook endpoints use `express.raw()` or equivalent to access the raw
      body for signature computation

### 9.5 Transport & Headers
- [ ] Nginx config: TLS 1.2+ only, strong cipher suites
- [ ] HTTP → HTTPS redirect in Nginx
- [ ] `helmet()` middleware sets: X-Content-Type-Options, X-Frame-Options,
      Strict-Transport-Security, Content-Security-Policy (at minimum)
- [ ] CORS: `origin` set to exactly `FRONTEND_URL`, not `*`
- [ ] No `Access-Control-Allow-Credentials` unless specifically needed

### 9.6 Data Protection
- [ ] No phone numbers, tokens, or prices in console.log in production
- [ ] Error responses never include stack traces or internal paths in production
- [ ] Prisma queries use parameterized inputs (verify no raw SQL anywhere)
- [ ] `.env` gitignored, `.env.example` has only placeholder values
- [ ] No secrets in Docker image layers (use runtime env vars, not build args)

### 9.7 Infrastructure Security
- [ ] PostgreSQL not exposed on public port (only via PgBouncer on internal
      Docker network, or direct only for migrations)
- [ ] Redis not exposed on public port in production
- [ ] Docker containers run as non-root user
- [ ] Production Docker Compose has `restart: unless-stopped` on all services
- [ ] Resource limits set on containers (memory, CPU) to prevent runaway
      processes

### 9.8 Database
- [ ] Automated daily backups (pg_dump cron or managed backup service)
- [ ] Backup retention: 14 days minimum
- [ ] Backup restoration tested at least once
- [ ] PgBouncer configured in transaction mode with `max_client_conn` and
      `default_pool_size` tuned for expected load

### 9.9 Done Criteria
- [ ] Every item in the architecture doc's Security Checklist (Section 9) is
      verified with a passing test or manual check
- [ ] No HIGH/CRITICAL vulnerabilities in `npm audit`
- [ ] A penetration test (even a basic one using OWASP ZAP) finds no critical
      issues on the public endpoints

---

## Phase 10 — Testing, Load Testing & Production Deploy

**Goal**: Verify the system works end-to-end under load, then deploy to
production.

> [!IMPORTANT]
> **This phase is mandatory, not optional.** The project is not "done"
> when local development and tests pass — it's done when it is running on
> a live server, reachable over HTTPS at the real domain, with the full
> rider→admin→confirmation→payment loop verified against real (or
> test-mode) WhatsApp and Paymob accounts. See Section 12 of the
> architecture doc ("Production readiness definition") for the full
> checklist this phase must satisfy before sign-off.

### 10.1 Automated Tests

#### Unit Tests (Jest / Vitest)
Focus on business logic in service layers:
- `tripsService`: status transitions, validation edge cases
- `adminService`: double-booking detection, assignment logic
- `paymobClient`: HMAC computation, response parsing
- `whatsappService`: template parameter building
- Rate limiter behavior (mock Redis)

#### Integration Tests (Supertest + test DB)
- Full request/response tests against a real Postgres (in Docker):
  - Create trip → verify DB state
  - Assign trip → verify status transition + TripAssignment created
  - Confirm trip → verify token validation + status change
  - Cancel trip → verify cancelledBy/reason/refund job enqueued
  - Admin login → verify JWT issued
  - Webhook signature verification (valid + invalid)
- Use a separate test database, run migrations before tests, truncate after

#### Frontend Tests (Vitest + React Testing Library)
- Multi-step form: navigation, validation per step, submission
- Trip status page: rendering for each status
- Admin login: token storage, redirect on 401
- Assignment modal: form validation, submission

### 10.2 End-to-End Tests (Optional but Recommended)

Use Playwright or Cypress:
- Full booking flow: fill form → submit → check status page
- Admin flow: login → view pending trip → assign → verify rider WhatsApp
  (mock) → complete trip
- Payment flow: initiate → (mock Paymob redirect) → verify webhook updates
  status

### 10.3 Load Testing

Use **k6** or **Artillery** against the Docker Compose stack:

#### Scenarios to test:
1. **Booking spike**: 50 concurrent users submitting `POST /api/trips` over 2
   minutes → verify all 200/201 responses, no 500s, p95 latency < 500ms
2. **Admin dashboard under load**: 10 concurrent admins polling
   `GET /api/admin/trips` every 5 seconds while bookings come in
3. **Mixed workload**: Simulate a realistic 30-minute summer rush — 100
   bookings, 20 assignments, 10 confirmations, 5 cancellations
4. **Rate limiter stress test**: Verify 429s kick in correctly under abuse

#### Metrics to monitor:
- Response time (p50, p95, p99)
- Error rate
- PostgreSQL connection count (via PgBouncer stats)
- Redis memory usage
- BullMQ queue depth (are jobs processing fast enough?)
- Container CPU and memory usage (`docker stats`)

#### Tuning targets:
- `backend` replicas: start with 2, increase if CPU > 70% sustained
- PgBouncer `default_pool_size`: start at 20, increase if connections wait
- Redis `maxmemory`: set to 256MB with `allkeys-lru` eviction
- BullMQ concurrency: adjust per queue based on external API rate limits

### 10.4 Production Deployment

#### Pre-deployment checklist:
- [ ] All env vars set on the server (not in docker-compose file)
- [ ] TLS certificate provisioned (Let's Encrypt via certbot or Nginx proxy
      manager)
- [ ] DNS pointing to server IP
- [ ] `docker-compose.prod.yml` reviewed: no exposed DB/Redis ports, restart
      policies set, resource limits configured
- [ ] Database backup cron job configured
- [ ] Monitoring/alerting set up (at minimum: uptime check on `/api/health`,
      disk space alert, container restart alert)

#### Deploy steps:
1. SSH into server
2. Clone repo (or pull latest)
3. Copy `.env` file with production values
4. `docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`
5. Run Prisma migrations: `docker-compose exec backend npx prisma migrate deploy`
6. Seed admin user: `docker-compose exec backend npx prisma db seed`
7. Verify health: `curl https://yourdomain.com/api/health`
8. Register WhatsApp webhook URL in Meta dashboard:
   `https://yourdomain.com/api/webhooks/whatsapp`
9. Update Paymob callback URL:
   `https://yourdomain.com/api/webhooks/paymob`
10. Send a test booking, verify the full loop works

#### Post-deployment:
- [ ] Test the full rider flow on a real phone (WhatsApp message received,
      confirm link works, payment works)
- [ ] Test the admin flow on a real browser (login, assign, cancel, complete)
- [ ] Verify backup cron runs and produces a valid dump
- [ ] Set up a basic uptime monitor (UptimeRobot, Better Uptime, or a simple
      cron curl)

### 10.5 Done Criteria
- [ ] Unit + integration tests pass with > 80% coverage on service layers
- [ ] Load test shows no errors under 50 concurrent bookings
- [ ] Production deployment completes without errors
- [ ] Full rider booking → admin assignment → rider confirmation → trip
      completion loop works on production with real WhatsApp messages
- [ ] Paymob payment works with a real (or test-mode) card transaction
- [ ] Backups are running and verified restorable
- [ ] Monitoring alerts configured and tested

---

## State Transition Reference

A quick reference for all valid trip status transitions, which phase implements
them, and what triggers them:

```
                    ┌─────────────────────────────────────────────────┐
                    │                                                 │
                    ▼                                                 │
  ┌──────────┐  admin assigns  ┌──────────┐  rider confirms  ┌──────────┐  admin marks  ┌──────────┐
  │ PENDING  │ ──────────────▶ │ ASSIGNED │ ───────────────▶ │CONFIRMED │ ────────────▶ │COMPLETED │
  └──────────┘                 └──────────┘                  └──────────┘              └──────────┘
       │                            │                             │
       │  rider/admin cancels       │  rider/admin cancels        │  admin cancels
       │  ──or── system expires     │  ──or── token expires       │
       ▼                            ▼                             ▼
  ┌──────────┐                 ┌──────────┐                  ┌──────────┐
  │CANCELLED │                 │CANCELLED │                  │CANCELLED │
  │ or       │                 │ or       │                  │(+ refund │
  │ EXPIRED  │                 │ EXPIRED  │                  │ if paid) │
  └──────────┘                 └──────────┘                  └──────────┘
```

| From        | To          | Triggered by                  | Phase | Refund? |
|-------------|-------------|-------------------------------|-------|---------|
| PENDING     | ASSIGNED    | Admin assigns car/driver      | 3     | —       |
| PENDING     | CANCELLED   | Rider cancels or Admin cancels| 2, 3  | —       |
| PENDING     | EXPIRED     | System (expiry job)           | 8     | —       |
| ASSIGNED    | CONFIRMED   | Rider confirms via token link | 2     | —       |
| ASSIGNED    | CANCELLED   | Rider cancels or Admin cancels| 2, 3  | If PAID |
| ASSIGNED    | EXPIRED     | System (token expired)        | 8     | —       |
| CONFIRMED   | COMPLETED   | Admin marks complete          | 3     | —       |
| CONFIRMED   | CANCELLED   | Admin cancels only            | 3     | If PAID |

---

## Phase Summary Timeline

| Phase | Name                          | Depends on | Estimated effort |
|-------|-------------------------------|------------|------------------|
| 0     | External accounts & templates | —          | 1–5 days (async) |
| 1     | Project skeleton & infra      | —          | 1 day            |
| 2     | Trips module (backend)        | 1          | 2 days           |
| 3     | Admin module (backend)        | 1, 2       | 2–3 days         |
| 4     | Frontend booking form         | 2          | 2–3 days         |
| 5     | Frontend admin dashboard      | 3          | 3–4 days         |
| 6     | WhatsApp integration          | 0, 2, 3   | 2 days           |
| 7     | Payments (Paymob)             | 0, 2, 3   | 2–3 days         |
| 8     | Background jobs (BullMQ)      | 6, 7       | 1–2 days         |
| 9     | Security hardening            | All above  | 1–2 days         |
| 10    | Testing & production deploy   | All above  | 2–3 days         |
|       | **Total**                     |            | **~18–26 days**  |

> [!TIP]
> Phases 4 and 5 (frontend) can run **in parallel** with Phases 6 and 7
> (WhatsApp + Payments) if two people are working, or interleaved if solo.
> Phase 0 runs fully in parallel from Day 1.
