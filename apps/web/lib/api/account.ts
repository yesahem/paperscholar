import type { AvatarUploaded, Me, UpdateMe } from "@repo/shared";
// zod/mini: this module runs in the browser, where the full zod build is too large.
import * as z from "zod/mini";
import { meSchema } from "@/lib/auth/schemas";
import { apiRequest, type CallOptions } from "./client";

/** The signed-in user's own account (docs/specs/05-api.md §7). */

export const avatarUploadedSchema: z.ZodMiniType<AvatarUploaded> = z.object({
  avatarUrl: z.string(),
});

export function updateMe(changes: UpdateMe, options: CallOptions = {}): Promise<Me> {
  return apiRequest("/v1/me", meSchema, { method: "PATCH", body: changes, ...options });
}

export function deleteMe(confirm: string, options: CallOptions = {}): Promise<void> {
  return apiRequest("/v1/me", null, { method: "DELETE", body: { confirm }, ...options });
}

export function uploadAvatar(
  file: File,
  options: CallOptions = {},
): Promise<AvatarUploaded> {
  const body = new FormData();
  body.append("avatar", file);
  return apiRequest("/v1/me/avatar", avatarUploadedSchema, {
    method: "POST",
    body,
    ...options,
  });
}

export function removeAvatar(options: CallOptions = {}): Promise<void> {
  return apiRequest("/v1/me/avatar", null, { method: "DELETE", ...options });
}
