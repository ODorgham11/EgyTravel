# Limousine Booking Platform — Demo Prototype Spec

> **Purpose**: A scoped-down, zero-cost, local-only version of the platform
> to demo live to the customer for approval, before investing in paid
> external services (Meta WhatsApp Business, Paymob) or the full production
> infrastructure described in `limo-webapp-architecture.md` and
> `limo-implementation-phases.md`.
>
> **This is not a separate codebase.** It's the same project, running in
> "mock mode," so the work here carries forward directly into the full
> build — nothing gets thrown away once the customer approves.

---

## 1. What's different from the full spec

| Concern | Full production spec | Demo prototype |
|---|---|---|
| WhatsApp | Real Meta Cloud API, approved templates | **Mocked** — in-app "simulated WhatsApp" screen |
| Payments | Real Paymob integration | **Mocked** — fake checkout modal, instant fake success |
| Infra | Postgres + PgBouncer + Redis + BullMQ + Nginx, multi-replica | **Single Postgres container**, no PgBouncer/Redis/BullMQ/Nginx |
| Hosting | VPS, domain, TLS, always-on | **Local only** — `docker-compose up` on your machine |
| Background jobs | BullMQ queues for sends/expiry | Called **synchronously in-process** (no queue needed at this scale) |
| Security hardening | Full checklist (Section 9 of architecture doc) | Basic only — server-side validation, no public exposure since it's local |

Everything else — data model, trip status lifecycle, booking form steps,
admin dashboard, business logic — is **identical** to the full spec. This
is the same app with two integrations swapped for fakes and the
infrastructure simplified to what a laptop needs.

---

## 2. Mock mode design

Add a single environment variable: `MOCK_MODE=true` (in `.env`, defaults to
`true` for the demo, set to `false` for production).

### `modules/whatsapp` in mock mode
Instead of calling the Meta Cloud API, `sendTripNotification()` and
`sendConfirmationRequest()`:
1. Render the exact same message content that would be sent (using the
   real template logic — this matters, since it's what proves the message
   content works)
2. Write it to a `MockMessage` table in the database — **not an in-memory
   store**, so messages survive backend restarts during the demo (avoids
   losing your simulated conversation mid-walkthrough). The table is only
   populated when `MOCK_MODE=true` and can be dropped when mock mode goes
   away.
3. The **admin dashboard** gets a small "Simulated WhatsApp" panel/tab
   showing these messages in a chat-bubble UI — so during the demo, when
   a booking comes in, you can show the customer "here's exactly what the
   admin would receive on WhatsApp," and after assigning a car, "here's
   exactly what the rider would receive."

```prisma
// Only used when MOCK_MODE=true — drop this model for production.
// If repurposed for a staging environment (real backend, fake WhatsApp to
// avoid spamming real customers during QA), add an isMock Boolean to Trip
// or key off the environment name, so a trip that starts in staging and
// later goes live doesn't mix mock and real message records.
model MockMessage {
  id        String   @id @default(uuid())
  tripId    String
  to        String   // phone number the message would be sent to
  direction String   // "to-admin" | "to-rider"
  template  String   // template name (e.g. "trip_new_admin")
  body      String   // fully rendered message content
  sentAt    DateTime @default(now())
}
```

This is arguably a **better** demo than the real thing — you can show the
message content clearly on a call without anyone needing to check their
phone or wait for template approval.

### `modules/payments` in mock mode
`POST /api/payments/:tripId/initiate` returns a mock checkout page
(simple HTML form: "Card number", "Pay now" button, **and a "Decline"
button**) instead of a real Paymob redirect. Two paths:

- **"Pay now"**: succeeds after a short fake delay (1–2 seconds with a
  spinner), updates `Payment.status` to `PAID`, and returns to the
  confirmation screen — demonstrates the happy path.
- **"Decline"**: fails after a short fake delay, updates `Payment.status`
  to `FAILED`, and returns to the status page with a "payment failed, try
  again" message — demonstrates the error path so the customer can see
  how failures are handled without needing a real declined card.

This covers the inevitable "what if the card is declined?" question
during the demo.

Offline payment path needs no mocking — it's already just a status flag.

### Everything else
The trips module, admin module, status lifecycle, double-booking check,
confirmation tokens — all real, all as specified in the architecture doc.
This is the part the customer is actually approving, so it should be the
real thing.

