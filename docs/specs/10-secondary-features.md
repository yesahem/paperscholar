# 10 — Secondary features

Everything around the core loop. Each section is self-contained and belongs to one
milestone. Detail here is intentionally lighter than in specs 03–09; each section is
expanded into endpoint schemas when its milestone starts.

Shared rules:

- **Every feature here is free for every signed-in user.** There are no plans. The
  reference site sells most of this; here nothing is gated by payment.
- Each feature is switched on per instance, automatically when its dependencies are
  configured (spec 13 §4). Its endpoints use `requireFeature` and return `404` when off.
- Limits are flat per user, set by the instance operator (`LIMIT_*`), and exist to stop
  abuse and to bound LLM cost. They are the same for everyone.
- Anything that takes more than a few seconds uses **create, then poll**, like
  submissions. No long-held requests through the proxy.

## 1. Quiz mode — milestone 7

Multiple-choice practice by topic. The reference grades in the browser and trusts the
score; here the server grades.

**Content.** `content/exams/<topic>.yaml`:

```yaml
title: Natural Language Processing
questions:
  - id: nlp-001
    difficulty: easy
    prompt: Which component lets a Transformer use token order? # markdown
    options: [Self-attention, Positional encoding, Layer norm, Dropout]
    answer: 1 # index into options
    explanation: Self-attention is permutation-invariant, so order must be injected.
```

`answer` and `explanation` are stored in the private part of the document
(`exams/<topic>/private.json`, spec 03 §2.1) and never sent before grading.

**Flow.**

| Call                                               | Behaviour                                                                                                                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /v1/exams/topics`                             | `{ items: { id, title, questionCount }[] }`, public                                                                                                                |
| `POST /v1/exams/attempts` `{ topics, count }`      | Picks `count` (5–30) random questions, stores their IDs, returns them **without answers**, plus `expiresAt` (90 s per question, minimum 10 minutes)                |
| `POST /v1/exams/attempts/:id/submit` `{ answers }` | Grades once. Returns score, and per question: chosen, correct, explanation. Unanswered counts as wrong. A second submit or a submit after expiry → `409 conflict`. |
| `GET /v1/exams/attempts`                           | The caller's history: topics, score, total, date                                                                                                                   |

Attempts per day are limited per user (`quota_exceeded` when used up).

## 2. Roadmap — milestone 2

Tracks from `content/tracks/` (spec 03 §6), shown as ordered lists with per-paper
progress. Every track is open to everyone, including the specialised ones the reference
sells. Maintainers can add a paper to a track from the admin screens.

## 3. Listings and professor directory — milestone 7

Job listings, internships, research internships and a professor directory. Free to every
signed-in user on instances that have the data.

**Open decision: where the data comes from.** The reference does not reveal its sources.
This spec defines storage and access only. Before building, decide the sources and check
that each permits reuse. **The repository ships the feature, not the data**: an open
repository cannot redistribute a dataset unless its source allows that, so each instance
imports its own. The feature stays off until data has been imported. Two rules apply
regardless:

- Listings link to the original posting and are attributed to it.
- The professor directory contains only professional contact details that the person or
  their institution has published, stores the source URL for each entry, and has a
  documented removal process that is honoured within a few days.

**Storage.** `listings` and `professors` tables (spec 04 §7), filled by
`bun run listings:import <file>`, which validates a CSV or JSON file with zod and upserts
by `(source, external_id)`. There is no public write endpoint. Listings older than 45 days
are hidden.

**Access.**

| Call                                          | Auth      | Notes                                              |
| --------------------------------------------- | --------- | -------------------------------------------------- |
| `GET /v1/listings?kind=&q=&location=&cursor=` | Signed in | `kind`: `job`, `internship`, `research_internship` |
| `GET /v1/professors?q=&area=&cursor=`         | Signed in |                                                    |

Page size is at most 25, and both endpoints have a per-user daily row cap, so the dataset
cannot be exported in bulk through the API.

## 4. Feedback — milestone 7

| Call                                                | Behaviour                                                         |
| --------------------------------------------------- | ----------------------------------------------------------------- |
| `POST /v1/feedback` `{ type, rating?, body }`       | `type`: `review` or `bug`. Auth required. Body ≤ 2000 characters. |
| `GET /v1/feedback?type=review`                      | Public: approved reviews only                                     |
| `GET /v1/feedback?mine=1`                           | The caller's own items, including bug reports                     |
| `PATCH /v1/feedback/:id`, `DELETE /v1/feedback/:id` | Owner or admin                                                    |

Reviews are shown publicly only after an admin approves them. Bug reports are never public.

## 5. Courses — milestone 8

Video lectures with exercises. Free. An instance offers courses when its operator has
added course content and video files; the repository ships the feature and no videos.

**Content.** `content/courses/<course-id>/course.yaml`:

```yaml
title: Transformers from First Principles
summary: ...
items:
  - id: intro
    type: lecture
    title: Why attention
    video_key: courses/transformers/intro.mp4 # key in the private bucket
    duration_seconds: 540
  - id: quiz-1
    type: exercise
    title: Check your understanding
    questions: [...] # same shape as quiz questions
