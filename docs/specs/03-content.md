# 03 — Content

What a paper and a problem are, where they live, and how they are kept correct.

## 1. Model

```
Paper   (metadata, link to the paper itself)
 └── Problems, ordered   ("learning steps")
       ├── shown to learners: description, tutorial, starter code, limits
       └── never shown:       reference solution, tests, helper source
Track   (an ordered list of papers)
```

"Step" and "problem" mean the same thing. The pipeline and the UI say _step_; tables and
endpoints say _problem_.

## 2. Where content lives

**Paper content lives in object storage, on Cloudflare R2. It is not in the database.**

Postgres holds users, submissions, progress, and the pipeline's job state. It holds no
paper, problem, description, test or solution.

Content reaches storage by three routes, all writing the same objects:

| Route              | Who                        | How                                                                          |
| ------------------ | -------------------------- | ---------------------------------------------------------------------------- |
| Paper pipeline     | A maintainer uploads a PDF | AI writes the steps; checks verify them; the maintainer publishes (spec 09)  |
| Repository library | Project contributors       | Files under `content/`, reviewed by pull request, uploaded by `content:sync` |
| Direct editing     | A maintainer               | The review screen, on any draft or published paper                           |

`content/` in the repository is the project's **shared library** and the **exchange
format**: every instance uploads it to its own storage on start, and any paper can be
exported back to it.

### 2.1 Object layout

One private bucket. Keys:

```
content/
  index.json                           catalogue of every paper; the only mutable object
  index-history/<timestamp>.json       previous copies of index.json
  papers/<paperId>/v<N>/public.json    metadata and each problem's public parts
  papers/<paperId>/v<N>/private.json   solutions, tests, helper source
  papers/<paperId>/draft/public.json   an unpublished draft
  papers/<paperId>/draft/private.json
  papers/<paperId>/candidates/<id>.json  an edit awaiting verification
  tracks.json
  exams/<topic>/public.json  private.json
  courses/<courseId>/public.json  private.json
ingestions/<ingestionId>/...           pipeline working files, incl. the PDF (spec 09 §15)
uploads/cv/<userId>/...                milestone 9
video/...                              milestone 8
```

`index.json` holds, for every paper: ID, status, source, current version, title, authors,
year, URL, summary, tags, who published it and when, and its ordered problem list (ID,
title, summary, difficulty, type, status). The catalogue, paper pages, statistics and the
leaderboard need nothing else, so each is served from this one object.

