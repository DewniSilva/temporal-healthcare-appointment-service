# Temporal Healthcare Appointment Demo

A deliberately small, production-minded learning project for Temporal. It books an appointment, atomically reserves the doctor's slot in PostgreSQL, starts a reminder Child Workflow, waits on a durable timer, and accepts confirm/cancel Signals. Product features outside that process are intentionally thin.

## Start and use it

Only Docker Desktop with Compose is required:

```bash
docker compose up --build
```

- API: http://localhost:3000
- Health: http://localhost:3000/health
- Frontend: http://localhost:8081
- Temporal UI: http://localhost:8080
- PostgreSQL and Temporal gRPC are internal-only (not host-published).

Local demo accounts all use `DemoPass123!`:

| Role | Email | Linked record |
|---|---|---|
| Patient | `patient1@example.test` | `patient-001` |
| Patient | `patient2@example.test` | `patient-002` |
| Doctor | `doctor1@example.test` | `doctor-001` |
| Admin | `admin@example.test` | all records |

These are fake, local-only identities. Compose credentials and its fallback JWT secret are intentionally labelled development values; replace them for any shared environment.

### Example API flow

```bash
# Login and copy the token value from the response.
curl -s http://localhost:3000/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"patient1@example.test","password":"DemoPass123!"}'

TOKEN='<paste token>'

# Idempotency-Key is required. Reusing it returns ALREADY_STARTED, even after
# the original Workflow has closed.
curl -s http://localhost:3000/appointments \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -H 'idempotency-key: interview-demo-001' \
  -d '{"patientId":"patient-001","doctorId":"doctor-001","appointmentTime":"2026-08-25T10:00:00Z"}'

APPOINTMENT_ID='<appointmentId from response>'
curl -s http://localhost:3000/appointments/$APPOINTMENT_ID -H "authorization: Bearer $TOKEN"
curl -s http://localhost:3000/appointments/$APPOINTMENT_ID/workflow -H "authorization: Bearer $TOKEN"
curl -s -X POST http://localhost:3000/appointments/$APPOINTMENT_ID/confirm -H "authorization: Bearer $TOKEN"
# Or: POST /appointments/:id/cancel
```

Compose defaults to `REMINDER_LEAD_TIME_SECONDS=7200`, so new appointments are reminded two hours before their scheduled time. For a quick demo, set it to `30` and choose an appointment roughly 45–60 seconds ahead. Configuration is read by the backend and copied into the Workflow input; existing Workflows retain the lead time they were created with.

### Resend reminder email

The reminder Activity can deliver an email through Resend, stating the appointment time (UTC) and the doctor's name. Create a local `.env` file from `.env.example`, then set:

```dotenv
RESEND_API_KEY=re_your_key
RESEND_FROM_EMAIL=Healthcare Appointments <onboarding@resend.dev>
REMINDER_EMAIL_TO=your-real-test-inbox@example.com
REMINDER_LEAD_TIME_SECONDS=7200
```

The seeded users use reserved `example.test` addresses, so local delivery intentionally goes to the single `REMINDER_EMAIL_TO` test inbox. The message states the appointment time and doctor's display name but still excludes patient identity and diagnosis. Verify your own sending domain and implement consented per-patient delivery before production use. After changing these values, recreate `backend` and `worker`; only newly booked appointments receive the new lead time:

```powershell
docker compose up -d --build --force-recreate backend worker
```

Both `RESEND_API_KEY` and `REMINDER_EMAIL_TO` are required. If either is missing when the reminder Activity runs, it fails loudly (`notification_provider_not_configured`, the notification is recorded `FAILED`, and the Activity retries) instead of being silently marked as delivered — an unconfigured provider must never look like a sent reminder.

### Twenty-minute appointment slots

Every appointment occupies a fixed 20-minute interval. New starts must use the caller's local `:00`, `:20`, or `:40` boundary, and must fall within working hours: `7:00 AM–12:00 PM` or `1:00 PM–5:00 PM`. The frontend only offers those slots, such as `8:00 AM – 8:20 AM`, and the API and Worker independently reject arbitrary minute values or times outside working hours.

