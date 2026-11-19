"use client";

import { CONTENT_TAGS, type ContentTag } from "@repo/shared/vocabulary";
import type { IngestionDetail, PaperMetadataEdit } from "@repo/shared";
import { Alert } from "@repo/ui/components/alert";
import { Badge } from "@repo/ui/components/badge";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Field } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { Skeleton } from "@repo/ui/components/skeleton";
import { Textarea } from "@repo/ui/components/textarea";
import { useToast } from "@repo/ui/components/toast";
import { cn } from "@repo/ui/lib/cn";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ExternalLink, Plus, Send } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { LoadError } from "@repo/web-core/states/load-error";
import { STEP_STATUS_LABEL, stepTone } from "@/lib/admin/format";
import { moved } from "@/lib/admin/order";
import { adminKeys, useIngestion } from "@/lib/admin/queries";
import { addStep, publishIngestion, updateDraft } from "@/lib/api/admin";
import { ApiError } from "@repo/web-core/api/errors";
import { StepReview } from "./step-review";

/** `/ingestions/[id]/review`: the review screen of spec 09 §10. */
export function ReviewView({
  id,
  siteUrl,
  initialStep = null,
}: {
  id: string;
  siteUrl: string;
  /** The step to show first; the first step when null or unknown. */
  initialStep?: string | null;
}) {
  const ingestion = useIngestion(id);
  if (ingestion.isPending) return <Skeleton className="h-96 w-full" />;
  if (ingestion.isError) {
    return (
      <LoadError
        what="this draft"
        message={ingestion.error.message}
        onRetry={() => void ingestion.refetch()}
      />
    );
  }
  const detail = ingestion.data;
  if (detail.status !== "ready_for_review" && detail.status !== "published") {
    return (
      <Alert variant="info" title="This draft is not ready for review yet">
        The ingestion is {detail.status.replaceAll("_", " ")}.{" "}
        <Link href={`/ingestions/${id}`} className="underline">
          Follow its progress
        </Link>
        .
      </Alert>
    );
  }
  return <Review detail={detail} siteUrl={siteUrl} initialStep={initialStep} />;
}

