import { SITE } from "@repo/shared";
import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Privacy",
  description: `What ${SITE.name} stores about you, and where.`,
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy"
      description="What this site keeps, and what it does not."
      updated="2026-11-14"
    >
      <h2>No account, no tracking</h2>
      <p>
        You do not need an account to use {SITE.name}, and this version has none. It sets
        no cookies, runs no analytics or advertising, and loads nothing from other
        companies: its fonts, maths rendering and code editor are served from this site.
      </p>
      <h2>Stored in your browser</h2>
      <ul>
        <li>
          <strong>Code drafts.</strong> What you type in the editor is saved in your
          browser&apos;s local storage so it is there when you come back. It is never sent
          to the server. Clear your site data to remove it.
        </li>
        <li>
          <strong>Theme.</strong> Your light or dark choice, if you made one.
        </li>
      </ul>
      <h2>Kept on the server</h2>
      <p>
        The server keeps short technical logs of each request: the method, the kind of
        page or API route, the status, how long it took and a random request id. They do
        not include your IP address, cookies or what you typed. If your browser reports a
        blocked script under the site&apos;s security policy, the server logs which rule
        was involved and the page path, without query strings. The company hosting this
        instance may keep its own access logs.
      </p>
      <h2>Changes</h2>
      <p>
        Accounts arrive in a later version. This page will say what they store before they
        do. The operator of an instance that changes the software is responsible for
        keeping this page accurate.
      </p>
    </LegalPage>
  );
}
