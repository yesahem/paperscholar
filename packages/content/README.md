# `@repo/content`

Papers and problems: their file format, their storage layout, and the commands that move
them between the two. Spec: docs/specs/03-content.md.

| Export                                    | What                                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `readContentLibrary(root)`                | Reads and validates a `content/` folder. Throws `ContentValidationError` listing every problem with its file. |
| `ContentStore`                            | Paper content in object storage: the index, immutable versions, a read cache.                                 |
| `syncLibrary(store, library)`             | Publishes changed repository papers as new versions. Never touches papers made on the instance.               |
| `exportPaper(store, paperId, root)`       | Writes a paper's live version back to the file format, byte-identical to its source.                          |
| `findRawHtml`, schemas, `toCanonicalYaml` | Building blocks shared with verification.                                                                     |

## Storage layout

```
content/index.json                       catalogue; the only mutable object and the commit point
content/index-history/<stamp>-<id>.json  every previous index
content/papers/<id>/v<N>/public.json     what learners may see
content/papers/<id>/v<N>/private.json    solutions, tests, helper source
content/tracks.json
```

- Version folders are written once (`ifNoneMatch: "*"`) and never changed.
- A version is live when the index points at it. Writers hold the index lock
  (`createAdvisoryLock` from `@repo/db` in production, `createProcessLock` in tests) and also
  write the index conditionally on its etag. Rolling back is `setLiveVersion`.
- Public and private parts are separate objects, so code serving learners never loads tests
  or solutions.
