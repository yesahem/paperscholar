import { PipelineError } from "./errors";
import { isPdf } from "./intake";

/** The only host the pipeline ever downloads from (docs/specs/09-paper-pipeline.md §4). */
export const ARXIV_HOST = "arxiv.org";
const MAX_REDIRECTS = 3;

export interface ArxivFetchOptions {
  maxBytes: number;
  fetch?: typeof fetch;
  signal?: AbortSignal;
}

function onArxiv(url: URL): boolean {
  return (
    url.protocol === "https:" &&
    (url.hostname === ARXIV_HOST || url.hostname === `export.${ARXIV_HOST}`)
  );
}

async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > maxBytes) {
    throw new PipelineError(
      "too_large",
      `The arXiv PDF is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`,
    );
  }
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new PipelineError(
        "too_large",
        `The arXiv PDF is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`,
      );
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * Downloads a paper's PDF from arXiv. Redirects are followed only within
 * arxiv.org, so no other host is ever contacted; the size is capped while
 * reading, and the bytes must be a PDF.
 */
export async function fetchArxivPdf(
  arxivId: string,
  options: ArxivFetchOptions,
): Promise<Uint8Array> {
  const fetchImpl = options.fetch ?? fetch;
  let url = new URL(`https://${ARXIV_HOST}/pdf/${arxivId}`);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetchImpl(url, {
      redirect: "manual",
      headers: { Accept: "application/pdf" },
      ...(options.signal ? { signal: options.signal } : {}),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      const next = location ? new URL(location, url) : null;
      if (!next || !onArxiv(next)) {
        throw new PipelineError(
          "invalid_pdf",
          "arXiv redirected somewhere other than arxiv.org.",
        );
      }
      url = next;
      continue;
    }
    if (response.status === 404) {
      throw new PipelineError("not_found", `arXiv has no paper ${arxivId}.`);
    }
    if (!response.ok) {
      throw new PipelineError(
        "invalid_pdf",
        `arXiv answered ${response.status} for ${arxivId}.`,
      );
    }
    const bytes = await readCapped(response, options.maxBytes);
    if (!isPdf(bytes))
      throw new PipelineError(
        "invalid_pdf",
        `arXiv did not return a PDF for ${arxivId}.`,
      );
    return bytes;
  }
  throw new PipelineError("invalid_pdf", "arXiv redirected too many times.");
}
