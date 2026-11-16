"use client";

import type { Verification, Waiver } from "@repo/shared";
import { Badge } from "@repo/ui/components/badge";
import { CircleCheck, CircleMinus, CircleX, ShieldCheck } from "lucide-react";
import { TestList } from "@repo/web-core/results/test-list";

const ICONS = {
  passed: { Icon: CircleCheck, className: "text-success", label: "Passed" },
  failed: { Icon: CircleX, className: "text-destructive", label: "Failed" },
  skipped: { Icon: CircleMinus, className: "text-muted-foreground", label: "Not run" },
  waived: { Icon: ShieldCheck, className: "text-warning", label: "Waived" },
} as const;

/**
 * A step's verification as the review screen shows it (spec 09 §10): each
 * check with its evidence, the reference solution's run test by test (the
 * same view a learner gets of their own), mutants, the solver and fidelity notes.
 */
export function CheckResults({
  verification,
  waivers,
}: {
  verification: Verification | null;
  waivers: Waiver[];
}) {
  if (!verification) {
    return (
      <p className="text-sm text-muted-foreground">
        Not verified on these files yet. Re-verify to run the quick checks (V1–V6, V10),
        or run the full check to add V7–V9.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-6">
      <ul aria-label="Checks" className="grid gap-2">
        {verification.checks.map((check) => {
          const { Icon, className, label } = ICONS[check.status];
          const waiver = waivers.find((candidate) => candidate.check === check.id);
          return (
            <li key={check.id} className="rounded-lg border border-border p-3 text-sm">
              <div className="flex items-center gap-2">
                <Icon aria-hidden="true" className={`size-4 shrink-0 ${className}`} />
                <span className="sr-only">{label}:</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {check.id}
                </span>
                <span className="font-medium">{check.name}</span>
              </div>
              {check.details.length > 0 && check.status !== "passed" ? (
                <ul className="mt-2 grid gap-1 pl-6">
                  {check.details.map((detail) => (
                    <li key={detail} className="font-mono text-xs whitespace-pre-wrap">
                      {detail}
                    </li>
                  ))}
                </ul>
              ) : check.details.length > 0 ? (
                <p className="mt-1 pl-6 text-xs text-muted-foreground">
                  {check.details.join(" · ")}
                </p>
              ) : null}
              {waiver ? (
                <p className="mt-1 pl-6 text-xs text-warning">Waived: {waiver.reason}</p>
              ) : null}
            </li>
          );
        })}
      </ul>

      {verification.tests && verification.tests.length > 0 ? (
        <section aria-labelledby="reference-run" className="grid grid-cols-1 gap-2">
          <h3 id="reference-run" className="text-sm font-semibold">
            The reference solution against every test
          </h3>
          <TestList tests={verification.tests} />
        </section>
      ) : null}

      {verification.mutants ? (
        <section aria-labelledby="mutants" className="grid grid-cols-1 gap-2">
          <h3 id="mutants" className="text-sm font-semibold">
            Mutants (V7)
          </h3>
          <ul className="grid gap-1 text-sm">
            {verification.mutants.map((mutant, index) => (
              <li
                key={`${index}-${mutant.description}`}
                className="flex flex-wrap items-baseline gap-2"
              >
                <Badge
                  variant={
                    mutant.outcome === "killed"
                      ? "success"
                      : mutant.outcome === "survived"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {mutant.outcome}
                </Badge>
                <span>{mutant.description}</span>
                {mutant.reason ? (
                  <span className="text-xs text-muted-foreground">({mutant.reason})</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {verification.solve ? (
        <section aria-labelledby="solver" className="grid grid-cols-1 gap-2">
          <h3 id="solver" className="text-sm font-semibold">
            Independent solver (V8)
          </h3>
          <p className="text-sm">
            {verification.solve.passed
              ? `Solved from the description alone in ${verification.solve.attempts === 1 ? "one attempt" : "two attempts"}.`
              : "Could not solve it from the description alone."}
          </p>
          {verification.solve.failures.length > 0 ? (
            <ul className="grid gap-1 font-mono text-xs">
              {verification.solve.failures.map((failure) => (
                <li key={failure}>{failure}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {verification.fidelity ? (
        <section aria-labelledby="fidelity" className="grid grid-cols-1 gap-2">
          <h3 id="fidelity" className="text-sm font-semibold">
            Fidelity to the paper (V9)
          </h3>
          {verification.fidelity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No issues found.</p>
          ) : (
            <ul className="grid gap-1 text-sm">
              {verification.fidelity.map((issue) => (
                <li key={`${issue.paperRef}-${issue.summary}`}>
                  <Badge
                    variant={issue.severity === "blocking" ? "destructive" : "secondary"}
                  >
                    {issue.severity}
                  </Badge>{" "}
                  <span className="text-muted-foreground">{issue.paperRef}:</span>{" "}
                  {issue.summary}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
