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
      <h2>No tracking</h2>
      <p>
        You can read every paper and use the editor without an account. {SITE.name} runs
        no analytics or advertising and loads nothing from other companies: its fonts,
        maths rendering and code editor are served from this site.
      </p>
      <h2>Stored in your browser</h2>
      <ul>
        <li>
          <strong>Code drafts.</strong> What you type in the editor is saved in your
          browser&apos;s local storage so it is there when you come back. It is sent to
          the server only when you press Run or Submit. Clear your site data to remove it.
        </li>
        <li>
          <strong>Theme.</strong> Your light or dark choice, if you made one.
        </li>
        <li>
          <strong>Session cookies</strong>, only once you sign in: one identifies your
          session, one holds a signed copy of it for up to five minutes so most pages do
          not need a database lookup. They are not readable by scripts, are sent only to
          this site, and end when you sign out or after 30 days.
        </li>
      </ul>
      <h2>If you create an account</h2>
      <ul>
        <li>
          <strong>Your email address</strong>, used to sign you in and, on instances that
          send email, to confirm the address and to reset your password. It is never shown
          to other people.
        </li>
        <li>
          <strong>Your username</strong>, which is public, and a bio if you write one.
        </li>
        <li>
          <strong>Your password</strong>, stored only as a one-way hash.
        </li>
        <li>
          <strong>Your sessions</strong>: for each signed-in browser, its network address
          and browser name, so a session can be recognised and ended.
        </li>
        <li>
          <strong>Code you run or submit</strong>, with its test results, so you can see
          your history and restore earlier code. Runs are deleted after 30 days; submits
          are kept with your account. Your code is run in an isolated sandbox with no
          network and is never shown to other people.
        </li>
        <li>
          <strong>Google sign-in</strong>, if you use it and this instance offers it:
          Google tells this site your email address and name. The sign-in tokens Google
          issues are kept with your account, encrypted.
        </li>
      </ul>
      <p>
        Emails are sent through the email service this instance&apos;s operator chose,
        which receives your address and the message. Deleting your account removes it and
        everything attached to it; until the settings page arrives, ask the operator.
      </p>
      <h2>Kept on the server</h2>
      <p>
        The server keeps short technical logs of each request: the method, the kind of
        page or API route, the status, how long it took and a random request id. They do
        not include your IP address, cookies, email address or what you typed. To slow
        down password guessing it counts sign-in, sign-up and reset attempts per network
        address, and it counts runs per account to keep each person within the daily
        limit. If your browser reports a blocked script under the site&apos;s security
        policy, the server logs which rule was involved and the page path, without query
        strings. The company hosting this instance may keep its own access logs.
      </p>
      <h2>Changes</h2>
      <p>
        This page says what the software stores before it stores it. The operator of an
        instance that changes the software is responsible for keeping this page accurate.
      </p>
    </LegalPage>
  );
}
