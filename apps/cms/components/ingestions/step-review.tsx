"use client";

import type { IngestionDetail, IngestionStep, StepFiles } from "@repo/shared";
import { Alert } from "@repo/ui/components/alert";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Dialog } from "@repo/ui/components/dialog";
import { Field } from "@repo/ui/components/field";
import { Select } from "@repo/ui/components/select";
import { Skeleton } from "@repo/ui/components/skeleton";
import { Tab, TabList, TabPanel, Tabs } from "@repo/ui/components/tabs";
import { Textarea } from "@repo/ui/components/textarea";
import { useToast } from "@repo/ui/components/toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Save, ShieldCheck, Sparkles, Trash2, Wand2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { LoadError } from "@repo/web-core/states/load-error";
import {
  STEP_FILE_TABS,
  STEP_STATUS_LABEL,
  stepTone,
  type StepFileKey,
} from "@/lib/admin/format";
import { adminKeys, useStepFiles } from "@/lib/admin/queries";
import {
  regenerateStep,
  removeStep,
  saveStep,
  verifyStep,
  waiveCheck,
} from "@/lib/api/admin";
import { ApiError } from "@repo/web-core/api/errors";
import { CheckResults } from "./check-results";

const CodeEditor = dynamic(
  () => import("@repo/web-core/editor/code-editor").then((module) => module.CodeEditor),
  { ssr: false, loading: () => <Skeleton className="h-96 w-full" /> },
);

const IN_FLIGHT = new Set(["pending", "writing", "verifying"]);

/** One step on the review screen (spec 09 §10). */
export function StepReview({
  detail,
  step,
}: {
  detail: IngestionDetail;
  step: IngestionStep;
}) {
  const files = useStepFiles(detail.id, step.stepId);
  const queries = useQueryClient();
  // Kept here, so saving (which reloads the editor below) keeps the file that was open.
  const [tab, setTab] = useState<StepFileKey>("description");
  // Refetch the files when the pipeline finishes with the step.
  useEffect(() => {
    void queries.invalidateQueries({ queryKey: adminKeys.step(detail.id, step.stepId) });
  }, [queries, detail.id, step.stepId, step.status, step.attempts]);

  if (files.isPending) return <Skeleton className="h-96 w-full" />;
  if (files.isError) {
    if (
      files.error instanceof ApiError &&
      files.error.status === 404 &&
      IN_FLIGHT.has(step.status)
    ) {
      return (
        <p className="text-sm text-muted-foreground">
          The pipeline is writing this step.
        </p>
      );
    }
    return (
      <LoadError
        what="this step"
        message={files.error.message}
        onRetry={() => void files.refetch()}
      />
    );
  }
  return (
    <StepEditor
      key={`${step.stepId}:${files.data.current.updatedAt}`}
      detail={detail}
      step={step}
      initial={files.data.current.files}
      planStep={files.data.step}
      verification={files.data.current.verification}
      tab={tab}
      onTabChange={setTab}
    />
  );
}

