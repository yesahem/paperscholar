import { afterEach, describe, expect, test } from "bun:test";
import { ContentValidationError, readContentLibrary } from "../src";
import {
  baseLibrary,
  courseYaml,
  examYaml,
  problemFiles,
  writeLibrary,
  type LibrarySpec,
} from "../src/testing";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

async function read(spec: LibrarySpec) {
  const { root, cleanup } = await writeLibrary(spec);
  cleanups.push(cleanup);
  return readContentLibrary(root);
}

async function issuesOf(spec: LibrarySpec): Promise<string[]> {
  try {
    await read(spec);
  } catch (error) {
    if (error instanceof ContentValidationError)
      return error.issues.map((i) => `${i.file}: ${i.message}`);
    throw error;
  }
  throw new Error("expected the library to be invalid");
}

describe("readContentLibrary", () => {
  test("reads papers, problems and tracks with camelCase metadata", async () => {
    const library = await read(baseLibrary());
    expect(library.papers.map((p) => p.id)).toEqual([
      "rectifier-networks",
      "second-paper",
    ]);
    const problem = library.papers[0]?.problems[0];
    expect(problem).toMatchObject({
      id: "relu",
      order: 1,
      tutorial: null,
      helpers: null,
    });
    expect(problem?.meta).toMatchObject({
      entryPoint: "relu",
      allowedPackages: ["numpy"],
      status: "published",
    });
    expect(library.tracks.map((t) => t.id)).toEqual(["fundamentals"]);
  });

  test("hashes are stable and change with any file", async () => {
    const first = await read(baseLibrary());
    const again = await read(baseLibrary());
    expect(again.papers[0]?.sourceHash).toBe(first.papers[0]?.sourceHash ?? "");

    const changed = baseLibrary();
    changed["papers/rectifier-networks/problems/01-relu/starter.py"] =
      "def relu(x):\n    return None\n";
    const edited = await read(changed);
    expect(edited.papers[0]?.sourceHash).not.toBe(first.papers[0]?.sourceHash ?? "");
    expect(edited.papers[1]?.sourceHash).toBe(first.papers[1]?.sourceHash ?? "");
  });

  test("reports a missing file, naming it", async () => {
    const spec = baseLibrary();
    spec["papers/rectifier-networks/problems/01-relu/tests/test_hidden.py"] = null;
    expect(await issuesOf(spec)).toContain(
      "content/papers/rectifier-networks/problems/01-relu/tests/test_hidden.py: is missing",
    );
  });

  test("reports schema problems with the field", async () => {
    const spec = baseLibrary();
    spec["papers/rectifier-networks/problems/01-relu/problem.yaml"] = (
      problemFiles()["problem.yaml"] ?? ""
    ).replace("difficulty: easy", "difficulty: trivial");
    const issues = await issuesOf(spec);
    expect(
      issues.some((i) => i.includes("01-relu/problem.yaml: difficulty: Invalid option")),
    ).toBe(true);
  });

  test("reports packages the environment does not have, once fields are valid", async () => {
    const spec = baseLibrary();
    spec["papers/rectifier-networks/problems/01-relu/problem.yaml"] = (
      problemFiles()["problem.yaml"] ?? ""
    ).replace("allowed_packages: [numpy]", "allowed_packages: [numpy, torch]");
    expect(await issuesOf(spec)).toContain(
      "content/papers/rectifier-networks/problems/01-relu/problem.yaml: allowed_packages: torch is not installed in the numpy environment",
    );
  });

  test("reports duplicate problem ids and order numbers", async () => {
    const spec = baseLibrary();
    for (const [path, content] of Object.entries(problemFiles())) {
      spec[`papers/rectifier-networks/problems/01-other/${path}`] = content;
      spec[`papers/rectifier-networks/problems/02-relu/${path}`] = content;
    }
    const issues = await issuesOf(spec);
    expect(
      issues.some((i) => i.includes("02-relu: repeats the problem id of 01-relu")),
    ).toBe(true);
    expect(
      issues.some((i) => i.includes("01-relu: repeats the order number of 01-other")),
    ).toBe(true);
  });

  test("reports bad folder names, unknown files, raw HTML and unknown track papers", async () => {
    const spec = baseLibrary();
    spec["papers/rectifier-networks/problems/relu-two/problem.yaml"] = "x";
    spec["papers/rectifier-networks/problems/01-relu/tests/test_pubilc.py"] = "";
    spec["papers/rectifier-networks/problems/01-relu/description.md"] =
      "Text\n\n<div>no</div>\n";
    spec["tracks/fundamentals.yaml"] = "title: T\nsummary: S\npapers: [missing-paper]\n";
    const issues = await issuesOf(spec);
    expect(
      issues.some((i) => i.includes('problem folders are named "NN-problem-id"')),
    ).toBe(true);
    expect(
      issues.some((i) => i.endsWith("test_pubilc.py: is not a recognised problem file")),
    ).toBe(true);
    expect(
      issues.some((i) => i.includes("raw HTML is not allowed (line 3): <div>")),
    ).toBe(true);
    expect(issues).toContain(
      'content/tracks/fundamentals.yaml: refers to unknown paper "missing-paper"',
    );
  });

  test("lists every problem at once", async () => {
    const spec = baseLibrary();
    spec["papers/rectifier-networks/paper.yaml"] = "title: [not a string]\n";
    spec["papers/second-paper/problems/01-relu/starter.py"] = null;
    expect((await issuesOf(spec)).length).toBeGreaterThanOrEqual(2);
  });
});

