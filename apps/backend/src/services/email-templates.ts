import { SITE } from "@repo/shared";
import type { EmailMessage } from "../adapters/email/types";

/**
 * The emails this instance sends (docs/specs/06-auth.md §5): plain words, one
 * link, and an HTML part that says the same as the text part.
 */

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function compose(
  to: string,
  subject: string,
  paragraphs: string[],
  link: { label: string; url: string },
  footer: string,
): EmailMessage {
  const text = [...paragraphs, `${link.label}: ${link.url}`, footer].join("\n\n");
  const html = [
    '<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;max-width:560px">',
    ...paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`),
    `<p><a href="${escapeHtml(link.url)}">${escapeHtml(link.label)}</a></p>`,
    `<p style="color:#666;font-size:14px">${escapeHtml(footer)}</p>`,
    "</body></html>",
  ].join("");
  return { to, subject, text, html };
}

export function verificationEmail(to: string, url: string): EmailMessage {
  return compose(
    to,
    `Confirm your email for ${SITE.name}`,
    [
      `Welcome to ${SITE.name}.`,
      "Confirm this address to start running and submitting code. The link works for 24 hours.",
    ],
    { label: "Confirm my email", url },
    "If you did not create an account, ignore this email and nothing will happen.",
  );
}

export function passwordResetEmail(to: string, url: string): EmailMessage {
  return compose(
    to,
    `Reset your ${SITE.name} password`,
    [
      "Someone asked to reset the password for this address.",
      "The link works once, for one hour. Setting a new password signs you out everywhere.",
    ],
    { label: "Choose a new password", url },
    "If it was not you, ignore this email: your password stays the same.",
  );
}
