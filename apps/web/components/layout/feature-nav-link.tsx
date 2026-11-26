"use client";

import type { Feature } from "@repo/shared";
import { useInstanceConfig } from "@repo/web-core/queries/session";
import { NavLink } from "./nav-link";

/**
 * A header link to an optional feature, shown only on an instance that
 * offers it (docs/specs/13-self-hosting.md §4: the web app hides what is off).
 */
export function FeatureNavLink({
  feature,
  href,
  children,
}: {
  feature: Feature;
  href: string;
  children: string;
}) {
  const config = useInstanceConfig();
  if (!config.data?.features[feature]) return null;
  return (
    <li>
      <NavLink href={href}>{children}</NavLink>
    </li>
  );
}
