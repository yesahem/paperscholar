import { afterEach, describe, expect, test } from "bun:test";
import { ContentValidationError, readContentLibrary } from "../src";
import { baseLibrary, problemFiles, writeLibrary, type LibrarySpec } from "./fixtures";

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
