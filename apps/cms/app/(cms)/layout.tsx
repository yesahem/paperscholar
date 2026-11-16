import type { ReactNode } from "react";
import { CmsHeader } from "@/components/shell/cms-header";
import { loadCmsEnv } from "@/lib/env";

/** Every screen after sign-in: the CMS header and the page. */
export default function CmsLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <CmsHeader siteUrl={loadCmsEnv().NEXT_PUBLIC_SITE_URL} />
      <main id="main" className="flex-1">
        {children}
      </main>
    </>
  );
}
