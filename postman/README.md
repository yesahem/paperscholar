# API contract collection

`collections/PaperScholar API/` is the API contract of docs/specs/05-api.md as runnable
checks, in Postman's v3 (git-native YAML) format. Each endpoint has at least one request
with assertions on its status, headers and response shape. When an endpoint changes, the
zod schema in `packages/shared`, this collection and the spec change in the same pull
request.

## Run it

Needs the [Postman CLI](https://learning.postman.com/docs/postman-cli/postman-cli-installation/);
no Postman account is required for local files.

```sh
bun run content:sync     # once: publish the repository's papers to local storage
bun dev                  # backend on :8797
bun run api:contract     # the collection against the local backend
```

Against a deployment, override the base URL:

```sh
postman collection run "postman/collections/PaperScholar API" \
  -e postman/environments/preview.environment.yaml --env-var baseUrl=https://preview.example.com
```

The requests discover a paper and a problem from the catalogue, so the collection works on
any instance with at least one published paper. CI runs it against a backend serving the
repository's content (`.github/workflows/ci.yml`).

## Layout

| Path                                        | Holds                                                                                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `collections/PaperScholar API/.resources/`  | Collection variables and checks every response must pass                                                                                         |
| `collections/PaperScholar API/content/`     | `GET /v1/papers`, papers, problems and tracks, 304s, 400/404                                                                                     |
| `collections/PaperScholar API/accounts/`    | Sign-up, `/v1/me` read, update, refusals, admin 404, delete                                                                                      |
| `collections/PaperScholar API/submissions/` | Signed-out 401, a run of the starter followed to its verdict, history, 400, 404. On an instance that requires a confirmed email, the 403 instead |
| `collections/PaperScholar API/instance/`    | `GET /v1/config` and `POST /api/csp-report`                                                                                                      |
| `environments/`                             | `local` (`http://localhost:8797`) and `preview`; `webOrigin` is sent as `Origin` on writes                                                       |

The accounts folder creates a throwaway account and deletes it. Sign-up is rate-limited per
address (10 per 10 minutes by default), so many runs in a row from one machine get `429`.

Lint after editing: `postman collection lint "postman/collections/PaperScholar API"`.
