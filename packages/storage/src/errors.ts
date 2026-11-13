/** A storage operation failed for a reason other than a missing key. */
export class StorageError extends Error {
  constructor(
    message: string,
    readonly details: { key?: string; status?: number; code?: string } = {},
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "StorageError";
  }
}

/** A conditional write was refused because the object changed or already exists. */
export class PreconditionFailedError extends StorageError {
  constructor(key: string) {
    super(`Precondition failed for ${key}`, { key, status: 412 });
    this.name = "PreconditionFailedError";
  }
}

/** The key is malformed or tries to leave the storage root. */
export class InvalidKeyError extends StorageError {
  constructor(key: string, reason: string) {
    super(`Invalid storage key ${JSON.stringify(key)}: ${reason}`, { key });
    this.name = "InvalidKeyError";
  }
}