describe("readContentLibrary: quiz topics", () => {
  test("reads each exams/<topic>.yaml with its questions and a hash", async () => {
    const library = await read({ ...baseLibrary(), "exams/nlp.yaml": examYaml("NLP", 2) });
    expect(library.exams).toHaveLength(1);
    expect(library.exams[0]).toMatchObject({ id: "nlp", title: "NLP" });
    expect(library.exams[0]?.questions[1]).toMatchObject({
      id: "q-002",
      difficulty: "hard",
      options: ["Alpha", "Beta", "Gamma", "Delta"],
      answer: 2,
    });
    expect(library.exams[0]?.sourceHash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("a library without exams/ has no topics", async () => {
    expect((await read(baseLibrary())).exams).toEqual([]);
  });

  test("names the file for every invalid topic", async () => {
    const question = (fields: string) =>
      `title: Bad\nquestions:\n  - id: q-1\n    difficulty: easy\n${fields}`;
    const issues = await issuesOf({
      ...baseLibrary(),
      "exams/out-of-range.yaml": question(
        "    prompt: Which?\n    options: [A, B]\n    answer: 2\n    explanation: Because.\n",
      ),
      "exams/one-option.yaml": question(
        "    prompt: Which?\n    options: [A]\n    answer: 0\n    explanation: Because.\n",
      ),
      "exams/raw-html.yaml": question(
        "    prompt: <b>Which?</b>\n    options: [A, B]\n    answer: 0\n    explanation: Because.\n",
      ),
      "exams/Bad_Name.yaml": examYaml("Bad", 1),
      "exams/notes.txt": "not a topic",
      "exams/repeated.yaml": `${examYaml("Repeated", 1)}${examYaml("Repeated", 1).split("questions:\n")[1] ?? ""}`,
    });
    const joined = issues.join("\n");
    expect(joined).toContain("content/exams/out-of-range.yaml: questions.0.answer");
    expect(joined).toContain("content/exams/one-option.yaml: questions.0.options");
    expect(joined).toContain("content/exams/raw-html.yaml: raw HTML is not allowed");
    expect(joined).toContain("content/exams/Bad_Name.yaml: topic id");
    expect(joined).toContain("content/exams/notes.txt: quiz topics are .yaml files");
    expect(joined).toContain("content/exams/repeated.yaml: questions: must not repeat question ids");
  });
});

describe("readContentLibrary: courses", () => {
  test("reads each courses/<id>/course.yaml with camelCase items", async () => {
    const library = await read({ ...baseLibrary(), "courses/attention/course.yaml": courseYaml() });
    expect(library.courses.map((course) => course.id)).toEqual(["attention"]);
    expect(library.courses[0]?.items[0]).toEqual({
      id: "why-attention",
      type: "lecture",
      title: "Why attention",
      videoKey: "attention/private-video-key-intro.mp4",
      durationSeconds: 540,
    });
  });

  test("names the file for every invalid course", async () => {
    const lecture = (fields: string) =>
      `title: Bad\nsummary: S.\nitems:\n  - id: one\n    type: lecture\n    title: One\n${fields}`;
    const issues = await issuesOf({
      ...baseLibrary(),
      "courses/escape/course.yaml": lecture(
        "    video_key: ../secrets/key.mp4\n    duration_seconds: 60\n",
      ),
      "courses/not-mp4/course.yaml": lecture(
        "    video_key: talks/one.mov\n    duration_seconds: 60\n",
      ),
      "courses/no-duration/course.yaml": lecture("    video_key: talks/one.mp4\n"),
      "courses/extra-file/course.yaml": courseYaml(),
      "courses/extra-file/notes.md": "notes",
      "courses/Bad_Name/course.yaml": courseYaml(),
      "courses/repeated/course.yaml": `title: R\nsummary: S.\nitems:\n  - id: a\n    type: lecture\n    title: A\n    video_key: a.mp4\n    duration_seconds: 1\n  - id: a\n    type: lecture\n    title: B\n    video_key: b.mp4\n    duration_seconds: 1\n`,
    });
    const joined = issues.join("\n");
    expect(joined).toContain("content/courses/escape/course.yaml: items.0");
    expect(joined).toContain("content/courses/not-mp4/course.yaml: items.0");
    expect(joined).toContain("content/courses/no-duration/course.yaml: items.0");
    expect(joined).toContain("content/courses/extra-file/notes.md: is not a recognised course file");
    expect(joined).toContain("content/courses/Bad_Name: course id");
    expect(joined).toContain("content/courses/repeated/course.yaml: items: must not repeat item ids");
  });
});
