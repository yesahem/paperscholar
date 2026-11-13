import { and, count, eq, ne, schema, type Database } from "@repo/db";
import {
  normaliseUsername,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  roleSchema,
  USERNAME_CHANGE_INTERVAL_DAYS,
  type Me,
  type Role,
} from "@repo/shared";
import { APIError } from "better-auth/api";
import type { Auth } from "../auth/auth";
import { AppError } from "../lib/errors";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ProfileChanges {
  /** Already validated and lowercased. */
  username?: string;
  /** Null clears the bio. */
  bio?: string | null;
}

export interface AccountsDependencies {
  db: Database;
  auth: Auth;
  now?: () => Date;
}

/** Postgres reports a unique-constraint violation with SQLSTATE 23505. */
export function isUniqueViolation(error: unknown): boolean {
  for (let current = error; current instanceof Error; current = current.cause) {
    const fields = current as Error & { errno?: unknown; code?: unknown };
    if (fields.errno === "23505" || fields.code === "23505") return true;
  }
  return false;
}

/** When a username last changed at `changedAt` may change again. */
export function nextUsernameChange(changedAt: Date | null): Date | null {
  if (!changedAt) return null;
  return new Date(changedAt.getTime() + USERNAME_CHANGE_INTERVAL_DAYS * DAY_MS);
}

/** Thrown by `setRole` when the change would leave the instance without an admin. */
export class LastAdminError extends Error {
  constructor() {
    super("This is the only admin; make someone else an admin first.");
    this.name = "LastAdminError";
  }
}

/**
 * The signed-in user's own account: reading it, changing the username and
 * bio, deleting it, and roles. Writes to Better Auth's `user` table go
 * through Better Auth (docs/specs/04-database.md §3).
 */
