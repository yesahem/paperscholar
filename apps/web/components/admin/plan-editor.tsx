"use client";

import type { IngestionDetail, Plan, PlanStep } from "@repo/shared";
import { Alert } from "@repo/ui/components/alert";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Field } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { Skeleton } from "@repo/ui/components/skeleton";
import { Textarea } from "@repo/ui/components/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Play, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoadError } from "@/components/states/load-error";
import { moved } from "@/lib/admin/order";
import { adminKeys, useIngestion } from "@/lib/admin/queries";
import { savePlan } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/errors";

/** `/admin/ingestions/[id]/plan`: reorder, rename, remove steps, then continue (spec 09 §6). */
export function PlanEditor({ id }: { id: string }) {
  const ingestion = useIngestion(id);
  if (ingestion.isPending) return <Skeleton className="h-64 w-full" />;
  if (ingestion.isError) {
    return (
      <LoadError
        what="the plan"
        message={ingestion.error.message}
        onRetry={() => void ingestion.refetch()}
      />
    );
  }
  const { plan, status } = ingestion.data;
  if (status !== "awaiting_plan_review" || !plan) {
    return (
      <Alert variant="info" title="This plan is not waiting for review">
        The ingestion is {status.replaceAll("_", " ")}. Plans can be edited when an upload
        asks to stop after planning.
      </Alert>
    );
  }
  return <Editor detail={ingestion.data} initial={plan} />;
}

function Editor({ detail, initial }: { detail: IngestionDetail; initial: Plan }) {
  const router = useRouter();
  const queries = useQueryClient();
  const [steps, setSteps] = useState<PlanStep[]>(initial.steps);
  const [problem, setProblem] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => savePlan(detail.id, { ...initial, steps }),
    onSuccess: (updated) => {
      queries.setQueryData(adminKeys.ingestion(detail.id), updated);
      router.push(`/admin/ingestions/${detail.id}`);
    },
    onError: (error) =>
      setProblem(error instanceof ApiError ? error.message : "Could not save the plan."),
  });
  const update = (index: number, changes: Partial<PlanStep>) =>
    setSteps((current) =>
      current.map((step, at) => (at === index ? { ...step, ...changes } : step)),
    );

  return (
    <div className="grid grid-cols-1 gap-6">
      {problem ? <Alert variant="destructive" title={problem} /> : null}
      <ol className="grid gap-4">
        {steps.map((step, index) => (
          <li key={step.id} className="grid gap-3 rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-muted-foreground">{index + 1}</span>
              <code className="text-xs text-muted-foreground">{step.id}</code>
              <Badge variant="secondary">{step.type}</Badge>
              <Badge variant="secondary">{step.difficulty}</Badge>
              <Badge variant="secondary">{step.environment}</Badge>
              <span className="flex-1" />
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Move ${step.title} up`}
                disabled={index === 0}
                onClick={() => setSteps(moved(steps, index, -1))}
              >
                <ArrowUp aria-hidden="true" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Move ${step.title} down`}
                disabled={index === steps.length - 1}
                onClick={() => setSteps(moved(steps, index, 1))}
              >
                <ArrowDown aria-hidden="true" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Remove ${step.title}`}
                onClick={() => setSteps(steps.filter((_, at) => at !== index))}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
            <Field label="Title">
              <Input
                value={step.title}
                onChange={(event) => update(index, { title: event.target.value })}
              />
            </Field>
            <Field label="Summary">
              <Textarea
                rows={2}
                value={step.summary}
                onChange={(event) => update(index, { summary: event.target.value })}
              />
            </Field>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Teaches:</span> {step.concept}{" "}
              <span className="font-mono">{step.signature}</span>
              {step.dependsOn.length > 0 ? (
                <> · builds on {step.dependsOn.join(", ")}</>
              ) : null}
              {step.paperRefs.length > 0 ? <> · {step.paperRefs.join(", ")}</> : null}
            </p>
          </li>
        ))}
      </ol>
      {initial.omitted.length > 0 ? (
        <section aria-labelledby="omitted" className="grid gap-2">
          <h2 id="omitted" className="text-lg font-semibold">
            Left out
          </h2>
          <ul className="grid gap-1 text-sm text-muted-foreground">
            {initial.omitted.map((item) => (
              <li key={item.what}>
                <span className="font-medium text-foreground">{item.what}</span>:{" "}
                {item.why}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <div>
        <Button onClick={() => save.mutate()} loading={save.isPending}>
          <Play aria-hidden="true" />
          Save and write the steps
        </Button>
      </div>
    </div>
  );
}
