import { AwsClient } from "aws4fetch";
import { PreconditionFailedError, StorageError } from "../errors";
import { assertValidKey, assertValidPrefix } from "../keys";
import type {
  ConditionalGetResult,
  ObjectInfo,
  ObjectStorage,
  PutOptions,
  PutResult,
  StoredObject,
} from "../types";

export interface S3StorageOptions {
  /** Service origin, e.g. https://<account>.r2.cloudflarestorage.com. */
  endpoint: string;
  /** "auto" for Cloudflare R2. */
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Per-request timeout. @default 30000 */
  requestTimeoutMs?: number;
}

/** Cloudflare R2's S3 endpoint for an account. */
export function r2Endpoint(accountId: string): string {
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

const XML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeXml(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#x"))
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith("#"))
      return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return XML_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function xmlTag(xml: string, name: string): string | undefined {
  const match = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml);
  return match?.[1] === undefined ? undefined : decodeXml(match[1]);
}

/**
 * Stores objects in an S3-compatible bucket: Cloudflare R2 in production, any
 * S3-compatible server in tests. Requests are signed with SigV4 and use only
 * `fetch`, so the driver runs on any host. Conditional writes rely on the
 * service honouring If-Match / If-None-Match on PutObject, which R2 does.
 */
export class S3Storage implements ObjectStorage {
  readonly driver = "r2";
  private readonly client: AwsClient;
  private readonly bucketUrl: string;
  private readonly timeoutMs: number;

  constructor(options: S3StorageOptions) {
    this.client = new AwsClient({
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
      service: "s3",
      region: options.region,
      retries: 3,
    });
    this.bucketUrl = `${options.endpoint.replace(/\/+$/, "")}/${encodeURIComponent(options.bucket)}`;
    this.timeoutMs = options.requestTimeoutMs ?? 30_000;
  }

  private objectUrl(key: string): string {
    assertValidKey(key);
    return `${this.bucketUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }

  private async send(url: string, init: RequestInit, key?: string): Promise<Response> {
    try {
      return await this.client.fetch(url, {
        ...init,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new StorageError(
        `Storage request ${init.method ?? "GET"} ${key ?? "bucket"} failed`,
        { key },
        { cause: error },
      );
    }
  }

  private async failure(
    response: Response,
    action: string,
    key?: string,
  ): Promise<never> {
    const text = await response.text().catch(() => "");
    const code = xmlTag(text, "Code");
    throw new StorageError(
      `${action}${key ? ` ${key}` : ""} failed with HTTP ${response.status}${code ? ` (${code})` : ""}`,
      { key, status: response.status, code },
    );
  }

  private infoFrom(key: string, response: Response, size?: number): ObjectInfo {
    const etag = response.headers.get("etag");
    if (!etag) throw new StorageError(`No etag returned for ${key}`, { key });
    return {
      key,
      size: size ?? Number(response.headers.get("content-length") ?? 0),
      etag,
      lastModified: new Date(response.headers.get("last-modified") ?? 0),
    };
  }

  private async objectFrom(key: string, response: Response): Promise<StoredObject> {
    const body = new Uint8Array(await response.arrayBuffer());
    return {
      ...this.infoFrom(key, response, body.byteLength),
      contentType: response.headers.get("content-type"),
      body,
    };
  }

  async get(key: string): Promise<StoredObject | null> {
    const response = await this.send(this.objectUrl(key), { method: "GET" }, key);
    if (response.status === 404) return null;
    if (!response.ok) return this.failure(response, "Reading", key);
    return this.objectFrom(key, response);
  }

  async getIfChanged(key: string, etag: string): Promise<ConditionalGetResult> {
    const response = await this.send(
      this.objectUrl(key),
      { method: "GET", headers: { "If-None-Match": etag } },
      key,
    );
    if (response.status === 304) return { status: "not-modified" };
    if (response.status === 404) return { status: "not-found" };
    if (!response.ok) return this.failure(response, "Reading", key);
    return { status: "found", object: await this.objectFrom(key, response) };
  }

  async head(key: string): Promise<ObjectInfo | null> {
    const response = await this.send(this.objectUrl(key), { method: "HEAD" }, key);
    if (response.status === 404) return null;
    if (!response.ok) return this.failure(response, "Inspecting", key);
    return this.infoFrom(key, response);
  }

  async put(
    key: string,
    body: string | Uint8Array,
    options: PutOptions = {},
  ): Promise<PutResult> {
    const headers = new Headers();
    if (options.contentType) headers.set("Content-Type", options.contentType);
    if (options.ifMatch !== undefined) headers.set("If-Match", options.ifMatch);
    if (options.ifNoneMatch !== undefined)
      headers.set("If-None-Match", options.ifNoneMatch);

    const response = await this.send(
      this.objectUrl(key),
      { method: "PUT", body: typeof body === "string" ? body : body.slice(), headers },
      key,
    );
    // 409 is how some S3-compatible services report a conditional-write conflict.
    // AWS-compatible services answer If-Match on a missing key with 404 NoSuchKey.
    const conditional =
      options.ifMatch !== undefined || options.ifNoneMatch !== undefined;
    if (
      response.status === 412 ||
      (conditional && response.status === 409) ||
      (options.ifMatch !== undefined && response.status === 404)
    ) {
      throw new PreconditionFailedError(key);
    }
    if (!response.ok) return this.failure(response, "Writing", key);
    const etag = response.headers.get("etag");
    if (!etag) throw new StorageError(`No etag returned for ${key}`, { key });
    return { etag };
  }

  async delete(key: string): Promise<void> {
    const response = await this.send(this.objectUrl(key), { method: "DELETE" }, key);
    if (!response.ok && response.status !== 404) {
      await this.failure(response, "Deleting", key);
    }
  }

  async *list(prefix: string): AsyncIterable<ObjectInfo> {
    assertValidPrefix(prefix);
    let continuationToken: string | undefined;
    do {
      const query = new URLSearchParams({ "list-type": "2", prefix });
      if (continuationToken) query.set("continuation-token", continuationToken);
      const response = await this.send(`${this.bucketUrl}?${query}`, { method: "GET" });
      if (!response.ok) await this.failure(response, "Listing", prefix);
      const xml = await response.text();

      for (const match of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
        const entry = match[1] ?? "";
        const key = xmlTag(entry, "Key");
        const etag = xmlTag(entry, "ETag");
        if (key === undefined || etag === undefined) continue;
        yield {
          key,
          size: Number(xmlTag(entry, "Size") ?? 0),
          etag,
          lastModified: new Date(xmlTag(entry, "LastModified") ?? 0),
        };
      }

      continuationToken =
        xmlTag(xml, "IsTruncated") === "true"
          ? xmlTag(xml, "NextContinuationToken")
          : undefined;
    } while (continuationToken);
  }

  /**
   * Creates the bucket when it does not exist. For tests and local development;
   * production R2 buckets are created in the Cloudflare dashboard.
   */
  async createBucketIfMissing(): Promise<void> {
    const head = await this.send(this.bucketUrl, { method: "HEAD" });
    if (head.ok) return;
    if (head.status !== 404) await this.failure(head, "Inspecting bucket");
    const created = await this.send(this.bucketUrl, { method: "PUT" });
    if (!created.ok && created.status !== 409)
      await this.failure(created, "Creating bucket");
  }
}
