import { mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { ContentNotFoundError } from "./store/errors";
import type { ContentStore } from "./store/content-store";
import { toCanonicalYaml } from "./yaml";

async function writeFile(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, content);
}

/**
 * Writes a paper's live version to `<contentRoot>/papers/<id>/` in the file
 * format of docs/specs/03-content.md §6, replacing that folder. This is how a
 * paper made on an instance is contributed to the shared library.
 */
export async function exportPaper(
  store: ContentStore,
  paperId: string,
  contentRoot: string,
): Promise<string> {
  const entry = await store.getEntry(paperId);
  if (!entry) throw new ContentNotFoundError(`Paper ${paperId}`);
  const [publicDoc, privateDoc] = await Promise.all([
    store.getPublicDoc(paperId, entry.version),
    store.getPrivateDoc(paperId, entry.version),
  ]);

  const paperDir = join(resolve(contentRoot), "papers", paperId);
  await rm(paperDir, { recursive: true, force: true });

  const { paper } = publicDoc;
  await writeFile(
    join(paperDir, "paper.yaml"),
    toCanonicalYaml([
      ["title", paper.title],
      ["authors", paper.authors],
      ["year", paper.year ?? undefined],
      ["url", paper.url],
      ["summary", paper.summary],
      ["tags", paper.tags],
    ]),
  );

  for (const problem of publicDoc.problems) {
    const hidden = privateDoc.problems.find((candidate) => candidate.id === problem.id);
    if (!hidden)
      throw new ContentNotFoundError(`Private parts of ${paperId}/${problem.id}`);
    const dir = join(
      paperDir,
      "problems",
      `${String(problem.order).padStart(2, "0")}-${problem.id}`,
    );

    await writeFile(
      join(dir, "problem.yaml"),
      toCanonicalYaml([
        ["title", problem.title],
        ["summary", problem.summary],
        ["difficulty", problem.difficulty],
        ["type", problem.type],
        ["entry_point", problem.entryPoint],
        ["environment", problem.environment],
        ["allowed_packages", problem.allowedPackages],
        ["prohibited_imports", problem.prohibitedImports],
        ["time_limit_seconds", problem.timeLimitSeconds],
        ["memory_limit_mb", problem.memoryLimitMb],
        ["paper_refs", problem.paperRefs],
        ["status", problem.status === "retired" ? "retired" : undefined],
      ]),
    );
    await writeFile(join(dir, "description.md"), problem.description);
    if (problem.tutorial !== null)
      await writeFile(join(dir, "tutorial.md"), problem.tutorial);
    await writeFile(join(dir, "starter.py"), problem.starter);
    await writeFile(join(dir, "solution.py"), hidden.solution);
    if (hidden.helpers !== null) await writeFile(join(dir, "helpers.py"), hidden.helpers);
    await writeFile(join(dir, "tests", "test_public.py"), hidden.testsPublic);
    await writeFile(join(dir, "tests", "test_hidden.py"), hidden.testsHidden);
  }
  return paperDir;
}
