"use client";

import type { CourseItem } from "@repo/shared";
import { Button } from "@repo/ui/components/button";
import { cn } from "@repo/ui/lib/cn";
import { CheckCircle2, Circle, ListChecks, PlayCircle } from "lucide-react";
import { formatMinutes } from "@/lib/courses/player";

/**
 * The course's items in order. Completed items are marked with an icon and
 * the words "completed" for screen readers, so colour is not the only signal.
 */
export function Syllabus({
  items,
  selected,
  completed,
  onSelect,
}: {
  items: readonly CourseItem[];
  selected: string;
  completed: ReadonlySet<string>;
  onSelect: (itemId: string) => void;
}) {
  return (
    <nav aria-label="Syllabus">
      <ol className="grid gap-1">
        {items.map((item, index) => {
          const done = completed.has(item.id);
          const current = item.id === selected;
          const Icon = item.type === "lecture" ? PlayCircle : ListChecks;
          return (
            <li key={item.id}>
              <Button
                variant="ghost"
                aria-current={current ? "step" : undefined}
                onClick={() => onSelect(item.id)}
                className={cn(
                  "h-auto w-full items-start justify-start gap-3 px-3 py-2 text-left font-normal whitespace-normal",
                  current && "bg-accent font-medium",
                )}
              >
                <Icon
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                />
                <span className="min-w-0 flex-1">
                  <span className="block">
                    {index + 1}. {item.title}
                  </span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {item.type === "lecture"
                      ? `Lecture · ${formatMinutes(item.durationSeconds)}`
                      : `Exercise · ${item.questionCount} question${item.questionCount === 1 ? "" : "s"}`}
                  </span>
                </span>
                {done ? (
                  <CheckCircle2
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-success"
                  />
                ) : (
                  <Circle
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-border"
                  />
                )}
                {done ? <span className="sr-only">completed</span> : null}
              </Button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
