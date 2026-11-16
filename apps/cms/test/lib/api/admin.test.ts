import { describe, expect, test } from "bun:test";
import { startIngestion } from "@/lib/api/admin";
import type { FetchLike } from "@repo/web-core/api/client";

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  credentials: RequestCredentials | undefined;
  body: unknown;
}

function fakeApi(uploadUrl: string, headers: Record<string, string>) {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({
      url,
      method: init?.method ?? "GET",
      headers: Object.fromEntries(new Headers(init?.headers)),
      credentials: init?.credentials,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : init?.body,
    });
    if (url === "/api/v1/admin/ingestions/upload-url") {
      return Response.json({
        pdfKey: "uploads/papers/u1/x.pdf",
        upload: { url: uploadUrl, method: "PUT", headers },
        expiresAt: "2026-11-14T12:00:00.000Z",
      });
    }
    if (url === "/api/v1/admin/ingestions") {
      return Response.json(
        { id: "0193a1b2-0000-7000-8000-000000000001", status: "queued", created: true },
        { status: 202 },
      );
    }
    return new Response(null, { status: 200 });
  };
  return { calls, fetchImpl };
}

const pdf = new File(["%PDF-1.4 tiny"], "paper.pdf", { type: "application/pdf" });
const body = {
  rightsConfirmed: true as const,
  options: { targetSteps: null, environment: null, focus: null, pauseAfterPlan: false },
};

describe("startIngestion", () => {
  test("uploads through the API with the session when storage cannot presign", async () => {
    const api = fakeApi("/api/v1/admin/ingestions/uploads/abc", {
      "content-type": "application/pdf",
    });
    const created = await startIngestion({ file: pdf }, body, { fetch: api.fetchImpl });
    expect(created.created).toBe(true);
    expect(api.calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      "POST /api/v1/admin/ingestions/upload-url",
      "PUT /api/v1/admin/ingestions/uploads/abc",
      "POST /api/v1/admin/ingestions",
    ]);
    expect(api.calls[0]?.body).toEqual({ filename: "paper.pdf", size: pdf.size });
    expect(api.calls[1]?.credentials).toBe("same-origin");
    expect(api.calls[2]?.body).toMatchObject({
      pdfKey: "uploads/papers/u1/x.pdf",
      rightsConfirmed: true,
    });
  });

  test("uploads straight to storage without cookies, sending the signed type", async () => {
    const api = fakeApi(
      "https://account.r2.cloudflarestorage.com/private/uploads/x.pdf?X-Amz-Signature=s",
      {
        "content-type": "application/pdf",
        "content-length": String(pdf.size),
      },
    );
    await startIngestion({ file: pdf }, body, { fetch: api.fetchImpl });
    const put = api.calls[1];
    expect(put?.url).toStartWith("https://account.r2.cloudflarestorage.com/");
    expect(put?.credentials).toBe("omit");
    // Browsers refuse to set Content-Length; they send it from the body.
    expect(put?.headers).toEqual({ "content-type": "application/pdf" });
  });

  test("an arXiv paper needs no upload", async () => {
    const api = fakeApi("unused", {});
    await startIngestion({ arxivId: "1706.03762" }, body, { fetch: api.fetchImpl });
    expect(api.calls).toHaveLength(1);
    expect(api.calls[0]?.body).toMatchObject({ arxivId: "1706.03762" });
  });

  test("a refused upload says so and starts nothing", async () => {
    const api = fakeApi("/api/v1/admin/ingestions/uploads/abc", {});
    const refusing: FetchLike = async (url, init) =>
      init?.method === "PUT"
        ? new Response(null, { status: 403 })
        : api.fetchImpl(url, init);
    await expect(
      startIngestion({ file: pdf }, body, { fetch: refusing }),
    ).rejects.toThrow("The upload was refused (403)");
    expect(api.calls.some((call) => call.url === "/api/v1/admin/ingestions")).toBe(false);
  });
});
