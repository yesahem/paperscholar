import type { ProblemDetail } from "@repo/shared";
import { Badge } from "@repo/ui/components/badge";
import { Clock, Cpu, MemoryStick } from "lucide-react";
import { Markdown } from "@/components/content/markdown";

/**
 * What a solution may use and how long it may run, built from the problem's
 * fields (docs/specs/08-web.md §5.1).
 */
export function LimitsBox({ problem }: { problem: ProblemDetail }) {
  return (
    <section
      aria-labelledby="limits-heading"
      className="flex flex-col gap-4 rounded-lg border border-border bg-muted/40 p-4 text-sm"
    >
      <h2 id="limits-heading" className="font-semibold">
        Rules for your solution
      </h2>
      <dl className="grid gap-3 sm:grid-cols-[auto_1fr] sm:gap-x-6">
        <dt className="text-muted-foreground">Implement</dt>
        <dd>
          <code className="font-mono">{problem.entryPoint}</code> in{" "}
          <code className="font-mono">solution.py</code>
        </dd>
        <dt className="text-muted-foreground">Allowed</dt>
        <dd className="flex flex-wrap gap-1.5">
          <Badge variant="outline">Python standard library</Badge>
          {problem.allowedPackages.map((name) => (
            <Badge key={name} variant="success">
              {name}
            </Badge>
          ))}
          {problem.helpersInterface ? <Badge variant="success">helpers</Badge> : null}
        </dd>
        {problem.prohibitedImports.length > 0 ? (
          <>
            <dt className="text-muted-foreground">Not allowed</dt>
            <dd className="flex flex-wrap gap-1.5">
              {problem.prohibitedImports.map((name) => (
                <Badge key={name} variant="destructive">
                  {name}
                </Badge>
              ))}
            </dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">Limits</dt>
        <dd className="flex flex-wrap gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1.5">
            <Clock aria-hidden="true" className="size-3.5" />
            {problem.timeLimitSeconds} s per test
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MemoryStick aria-hidden="true" className="size-3.5" />
            {problem.memoryLimitMb} MB memory
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Cpu aria-hidden="true" className="size-3.5" />
            {problem.environment === "torch" ? "NumPy and PyTorch (CPU)" : "NumPy"}
          </span>
        </dd>
        {problem.paperRefs.length > 0 ? (
          <>
            <dt className="text-muted-foreground">In the paper</dt>
            <dd>{problem.paperRefs.join(", ")}</dd>
          </>
        ) : null}
      </dl>
      {problem.helpersInterface ? (
        <div className="flex flex-col gap-2">
          <h3 className="font-medium">
            Helpers you can import:{" "}
            <code className="font-mono">from helpers import …</code>
          </h3>
          <Markdown>{`\`\`\`python\n${problem.helpersInterface}\n\`\`\``}</Markdown>
        </div>
      ) : null}
    </section>
  );
}