```

`video_key` and exercise answers go to the private part of the document.

**Access rule.** Every item is viewable by any signed-in user. Playback still uses
short-lived signed URLs, so video files are not hot-linked from other sites.

| Call                                              | Behaviour                                                               |
| ------------------------------------------------- | ----------------------------------------------------------------------- |
| `GET /v1/courses`                                 | List                                                                    |
| `GET /v1/courses/:id`                             | Syllabus                                                                |
| `GET /v1/courses/:id/items/:itemId/playback`      | `{ url, expiresInSeconds: 300 }` — a presigned GET for the video object |
| `GET /v1/courses/:id/items/:itemId/exercise`      | Questions without answers                                               |
| `POST /v1/courses/:id/items/:itemId/exercise`     | Server-graded; returns per-question results                             |
| `PUT /v1/courses/:id/items/:itemId/progress`      | `{ completed, lastWatchedSeconds }`                                     |
| `GET` / `PUT /v1/courses/:id/items/:itemId/notes` | Personal notes, ≤ 10 000 characters                                     |

**Video.** Progressive MP4 in the private R2 bucket, played with the native
`<video>` element. The player requests a fresh URL when the old one is close to expiry,
resumes from `lastWatchedSeconds`, and marks a lecture complete at 90% watched. Adaptive
streaming is out of scope until bandwidth complaints justify it.

A signed URL can be shared for five minutes. That is accepted; DRM is out of scope.

## 6. Cold-mail generator — milestone 9

The user uploads a CV, describes a recipient, and gets a draft outreach email to edit and
send themselves. **The platform never sends email on the user's behalf.**

**Flow.**

| Call                              | Behaviour                                                                                                                                                                   |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /v1/cv`                     | `multipart/form-data`, one PDF ≤ 4 MB and ≤ 10 pages. Stored in the private bucket. Returns `{ id, filename }`. At most 3 per user; uploading a fourth replaces the oldest. |
| `GET /v1/cv`, `DELETE /v1/cv/:id` | List and delete                                                                                                                                                             |
| `POST /v1/cold-mails`             | `{ cvId, targetType, target: { name, organisation, role?, notes? }, tone }` → `202 { id }`                                                                                  |
| `GET /v1/cold-mails/:id`          | `{ status: "pending" \| "done" \| "failed", subject?, body?, highlights? }`                                                                                                 |
| `GET /v1/cold-mails`              | History                                                                                                                                                                     |

`targetType` is `company` or `professor`. `notes` is free text ≤ 2000 characters. `tone`
is `formal` or `friendly`.

**LLM requirements.** All calls go through one `LlmClient` adapter built on the official
`@anthropic-ai/sdk`. Read the current SDK documentation before writing the calls; do not
guess method names.

