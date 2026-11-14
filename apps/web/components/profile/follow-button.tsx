"use client";

import type { PublicProfile } from "@repo/shared";
import { Button } from "@repo/ui/components/button";
import { useToast } from "@repo/ui/components/toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserMinus, UserPlus } from "lucide-react";
import { useAuthDialog } from "@/components/auth/auth-dialog";
import { ApiError } from "@/lib/api/errors";
import { setFollowing } from "@/lib/api/users";
import { queryKeys } from "@/lib/queries";

/**
 * Follow or unfollow `username`. Visitors are asked to sign in first. The
 * profile updates at once and is put back if the request fails.
 */
export function FollowButton({ profile }: { profile: PublicProfile }) {
  const queries = useQueryClient();
  const toast = useToast();
  const dialog = useAuthDialog();
  const key = queryKeys.profile(profile.username);
  const following = profile.isFollowedByMe === true;

  const mutation = useMutation({
    mutationFn: (next: boolean) => setFollowing(profile.username, next),
    onMutate: async (next) => {
      await queries.cancelQueries({ queryKey: key });
      const previous = queries.getQueryData<PublicProfile>(key);
      if (previous) {
        queries.setQueryData<PublicProfile>(key, {
          ...previous,
          isFollowedByMe: next,
          followerCount: Math.max(0, previous.followerCount + (next ? 1 : -1)),
        });
      }
      return { previous };
    },
    onError: (error, _next, context) => {
      if (context?.previous) queries.setQueryData(key, context.previous);
      if (error instanceof ApiError && error.code === "unauthenticated") {
        dialog.open("sign-in");
        return;
      }
      toast({
        title:
          error instanceof ApiError && error.code === "email_not_verified"
            ? "Confirm your email address to follow people."
            : error instanceof ApiError
              ? error.message
              : "Could not change who you follow. Try again.",
        variant: "warning",
      });
    },
    onSettled: () => {
      void queries.invalidateQueries({ queryKey: key });
      void queries.invalidateQueries({ queryKey: ["following"] });
    },
  });

  if (profile.isFollowedByMe === null) {
    return (
      <Button variant="outline" size="sm" onClick={() => dialog.open("sign-in")}>
        <UserPlus aria-hidden="true" />
        Follow
      </Button>
    );
  }
  return (
    <Button
      variant={following ? "outline" : "primary"}
      size="sm"
      aria-pressed={following}
      disabled={mutation.isPending}
      onClick={() => mutation.mutate(!following)}
    >
      {following ? <UserMinus aria-hidden="true" /> : <UserPlus aria-hidden="true" />}
      {following ? "Following" : "Follow"}
    </Button>
  );
}
