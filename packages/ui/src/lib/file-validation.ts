import { formatBytes } from "./format";

export type FileRejectionReason = "type" | "size" | "count";

export interface FileRejection {
  file: File;
  reason: FileRejectionReason;
  /** User-facing explanation. */
  message: string;
}

export interface FileValidationOptions {
  /**
   * Same syntax as the `accept` attribute of `<input type="file">`:
   * comma-separated MIME types (`application/pdf`), wildcards (`image/*`)
   * and extensions (`.pdf`). Empty or absent accepts every file.
   */
  accept?: string;
  /** Largest allowed size of one file, in bytes. */
  maxSizeBytes?: number;
  /** Most files allowed in total. */
  maxFiles?: number;
}

export interface FileValidationResult {
  accepted: File[];
  rejected: FileRejection[];
}

/** Splits an `accept` string into normalised entries. */
export function parseAccept(accept: string | undefined): string[] {
  if (!accept) return [];
  return accept
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

/** Whether a file satisfies at least one `accept` entry. */
export function matchesAccept(file: File, acceptEntries: readonly string[]): boolean {
  if (acceptEntries.length === 0) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return acceptEntries.some((entry) => {
    if (entry.startsWith(".")) return name.endsWith(entry);
    if (entry.endsWith("/*")) return type.startsWith(entry.slice(0, -1));
    return type === entry;
  });
}

/**
 * Splits files into accepted and rejected, checking type, then size, then the
 * total count. Browser checks are a convenience; the server validates again.
 */
export function validateFiles(
  files: readonly File[],
  { accept, maxSizeBytes, maxFiles }: FileValidationOptions = {},
): FileValidationResult {
  const acceptEntries = parseAccept(accept);
  const accepted: File[] = [];
  const rejected: FileRejection[] = [];

  for (const file of files) {
    if (!matchesAccept(file, acceptEntries)) {
      rejected.push({
        file,
        reason: "type",
        message: `${file.name} is not an accepted file type.`,
      });
      continue;
    }
    if (maxSizeBytes !== undefined && file.size > maxSizeBytes) {
      rejected.push({
        file,
        reason: "size",
        message: `${file.name} is larger than ${formatBytes(maxSizeBytes)}.`,
      });
      continue;
    }
    if (maxFiles !== undefined && accepted.length >= maxFiles) {
      rejected.push({
        file,
        reason: "count",
        message:
          maxFiles === 1
            ? "Only one file can be added."
            : `At most ${maxFiles} files can be added.`,
      });
      continue;
    }
    accepted.push(file);
  }

  return { accepted, rejected };
}

/** Stable identity for de-duplicating the same file picked twice. */
export function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

const MIME_LABELS: Record<string, string> = {
  "image/*": "Images",
  "video/*": "Videos",
  "audio/*": "Audio",
  "text/*": "Text files",
};

/**
 * Short human description of an `accept` string: ".pdf,application/pdf" → "PDF".
 * Returns undefined when every file type is accepted.
 */
export function describeAccept(accept: string | undefined): string | undefined {
  const entries = parseAccept(accept);
  if (entries.length === 0) return undefined;
  const labels = new Set<string>();
  for (const entry of entries) {
    if (entry.startsWith(".")) {
      labels.add(entry.slice(1).toUpperCase());
    } else if (MIME_LABELS[entry]) {
      labels.add(MIME_LABELS[entry]);
    } else {
      const subtype = entry.split("/")[1] ?? entry;
      labels.add(subtype.replace(/^x-/, "").toUpperCase());
    }
  }
  return [...labels].join(", ");
}
