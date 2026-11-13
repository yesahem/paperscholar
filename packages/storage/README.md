# `@repo/storage`

Object storage behind one interface, `ObjectStorage`: `get`, `getIfChanged`, `head`, `put`
(with `ifMatch` / `ifNoneMatch: "*"`), `delete`, `list`. Spec: docs/specs/03-content.md §2.4.

| Driver | Class       | Backed by                                 | Use                                                      |
| ------ | ----------- | ----------------------------------------- | -------------------------------------------------------- |
| `fs`   | `FsStorage` | a local folder                            | development, tests, self-hosting without an object store |
| `r2`   | `S3Storage` | Cloudflare R2, or any S3-compatible store | the hosted instance; required on serverless              |

```ts
import { createStorage } from "@repo/storage";

const storage = createStorage({ driver: "fs", root: ".storage" });
await storage.put("content/index.json", body, { ifMatch: etag }); // throws PreconditionFailedError if it changed
```

## Guarantees

- **Keys are validated.** Only relative keys of simple segments (`a-z A-Z 0-9 . _ - @`, starting
  with a letter or digit) are accepted, so no key can address anything outside the root.
- **Conditional writes.** `ifNoneMatch: "*"` writes only if the key is absent; `ifMatch`
  only if the etag is current. Either way a refusal throws `PreconditionFailedError` and
  writes nothing. The `fs` driver is atomic within one process; across processes, callers
  hold a database lock.
- **No partial reads.** The `fs` driver writes to a temporary file and renames it into place.

## The `r2` driver

Requests are signed with SigV4 by [`aws4fetch`](https://github.com/mhart/aws4fetch) and sent
with `fetch`, so the driver runs on any host. Bun's built-in S3 client is not used because it
cannot send conditional-write headers. R2 evaluates `If-Match` / `If-None-Match` on PUT
atomically.

## Tests

`bun test` runs one contract suite against every driver. The `fs` run always happens; the
S3 run happens when `S3_TEST_*` is set (see `.env.example`), against the S3-compatible
server in `docker-compose.dev.yml`.