The backend performs a fast overlap preflight so a known occupied slot returns HTTP `409`. The Worker repeats the check because the backend result can become stale. PostgreSQL remains the final concurrency authority through a GiST exclusion constraint that prevents two new reservations for the same doctor from having overlapping 20-minute timestamp ranges. Adjacent ranges are allowed: `8:00–8:20` and `8:20–8:40` do not overlap.

### Reconciliation

A Temporal Schedule (`appointment-reconciliation`, created idempotently on backend startup) runs `reconciliationWorkflow` every `RECONCILIATION_INTERVAL_MINUTES` (default 15) to sweep for state a live appointment Workflow should have cleaned up itself but didn't — a crashed worker, a terminated Workflow, or exhausted Activity retries:

- **Orphaned slot reservations** — a `SlotReservation` still present more than `ORPHANED_RESERVATION_GRACE_MINUTES` (default 60) after its own appointment ended. Safe to auto-release: once an appointment's time is in the past, that exact slot can never be requested again, so the row is provably dead weight, not a real conflict risk.
- **Failed reminder notifications** — retried automatically. Resend was given a stable idempotency key derived from the appointment ID (see `resend.notification.ts`), so re-attempting cannot duplicate a delivery that already went out.
- **Appointments stuck at `BOOKED`** past their own time — detected and logged (`reconciliation_stuck_booked_appointments`) for on-call/alerting, not auto-mutated. This means its Workflow died before ever reaching `CONFIRMED`/`CANCELLED`; deciding the correct outcome is a business call, not something to guess.

### Health, rate limiting, and Temporal connectivity

`GET /health` independently checks PostgreSQL (`SELECT 1`), Temporal (`getSystemInfo`), and Redis (`PING`), returning `503` with a per-dependency breakdown if any is unreachable — it no longer reports Temporal as unconditionally `ready`.

HTTP rate limits (login, and appointment create/confirm/cancel) are backed by Redis (`REDIS_URL`) rather than in-process memory, so limits stay correct once the backend runs as more than one replica.

`TEMPORAL_TLS` and `TEMPORAL_API_KEY` let the backend and Worker connect to a TLS-secured Temporal cluster or Temporal Cloud (API-key auth implies TLS); both default to plaintext for the local Compose network. `JWT_SECRET` is refused at startup if it's still the local-development default and `NODE_ENV=production` — a real deployment must supply its own secret rather than silently signing tokens with a value that's public in this repo's history.

## Architecture and project tree

```text
REST client -> Express backend -> reused Temporal Client -> Temporal Server
                                                         -> healthcare-appointments queue
                                                         -> bounded Worker
                                                            |-> deterministic Workflows
                                                            `-> Activities -> PostgreSQL / notification adapter
```

```text
.
├── docker/postgres/init.sql
├── prisma/
│   ├── migrations/20260824000000_init/migration.sql
│   ├── schema.prisma
│   └── seed.ts
├── src/
│   ├── backend/             # HTTP service boundary
│   │   ├── api/             # controllers, routes, schemas, middleware
│   │   ├── auth/            # login, JWT verification, authorization
│   │   ├── temporal/        # reused Temporal client only
│   │   ├── app.ts
│   │   └── server.ts        # backend container entry point
│   ├── worker/              # Temporal execution service boundary
│   │   ├── activities/      # database and notification side effects
│   │   ├── workflows/       # booking parent + reminder child
│   │   └── worker.ts        # worker container entry point
│   └── shared/              # small modules genuinely needed by both
│       ├── config/
│       ├── database/
│       ├── logging/
│       └── temporal/        # contracts, Signals, and Queries
├── tests/                   # Temporal time-skipping + validation/auth tests
├── .env.example
├── Dockerfile
├── docker-compose.yml
├── package-lock.json
└── package.json
```

This is one repository containing two applications, not one combined process. Compose creates a `backend` container running `dist/src/backend/server.js` and a separate `worker` container running `dist/src/worker/worker.js`. They reuse one image because their Node dependencies overlap, but they have different entry points, lifecycles, ports, and scaling behavior.

The backend only validates/authenticates HTTP and starts, signals, or queries Workflows. It never executes Activities. The worker never serves HTTP; it polls the Task Queue and executes Workflows and Activities. `shared/` contains no application entry point and is intentionally limited to cross-boundary contracts and process infrastructure. PostgreSQL is the business-data source of truth; Temporal is the execution-state source of truth.

These boundaries are executable rules in `tests/architecture.test.ts`: backend cannot import worker implementation, worker cannot import backend implementation, shared code cannot depend on either application, and Workflow modules cannot import Prisma, configuration, logging, filesystem, HTTP, or crypto infrastructure. The test fails immediately if a future refactor crosses one of those boundaries.

## End-to-end execution

```mermaid
sequenceDiagram
  participant C as REST client
  participant A as Express backend
  participant T as Temporal Server
  participant W as Worker
  participant P as PostgreSQL
  C->>A: POST /appointments + JWT + Idempotency-Key
  A->>A: Zod validation + ownership authorization
  A->>T: start appointmentBookingWorkflow
  A-->>C: 202 STARTED (does not await result)
  T->>W: Workflow Task on healthcare-appointments
  W->>P: validate IDs / availability Activities
  W->>P: atomic non-overlapping 20-minute slot reservation
  W->>P: idempotent appointment create (BOOKED)
  W->>P: idempotent confirmation notification
  W->>T: start appointmentReminderWorkflow child
  T->>T: durable reminder timer
  T->>W: timer fires; reminder Activity
  W->>P: idempotent reminder notification
  C->>A: POST /appointments/:id/confirm
  A->>A: object-level authorization
  A->>T: confirmAppointment Signal to child
  T->>W: Workflow Task
  W->>P: guarded BOOKED -> CONFIRMED Activity
