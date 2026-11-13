import { SITE } from "@repo/shared/site";
import { buttonVariants } from "@repo/ui/components/button";
import { cn } from "@repo/ui/lib/cn";
import { BookOpenText } from "lucide-react";
import Link from "next/link";
import { AccountControls } from "@/components/auth/account-controls";
import { VerificationBanner } from "@/components/auth/verification-banner";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { NavLink } from "./nav-link";

const NAVIGATION = [
  { href: "/papers", label: "Papers" },
  { href: "/roadmap", label: "Roadmap" },
  { href: "/about", label: "About" },
] as const;

/**
 * The header on every page: the product name, navigation, theme switch and
 * account controls, with the email-verification banner beneath when needed.
 */
export function SiteHeader({ className }: { className?: string }) {
  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur",
        className,
      )}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 rounded-md font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-ring"
        >
          <BookOpenText aria-hidden="true" className="size-5 text-primary" />
          {SITE.name}
        </Link>
        <nav aria-label="Main" className="min-w-0 flex-1 overflow-x-auto">
          <ul className="flex items-center gap-1">
            {NAVIGATION.map((item) => (
              <li key={item.href}>
                <NavLink href={item.href}>{item.label}</NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <a
          href={SITE.repositoryUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "hidden sm:inline-flex",
          )}
        >
          GitHub
        </a>
        <ThemeToggle />
        <AccountControls />
      </div>
      <VerificationBanner />
    </header>
  );
}
