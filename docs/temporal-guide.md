# Temporal: What It Is, How To Use It, and How This System Uses It

## 1. What Temporal actually is

Temporal is a **durable execution engine**. You write ordinary-looking async code (a function that calls other functions, sleeps, waits for input), and Temporal guarantees that code runs to completion exactly once from the caller's perspective — even if the process executing it crashes, the server restarts, or the wait spans days — without you writing retry loops, cron jobs, or a state machine table by hand.

The trick: Temporal doesn't keep your workflow "running" in a process. It records every meaningful thing that happens inside it (a step started, a step finished, a timer fired, a signal arrived) as an **event history** in its own database. If the worker process holding your workflow dies, a new worker picks up the history, **replays** it (re-executes your function, but skips re-doing already-recorded steps and just feeds back their recorded results), and continues exactly where it left off — new process, same execution.

## 2. Core concepts

| Concept | What it is | In this repo |
|---|---|---|
| **Workflow** | Your orchestration function — deterministic, durable, can run for years | `src/worker/workflows/appointment.workflow.ts`, `src/worker/workflows/reconciliation.workflow.ts` |
| **Activity** | A single side-effecting step (DB write, email send, API call) — retried independently, not required to be deterministic | `src/worker/activities/appointment.activities.ts`, `reservation.activities.ts`, `reminder.activities.ts` |
| **Worker** | A process that polls a task queue and executes workflow/activity code | `src/worker/worker.ts` |
| **Task Queue** | The named channel workers poll and clients dispatch to | `'healthcare-appointments'` — `src/shared/temporal/contracts.ts:5` |
| **Client** | Library used by *other* processes (your API) to start/signal/query workflows | `src/backend/temporal/client.ts` |
| **Signal** | Async, fire-and-forget message delivered into a running workflow | `src/shared/temporal/signals.ts` — confirm, cancel, complete, no-show |
| **Query** | Synchronous read of a running workflow's in-memory state, no side effects | `src/shared/temporal/queries.ts` — `appointmentState` |
| **Timer (`sleep`)** | A durable wait — doesn't hold a thread or setTimeout, survives restarts | used throughout `appointmentWorkflow` |
| **Schedule** | Temporal's built-in cron equivalent, starts a workflow on an interval | `src/backend/temporal/reconciliationSchedule.ts` |
| **Workflow ID + reuse/conflict policy** | Business-level idempotency: one workflow ID = one execution, ever | `appointmentWorkflowId(appointmentId)` — `src/shared/temporal/contracts.ts:100` |

**The one hard rule:** workflow code must be **deterministic**. No `Date.now()`, `Math.random()`, direct network/DB calls, or non-replayable branching inside a workflow function — those all go in Activities, which the workflow calls through a generated proxy (`proxyActivities<T>()`). This repo enforces the boundary with an actual test — `tests/architecture.test.ts` — that fails the build if a workflow file imports Prisma, `fs`, `crypto`, config, or logging.

## 3. When to use Temporal

Use it when a process has **two or more** of:

- Steps that must survive a crash between them (not just retry the whole thing from scratch)
- A wait measured in minutes/hours/days, not milliseconds
- A need for a human or external signal to arrive mid-process
- Multiple side effects that must either all "stick" or be compensated (saga pattern)
- A need for at-least-once execution with retries/backoff per step

Don't reach for it for a plain synchronous CRUD request/response, a short pipeline with no external wait, or anything where a database transaction alone gives you the durability guarantee you need. It's also the wrong tool if you can't tolerate running an extra stateful service (Temporal Server + its own Postgres).

## 4. Why Temporal over the alternatives

The alternative to Temporal for this appointment flow would be: a `status` column, a cron job polling for "reminders due," a queue (SQS/RabbitMQ) for retries, a distributed lock or `SELECT ... FOR UPDATE` to avoid double-processing, a saga table to track compensation, and manual reconciliation scripts for anything that falls through the cracks. That's five separate pieces of infrastructure, each with its own failure modes, to reproduce what Temporal gives as one execution model:

- durable timers (no polling table for "send reminder at 6pm three days from now")
- automatic per-activity retry/backoff with typed non-retryable errors
- one place (event history) to see exactly what happened to one appointment
- workflow ID collision handling as the idempotency mechanism, instead of a hand-rolled dedupe table

The cost: an extra service to operate, a determinism constraint on workflow code, and a learning curve around replay semantics. The trade-off report in this repo (`SYSTEM_REPORT.md`, §4.2) calls this out explicitly.

## 5. Generic steps to build a Temporal-backed system

