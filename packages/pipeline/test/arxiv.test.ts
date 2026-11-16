import { describe, expect, test } from "bun:test";
import { demoPdf, fetchArxivPdf, PipelineError } from "../src";

type Route = (url: URL) => Response;

function fakeFetch(route: Route) {
  const seen: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input);
    seen.push(url.href);
    return route(url);
  }) as typeof fetch;
  return { fetchImpl, seen };
}

const pdfResponse = () =>
  new Response(demoPdf("arxiv"), { headers: { "content-type": "application/pdf" } });

describe("fetchArxivPdf", () => {
  test("downloads from arxiv.org, following redirects within it", async () => {
    const { fetchImpl, seen } = fakeFetch((url) =>
      url.pathname === "/pdf/1706.03762"
        ? new Response(null, { status: 301, headers: { location: "/pdf/1706.03762v7" } })
        : pdfResponse(),
    );
    const bytes = await fetchArxivPdf("1706.03762", {
      maxBytes: 1_000_000,
      fetch: fetchImpl,
    });
    expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe("%PDF-");
    expect(seen).toEqual([
      "https://arxiv.org/pdf/1706.03762",
      "https://arxiv.org/pdf/1706.03762v7",
    ]);
  });

  test("never follows a redirect to another host", async () => {
    const { fetchImpl, seen } = fakeFetch(
      () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://evil.example/x.pdf" },
        }),
    );
    await expect(
      fetchArxivPdf("1706.03762", { maxBytes: 1_000_000, fetch: fetchImpl }),
    ).rejects.toThrow("somewhere other than arxiv.org");
    expect(seen).toHaveLength(1);
  });

  test("refuses what is too large or not a PDF, and reports a missing paper", async () => {
    const big = fakeFetch(() => pdfResponse());
    await expect(
      fetchArxivPdf("1706.03762", { maxBytes: 10, fetch: big.fetchImpl }),
    ).rejects.toMatchObject({
      code: "too_large",
    });
    const html = fakeFetch(() => new Response("<html>"));
    await expect(
      fetchArxivPdf("1706.03762", { maxBytes: 1000, fetch: html.fetchImpl }),
    ).rejects.toMatchObject({
      code: "invalid_pdf",
    });
    const missing = fakeFetch(() => new Response("", { status: 404 }));
    const error = await fetchArxivPdf("9999.99999", {
      maxBytes: 1000,
      fetch: missing.fetchImpl,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PipelineError);
    expect(error).toMatchObject({ code: "not_found" });
  });
});
