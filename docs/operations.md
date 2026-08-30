# Production deployment and operations

## Supported deployment targets

The application can run anywhere that supports OCI containers and provides PostgreSQL, Redis, and a reachable Temporal cluster. Suitable targets include a single hardened Linux VM with Docker Compose for a small installation, AWS ECS/Fargate, Azure Container Apps, Google Cloud Run (API only) plus a continuously running worker service, Fly.io, Render, or another managed container platform. Kubernetes manifests and cloud-specific infrastructure are deliberately outside this repository.

Deploy four independent workloads from two images:

| Workload | Image / command | Scaling and exposure |
|---|---|---|
| Migration job | app image / `npm run prisma:migrate` | Run once before rollout; never scale |
| API | app image / `npm start` | Replicas may scale horizontally; expose through a TLS load balancer |
| Temporal worker | app image / `npm run worker` | Replicas may scale horizontally; no public ingress |
| Web frontend | frontend image | Expose through the same TLS endpoint; `/api` proxies to the API |

Use managed PostgreSQL with verified server certificates, managed Redis with TLS/authentication, and Temporal Cloud or a TLS-enabled self-hosted cluster. The local Compose PostgreSQL, Redis, Temporal auto-setup, demo seed, and plaintext service network are development conveniences, not a production topology.

## Deployment sequence

1. Create versioned secrets and dependency endpoints in the platform secret manager. Never place them in an image, Compose file, CI variable output, or Git.
2. Select the CI-produced `git-<full SHA>` image tags and record their registry digests. Deploy by digest where the platform supports it.
3. Run the migration workload once using the new app image. `prisma migrate deploy` is the only automatic production database operation; seed data is never part of API startup.
4. Roll out workers first. Confirm connection, poller, activity-failure, and task-backlog metrics before continuing. Temporal's durable history makes worker restarts safe, but Workflow code changes must remain replay-compatible.
5. Roll out the API gradually, keeping at least one old replica until new replicas pass `/liveness` and `/readiness` and HTTP errors/latency remain normal.
6. Roll out the frontend, run login/availability/booking/query smoke checks, and observe one full reminder and reconciliation interval.
7. Promote the recorded digest to the next environment. Do not rebuild between environments.

The schema change policy is expand/migrate/contract: first add backward-compatible columns/tables, deploy code that tolerates both forms, migrate data separately, and remove old schema only in a later release. Never combine an incompatible schema removal with the first code rollout.

## Rollback

Stop promotion when readiness, API error ratio, p95 latency, workflow/activity failures, reminder failures, or reconciliation repairs breach their alert thresholds. Roll back the API, worker, and frontend to the previous recorded image digests. Do not automatically roll a database migration backward: Prisma migrations can be destructive and Temporal histories may contain the new Workflow code. For a failed additive migration, keep the expanded schema and restore the prior compatible application. For an incompatible change, follow a reviewed forward-fix/runbook and verify Workflow replay before changing worker code.

## TLS, proxy, and secrets

Terminate public TLS at a managed load balancer or ingress and redirect HTTP to HTTPS there. Set HSTS at that public TLS terminator. It must pass `X-Forwarded-Proto`, `X-Forwarded-For`, and a request ID. Set `TRUST_PROXY_HOPS` to the exact number of trusted hops; leaving it at zero prevents spoofed client IPs. The bundled Nginx adds browser security headers and forwards the proxy headers but is an internal HTTP server.

Production configuration fails closed unless PostgreSQL uses `sslmode=verify-full`, Redis uses `rediss://`, Temporal uses TLS/API-key/mTLS, the JWT secret is at least 48 characters, Resend is configured, and tracing has an OTLP endpoint when enabled. Temporal mTLS certificates and keys are read from mounted files. Rotate secrets by creating a new secret version, restarting the affected workloads gradually, validating readiness, then revoking the old version. JWT-secret rotation invalidates existing sessions; schedule it accordingly.

Secret values include `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `TEMPORAL_API_KEY`, Temporal client keys, `RESEND_API_KEY`, and registry credentials. Non-secret settings include service addresses without credentials, ports, task queues, timing policy, issuer/audience names, and telemetry toggles. Structured logging redacts common credential fields and correlates active traces using `traceId`/`spanId`; do not add patient names, emails, tokens, raw URLs, or request bodies as trace attributes.

JWTs enforce issuer, audience, and a production lifetime of at most one hour. Refresh tokens, per-token revocation, asymmetric signing, and overlapping-key rotation are not implemented; treat those as remaining authentication risks before a high-assurance public launch.

## Observability

Application Prometheus endpoints listen inside each container on port 9464; the worker's Temporal SDK metrics listen on 9465. They are intentionally not published by the default Compose file. Metrics use bounded labels such as normalized route, status class, state, reminder type, repair type, and rate-limit policy—never appointment IDs, user IDs, emails, or tokens.

Tracing uses Node automatic instrumentation plus Prisma's official instrumentation for database query latency/errors, Redis, Express/HTTP, and outbound HTTP, with Temporal's official client/activity interceptors across durable execution boundaries. Connection-pool saturation should also be monitored at the managed PostgreSQL service because Prisma does not expose every engine-pool gauge through this application exporter.

For optional local dashboards and OTLP validation:

```bash
docker compose -f docker-compose.yml -f docker-compose.observability.yml --profile observability up --build
```

Prometheus is at `http://localhost:9090` and Grafana at `http://localhost:3001`. The local collector prints trace summaries; production should point `OTEL_EXPORTER_OTLP_ENDPOINT` at the organization's authenticated collector/backend. Alert rules cover API availability/error ratio/p95 latency, Temporal workflow/activity failures, reminder failures, reconciliation failures/repair spikes, and Redis rate-limit failures/blocking spikes. Route alerts into the existing paging system and tune thresholds from observed baselines.

## Health and incident checks

`/liveness` only proves the API process is alive. `/readiness` checks PostgreSQL, Temporal, and Redis and removes an unhealthy replica from service. During an incident, check dependency TLS/authentication, API and worker logs by `requestId`/`traceId`, Temporal Workflow history, task-queue metrics, reminder transition metrics, and reconciliation repair counts. A Redis outage makes readiness fail; rate limiting deliberately fails open so Redis failure cannot corrupt booking correctness, but it is a security degradation that should page immediately.

## CI/CD gates

`.github/workflows/ci.yml` uses Node 20 and runs backend type checking/tests/build/schema validation, frontend type checking/lint/tests/build, PostgreSQL+Redis integration tests after real migrations, immutable OCI builds, Trivy severity gates, SPDX SBOM generation, and exact-image Compose smoke tests. Pushes publish `git-<full SHA>` tags to GHCR. Protect the production environment with required review and deploy only a digest that passed every job.
