"use client";

import { Dialog } from "@repo/ui/components/dialog";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useRefreshMe } from "@/lib/queries";
import { SignInForm } from "./sign-in-form";
import { SignUpForm } from "./sign-up-form";

type Mode = "sign-in" | "sign-up";

interface AuthDialogValue {
  /** Opens the sign-in modal over the current page, keeping what the user was doing. */
  open: (mode?: Mode) => void;
}

const AuthDialogContext = createContext<AuthDialogValue | null>(null);

/** The sign-in modal, available to any page (docs/specs/06-auth.md §8). */
export function AuthDialogProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const refreshMe = useRefreshMe();
  const pathname = usePathname();

  const open = useCallback((next: Mode = "sign-in") => setMode(next), []);
  const done = () => {
    setMode(null);
    void refreshMe();
  };

  return (
    <AuthDialogContext value={{ open }}>
      {children}
      <Dialog
        open={mode !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setMode(null);
        }}
        title={mode === "sign-up" ? "Create your account" : "Sign in"}
        description={
          mode === "sign-up"
            ? "Free, and your drafts stay where they are."
            : "Pick up where you left off."
        }
      >
        {mode === "sign-up" ? (
          <SignUpForm
            next={pathname}
            onSignedUp={done}
            onWantsSignIn={() => setMode("sign-in")}
          />
        ) : mode === "sign-in" ? (
          <SignInForm
            next={pathname}
            onSignedIn={done}
            onWantsSignUp={() => setMode("sign-up")}
          />
        ) : null}
      </Dialog>
    </AuthDialogContext>
  );
}

export function useAuthDialog(): AuthDialogValue {
  const value = useContext(AuthDialogContext);
  if (!value) throw new Error("useAuthDialog must be used inside AuthDialogProvider");
  return value;
}
