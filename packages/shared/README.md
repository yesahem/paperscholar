# `@repo/shared`

Contracts used by both the backend and the web app. Browser-safe: no Node, Bun or server
dependencies, only `zod`.

| Export                                                             | What                                                                                                                  |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `SITE`                                                             | Product name, tagline, description and repository URL.                                                                |
| `ERROR_CODES`, `ERROR_STATUS`, `ERROR_MESSAGES`, `errorCodeSchema` | Every API error code with its HTTP status and default message (docs/specs/05-api.md §3).                              |
| `errorBodySchema`, `validationIssueSchema`                         | Shape of every non-2xx API response.                                                                                  |
| `healthResponseSchema`                                             | Response of `GET /api/health`.                                                                                        |
| `parseEnv`, `EnvError`, `httpOriginSchema`                         | Environment validation used by every app: blank counts as unset, every problem is reported, each naming its variable. |

Add a schema here when both sides need it. Keep app-specific logic out.