```

The Task Queue is a durable routing name, not a broker that the application manages. The backend may restart immediately after `start` returns; Temporal retains the Workflow history. A worker restart causes another worker poll to replay deterministic workflow code and continue at the last durable event. A timer lives in Temporal, not in Node memory.

`POST /appointments` requires an `Idempotency-Key`. The backend scopes it to the authenticated user, derives a stable appointment/Workflow ID, and starts with `workflowIdConflictPolicy: FAIL` plus `workflowIdReusePolicy: REJECT_DUPLICATE`. The same logical request therefore cannot create another run while the original Workflow is open or after it has closed.

## Temporal concepts demonstrated

- `appointmentBookingWorkflow` orchestrates validation, availability, reservation, creation, confirmation, compensation, and the Child Workflow.
- `appointmentReminderWorkflow` receives the lead time as input, uses Temporal `sleep`, sends one logical reminder, waits with `condition`, exposes `appointmentState`, and handles `confirmAppointment` / `cancelAppointment` Signals.
- Query handlers are synchronous/read-only and perform no database work.
- Signal endpoints never update process-owned state directly. The child Workflow calls a guarded Activity; cancellation also releases the slot.
- IDs, time, and one integer are the entire Workflow payload—no JWT, name, password, diagnosis, or patient record enters Event History.

Temporal replaces fragile combinations of cron, in-memory `setTimeout`, polling tables, custom retry loops, and hand-built state machines. It supplies persisted history, deterministic replay, durable timers, retry scheduling, human-interaction Signals, Queries, and UI visibility as one execution model.

## Failure tolerance

| Mechanism | Where | Behavior during failure |
|---|---|---|
| Activity retry/backoff | Workflow `proxyActivities` options | Transient DB/provider errors retry 3–5 times, starting at 1s with 2x backoff and bounded maximum intervals. |
| Non-retryable business errors | Activities use `ApplicationFailure.nonRetryable` | Invalid time, missing entities, unavailable slot, and invalid transition fail immediately instead of wasting retries. |
| Explicit timeouts | Workflow Activity options | DB work has 5–10s start-to-close and 15–45s schedule-to-close limits; notifications get 10s/1m. No Activity is long-running, so heartbeat timeouts would add no value. |
| Database slot constraints | Exact-start uniqueness plus a PostgreSQL GiST exclusion constraint | Two workers racing for overlapping 20-minute ranges for the same doctor cannot both win; the constraint error becomes `DOCTOR_UNAVAILABLE`. |
| Idempotent Activities | primary/unique keys, upsert/deleteMany, guarded updates | Retries cannot duplicate an appointment, reservation, release, notification record, or valid state transition. |
| Saga compensation | booking Workflow `catch` after `createAppointment` | A permanent/exhausted create failure invokes idempotent `releaseAppointmentSlot`; temporary failures retry before compensation. |
| Durable state/timer | Temporal Event History and `sleep` | Worker, backend, or container restarts do not lose progress or the reminder schedule. |
| Connection retry | backend client and worker startup | Dependencies are retried with bounded increasing delays; Compose health gates also prevent premature startup. |
| Graceful shutdown | server close and Worker SDK run loop | Backend stops accepting HTTP and closes clients; worker handles SIGTERM/SIGINT, drains, then closes Temporal/Prisma. |

Reminder delivery requires Resend to be configured; an unconfigured provider fails the Activity rather than being recorded as sent. Database uniqueness prevents repeat completed sends, and the Resend request uses a hashed, stable appointment/type idempotency key during Activity retries. Resend retains idempotency keys for 24 hours; production delivery still needs reconciliation or a transactional outbox because no local database can atomically commit with an unrelated provider.

### Deliberate failure demonstrations

Workflow tests cover transient notification retry and permanent-create compensation. For a live demo, set the worker mode before starting:

```powershell
$env:DEMO_FAILURE_MODE='notification-once' # or create-permanent
docker compose up -d --force-recreate worker
```

Start a new appointment with a new idempotency key and inspect attempts/events in Temporal UI. Reset with `$env:DEMO_FAILURE_MODE='none'`. To demonstrate recovery, stop the worker while a child timer is pending, then start it again; the timer remains in Temporal. Restarting only `backend` likewise has no effect on the Workflow.

## Efficiency choices

- One Temporal connection/client per backend process and one Prisma client per backend/worker process.
- One logical Task Queue; worker concurrency is bounded at 20 Activities and 50 Workflow Tasks.
- Small Workflow arguments/results and no database/network work in Workflow code.
- Short transactions/atomic statements only; no transaction spans Temporal, a notification call, timer, or human wait.
- Narrow Prisma `select` projections, parallel independent existence checks, no list/N+1 path.
- Only query-driven indexes: patient, appointment time, status, exact-start uniqueness, and the 20-minute overlap exclusion constraint.
- Multi-stage Node 20 slim image, deterministic `npm ci`, non-root runtime, and no unnecessary services.

At higher scale, tune Temporal pollers/concurrency from metrics, add connection-pool sizing, consider Continue-As-New for workflows with many reschedules/signals, and separate migrations from horizontally scaled API startup. Rate limiting is already Redis-backed (see Health, rate limiting, and Temporal connectivity above) rather than in-process, and reminder retries are already idempotency-key-safe at the provider (see Reconciliation above).

# Healthcare Data Security

## 1. Authentication

`POST /auth/login` verifies an email and bcrypt hash (cost 12), then issues an HS256 JWT with a one-hour default lifetime. `requireAuth` verifies signature and expiry on protected routes. The signing secret comes from `JWT_SECRET`; no token is sent to Temporal or logged.

## 2. Authorization

Patients can create only for their linked `patientId`, read and signal only their own appointments. Doctors can read only appointments assigned to their linked `doctorId`; they cannot send patient confirm/cancel actions. Admins have broad demo access. Every object action first loads the appointment's patient/doctor IDs and checks claims—knowing a URL ID is never authorization.

## 3. Input validation

Strict Zod objects reject unknown fields. IDs have length/character limits; route IDs, email/password shape, ISO dates with offsets, future appointment times, and idempotency keys are validated before Temporal/database use. Clients never supply appointment status.

## 4. Data minimization

Temporal receives only `appointmentId`, `patientId`, `doctorId`, `appointmentTime`, and reminder lead time. Full patient profiles, diagnoses, notes, prescriptions, national IDs, credentials, and tokens are excluded, reducing sensitive durable Event History.

## 5. Database protection

Prisma parameterizes queries. A dedicated `healthcare_app` role owns only the application database; the app cannot access Temporal databases. Foreign keys, primary keys, notification uniqueness, and atomic slot uniqueness reinforce integrity. Credentials are environment configuration. PostgreSQL is not published to the host.

## 6. Password protection

Seeded passwords are bcrypt hashes with cost 12; plaintext is never stored, returned, or logged. The shared demo password is only a local learning convenience.

## 7. Secret management

`.env.example` contains placeholders, `.env` is ignored, source has no production secret, and protected values are redacted by the logger. Compose fallback values are explicitly local-only. Production must inject rotated secrets from a secret manager rather than Compose/source files.

## 8. Logging privacy

Logs contain event, request ID, workflow/run/appointment ID where relevant, actor user ID for state-changing Signals, status/error code, and duration. They must never contain passwords, password hashes, JWTs, authorization headers, secrets, names/full patient records, diagnosis, medical notes, or request bodies. Pino redaction provides a second guard.

## 9. Temporal security

Workflow history contains minimized opaque IDs, schedule time, and orchestration state only. Secrets and authorization artifacts remain in process configuration. Activities—not Workflows—access protected resources. Workflow IDs use random/hash appointment IDs, never names or medical facts.

## 10. API security

Helmet headers, an explicit CORS origin, 32KB JSON limit, strict parsing/schemas, login/mutation rate limits, JWT middleware, object authorization, disabled `x-powered-by`, correlation IDs, and safe status-specific errors are implemented. Stack traces stay in server logs.

## 11. Container security

Node 20 and infrastructure images are pinned, npm uses a lockfile, the runtime is slim and runs as `node`, and `.dockerignore` excludes secrets/build clutter. Only API 3000 and UI 8080 are published; PostgreSQL and Temporal stay on the internal Compose network.

## 12. Data in transit

Local Compose traffic is **not encrypted**. Production requires HTTPS/TLS at the API, TLS to PostgreSQL, Temporal TLS/mTLS as appropriate, authenticated encrypted provider connections, and service-to-service identity controls.

## 13. Data at rest

Local named volumes are **not application-encrypted**. Production requires encryption at rest for PostgreSQL, backups, Docker/cloud volumes, Temporal persistence, and logs, with managed keys, rotation, retention, and tested restore procedures.

## 14. Auditability

Structured state-change logs capture created/confirmed/cancelled events with actor user ID (for Signals), timestamp, request ID, appointment ID, and workflow ID without clinical content. Production should persist immutable audit records with access controls, retention, export, and tamper evidence rather than relying only on container logs.

## 15. Healthcare compliance boundary

The architecture applies security principles useful for healthcare systems, but regulatory compliance also depends on deployment infrastructure, organizational controls, access policies, data retention, encryption, auditing, legal requirements, vendor agreements, and operational processes. This demo does not claim automatic HIPAA, GDPR, or PDPA compliance.

Production work includes mTLS to PostgreSQL, managed identity/secrets/keys, encrypted storage/backups, formal audit storage, JWT rotation/revocation or an external identity provider, fine-grained database grants, network policies, vulnerability/patch operations, retention/deletion policies, consent and breach processes, monitoring/alerting, disaster recovery, threat modeling, penetration testing, and applicable vendor/legal agreements. TLS to Temporal and multi-node-safe rate limiting are already supported (see Health, rate limiting, and Temporal connectivity above); provider-idempotent retries for failed reminders are already automated (see Reconciliation above).

## Testing and inspection

```bash
npm ci
npm run check
docker compose config
docker compose up --build
```

The Temporal tests use the SDK's official ephemeral time-skipping server; they do not wait real hours. Covered behavior: strict input, ownership/role authorization, durable reminder timer, read-only Query, confirm Signal, cancel Signal/release, retryable notification failure, and non-retryable creation failure with compensation. Live verification additionally covers migrations/seed/health, login, booking, duplicate idempotency key, reminder delivery, confirmation, and a concurrent two-patient race where exactly one slot persisted.

Open http://localhost:8080, select namespace `default`, and search for `appointment-<appointmentId>` (parent) or `appointment-reminder-<appointmentId>` (child). The Event History shows Activity attempts, timer start/fire, Child Workflow, Signal, and final status.

## Known limitations

- Resend delivery currently targets one configured test inbox with a generic privacy-minimized message; consented per-patient recipient mapping, delivery webhooks, bounces, and suppression handling are not implemented.
- Appointment creation is asynchronous; a business conflict is visible as a failed Workflow, not synchronously as HTTP 409. A production API could add an operation-status resource/webhook without waiting on the long reminder process.
- There is a brief interval before the appointment row/child exists in which reads, Queries, or Signals return not-found/not-ready.
- No reschedule/completion path, clinical data, frontend, distributed rate-limit store, durable audit table, token revocation, or key rotation is included.
- Local networking/storage and demo credentials are intentionally not production security controls.
