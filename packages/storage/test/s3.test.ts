import { describe } from "bun:test";
import { S3Storage } from "../src";
import { describeStorageContract } from "./contract";

/**
 * Runs the contract against an S3-compatible server when one is configured:
 * `docker compose -f docker-compose.dev.yml up -d objectstore` locally, a
 * service container in CI. Skipped otherwise.
 */
const endpoint = process.env.S3_TEST_ENDPOINT;
const accessKeyId = process.env.S3_TEST_ACCESS_KEY_ID;
const secretAccessKey = process.env.S3_TEST_SECRET_ACCESS_KEY;
const bucket = process.env.S3_TEST_BUCKET ?? "storage-tests";
const configured = Boolean(endpoint && accessKeyId && secretAccessKey);

const storage = configured
  ? new S3Storage({
      endpoint: endpoint ?? "",
      region: "us-east-1",
      bucket,
      accessKeyId: accessKeyId ?? "",
      secretAccessKey: secretAccessKey ?? "",
    })
  : undefined;

let bucketReady: Promise<void> | undefined;

describe.skipIf(!configured)("s3 driver", () => {
  describeStorageContract("s3", async () => {
    if (!storage) throw new Error("S3 test server is not configured");
    bucketReady ??= storage.createBucketIfMissing();
    await bucketReady;
    return { storage, base: `run-${crypto.randomUUID()}` };
  });
});
