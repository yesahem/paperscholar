"use client";

import { useInstanceConfig } from "@repo/web-core/queries/session";
import { NavLink } from "@/components/layout/nav-link";

/**
 * "Courses" in the header, only on an instance that offers them
 * (docs/specs/10-secondary-features.md §5: no course content, no entry).
 */
export function CoursesNavLink() {
  const config = useInstanceConfig();
  if (!config.data?.features.courses) return null;
  return (
    <li>
      <NavLink href="/courses">Courses</NavLink>
    </li>
  );
}
