-- Better Auth owns the "user" table and its generated schema cannot declare a
-- CHECK constraint, so the role enumeration is enforced here
-- (docs/specs/04-database.md §2).
ALTER TABLE "user" ADD CONSTRAINT "user_role_check" CHECK ("role" in ('user', 'maintainer', 'admin'));