- Model: `claude-opus-5-5`, read from an environment variable so it can be changed without
  a deploy.
- The CV PDF is sent to the model as a **document** content block, so no separate PDF
  parsing library is needed. One request both reads the CV and writes the draft.
- The response is constrained with **structured outputs** to
  `{ subject: string, body: string, highlights: string[] }` and validated with the same
  zod schema before storing.
- Set the effort level explicitly rather than relying on the model default.
- Check `stop_reason` before reading content. A `refusal` or `max_tokens` stop marks the
  mail `failed`, shows a neutral message, and does not consume quota.
- Enable the API's server-side refusal fallback option, as the SDK guidance recommends by
  default for this model.
- Handle errors with the SDK's typed error classes, distinguishing rate limits and
  overload (retry later) from bad requests (do not retry).
- Record input and output token counts on the `cold_mails` row.

**Safety.**

- The CV and the user's notes are untrusted input. The system prompt states that document
  and note contents are material to write from, not instructions to follow.
- The output is only ever shown to the user who requested it, as editable text. It is not
  rendered as HTML.
- CVs are personal data: private bucket, access only through the owner's session, deleted
  with the account.

**Limit.** Generations per user per day, set by the operator. Each one costs the operator
LLM tokens.

## 7. Mock interview — milestone 10

A timed, conversational technical interview with written feedback at the end.

**10a — text.**

| Call                                | Behaviour                                                                                                |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `GET /v1/interviews/quota`          | Sessions remaining this month                                                                            |
| `POST /v1/interviews`               | `{ cvId?, topics, role, difficulty, durationMinutes, jobDescription? }` → `{ id, firstMessage, endsAt }` |
| `POST /v1/interviews/:id/messages`  | `{ content }` → the interviewer's reply, streamed as server-sent events                                  |
| `POST /v1/interviews/:id/complete`  | Ends the session and starts feedback generation → `202`                                                  |
| `GET /v1/interviews/:id/feedback`   | `{ status, feedback? }`                                                                                  |
| `GET /v1/interviews/:id/transcript` | Ordered messages                                                                                         |

- `durationMinutes` is 10, 20 or 30. `jobDescription` is pasted text ≤ 5000 characters.
  The server does not fetch URLs supplied by users.
- Messages after `endsAt` are rejected and the session is completed automatically.
- This is an ordinary multi-turn conversation, not an agent: no tools.

**LLM requirements**, in addition to those in §6:

- The API is stateless: each turn sends the whole conversation, rebuilt from the database.
- Store each assistant turn's **full content array** as returned and replay it unchanged.
  Do not reduce stored turns to plain text; current models validate replayed history. Read
  the SDK's guidance on this before implementing.
- Put the stable material first (system prompt, CV, job description) and mark it for
  prompt caching, so each turn pays mainly for the new messages. Nothing that changes per
  request (timestamps, remaining time) may appear before the cached part.
- Stream replies.
- Feedback is one structured-output call returning
  `{ overall, dimensions: [{ name, score, evidence }], strengths, improvements,
suggestedPaperIds }`. `suggestedPaperIds` are validated against the catalogue.

**Risk to settle first.** Confirm on a preview deployment that a streamed response
survives the `/api` proxy without buffering or timing out. If it does not, serve this one
endpoint from a streaming route in `apps/web` that forwards to the API.

**10b — voice.** Added after 10a works.

```ts
interface SpeechProvider {
  transcribe(audio: Blob, mimeType: string): Promise<string>;
  synthesize(text: string): Promise<ReadableStream<Uint8Array>>;
}
```

- The browser records with `MediaRecorder`; clips are ≤ 60 seconds.
- Audio is transcribed and then discarded. Only text is stored.
- The page's Permissions-Policy allows the microphone for the site's own origin only.
- Vendor is an open decision (README Q9).

**Limit.** Sessions per user per month, set by the operator.
