import type { ReactNode } from "react";

/** The sign-in page: no header, a card in the middle. */
export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main id="main" className="flex flex-1 items-center justify-center">
      {children}
    </main>
  );
}