1. **Run Temporal Server** (self-hosted via Docker Compose, or Temporal Cloud). It needs its own persistence store (Postgres/Cassandra/MySQL) and, self-hosted, a visibility store for search.
2. **Define the contract** — plain TypeScript interfaces shared by both sides: workflow input/output types, activity function signatures, signal/query names. (This repo centralizes them in `shared/temporal/contracts.ts`, `signals.ts`, `queries.ts` so client and worker can't drift.)
3. **Write activities** — plain async functions with real side effects (DB, HTTP, email). Each throws typed errors that the workflow's retry policy can classify as retryable or not.
4. **Write the workflow** — call `proxyActivities<T>({ startToCloseTimeout, scheduleToCloseTimeout, retry })` to get a typed, retry-wrapped handle to your activities; use `setHandler` for signals/queries; use `sleep`/`condition`/`Promise.race` for durable waits and racing a timer against a signal.
5. **Run a Worker** — `Worker.create({ connection, taskQueue, workflowsPath, activities })`, then `worker.run()`. One process, polls the task queue, executes both workflow tasks (replay) and activity tasks.
6. **Start/signal/query from your API** — a `Client` connects to the same Temporal Server/namespace; `client.workflow.start(...)`, `.signal(...)`, `.query(...)`, using a **stable, business-derived workflow ID** for idempotency and a reuse/conflict policy that matches your semantics (here: `REJECT_DUPLICATE` + `FAIL`, so a retried booking request never starts a second workflow).
7. **Add Schedules** for anything cron-shaped (here: the reconciliation sweep) instead of a separate cron container.
8. **Test with time-skipping** — `@temporalio/testing`'s `TestWorkflowEnvironment` lets you assert on a workflow that "waits 3 days" without actually waiting, by advancing a mocked clock. This repo's `tests/workflows.test.ts` and `tests/reconciliation-workflow.test.ts` do exactly this.
9. **Instrument it** — Temporal ships OpenTelemetry interceptors for both worker and client so workflow/activity spans show up in the same tracing backend as your HTTP spans (used here — see the interceptor wiring in `src/worker/worker.ts:42-61` and `src/backend/temporal/client.ts:22`).

## 6. How this specific system uses it

**One workflow per appointment**, keyed by a deterministic workflow ID (`appointment-<appointmentId>`) where `appointmentId` itself is derived from `(userId, idempotencyKey)` — `src/backend/api/appointment.service.ts:41-42`. That double layer means a retried HTTP request can never produce two workflows, and `workflowIdConflictPolicy: FAIL` + `workflowIdReusePolicy: REJECT_DUPLICATE` turns a duplicate start attempt into a clean `ALREADY_STARTED` response rather than an error.

**The workflow itself** (`src/worker/workflows/appointment.workflow.ts`) is a single long-lived state machine, not a parent/child split:

- Validates the booking, then reserves the doctor's slot via an activity — if reservation fails, it **compensates** by releasing the slot and marking `BOOKING_FAILED` (a saga, done by hand in workflow code, not a Temporal-native primitive).
- Registers signal handlers (`confirmAppointment`, `cancelAppointment`, `markAppointmentCompleted`, `markAppointmentNoShow`) and a query handler (`appointmentState`) up front via `setHandler`.
- Uses `Promise.race([sleep(duration), condition(() => confirmed || cancelled)])` repeatedly — this is the idiomatic Temporal pattern for "wait until either a durable timer fires or a signal arrives, whichever comes first." That's how the confirmation-reminder deadline, the upcoming-reminder timer, and the appointment-time wait are all implemented, without ever polling.
- Distinguishes retryable infrastructure failures from genuine business conflicts using `nonRetryableErrorTypes` on the activity proxy (e.g. `DOCTOR_UNAVAILABLE` fails fast; a transient DB error retries with backoff) — `src/worker/workflows/appointment.workflow.ts:22-34`.
- Treats reminder sends as **best-effort**: a failed reminder never aborts the appointment lifecycle, only reconciliation later retries it — see `sendReminderBestEffort` at `src/worker/workflows/appointment.workflow.ts:50-60`.

**A second workflow, `reconciliationWorkflow`**, runs on a **Temporal Schedule** (Temporal's native cron) created idempotently at backend startup — `src/backend/temporal/reconciliationSchedule.ts`. It sweeps for state the primary workflow couldn't self-heal: stale slot reservations, orphaned reminders, retryable failed reminders, and appointments "stuck" past their expected transition time (logged for a human, never auto-resolved when ambiguous). `ScheduleOverlapPolicy.SKIP` guarantees two sweeps never run concurrently over the same rows.

**The backend never touches worker code.** It only imports the shared contracts and talks to Temporal through `Client.workflow.start/getHandle/signal/query` (`src/backend/api/appointment.service.ts`) — enforced by the architecture test. This is what makes "durable, resumable, multi-day appointment lifecycle" possible without the API process ever holding a timer, a queue consumer, or an in-memory state machine of its own.
