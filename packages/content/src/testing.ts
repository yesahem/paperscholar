/**
 * Fixtures for tests of content and of code that serves it: a small library
 * whose private parts carry a canary string. Exported as `@repo/content/testing`;
 * never imported by application code.
 */
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** A canary that must never appear in anything learners can read. */
export const CANARY = "CANARY-7f3c9e-private-content";

export const problemFiles = (
  overrides: Record<string, string | null> = {},
): Record<string, string | null> => ({
  "problem.yaml": `title: Rectified linear unit
summary: Clip negative values to zero.
difficulty: easy
type: micro
entry_point: relu
environment: numpy
allowed_packages: [numpy]
prohibited_imports: [torch]
time_limit_seconds: 2
memory_limit_mb: 256
paper_refs: [Eq. 1]
`,
  "description.md":
    "Implement $\\max(0, x)$ element-wise. Keep `x.shape` and note $i < n$.\n",
  "starter.py": "def relu(x):\n    raise NotImplementedError\n",
  "solution.py": `import numpy as np\n\n# ${CANARY}\ndef relu(x):\n    return np.maximum(x, 0)\n`,
  "tests/test_public.py": `from solution import relu\n# ${CANARY}\n`,
  "tests/test_hidden.py": `from solution import relu\n# ${CANARY}\n`,
  ...overrides,
});

export const paperYaml = `title: Rectifier Networks
authors: [Glorot, Bordes, Bengio]
year: 2011
url: https://proceedings.mlr.press/v15/glorot11a.html
summary: Rectified linear units for deep networks.
tags: [deep-learning, fundamentals]
`;

export type LibrarySpec = Record<string, string | null>;

/** Helpers whose bodies carry the canary; only their signatures may be shown. */
export const helpersWithCanary = `import numpy as np


def clip_below(x: np.ndarray, low: float = 0.0) -> np.ndarray:
    """Values below \`low\` become \`low\`."""
    marker = "${CANARY}"
    return np.maximum(x, low)
`;

/** A two-paper library with one track. Keys are paths relative to the content root. */
export function baseLibrary(): LibrarySpec {
  const files: LibrarySpec = {
    "papers/rectifier-networks/paper.yaml": paperYaml,
    "papers/second-paper/paper.yaml": paperYaml.replace(
      "Rectifier Networks",
      "Second Paper",
    ),
    "tracks/fundamentals.yaml":
      "title: Fundamentals\nsummary: Start here.\npapers: [rectifier-networks, second-paper]\n",
  };
  for (const [path, content] of Object.entries(problemFiles())) {
    files[`papers/rectifier-networks/problems/01-relu/${path}`] = content;
    files[`papers/second-paper/problems/01-relu/${path}`] = content;
  }
  return files;
}

/** Writes a library into a fresh temporary `content` folder; `null` values are skipped. */
export async function writeLibrary(
  spec: LibrarySpec,
): Promise<{ root: string; cleanup: () => Promise<void> }> {
  const parent = await mkdtemp(join(tmpdir(), "content-test-"));
  const root = join(parent, "content");
  await mkdir(root, { recursive: true });
  for (const [path, content] of Object.entries(spec)) {
    if (content === null) continue;
    await mkdir(dirname(join(root, path)), { recursive: true });
    await Bun.write(join(root, path), content);
  }
  return { root, cleanup: () => rm(parent, { recursive: true, force: true }) };
}
