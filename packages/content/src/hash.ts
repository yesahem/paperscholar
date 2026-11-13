export interface HashableFile {
  path: string;
  content: string;
}

export function sha256Hex(text: string): string {
  return new Bun.CryptoHasher("sha256").update(text).digest("hex");
}

/** Hash over a set of files, independent of the order they are given in. */
export function hashFiles(files: readonly HashableFile[]): string {
  const hasher = new Bun.CryptoHasher("sha256");
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    hasher.update(file.path).update("\0").update(file.content).update("\0");
  }
  return hasher.digest("hex");
}