export function createAccounts({
  db,
  auth,
  now = () => new Date(),
}: AccountsDependencies) {
  async function load(userId: string) {
    const [row] = await db
      .select({
        id: schema.user.id,
        username: schema.user.username,
        email: schema.user.email,
        emailVerified: schema.user.emailVerified,
        role: schema.user.role,
        createdAt: schema.user.createdAt,
        bio: schema.profiles.bio,
        usernameChangedAt: schema.profiles.usernameChangedAt,
      })
      .from(schema.user)
      .leftJoin(schema.profiles, eq(schema.profiles.userId, schema.user.id))
      .where(eq(schema.user.id, userId))
      .limit(1);
    return row ?? null;
  }

  function toMe(row: NonNullable<Awaited<ReturnType<typeof load>>>): Me {
    return {
      id: row.id,
      username: row.username ?? "",
      email: row.email,
      emailVerified: row.emailVerified,
      avatarUrl: null,
      bio: row.bio ?? null,
      role: roleSchema.catch("user").parse(row.role),
      createdAt: row.createdAt.toISOString(),
    };
  }

  async function changeUsername(
    userId: string,
    current: string | null,
    username: string,
    changedAt: Date | null,
  ) {
    if (current === username) return;
    const availableAt = nextUsernameChange(changedAt);
    if (availableAt && availableAt > now()) {
      throw new AppError("conflict", {
        message: `You can change your username again on ${availableAt.toISOString().slice(0, 10)}.`,
        details: { availableAt: availableAt.toISOString() },
      });
    }
    const taken = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(and(eq(schema.user.username, username), ne(schema.user.id, userId)))
      .limit(1);
    if (taken.length > 0) throw usernameTaken();

    const context = await auth.$context;
    try {
      await context.internalAdapter.updateUser(userId, { username });
    } catch (error) {
      // Lost a race with another account taking the same name.
      if (error instanceof APIError || isUniqueViolation(error))
        throw usernameTaken(error);
      throw error;
    }
    await db
      .insert(schema.profiles)
      .values({ userId, usernameChangedAt: now() })
      .onConflictDoUpdate({
        target: schema.profiles.userId,
        set: { usernameChangedAt: now(), updatedAt: now() },
      });
  }

  /** The user's role as stored now, or null when the user does not exist. */
  async function currentRole(userId: string): Promise<Role | null> {
    const [row] = await db
      .select({ role: schema.user.role })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .limit(1);
    if (!row) return null;
    return roleSchema.catch("user").parse(row.role);
  }

  return {
    /** The account as `GET /v1/me` returns it, or null when it no longer exists. */
    async getMe(userId: string): Promise<Me | null> {
      const row = await load(userId);
      return row ? toMe(row) : null;
    },

    /** Applies `PATCH /v1/me`. Throws `conflict` for a taken name or a change too soon. */
    async updateMe(userId: string, changes: ProfileChanges): Promise<Me> {
      const row = await load(userId);
      if (!row) throw new AppError("unauthenticated");

      if (changes.username !== undefined) {
        await changeUsername(
          userId,
          row.username,
          changes.username,
          row.usernameChangedAt ?? null,
        );
      }
      if (changes.bio !== undefined) {
        await db
          .insert(schema.profiles)
          .values({ userId, bio: changes.bio })
          .onConflictDoUpdate({
            target: schema.profiles.userId,
            set: { bio: changes.bio, updatedAt: now() },
          });
      }

      const updated = await load(userId);
      if (!updated) throw new AppError("unauthenticated");
      return toMe(updated);
    },

    /** Throws `validation_error` unless `confirm` is the user's username. */
    async confirmDeletion(userId: string, confirm: string): Promise<void> {
      const row = await load(userId);
      if (!row) throw new AppError("unauthenticated");
      if (normaliseUsername(confirm) !== row.username) {
        throw new AppError("validation_error", {
          message: "Type your username to confirm.",
          details: { issues: [{ path: "confirm", message: "must match your username" }] },
        });
      }
    },

    /**
     * Deletes the account and its sessions. Every row referencing the user
     * goes with it (foreign keys cascade); content the user created keeps
     * existing without an author. Call `confirmDeletion` first.
     */
    async deleteAccount(userId: string): Promise<void> {
      const context = await auth.$context;
      await context.internalAdapter.deleteUserSessions(userId);
      await context.internalAdapter.deleteUser(userId);
    },

    currentRole,

    /**
     * Changes a user's role (docs/specs/06-auth.md §9). Refuses to demote the
     * last admin. Returns the previous role.
     */
    async setRole(userId: string, role: Role): Promise<Role> {
      const previous = await currentRole(userId);
      if (previous === null) throw new AppError("not_found");
      if (previous === "admin" && role !== "admin") {
        const [admins] = await db
          .select({ total: count() })
          .from(schema.user)
          .where(eq(schema.user.role, "admin"));
        if ((admins?.total ?? 0) <= 1) throw new LastAdminError();
      }
      if (previous !== role) {
        const context = await auth.$context;
        await context.internalAdapter.updateUser(userId, { role });
      }
      return previous;
    },

    /**
     * Sets a password from the command line, for instances that cannot send
     * reset emails (docs/specs/06-auth.md §1), and signs the user out everywhere.
     */
    async setPassword(userId: string, password: string): Promise<void> {
      if (
        password.length < PASSWORD_MIN_LENGTH ||
        password.length > PASSWORD_MAX_LENGTH
      ) {
        throw new AppError("validation_error", {
          message: `Use ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters.`,
        });
      }
      const context = await auth.$context;
      const hash = await context.password.hash(password);
      if (await context.internalAdapter.findCredentialAccount(userId)) {
        await context.internalAdapter.updatePassword(userId, hash);
      } else {
        // A Google-only account gains a password sign-in.
        await context.internalAdapter.linkAccount({
          userId,
          providerId: "credential",
          accountId: userId,
          password: hash,
        });
      }
      await context.internalAdapter.deleteUserSessions(userId);
    },

    /** The id of the user with `email`, or null. */
    async findUserIdByEmail(email: string): Promise<string | null> {
      const [row] = await db
        .select({ id: schema.user.id })
        .from(schema.user)
        .where(eq(schema.user.email, email.trim().toLowerCase()))
        .limit(1);
      return row?.id ?? null;
    },
  };
}

function usernameTaken(cause?: unknown): AppError {
  return new AppError("conflict", { message: "That username is taken.", cause });
}

export type Accounts = ReturnType<typeof createAccounts>;
