import type { Role } from "@repo/shared/accounts";
import type { ReactNode } from "react";
import { CmsGate } from "./cms-gate";

/** Width, heading and role gate shared by the maintainer screens; wider than document pages. */
export function PageFrame({
  title,
  description,
  role = "maintainer",
  children,
}: {
  title: string;
  description?: ReactNode;
  role?: Role;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 [&>*]:min-w-0">
      <CmsGate role={role}>
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-balance">{title}</h1>
          {description ? (
            <p className="max-w-3xl text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {children}
      </CmsGate>
    </div>
  );
}
