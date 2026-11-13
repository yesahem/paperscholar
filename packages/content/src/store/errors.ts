/** A content object the index points at is missing. */
export class ContentNotFoundError extends Error {
  constructor(what: string) {
    super(`${what} was not found in content storage`);
    this.name = "ContentNotFoundError";
  }
}

/** content/index.json changed without holding the index lock. */
export class ContentConcurrencyError extends Error {
  constructor() {
    super("content/index.json was changed by a writer that did not hold the index lock");
    this.name = "ContentConcurrencyError";
  }
}

/** A stored object does not match its schema. */
export class ContentCorruptError extends Error {
  constructor(key: string, detail: string, options?: { cause?: unknown }) {
    super(`${key} is not a valid content object: ${detail}`, options);
    this.name = "ContentCorruptError";
  }
}
