"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { AuthDialogProvider } from "@/components/auth/auth-dialog";

/** Browser-side state for every page: the query cache and the sign-in modal. */
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { refetchOnWindowFocus: false } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <AuthDialogProvider>{children}</AuthDialogProvider>
    </QueryClientProvider>
  );
}
