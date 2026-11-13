"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "../lib/cn";
import { nextRovingIndex } from "../lib/roving-focus";
import { buttonVariants } from "./button";

interface MenuContextValue {
  close: (options?: { restoreFocus?: boolean }) => void;
}

const MenuContext = createContext<MenuContextValue | null>(null);

export interface DropdownMenuProps {
  /** Content of the button that opens the menu. */
  trigger: ReactNode;
  /** Accessible name of the button when `trigger` has no text. */
  triggerLabel?: string;
  triggerClassName?: string;
  /** Which edge of the button the menu lines up with. */
  align?: "start" | "end";
  /** DropdownMenuItem, DropdownMenuLabel and DropdownMenuSeparator elements. */
  children: ReactNode;
  className?: string;
}

/**
 * A button that opens a list of actions, following the WAI-ARIA menu button
 * pattern: Enter, Space or Arrow Down open it on the first item, Arrow Up on
 * the last; arrows, Home and End move between items; Escape closes it and
 * returns focus to the button; Tab or a click elsewhere closes it.
 *
 * @example
 * <DropdownMenu trigger="ada" align="end">
 *   <DropdownMenuLabel>ada@example.com</DropdownMenuLabel>
 *   <DropdownMenuSeparator />
 *   <DropdownMenuItem onSelect={signOut}>Sign out</DropdownMenuItem>
 * </DropdownMenu>
 */
export function DropdownMenu({
  trigger,
  triggerLabel,
  triggerClassName,
  align = "start",
  children,
  className,
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const [focusOn, setFocusOn] = useState<"first" | "last">("first");
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const items = () =>
    Array.from(
      menu.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not([aria-disabled="true"])',
      ) ?? [],
    );

  const close = useCallback((options: { restoreFocus?: boolean } = {}) => {
    setOpen(false);
    if (options.restoreFocus ?? true) button.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const list = Array.from(
      menu.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not([aria-disabled="true"])',
      ) ?? [],
    );
    (focusOn === "first" ? list[0] : list.at(-1))?.focus();

    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, focusOn]);

  const openOn = (position: "first" | "last") => {
    setFocusOn(position);
    setOpen(true);
  };

  const onButtonKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openOn("first");
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openOn("last");
    }
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "Tab") {
      close({ restoreFocus: false });
      return;
    }
    const list = items();
    const current = list.findIndex((item) => item === document.activeElement);
    const next = nextRovingIndex(
      Math.max(current, 0),
      event.key,
      list.length,
      "vertical",
    );
    if (next !== null) {
      event.preventDefault();
      list[next]?.focus();
    }
  };

  return (
    <MenuContext value={{ close }}>
      <div ref={root} className={cn("relative inline-flex", className)}>
        <button
          ref={button}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          aria-label={triggerLabel}
          onClick={() => (open ? close({ restoreFocus: false }) : openOn("first"))}
          onKeyDown={onButtonKeyDown}
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            triggerClassName,
          )}
        >
          {trigger}
        </button>
        {open ? (
          <div
            ref={menu}
            id={menuId}
            role="menu"
            aria-orientation="vertical"
            onKeyDown={onMenuKeyDown}
            className={cn(
              "absolute top-full z-50 mt-1 grid min-w-48 gap-0.5 rounded-md border border-border bg-card p-1 text-card-foreground shadow-lg",
              align === "end" ? "right-0" : "left-0",
            )}
          >
            {children}
          </div>
        ) : null}
      </div>
    </MenuContext>
  );
}

export interface DropdownMenuItemProps extends Omit<
  ComponentProps<"button">,
  "onSelect" | "role" | "type"
> {
  /** Runs when the item is chosen by click, Enter or Space. The menu then closes. */
  onSelect: () => void;
}

/** One action in a DropdownMenu. */
export function DropdownMenuItem({
  onSelect,
  className,
  disabled,
  children,
  ...props
}: DropdownMenuItemProps) {
  const menu = useContext(MenuContext);
  return (
    <button
      {...props}
      type="button"
      role="menuitem"
      tabIndex={-1}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (disabled) return;
        menu?.close();
        onSelect();
      }}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
        "hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-none",
        "aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
        "[&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Non-interactive text at the top of a group, such as who is signed in. */
export function DropdownMenuLabel({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      role="presentation"
      className={cn("px-2 py-1.5 text-xs text-muted-foreground", className)}
      {...props}
    />
  );
}

/** A line between groups of items. */
export function DropdownMenuSeparator({ className }: { className?: string }) {
  return <div role="separator" className={cn("-mx-1 my-1 h-px bg-border", className)} />;
}
