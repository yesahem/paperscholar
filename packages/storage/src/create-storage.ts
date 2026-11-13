import { FsStorage } from "./drivers/fs";
import { r2Endpoint, S3Storage } from "./drivers/s3";
import type { ObjectStorage } from "./types";

export type StorageConfig =
  | { driver: "fs"; root: string }
  | {
      driver: "r2";
      /** Cloudflare account id; the endpoint is derived from it. */
      accountId?: string;
      /** Explicit endpoint, overriding `accountId`. For tests and other S3-compatible stores. */
      endpoint?: string;
      region?: string;
      bucket: string;
      accessKeyId: string;
      secretAccessKey: string;
    };

/** Builds the configured storage driver. */
export function createStorage(config: StorageConfig): ObjectStorage {
  if (config.driver === "fs") return new FsStorage({ root: config.root });

  const endpoint =
    config.endpoint ?? (config.accountId ? r2Endpoint(config.accountId) : undefined);
  if (!endpoint) {
    throw new Error("The r2 storage driver needs an account id or an explicit endpoint.");
  }
  return new S3Storage({
    endpoint,
    region: config.region ?? "auto",
    bucket: config.bucket,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  });
}
