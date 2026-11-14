"use client";

import {
  useId,
  useState,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { cn } from "../lib/cn";
import { clampSplit, nextSplit, splitAtPointer } from "../lib/resizable";

export interface ResizablePanelsProps {
  /** The left pane. Stacked above `end` below the breakpoint. */
  start: ReactNode;
  end: ReactNode;
  /** Label of the divider, for screen readers, e.g. "Resize instructions and editor". */
  label: string;
  /** Width of `start` in percent. */
  defaultSplit?: number;
  min?: number;
  max?: number;
  onSplitChange?: (split: number) => void;
  className?: string;
  startClassName?: string;
  endClassName?: string;
}

/**
 * Two panes side by side with a draggable divider, following the WAI-ARIA
 * window splitter pattern: the divider is focusable and arrow keys, Home and
 * End move it. Below 900 px the panes stack and the divider is hidden.
 *
 * @example
 * <ResizablePanels label="Resize panes" start={<Instructions />} end={<Editor />} />
 */
export function ResizablePanels({
  start,
  end,
  label,
  defaultSplit = 50,
  min = 25,
  max = 75,
  onSplitChange,
  className,
  startClassName,
  endClassName,
}: ResizablePanelsProps) {
  const bounds = { min, max };
  const [split, setSplit] = useState(() => clampSplit(defaultSplit, bounds));
  const container = useRef<HTMLDivElement>(null);
  const startId = useId();

  const update = (next: number) => {
    setSplit(next);
    onSplitChange?.(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = nextSplit(split, event.key, bounds);
    if (next === null) return;
    event.preventDefault();
    update(next);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const box = container.current?.getBoundingClientRect();
    if (box) update(splitAtPointer(event.clientX, box.left, box.width, bounds));
  };

  return (
    <div
      ref={container}
      style={{ "--split": `${split}%` } as CSSProperties}
      className={cn(
        "grid min-h-0 flex-1 min-[900px]:grid-cols-[minmax(0,var(--split))_auto_minmax(0,1fr)]",
        className,
      )}
    >
      <div id={startId} className={cn("min-h-0", startClassName)}>
        {start}
      </div>
      <div
        role="separator"
        aria-label={label}
        aria-controls={startId}
        aria-orientation="vertical"
        aria-valuenow={split}
        aria-valuemin={min}
        aria-valuemax={max}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        className="hidden w-1.5 cursor-col-resize touch-none bg-border transition-colors hover:bg-primary focus-visible:bg-primary min-[900px]:block"
      />
      <div className={cn("min-h-0", endClassName)}>{end}</div>
    </div>
  );
}
