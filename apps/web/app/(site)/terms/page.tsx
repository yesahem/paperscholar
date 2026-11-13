import { SITE } from "@repo/shared";
import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Terms",
  description: `The terms for using ${SITE.name}.`,
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      description="Short, because there is not much to agree to."
      updated="2026-11-14"
    >
      <h2>The service</h2>
      <p>
        {SITE.name} is free software. This site is one instance of it, run by its
        operator. You can read every paper and problem without an account, and nothing on
        it costs money.
      </p>
      <h2>Content</h2>
      <p>
        Problem descriptions, starter code and tests are written by contributors. Papers
        belong to their authors; {SITE.name} links to them and summarises them in its own
        words. If a step is wrong or unclear, use the &ldquo;Report a problem with this
        step&rdquo; link on it.
      </p>
      <h2>The software</h2>
      <p>
        The code is available under the{" "}
        <a
          href={`${SITE.repositoryUrl}/blob/main/LICENSE`}
          target="_blank"
          rel="noopener noreferrer"
        >
          MIT licence
        </a>
        . It is provided as is, without warranty of any kind.
      </p>
      <h2>Fair use</h2>
      <p>
        Do not try to break the service, read other people&apos;s data, or overload it.
        The operator may block traffic that does.
      </p>
    </LegalPage>
  );
}
