/**
 * The public interface of a Python module: top-level function and class
 * signatures with their docstrings, and the signatures of public methods,
 * with every body replaced by `...`. Learners see this for a problem's
 * helpers; the bodies stay private (docs/specs/05-api.md §5).
 *
 * This is a line scanner, not a parser. It relies on authored helpers being
 * formatted normally (four-space indents, `def`/`class` at the start of a
 * line), which `content:verify` runs and the formatter enforces.
 */

const DEFINITION = /^(\s*)(?:async\s+)?(def|class)\s+([A-Za-z_]\w*)/;
const DOCSTRING_START = /^\s*[rRuU]?("""|''')/;

interface Block {
  /** Header lines through the colon that opens the body. */
  header: string[];
  /** The docstring's lines, or none. */
  docstring: string[];
  /** Index of the first line after the header and docstring. */
  next: number;
}

interface LineScan {
  /** Bracket depth after the line. */
  depth: number;
  /** Index of the colon that ends a definition header (a colon at depth 0), if any. */
  headerColon: number | null;
}

/** Tracks brackets through a line, ignoring those inside strings and comments. */
function scanLine(line: string, startDepth: number): LineScan {
  let depth = startDepth;
  let quote: string | null = null;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "#") break;
    if (char === '"' || char === "'") quote = char;
    else if (char === "(" || char === "[" || char === "{") depth += 1;
    else if (char === ")" || char === "]" || char === "}") depth -= 1;
    else if (char === ":" && depth <= 0) return { depth, headerColon: index };
  }
  return { depth, headerColon: null };
}

function readBlock(lines: string[], start: number): Block {
  const header: string[] = [];
  let depth = 0;
  let index = start;
  for (; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const scan = scanLine(line, depth);
    depth = scan.depth;
    if (scan.headerColon !== null) {
      // A one-line definition (`def f(x): return x`) keeps only its signature.
      header.push(line.slice(0, scan.headerColon + 1).trimEnd());
      index += 1;
      break;
    }
    header.push(line.trimEnd());
  }

  while (index < lines.length && (lines[index] ?? "").trim() === "") index += 1;
  const docstring: string[] = [];
  const first = lines[index] ?? "";
  const opening = DOCSTRING_START.exec(first);
  if (opening?.[1]) {
    const delimiter = opening[1];
    const afterOpening = first.slice(first.indexOf(delimiter) + 3);
    docstring.push(first.trimEnd());
    index += 1;
    if (!afterOpening.includes(delimiter)) {
      for (; index < lines.length; index += 1) {
        const line = lines[index] ?? "";
        docstring.push(line.trimEnd());
        if (line.includes(delimiter)) {
          index += 1;
          break;
        }
      }
    }
  }
  return { header, docstring, next: index };
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

/** Signatures and docstrings of a module's public functions and classes. */
export function extractPythonInterface(source: string): string {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const sections: string[] = [];

  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    const match = DEFINITION.exec(line);
    if (!match || match[1] !== "" || (match[3] ?? "").startsWith("_")) {
      index += 1;
      continue;
    }

    const block = readBlock(lines, index);
    const output = [...block.header, ...block.docstring];
    index = block.next;

    if (match[2] === "class") {
      const methods: string[] = [];
      let bodyIndent: number | null = null;
      while (index < lines.length) {
        const inner = lines[index] ?? "";
        if (inner.trim() !== "") {
          if (indentOf(inner) === 0) break;
          bodyIndent ??= indentOf(inner);
        }
        const method = DEFINITION.exec(inner);
        const name = method?.[3] ?? "";
        const isMethod = method !== null && indentOf(inner) === bodyIndent;
        if (isMethod && (!name.startsWith("_") || name === "__init__")) {
          const methodBlock = readBlock(lines, index);
          methods.push(
            [...methodBlock.header, ...methodBlock.docstring].join("\n"),
            `${method[1] ?? ""}    ...`,
          );
          index = methodBlock.next;
        } else {
          index += 1;
        }
      }
      output.push(...(methods.length > 0 ? methods : ["    ..."]));
    } else {
      output.push("    ...");
    }
    sections.push(output.join("\n"));
  }

  return sections.join("\n\n\n");
}
