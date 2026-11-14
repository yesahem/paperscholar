"use client";

import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@repo/ui/components/dropdown-menu";
import { Avatar } from "@repo/ui/components/avatar";
import { Skeleton } from "@repo/ui/components/skeleton";
import { ChevronDown, LogOut, Settings, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signOut } from "@/lib/auth/auth-api";
import { useMe, useRefreshMe } from "@/lib/queries";
import { useAuthDialog } from "./auth-dialog";

/** The header's account area: a sign-in button, or the signed-in user's menu. */
export function AccountControls() {
  const me = useMe();
  const dialog = useAuthDialog();
  const refreshMe = useRefreshMe();
  const router = useRouter();
  const [signOutFailed, setSignOutFailed] = useState(false);

  if (me.isPending) return <Skeleton className="h-8 w-20" />;

  if (!me.data) {
    return (
      <Button size="sm" onClick={() => dialog.open("sign-in")}>
        Sign in
      </Button>
    );
  }

  const { username } = me.data;

  async function leave() {
    setSignOutFailed(false);
    try {
      await signOut();
      await refreshMe();
    } catch {
      setSignOutFailed(true);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {signOutFailed ? (
        <span role="alert" className="text-xs text-destructive">
          Sign-out failed
        </span>
      ) : null}
      <DropdownMenu
        align="end"
        triggerLabel={`Account: ${me.data.username}`}
        trigger={
          <>
            <Avatar
              src={me.data.avatarUrl}
              name={me.data.username}
              size="sm"
              decorative
            />
            <span className="hidden max-w-32 truncate sm:inline">{me.data.username}</span>
            <ChevronDown aria-hidden="true" />
          </>
        }
      >
        <DropdownMenuLabel>
          Signed in as{" "}
          <span className="font-medium text-foreground">{me.data.username}</span>
          <br />
          {me.data.email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push(`/profile/${username}`)}>
          <UserRound aria-hidden="true" />
          Your profile
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push("/settings")}>
          <Settings aria-hidden="true" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void leave()}>
          <LogOut aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenu>
    </div>
  );
}
