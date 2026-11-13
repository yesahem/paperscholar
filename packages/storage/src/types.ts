/** Metadata of one stored object. */
export interface ObjectInfo {
  key: string;
  /** Size in bytes. */
  size: number;
  /** Opaque version tag, including its quotes as S3 returns it. Changes with the content. */
  etag: string;
  lastModified: Date;
}

/** An object and its content. */
export interface StoredObject extends ObjectInfo {
  contentType: string | null;
  body: Uint8Array;
}

export interface PutOptions {
  contentType?: string;
  /** Write only if the current object has this etag. */
  ifMatch?: string;
  /** `"*"`: write only if no object exists at the key (create-once). */
  ifNoneMatch?: "*";
}

export interface PutResult {
  etag: string;
}

/** Outcome of a conditional read. */
export type ConditionalGetResult =
  | { status: "found"; object: StoredObject }
  | { status: "not-modified" }
  | { status: "not-found" };

/**
 * Key-value object storage. Keys are `/`-separated relative paths such as
 * `content/index.json`. Spec: docs/specs/03-content.md §2.4.
 */
export interface ObjectStorage {
  readonly driver: "fs" | "r2";
  /** The object, or null when the key does not exist. */
  get(key: string): Promise<StoredObject | null>;
  /** Reads only when the current etag differs from `etag`. */
  getIfChanged(key: string, etag: string): Promise<ConditionalGetResult>;
  /** Metadata only, or null when the key does not exist. */
  head(key: string): Promise<ObjectInfo | null>;
  /**
   * Writes the object. Throws PreconditionFailedError when `ifMatch` or
   * `ifNoneMatch` does not hold; nothing is written in that case.
   */
  put(key: string, body: string | Uint8Array, options?: PutOptions): Promise<PutResult>;
  /** Deletes the object. Deleting a missing key is not an error. */
  delete(key: string): Promise<void>;
  /** Every object whose key starts with `prefix`, in key order. */
  list(prefix: string): AsyncIterable<ObjectInfo>;
}
