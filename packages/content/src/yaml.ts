/**
 * Writes the flat YAML files of the content format (paper.yaml, problem.yaml)
 * in one canonical style, so an exported paper is byte-identical to the files
 * it came from and diffs in pull requests show only real changes.
 *
 * - Strings are plain when that is unambiguous, otherwise JSON-quoted (valid YAML).
 * - Lists of strings use `[a, b]` when the line fits in 90 columns, else one item per line.
 *   Both forms are stable under Prettier.
 */
export type YamlValue = string | number | readonly string[];

const LINE_WIDTH = 90;
const RESERVED_WORDS = /^(true|false|yes|no|on|off|null|~)$/i;
const LOOKS_NUMERIC = /^[-+]?(\.?\d)/;
const INDICATOR_START = /^[-?:,[\]{}#&*!|>'"%@`]/;

function isPlainSafe(value: string, inFlow: boolean): boolean {
  return (
    value.length > 0 &&
    value === value.trim() &&
    !value.includes("\n") &&
    !INDICATOR_START.test(value) &&
    !value.includes(": ") &&
    !value.includes(" #") &&
    !value.endsWith(":") &&
    !RESERVED_WORDS.test(value) &&
    !LOOKS_NUMERIC.test(value) &&
    !(inFlow && /[,[\]{}]/.test(value))
  );
}

function scalar(value: string, inFlow = false): string {
  return isPlainSafe(value, inFlow) ? value : JSON.stringify(value);
}

/** Serialises entries in the given order; undefined values are omitted. */
export function toCanonicalYaml(
  entries: readonly (readonly [string, YamlValue | undefined])[],
): string {
  const lines: string[] = [];
  for (const [key, value] of entries) {
    if (value === undefined) continue;
    if (typeof value === "number") {
      lines.push(`${key}: ${value}`);
    } else if (typeof value === "string") {
      lines.push(`${key}: ${scalar(value)}`);
    } else {
      const flow = `${key}: [${value.map((item) => scalar(item, true)).join(", ")}]`;
      if (flow.length <= LINE_WIDTH) {
        lines.push(flow);
      } else {
        lines.push(`${key}:`, ...value.map((item) => `  - ${scalar(item)}`));
      }
    }
  }
  return `${lines.join("\n")}\n`;
}
