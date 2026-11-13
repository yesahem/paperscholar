import type { ReactNode } from "react";

/** Title block at the top of a document page. */
export function PageHeader({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        {title}
      </h1>
      {description ? (
        <p className="max-w-3xl text-lg text-pretty text-muted-foreground">
          {description}
        </p>
      ) : null}
      {children}
    </div>
  );
}

/** Width and padding shared by document pages. */
export function PageContainer({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-10 sm:px-6 sm:py-14">
      {children}
    </div>
  );
}