function StepEditor({
  detail,
  step,
  initial,
  planStep,
  verification,
  tab,
  onTabChange: setTab,
}: {
  detail: IngestionDetail;
  step: IngestionStep;
  initial: StepFiles;
  planStep: NonNullable<IngestionDetail["plan"]>["steps"][number];
  verification: Parameters<typeof CheckResults>[0]["verification"];
  tab: StepFileKey;
  onTabChange: (tab: StepFileKey) => void;
}) {
  const queries = useQueryClient();
  const toast = useToast();
  const [files, setFiles] = useState<StepFiles>(initial);
  const [regenerating, setRegenerating] = useState(false);
  const [note, setNote] = useState("");
  const [waiving, setWaiving] = useState(false);
  const [waiveTarget, setWaiveTarget] = useState<"V7" | "V8">("V7");
  const [reason, setReason] = useState("");
  const dirty = JSON.stringify(files) !== JSON.stringify(initial);
  const busy = IN_FLIGHT.has(step.status);

  const refresh = () => {
    void queries.invalidateQueries({ queryKey: adminKeys.ingestion(detail.id) });
    void queries.invalidateQueries({ queryKey: adminKeys.step(detail.id, step.stepId) });
  };
  const failed = (error: Error) =>
    toast({
      title: error instanceof ApiError ? error.message : "That did not work",
      variant: "destructive",
    });

  // The files are passed when clicked, so a save never sends an earlier render's state.
  const save = useMutation({
    mutationFn: (payload: StepFiles) => saveStep(detail.id, step.stepId, payload),
    onSuccess: () => {
      refresh();
      toast({ title: "Saved. Re-verify before publishing.", variant: "success" });
    },
    onError: failed,
  });
  const verify = useMutation({
    mutationFn: async ({
      full,
      payload,
    }: {
      full: boolean;
      payload: StepFiles | null;
    }) => {
      if (payload) await saveStep(detail.id, step.stepId, payload);
      return verifyStep(detail.id, step.stepId, full);
    },
    onSuccess: (result) => {
      refresh();
      toast({
        title: result.queued
          ? "Full check queued: V1–V10 run in the background"
          : result.verification?.passed
            ? "Quick checks passed"
            : "Quick checks failed: see the results",
        variant: result.queued || result.verification?.passed ? "success" : "warning",
      });
    },
    onError: failed,
  });
  // Unsaved changes are saved first.
  const runVerify = (full: boolean) =>
    verify.mutate({ full, payload: dirty ? files : null });
  const regenerate = useMutation({
    mutationFn: () => regenerateStep(detail.id, step.stepId, note.trim()),
    onSuccess: () => {
      setRegenerating(false);
      setNote("");
      refresh();
      toast({ title: "Writing the step again with your note", variant: "success" });
    },
    onError: failed,
  });
  const waive = useMutation({
    mutationFn: () => waiveCheck(detail.id, step.stepId, waiveTarget, reason.trim()),
    onSuccess: () => {
      setWaiving(false);
      setReason("");
      refresh();
    },
    onError: failed,
  });
  const remove = useMutation({
    mutationFn: () => removeStep(detail.id, step.stepId),
    onSuccess: refresh,
    onError: failed,
  });

  const chunks = (detail.outline?.chunks ?? []).filter((chunk) =>
    planStep.chunkIds.includes(chunk.id),
  );

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">{step.title}</h2>
        <Badge variant={stepTone(step.status)}>{STEP_STATUS_LABEL[step.status]}</Badge>
        <span className="text-xs text-muted-foreground">
          {step.attempts} {step.attempts === 1 ? "attempt" : "attempts"}
        </span>
      </div>

      <section
        aria-labelledby="source"
        className="grid grid-cols-1 gap-2 rounded-lg border border-border p-4"
      >
        <h3 id="source" className="text-sm font-semibold">
          Where it comes from
        </h3>
        <p className="text-sm text-muted-foreground">
          {planStep.concept}{" "}
          {planStep.paperRefs.length > 0 ? `(${planStep.paperRefs.join(", ")})` : ""}
        </p>
        <ul className="grid gap-2 text-sm">
          {chunks.map((chunk) => (
            <li key={chunk.id}>
              <span className="font-medium">{chunk.heading}</span>{" "}
              <span className="text-muted-foreground">
                p.{" "}
                {chunk.pageStart === chunk.pageEnd
                  ? chunk.pageStart
                  : `${chunk.pageStart}–${chunk.pageEnd}`}
              </span>
              <p className="text-muted-foreground">{chunk.summary}</p>
            </li>
          ))}
        </ul>
      </section>

      {busy ? (
        <Alert
          variant="info"
          title="The pipeline is working on this step; editing is paused."
        />
      ) : null}

      <Tabs
        defaultValue="description"
        value={tab}
        onValueChange={(value) => setTab(value as StepFileKey)}
      >
        <TabList aria-label="Files of this step" className="overflow-x-auto">
          {STEP_FILE_TABS.map((file) => (
            <Tab key={file.key} value={file.key}>
              {file.label}
            </Tab>
          ))}
        </TabList>
        {STEP_FILE_TABS.map((file) => (
          <TabPanel key={file.key} value={file.key} className="pt-3">
            {file.key === "helpers" && files.helpers === null ? (
              <p className="text-sm text-muted-foreground">This step uses no helpers.</p>
            ) : file.language === "python" ? (
              <div className="h-96 overflow-hidden rounded-lg border border-border">
                {tab === file.key ? (
                  <CodeEditor
                    value={files[file.key] ?? ""}
                    onChange={(value) =>
                      setFiles((current) => ({ ...current, [file.key]: value }))
                    }
                    onReady={() => {}}
                    label={`${file.label} of ${step.title}`}
                    onRun={() => runVerify(false)}
                    onSubmit={() => runVerify(true)}
                  />
                ) : null}
              </div>
            ) : (
              <Textarea
                aria-label={`${file.label} of ${step.title}`}
                rows={18}
                className="font-mono text-xs"
                value={files[file.key] ?? ""}
                disabled={busy}
                onChange={(event) =>
                  setFiles((current) => ({ ...current, [file.key]: event.target.value }))
                }
              />
            )}
          </TabPanel>
        ))}
      </Tabs>

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => save.mutate(files)}
          disabled={!dirty || busy}
          loading={save.isPending}
        >
          <Save aria-hidden="true" />
          Save
        </Button>
        <Button
          variant="outline"
          onClick={() => runVerify(false)}
          disabled={busy}
          loading={verify.isPending && verify.variables.full === false}
        >
          <RefreshCw aria-hidden="true" />
          Re-verify
        </Button>
        <Button
          variant="outline"
          onClick={() => runVerify(true)}
          disabled={busy}
          loading={verify.isPending && verify.variables.full === true}
        >
          <Sparkles aria-hidden="true" />
          Full check
        </Button>
        <Button variant="ghost" onClick={() => setRegenerating(true)} disabled={busy}>
          <Wand2 aria-hidden="true" />
          Regenerate
        </Button>
        <Button variant="ghost" onClick={() => setWaiving(true)} disabled={busy}>
          <ShieldCheck aria-hidden="true" />
          Waive a check
        </Button>
        <Button
          variant="ghost"
          onClick={() => remove.mutate()}
          disabled={busy}
          loading={remove.isPending}
        >
          <Trash2 aria-hidden="true" />
          Remove step
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Ctrl/⌘ + Enter in the editor re-verifies; Ctrl/⌘ + Shift + Enter runs the full
        check. Unsaved changes are saved first.
      </p>

      <section aria-labelledby="results" className="grid grid-cols-1 gap-3">
        <h3 id="results" className="text-lg font-semibold">
          Verification
        </h3>
        <CheckResults verification={verification} waivers={step.waivers} />
      </section>

      <Dialog
        open={regenerating}
        onOpenChange={setRegenerating}
        title="Write this step again"
        description="The pipeline writes and verifies the step afresh, with your note in its instructions. Earlier attempts are kept."
        footer={
          <Button
            onClick={() => regenerate.mutate()}
            disabled={note.trim() === ""}
            loading={regenerate.isPending}
          >
            Regenerate
          </Button>
        }
      >
        <Field
          label="Your note"
          description="What should change, such as “define the mask before using it”."
        >
          <Textarea
            rows={4}
            maxLength={2000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
      </Dialog>

      <Dialog
        open={waiving}
        onOpenChange={setWaiving}
        title="Waive a check for this step"
        description="A waived V7 or V8 no longer blocks publishing. Your reason is stored with your name."
        footer={
          <Button
            onClick={() => waive.mutate()}
            disabled={reason.trim().length < 3}
            loading={waive.isPending}
          >
            Waive
          </Button>
        }
      >
        <div className="grid gap-4">
          <Field label="Check">
            <Select
              value={waiveTarget}
              onChange={(event) =>
                setWaiveTarget(event.target.value === "V8" ? "V8" : "V7")
              }
            >
              <option value="V7">V7 Tests have teeth</option>
              <option value="V8">V8 Solvable from the description</option>
            </Select>
          </Field>
          <Field label="Why" required>
            <Textarea
              rows={3}
              maxLength={1000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
