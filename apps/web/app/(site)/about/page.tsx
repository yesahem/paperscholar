import { SITE } from "@repo/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/legal-page";
import { ApiStatus } from "@/components/system/api-status";

export const metadata: Metadata = {
  title: "About",
  description: `What ${SITE.name} is, who makes it, and how to run your own.`,
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <LegalPage
      title={`About ${SITE.name}`}
      description={SITE.description}
      aside={
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle className="text-base">Instance status</CardTitle>
          </CardHeader>
          <CardContent>
            <ApiStatus />
          </CardContent>
        </Card>
      }
    >
      <h2>Why implement papers</h2>
      <p>
        Most people learn a paper by reading it. Writing the code is where the details
        become clear: the shapes, the edge cases, the step the paper mentions in one line.{" "}
        {SITE.name} splits each paper into small functions, in the order they build on
        each other, so you implement the whole method one tested piece at a time.
      </p>
      <h2>Open source and free</h2>
      <p>
        Every paper and every feature is free. The code is open source under the MIT
        licence, and anyone can run their own instance, for a class, a reading group or a
        team. Problems are written by contributors and checked by an automated verifier
        before they are published: the reference solution must pass every test and the
        starter code must fail them.
      </p>
      <ul>
        <li>
          <a href={SITE.repositoryUrl} target="_blank" rel="noopener noreferrer">
            Source code and issue tracker
          </a>
        </li>
        <li>
          <a
            href={`${SITE.repositoryUrl}/blob/main/CONTRIBUTING.md`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Contributing a paper or a fix
          </a>
        </li>
        <li>
          <Link href="/roadmap">Learning tracks</Link>
        </li>
      </ul>
    </LegalPage>
  );
}
