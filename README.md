# Temporal Healthcare Appointment Demo

A deliberately small, production-minded learning project for Temporal. It books an appointment, atomically reserves the doctor's slot in PostgreSQL, starts a reminder Child Workflow, waits on a durable timer, and accepts confirm/cancel Signals. Product features outside that process are intentionally thin.

## Start and use it

Only Docker Desktop with Compose is required:

```bash
docker compose up --build
```

- API: http://localhost:3000
- Health: http://localhost:3000/health
- Frontend: http://localhost:5173
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

For a quick reminder, Compose defaults to `REMINDER_LEAD_TIME_SECONDS=30`: choose an appointment roughly 45–60 seconds ahead. For a realistic deployment set the value to `86400`. Configuration is read by the backend and copied into the Workflow input; Workflow replay never reads environment variables.

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
  W->>P: atomic unique slot reservation
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
| Database uniqueness | `SlotReservation @@unique([doctorId, appointmentTime])` | Two workers racing for the same slot cannot both win; Prisma `P2002` becomes `DOCTOR_UNAVAILABLE`. |
| Idempotent Activities | primary/unique keys, upsert/deleteMany, guarded updates | Retries cannot duplicate an appointment, reservation, release, notification record, or valid state transition. |
| Saga compensation | booking Workflow `catch` after `createAppointment` | A permanent/exhausted create failure invokes idempotent `releaseAppointmentSlot`; temporary failures retry before compensation. |
| Durable state/timer | Temporal Event History and `sleep` | Worker, backend, or container restarts do not lose progress or the reminder schedule. |
| Connection retry | backend client and worker startup | Dependencies are retried with bounded increasing delays; Compose health gates also prevent premature startup. |
| Graceful shutdown | server close and Worker SDK run loop | Backend stops accepting HTTP and closes clients; worker handles SIGTERM/SIGINT, drains, then closes Temporal/Prisma. |

Notification delivery is represented by a structured-log adapter. Its database uniqueness prevents repeat demo sends. A production provider must also accept `appointmentId + notificationType` as its idempotency key (or use a transactional outbox), because no local database can atomically commit with an unrelated external provider.

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
- Only query-driven indexes: patient, appointment time, status, and the slot uniqueness constraint.
- Multi-stage Node 20 slim image, deterministic `npm ci`, non-root runtime, and no unnecessary services.

At higher scale, replace the in-memory rate-limit store with a shared service, use a provider/outbox notification adapter, tune Temporal pollers/concurrency from metrics, add connection-pool sizing, consider Continue-As-New for workflows with many reschedules/signals, and separate migrations from horizontally scaled API startup.

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

Production work includes TLS/mTLS, managed identity/secrets/keys, encrypted storage/backups, formal audit storage, JWT rotation/revocation or an external identity provider, multi-node rate limiting, provider idempotency/outbox, fine-grained database grants, network policies, vulnerability/patch operations, retention/deletion policies, consent and breach processes, monitoring/alerting, disaster recovery, threat modeling, penetration testing, and applicable vendor/legal agreements.

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

- Notification delivery is a safe idempotency demonstration, not a real email/SMS integration.
- Appointment creation is asynchronous; a business conflict is visible as a failed Workflow, not synchronously as HTTP 409. A production API could add an operation-status resource/webhook without waiting on the long reminder process.
- There is a brief interval before the appointment row/child exists in which reads, Queries, or Signals return not-found/not-ready.
- No reschedule/completion path, clinical data, frontend, distributed rate-limit store, durable audit table, token revocation, or key rotation is included.
- Local networking/storage and demo credentials are intentionally not production security controls.
