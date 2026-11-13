"use client";

import {
  createContext,
  useContext,
  useId,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "../lib/cn";
import { nextRovingIndex } from "../lib/roving-focus";

interface TabsContextValue {
  baseId: string;
  value: string;
  select(value: string): void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabs(component: string): TabsContextValue {
  const context = useContext(TabsContext);
  if (!context) throw new Error(`<${component}> must be used inside <Tabs>`);
  return context;
}

const tabId = (baseId: string, value: string) => `${baseId}-tab-${value}`;
const panelId = (baseId: string, value: string) => `${baseId}-panel-${value}`;

export interface TabsProps extends Omit<ComponentProps<"div">, "onChange"> {
  /** The tab shown first, and on the server. */
  defaultValue: string;
  /** Controlled value. Pass with `onValueChange`. */
  value?: string;
  onValueChange?: (value: string) => void;
  children: ReactNode;
}

/**
 * Tabs following the WAI-ARIA pattern: arrow keys move between tabs and
 * select them, Home and End jump to the ends, only the selected tab is in the
 * tab order. The selected panel is rendered on the server, so its content is
 * readable without JavaScript.
 *
 * @example
 * <Tabs defaultValue="description">
 *   <TabList aria-label="Problem">
 *     <Tab value="description">Description</Tab>
 *     <Tab value="tutorial">Tutorial</Tab>
 *   </TabList>
 *   <TabPanel value="description">…</TabPanel>
 *   <TabPanel value="tutorial">…</TabPanel>
 * </Tabs>
 */
export function Tabs({
  defaultValue,
  value,
  onValueChange,
  className,
  children,
  ...props
}: TabsProps) {
  const baseId = useId();
  const [uncontrolled, setUncontrolled] = useState(defaultValue);
  const current = value ?? uncontrolled;
  const select = (next: string) => {
    if (value === undefined) setUncontrolled(next);
    onValueChange?.(next);
  };
  return (
    <TabsContext.Provider value={{ baseId, value: current, select }}>
      <div className={cn("flex flex-col", className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export interface TabListProps extends ComponentProps<"div"> {
  /** Names the tab list for screen readers. */
  "aria-label": string;
}

export function TabList({ className, onKeyDown, ...props }: TabListProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    const tabs = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[role="tab"]:not(:disabled)',
      ),
    );
    const current = tabs.findIndex((tab) => tab === document.activeElement);
    if (current === -1) return;
    const next = nextRovingIndex(current, event.key, tabs.length);
    if (next === null) return;
    event.preventDefault();
    tabs[next]?.focus();
    tabs[next]?.click();
  };
  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      className={cn(
        "flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border",
        className,
      )}
      onKeyDown={handleKeyDown}
      {...props}
    />
  );
}

export interface TabProps extends Omit<ComponentProps<"button">, "value"> {
  value: string;
}

export function Tab({ value, className, onClick, ...props }: TabProps) {
  const tabs = useTabs("Tab");
  const selected = tabs.value === value;
  return (
    <button
      type="button"
      role="tab"
      id={tabId(tabs.baseId, value)}
      aria-selected={selected}
      aria-controls={panelId(tabs.baseId, value)}
      tabIndex={selected ? 0 : -1}
      data-state={selected ? "active" : "inactive"}
      className={cn(
        "-mb-px inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 border-b-2 border-transparent px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors",
        "hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
        "disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4",
        "data-[state=active]:border-primary data-[state=active]:text-foreground",
        className,
      )}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) tabs.select(value);
      }}
      {...props}
    />
  );
}

export interface TabPanelProps extends ComponentProps<"div"> {
  value: string;
}

/** Inactive panels stay in the DOM, hidden, so their state is kept. */
export function TabPanel({ value, className, ...props }: TabPanelProps) {
  const tabs = useTabs("TabPanel");
  const selected = tabs.value === value;
  return (
    <div
      role="tabpanel"
      id={panelId(tabs.baseId, value)}
      aria-labelledby={tabId(tabs.baseId, value)}
      hidden={!selected}
      tabIndex={0}
      className={cn(
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
        className,
      )}
      {...props}
    />
  );
}
