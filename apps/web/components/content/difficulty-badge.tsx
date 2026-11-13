import type { Difficulty } from "@repo/shared";
import { Badge } from "@repo/ui/components/badge";
import { Gauge, Signal, SignalHigh, SignalLow } from "lucide-react";

const DIFFICULTY = {
  easy: { label: "Easy", variant: "success", Icon: SignalLow },
  medium: { label: "Medium", variant: "warning", Icon: SignalHigh },
  hard: { label: "Hard", variant: "destructive", Icon: Signal },
} as const;

/** Difficulty with an icon and a word, never colour alone. */
export function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  const { label, variant, Icon } = DIFFICULTY[difficulty];
  return (
    <Badge variant={variant}>
      <Icon aria-hidden="true" />
      {label}
    </Badge>
  );
}

/** "2 easy · 1 medium", skipping difficulties with no problems. */
export function DifficultyMix({ counts }: { counts: Record<Difficulty, number> }) {
  const parts = (Object.keys(DIFFICULTY) as Difficulty[])
    .filter((difficulty) => counts[difficulty] > 0)
    .map((difficulty) => `${counts[difficulty]} ${difficulty}`);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Gauge aria-hidden="true" className="size-3.5" />
      {parts.length > 0 ? parts.join(" · ") : "No problems yet"}
    </span>
  );
}
