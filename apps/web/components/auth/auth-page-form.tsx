"use client";

import { useRouter } from "next/navigation";
import { useRefreshMe } from "@/lib/queries";
import { SignInForm } from "./sign-in-form";
import { SignUpForm } from "./sign-up-form";

/** The sign-in or sign-up form on its own page; afterwards, goes to `next`. */
export function AuthPageForm({
  mode,
  next,
}: {
  mode: "sign-in" | "sign-up";
  next: string;
}) {
  const router = useRouter();
  const refreshMe = useRefreshMe();
  const done = () => {
    void refreshMe();
    router.push(next);
  };
  return mode === "sign-in" ? (
    <SignInForm next={next} onSignedIn={done} />
  ) : (
    <SignUpForm next={next} onSignedUp={done} />
  );
}