---

## 3. Simplified infra for the demo

`docker-compose.yml` (demo version) — three services only:

| Service | Image | Notes |
|---|---|---|
| `postgres` | `postgres:16-alpine` | No PgBouncer — direct connection is fine at demo scale |
| `backend` | Build from `./backend` | `MOCK_MODE=true`, calls mock services synchronously — no BullMQ needed |
| `frontend` | Build from `./frontend` | Vite dev server or a simple static preview build |

No Redis, no BullMQ, no Nginx, no TLS, no domain. `docker-compose up`
and you're demoing on `http://localhost:5173` (frontend) and
`http://localhost:3000` (API) in a couple of minutes.

Rate limiting can be skipped or left permissive for the demo — it's not
exposed to the internet, so there's nothing to protect against yet.

---

## 4. What the customer should see, end to end

A live walkthrough should cover the full loop in one sitting:

1. **Rider books a trip** — open the public booking form, fill in pickup
   city, destination, date/time, passengers, luggage, and any extra
   preferences, submit.
2. **Admin gets notified** — switch to the admin dashboard, show the new
   `PENDING` trip appear, open the "Simulated WhatsApp" panel to show the
   exact notification message that would have landed on the owner's phone.
3. **Admin assigns the trip** — pick a car, driver, set price and exact
   pickup time, choose payment method, submit. Trip moves to `ASSIGNED`.
4. **Rider gets the confirmation** — show the simulated confirmation
   message with all the assigned details and a confirm link.
5. **Rider confirms** — open the confirm link, trip moves to `CONFIRMED`.
   If payment method was `ONLINE`, walk through the mock checkout to show
   that flow too.
6. **Admin completes the trip** — mark it `COMPLETED` from the dashboard.

This demonstrates the entire value proposition — automated intake,
structured admin decision-making, automated confirmation back to the
rider — without a single dollar spent or external account created.

---

## 5. How the demo maps to the implementation phases

The demo prototype builds Phases 1–5 of
[limo-implementation-phases.md](./limo-implementation-phases.md), but with
simplified infra and mock integrations. Here's the mapping:

| Phases doc phase | In the demo | Notes |
|---|---|---|
| **Phase 0** (external accounts) | **Skip entirely** | No Meta/Paymob accounts needed yet |
| **Phase 1** (skeleton + infra) | **Simplified** | Use the 3-service docker-compose from Section 3 above — no PgBouncer, Redis, BullMQ, or Nginx |
| **Phase 2** (trips module) | **Build as-is** | All real — identical to full spec |
| **Phase 3** (admin module) | **Build as-is** | All real — identical to full spec |
| **Phase 4** (frontend booking form) | **Build as-is** | All real — identical to full spec |
| **Phase 5** (frontend admin dashboard) | **Build as-is**, plus add the "Simulated WhatsApp" panel | The panel is demo-only UI, reads from `MockMessage` table |
| **Phase 6** (WhatsApp integration) | **Mock mode only** | Build the service interface, but swap the API call for a DB write |
| **Phase 7** (payments) | **Mock mode only** | Build the service interface, but swap the Paymob redirect for a fake checkout page |
| **Phase 8** (BullMQ jobs) | **Skip entirely** | Calls are synchronous in mock mode |
| **Phase 9** (security hardening) | **Skip** | Not exposed to the internet |
| **Phase 10** (testing + deploy) | **Skip** | Demo runs locally |

The demo is **done** when the walkthrough in Section 4 can be performed
start to finish without errors.

---

## 6. After customer approval

Once approved, the path forward is exactly what's already documented:

1. Set `MOCK_MODE=false`.
2. Run Phase 0 of `limo-implementation-phases.md` (Meta Business + Paymob
   account setup) — start this early since template approval takes time.
3. Fill in real credentials in `.env`.
4. Re-add PgBouncer, Redis, BullMQ, Nginx (already specified in the full
   architecture doc) for production durability.
5. Follow Phases 6–10 of the implementation doc as written, ending with
   the production-readiness checklist (Section 12 of the architecture doc)
   before going live on a real server.

No code gets rewritten — the mock services are simply swapped out for
real ones behind the same interfaces (`sendTripNotification()`,
`initiatePayment()`, etc.), which is exactly why building mock mode as a
flag inside the real codebase (rather than a throwaway separate demo)
pays off here.