function Review({
  detail,
  siteUrl,
  initialStep,
}: {
  detail: IngestionDetail;
  siteUrl: string;
  initialStep: string | null;
}) {
  const queries = useQueryClient();
  const toast = useToast();
  const [selected, setSelected] = useState<string | null>(
    detail.stepStates.find((state) => state.stepId === initialStep)?.stepId ??
      detail.stepStates[0]?.stepId ??
      null,
  );
  const step =
    detail.stepStates.find((candidate) => candidate.stepId === selected) ??
    detail.stepStates[0];
  const refresh = () =>
    void queries.invalidateQueries({ queryKey: adminKeys.ingestion(detail.id) });
  const failed = (error: Error) =>
    toast({
      title: error instanceof ApiError ? error.message : "That did not work",
      variant: "destructive",
    });

  const publish = useMutation({
    mutationFn: () => publishIngestion(detail.id),
    onSuccess: (paper) => {
      refresh();
      void queries.invalidateQueries({ queryKey: adminKeys.papers });
      toast({
        title: `Published ${paper.paperId} v${paper.version}. Learners see it within a minute.`,
        variant: "success",
      });
    },
    onError: failed,
  });
  const reorder = useMutation({
    mutationFn: (order: { stepId: string; title: string }[]) =>
      updateDraft(detail.id, { steps: order }),
    onSuccess: (updated) => queries.setQueryData(adminKeys.ingestion(detail.id), updated),
    onError: failed,
  });
  const order = detail.stepStates.map((state) => ({
    stepId: state.stepId,
    title: state.title,
  }));
  const problems = detail.publishProblems ?? [];

  return (
    <div className="grid grid-cols-1 gap-8">
      <section
        aria-labelledby="publish-heading"
        className="grid grid-cols-1 gap-3 rounded-lg border border-border p-4"
      >
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="publish-heading" className="text-lg font-semibold">
            {detail.status === "published" ? "Published" : "Draft"}
            {detail.paperId ? (
              <span className="ml-2 font-mono text-sm text-muted-foreground">
                {detail.paperId}
              </span>
            ) : null}
          </h2>
          <span className="flex-1" />
          {detail.status === "published" && detail.paperId ? (
            <a
              href={`${siteUrl}/papers/${detail.paperId}`}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <ExternalLink aria-hidden="true" />
              View as a learner
            </a>
          ) : null}
          <Button
            onClick={() => publish.mutate()}
            disabled={problems.length > 0}
            loading={publish.isPending}
          >
            <Send aria-hidden="true" />
            {detail.status === "published" ? "Publish the changes" : "Publish"}
          </Button>
        </div>
        {problems.length > 0 ? (
          <Alert variant="warning" title="Not ready to publish">
            <ul className="mt-1 grid gap-1">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </Alert>
        ) : (
          <p className="text-sm text-muted-foreground">
            Every step has passed its checks on its current files. Publishing writes a new
            version and makes it live.
          </p>
        )}
      </section>

      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <nav aria-label="Steps" className="grid content-start gap-2">
          <ol className="grid gap-1">
            {detail.stepStates.map((state, index) => (
              <li key={state.stepId} className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  aria-current={state.stepId === step?.stepId ? "true" : undefined}
                  onClick={() => setSelected(state.stepId)}
                  className={cn(
                    "h-auto min-w-0 flex-1 flex-col items-start gap-1 px-2 py-2 text-left",
                    state.stepId === step?.stepId && "bg-accent",
                  )}
                >
                  <span className="w-full truncate font-medium">
                    {index + 1}. {state.title}
                  </span>
                  <Badge variant={stepTone(state.status)}>
                    {STEP_STATUS_LABEL[state.status]}
                  </Badge>
                </Button>
                <span className="flex flex-col">
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Move ${state.title} up`}
                    disabled={index === 0 || reorder.isPending}
                    onClick={() => reorder.mutate(moved(order, index, -1))}
                  >
                    <ArrowUp aria-hidden="true" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Move ${state.title} down`}
                    disabled={index === order.length - 1 || reorder.isPending}
                    onClick={() => reorder.mutate(moved(order, index, 1))}
                  >
                    <ArrowDown aria-hidden="true" />
                  </Button>
                </span>
              </li>
            ))}
          </ol>
          <AddStep id={detail.id} />
        </nav>
        <div className="min-w-0">
          {step ? <StepReview detail={detail} step={step} /> : <p>No steps.</p>}
        </div>
      </div>

      <PaperForm detail={detail} />

      {detail.report?.omitted.length ? (
        <section aria-labelledby="omitted" className="grid grid-cols-1 gap-2">
          <h2 id="omitted" className="text-lg font-semibold">
            Left out of the path
          </h2>
          <ul className="grid gap-1 text-sm text-muted-foreground">
            {detail.report.omitted.map((item) => (
              <li key={item.what}>
                <span className="font-medium text-foreground">{item.what}</span>:{" "}
                {item.why}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function AddStep({ id }: { id: string }) {
  const queries = useQueryClient();
  const toast = useToast();
  const [description, setDescription] = useState("");
  const add = useMutation({
    mutationFn: () => addStep(id, description.trim()),
    onSuccess: (updated) => {
      queries.setQueryData(adminKeys.ingestion(id), updated);
      setDescription("");
      toast({
        title: "Planning the new step; it appears here once planned",
        variant: "success",
      });
    },
    onError: (error) =>
      toast({
        title: error instanceof ApiError ? error.message : "Could not add the step",
        variant: "destructive",
      }),
  });
  return (
    <form
      className="mt-4 grid gap-2"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        add.mutate();
      }}
    >
      <Field
        label="Add a step"
        description="Describe it in a sentence; the pipeline plans, writes and verifies it."
      >
        <Textarea
          rows={2}
          maxLength={1000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={description.trim() === ""}
        loading={add.isPending}
      >
        <Plus aria-hidden="true" />
        Add step
      </Button>
    </form>
  );
}

function PaperForm({ detail }: { detail: IngestionDetail }) {
  const queries = useQueryClient();
  const toast = useToast();
  const outline = detail.outline;
  const [paper, setPaper] = useState<PaperMetadataEdit>({
    title: outline?.title ?? detail.title ?? "",
    authors: outline?.authors ?? [],
    year: outline?.year ?? null,
    url: outline?.url?.startsWith("https://")
      ? outline.url
      : detail.sourceRef
        ? `https://arxiv.org/abs/${detail.sourceRef}`
        : "",
    summary: (outline?.summary ?? "").slice(0, 300),
    tags: outline?.tags ?? [],
  });
  const save = useMutation({
    mutationFn: () => updateDraft(detail.id, { paper }),
    onSuccess: (updated) => {
      queries.setQueryData(adminKeys.ingestion(detail.id), updated);
      toast({ title: "Paper details saved", variant: "success" });
    },
    onError: (error) =>
      toast({
        title: error instanceof ApiError ? error.message : "Could not save the details",
        variant: "destructive",
      }),
  });
  const toggleTag = (tag: ContentTag) =>
    setPaper((current) => ({
      ...current,
      tags: current.tags.includes(tag)
        ? current.tags.filter((other) => other !== tag)
        : [...current.tags, tag],
    }));

  return (
    <form
      aria-labelledby="paper-heading"
      className="grid max-w-3xl gap-4 rounded-lg border border-border p-4"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <h2 id="paper-heading" className="text-lg font-semibold">
        Paper details
      </h2>
      <Field label="Title">
        <Input
          value={paper.title}
          onChange={(event) => setPaper({ ...paper, title: event.target.value })}
        />
      </Field>
      <Field label="Authors" description="Comma-separated.">
        <Input
          value={paper.authors.join(", ")}
          onChange={(event) =>
            setPaper({
              ...paper,
              authors: event.target.value
                .split(",")
                .map((author) => author.trim())
                .filter(Boolean),
            })
          }
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
        <Field label="Year">
          <Input
            type="number"
            inputMode="numeric"
            value={paper.year ?? ""}
            onChange={(event) =>
              setPaper({
                ...paper,
                year: event.target.value === "" ? null : Number(event.target.value),
              })
            }
          />
        </Field>
        <Field
          label="Link to the paper"
          description="An https link, such as its arXiv page."
        >
          <Input
            type="url"
            value={paper.url}
            onChange={(event) => setPaper({ ...paper, url: event.target.value })}
          />
        </Field>
      </div>
      <Field label="Summary" description="At most 300 characters.">
        <Textarea
          rows={3}
          maxLength={300}
          value={paper.summary}
          onChange={(event) => setPaper({ ...paper, summary: event.target.value })}
        />
      </Field>
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Tags</legend>
        <div className="flex flex-wrap gap-2">
          {CONTENT_TAGS.map((tag) => (
            <Button
              key={tag}
              type="button"
              size="sm"
              variant={paper.tags.includes(tag) ? "primary" : "outline"}
              aria-pressed={paper.tags.includes(tag)}
              onClick={() => toggleTag(tag)}
            >
              {tag}
            </Button>
          ))}
        </div>
      </fieldset>
      <div>
        <Button type="submit" loading={save.isPending}>
          Save details
        </Button>
      </div>
    </form>
  );
}
