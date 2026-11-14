import { AppError } from "../lib/errors";

/** The id of the user a guard has already established. */
export function signedInUserId(user: { id: string } | null): string {
  if (!user) throw new AppError("unauthenticated");
  return user.id;
}