`public.json` adds each problem's description, tutorial, starter, limits and
`helpersInterface` (the helpers' signatures and docstrings, never their bodies).
`private.json` holds each problem's solution, both test files and helper source.

### 2.2 Rules

- **Version folders are immutable.** Once `v<N>` is written it is never changed.
  Publishing a change writes `v<N+1>`.
- **`index.json` is the commit point.** A version is live when the index points at it, and
  not before. Rolling back is pointing the index at the previous version.
- **One writer at a time.** A write to `index.json` is read-modify-write under a Postgres
  advisory lock, and uses a conditional write on the object's ETag where the storage
  supports it. The previous index is copied to `index-history/` first.
- **The bucket is private.** No content object has a public URL. Everything a learner
  sees is served by the API, which chooses the fields.
- **Public and private parts are separate objects**, so code that serves learners never
  loads a solution or a test.
- Draft and candidate objects are deleted when published or discarded.

### 2.3 Reading

The API reads through a small cache, per running instance:

| Object                                  | Cached                                      | Refreshed                                                     |
| --------------------------------------- | ------------------------------------------- | ------------------------------------------------------------- |
| `index.json`                            | Up to 30 seconds                            | Conditional GET with its ETag; unchanged costs almost nothing |
| `v<N>/public.json`, `v<N>/private.json` | Until the instance stops, with a size bound | Never; versions are immutable                                 |
| Drafts and candidates                   | Not cached                                  | —                                                             |

A cold serverless instance costs one `index.json` read. The web app never reads storage;
it calls the API (spec 08 §1).

### 2.4 Storage drivers

`packages/storage` defines one `ObjectStorage` interface (get, put, delete, list, head,
conditional get and put, presigned upload and download URLs) with two drivers:

| Driver | Backed by                                   | Used for                                                    |
| ------ | ------------------------------------------- | ----------------------------------------------------------- |
| `r2`   | Cloudflare R2 through its S3-compatible API | The hosted instance; any instance that wants it             |
| `fs`   | A directory on disk                         | Local development, tests, and self-hosting with no accounts |

Both use the same keys. Because R2 speaks the S3 protocol, the `r2` driver also works
against other S3-compatible stores by changing the endpoint, but R2 is what is supported
and tested. A serverless deployment has no persistent disk, so it MUST use `r2`.

R2 set-up, to confirm against Cloudflare's current documentation:

- two buckets: a private one for everything above, and a public one for avatars;
- an API token limited to object read and write on those two buckets;
- the S3 endpoint for the account, with region `auto`;
- a CORS rule on the private bucket allowing `PUT` from the site's origin, for presigned
  PDF and CV uploads from the browser.

## 3. Lifecycle and versions

| Status                 | Paper                                                           | Problem          |
| ---------------------- | --------------------------------------------------------------- | ---------------- |
| `draft`                | Visible to maintainers only; lives under `draft/`               | —                |
| `published`            | Listed and open to everyone                                     | Open to everyone |
| `archived` / `retired` | Hidden from lists; still shown to users who solved its problems | Same             |

- A paper's status and current version are in `index.json`. A problem's status is in the
  paper's `public.json`.
- A paper is published by a maintainer (spec 09 §11). The first publish writes `v1`.
- **Published content is always verified content.** An edit to a published paper is
  written as a candidate object, verified, and only then written as the next version and
  committed through the index (§8).
- Each paper records its `source`: `repo`, `pipeline` or `manual`.
- A submission records the paper version it was graded against.
- Only drafts are deleted. A published paper is archived, so user history that refers to
  it stays meaningful.

## 4. Identifiers

- IDs match `^[a-z0-9]+(-[a-z0-9]+)*$`, at most 64 characters.
- A problem ID is unique within its paper.
- **IDs are permanent once published.** Progress and submissions reference them.
- In the file format, a paper's ID is its folder name and a problem's ID is its folder
  name without the numeric prefix (`01-positional-encoding` → `positional-encoding`). The
  prefix sets the order.

## 5. A problem's parts

| Part           | Shown to learners                   | Purpose                                                                                                                                                                   |
| -------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `description`  | Yes                                 | The task. Markdown with GFM and LaTeX. States inputs, outputs, shapes and dtypes. Solvable from this text alone.                                                          |
| `tutorial`     | Yes                                 | Optional background, shown in its own tab                                                                                                                                 |
| `starter`      | Yes                                 | What the editor is prefilled with: signature, docstring, `raise NotImplementedError`                                                                                      |
| `solution`     | **Never**                           | Reference implementation. Proves the tests are satisfiable.                                                                                                               |
| `tests_public` | Results and failure detail          | Run on **Run** and **Submit**. A small set a learner can reason about.                                                                                                    |
| `tests_hidden` | Test names and messages only        | Run on **Submit** only. Edge cases and larger inputs.                                                                                                                     |
| `helpers`      | Interface only, via the description | Optional. Code from earlier steps that this step may call; importable as `helpers` in the sandbox. Its source is not shown, so later steps do not reveal earlier answers. |

Metadata:

| Field                | Rule                                                                                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`, `summary`   | Required                                                                                                                                                                     |
| `difficulty`         | `easy`, `medium`, `hard`                                                                                                                                                     |
| `type`               | `micro` (one function) or `model` (assembles earlier pieces)                                                                                                                 |
| `entry_point`        | A function or class name defined by both `starter` and `solution`                                                                                                            |
| `environment`        | `numpy` or `torch`; selects the sandbox image                                                                                                                                |
| `allowed_packages`   | Third-party modules the solution may import. The standard library is allowed except for the global denylist (spec 07 §5). `helpers` is allowed when the problem has helpers. |
| `prohibited_imports` | Modules banned even though the environment has them. This is what makes a step "from scratch".                                                                               |
| `time_limit_seconds` | 1–30, per test                                                                                                                                                               |
| `memory_limit_mb`    | 64–2048                                                                                                                                                                      |
| `paper_refs`         | Where in the paper this comes from: "§3.2", "Eq. 1"                                                                                                                          |

Conventions for tests, whoever or whatever writes them:

- Tests import from a module named `solution`: `from solution import positional_encoding`.
- One behaviour per test function. Names read as sentences
  (`test_output_has_shape_seq_len_by_d_model`), because the name is shown to the learner.
- Every assertion carries a message written for the learner:
  `assert out.dtype == np.float32, "expected dtype float32"`.
- Tests are deterministic. Seed any randomness.
- Hidden-test messages do not print whole expected arrays.
- Markdown contains no raw HTML.

## 6. File format

```
content/
  papers/
    attention-is-all-you-need/
      paper.yaml
      problems/
        01-positional-encoding/
          problem.yaml
          description.md
          tutorial.md              optional
          starter.py
          solution.py
          helpers.py               optional
          tests/
            test_public.py
            test_hidden.py
  tracks/
    fundamentals.yaml
  exams/                           milestone 7
  courses/                         milestone 8
```

```yaml
# paper.yaml
title: Attention Is All You Need
authors: [Vaswani et al.]
year: 2017
url: https://arxiv.org/abs/1706.03762
summary: The Transformer architecture, built from self-attention instead of recurrence.
tags: [nlp, transformer]
```

```yaml
# problem.yaml
title: Positional Encoding
summary: Implement sinusoidal positional encodings.
difficulty: easy
type: micro
entry_point: positional_encoding
environment: numpy
allowed_packages: [numpy]
prohibited_imports: [torch, jax]
time_limit_seconds: 2
memory_limit_mb: 256
paper_refs: [§3.5]
status: published # optional: published (default) or retired
```

```yaml
# tracks/fundamentals.yaml
title: Fundamentals
summary: Classical models and the building blocks of deep learning.
papers: [support-vector-machines, word2vec, attention-is-all-you-need]
```

`tags` come from a controlled list in `packages/shared`.

- `prohibited_imports` may name a module (`torch`) or a submodule path (`torch.optim`).
- `allowed_packages` must be installed in the chosen environment (`ENVIRONMENT_PACKAGES` in
  `packages/shared`, kept equal to `packages/runner/environments/` by a test).
- YAML files use one canonical style (plain scalars where unambiguous, JSON-quoted
  otherwise, `[a, b]` lists when the line fits in 90 columns). `content:export` writes that
  style, so exporting a synced paper reproduces its files byte for byte.
- Images in markdown are not supported yet; they arrive with the content pages (M2).

## 7. Sync and export

**`bun run content:sync`** uploads `content/` to storage. It runs when an instance starts
and in CI before a hosted deploy.

- It validates every file against the same zod schemas the pipeline uses, and fails with
  the file name on any violation.
- For each paper it compares a hash of the files with the hash recorded in `index.json`.
  Unchanged papers are skipped. Changed or new papers are written as the next version and
  committed through the index as `published`.
- It creates or updates only papers whose `source` is `repo`. It never touches a paper
  made by the pipeline or edited on the instance, even if the ID is the same; it reports
  the conflict instead.
- A problem removed from the files is marked `retired`, never dropped.
- Tracks, quiz sets and courses are uploaded the same way.

**`bun run content:status <paper-id> <draft|published|archived>`** changes a paper's
status in `index.json` without writing a version. Learners see the change within a minute
(spec 05 §4).

**`bun run content:export <paper-id>`** downloads a paper's current version from storage
and writes it to `content/` in the file format above. This is how a paper produced by the
pipeline is contributed to the shared library.

## 8. Verification

One function, `verifyProblem(problem)`, in `packages/pipeline`, is used everywhere a
problem's correctness matters. It runs the checks defined in spec 09 §8.

| Where it runs                                    | Checks                            | Uses                            |
| ------------------------------------------------ | --------------------------------- | ------------------------------- |
| `content:verify` in CI, on changes to `content/` | V1–V6, V10                        | `local` provider; no LLM needed |
| Paper pipeline                                   | V1–V10                            | Real sandbox and LLM            |
| Editing in the review screen                     | V1–V6, V10; V7–V9 on "full check" | Real sandbox                    |

V1–V6 and V10 need only the sandbox, so contributors can verify papers written by hand
without an LLM key. V7–V9 need a model.

Rules:

- A problem cannot be `published` unless its current content has passed V1–V6 and V10.
  The verified content hash is stored with the problem.
- A change to a published problem is stored as a candidate object, verified, and then
  published as the paper's next version. Learners never see or get graded by unverified
  content.
- A pull request that adds or changes a paper cannot merge unless `content:verify` passes.

## 9. Keeping the private parts private

1. `solution`, tests and `helpers` are in `private.json`, a separate object from the
   public parts. It is read by exactly two code paths: building a sandbox run, and the
   maintainer endpoints.
2. The bucket is private and its credentials exist only in the API and worker. Presigned
   URLs are issued only for uploads, avatars and video, never for a content object.
3. API responses are built from explicit allow-lists of fields, never by returning an
   object as stored.
4. A test stores a problem whose private parts contain a canary string, requests every
   learner-facing endpoint, and fails if the canary appears anywhere.
5. The web app has no storage or database credentials.

Maintainer endpoints do return private parts, and are guarded by role (spec 06 §6).

## 10. Changing published content

| Change                      | Effect                                       | Rule                                           |
| --------------------------- | -------------------------------------------- | ---------------------------------------------- |
| Fix a typo in a description | None                                         | Verified automatically, applied at once        |
| Add or tighten a test       | Past solutions might no longer pass          | Allowed; existing `progress` rows are kept     |
| Add a problem to a paper    | Paper may become "incomplete" for some users | Recorded completions are never revoked (04 §5) |
| Remove a problem            | Would orphan progress                        | Retire it instead                              |
| Rename an ID                | Breaks stored references                     | Not allowed without a migration                |

## 11. Launch content

The repository library needs at least three complete papers at milestone 1, written by
hand, to prove the format before the pipeline exists: one classical ML paper (NumPy), one
attention-based paper (NumPy), one that allows PyTorch. These later double as the
reference set for measuring pipeline quality (spec 09 §18).
