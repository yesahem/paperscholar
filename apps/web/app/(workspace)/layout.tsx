import type { ReactNode } from "react";
import { SiteHeader } from "@/components/layout/site-header";

/** The workspace fills the window below the header; there is no footer. */
export default function WorkspaceLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex flex-col min-[900px]:h-dvh">
      <SiteHeader className="static" />
      <main id="main" className="flex min-h-0 flex-1 flex-col">
        {children}
      </main>
    </div>
  );
}
