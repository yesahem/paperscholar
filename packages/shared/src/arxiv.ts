/**
 * Reading an arXiv paper from whatever a person pastes (docs/specs/14-cms.md §5.1).
 * Pure and zod-free, so the CMS runs the same parser in the browser as the API
 * runs on the server.
 */

/** Longest input considered; longer is not an arXiv reference. */
export const ARXIV_REFERENCE_MAX_LENGTH = 300;

/** `1706.03762` */
const NEW_STYLE_ID = /^\d{4}\.\d{4,5}$/;
/** `hep-th/9901001`, `math.GT/0309136` */
const OLD_STYLE_ID = /^[a-z]+(?:-[a-z]+)*(?:\.[A-Za-z]{2})?\/\d{7}$/;
const VERSION_SUFFIX = /v\d+$/;
const ARXIV_HOSTS = new Set(["arxiv.org", "www.arxiv.org", "export.arxiv.org"]);
const ARTICLE_PATH = /^\/(?:abs|pdf|html)\/(.+)$/;

/** The identifier of a URL on arxiv.org, or null when it is any other address. */
function identifierFromUrl(input: string): string | null {
  const withScheme = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username !== "" || url.password !== "" || url.port !== "") return null;
  if (!ARXIV_HOSTS.has(url.hostname)) return null;
  const match = ARTICLE_PATH.exec(url.pathname);
  return match?.[1] ?? null;
}

/**
 * The bare identifier, without its version, of an arXiv paper named by a bare
 * id, `arxiv:<id>`, or an `abs`, `pdf` or `html` link on arxiv.org (with or
 * without a scheme, version, `.pdf`, query or fragment); null for anything
 * else. The latest version is always the one fetched, so `1706.03762v5` and
 * `1706.03762` name the same paper.
 */
export function parseArxivReference(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === "" || trimmed.length > ARXIV_REFERENCE_MAX_LENGTH) return null;

  const withoutPrefix = trimmed.replace(/^arxiv:\s*/i, "");
  const isLink =
    /^https?:\/\//i.test(withoutPrefix) ||
    /^(?:www\.|export\.)?arxiv\.org\//i.test(withoutPrefix);
  const candidate = (isLink ? identifierFromUrl(withoutPrefix) : withoutPrefix)
    ?.replace(/\.pdf$/i, "")
    .replace(VERSION_SUFFIX, "");
  if (candidate === undefined || candidate === null) return null;
  return NEW_STYLE_ID.test(candidate) || OLD_STYLE_ID.test(candidate) ? candidate : null;
}
