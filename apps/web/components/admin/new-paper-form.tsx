"use client";

import { PIPELINE_DEFAULTS } from "@repo/shared/pipeline";
import { RUN_ENVIRONMENTS } from "@repo/shared/vocabulary";
import { Alert } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import { Field } from "@repo/ui/components/field";
import { FileUpload } from "@repo/ui/components/file-upload";
import { Input } from "@repo/ui/components/input";
import { Select } from "@repo/ui/components/select";
import { Tab, TabList, TabPanel, Tabs } from "@repo/ui/components/tabs";
import { Textarea } from "@repo/ui/components/textarea";
import { useMutation } from "@tanstack/react-query";
import { FileUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { startIngestion } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/errors";
import { useInstanceConfig } from "@/lib/queries";

type Source = "pdf" | "arxiv";

/** `/admin/papers/new`: a PDF or an arXiv id, the options of spec 09 §4, and the rights confirmation. */
export function NewPaperForm() {
  const router = useRouter();
  const config = useInstanceConfig();
  const [source, setSource] = useState<Source>("pdf");
  const [files, setFiles] = useState<File[]>([]);
  const [arxivId, setArxivId] = useState("");
  const [targetSteps, setTargetSteps] = useState("");
  const [environment, setEnvironment] = useState("");
  const [focus, setFocus] = useState("");
  const [pauseAfterPlan, setPauseAfterPlan] = useState(false);
  const [rights, setRights] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const start = useMutation({
    mutationFn: () => {
      const file = files[0];
      const target =
        source === "pdf" ? (file ? { file } : null) : { arxivId: arxivId.trim() };
      if (!target) throw new Error("Choose a PDF first.");
      return startIngestion(target, {
        rightsConfirmed: true,
        options: {
          targetSteps: targetSteps === "" ? null : Number(targetSteps),
          environment:
            environment === "numpy" || environment === "torch" ? environment : null,
          focus: focus.trim() === "" ? null : focus.trim(),
          pauseAfterPlan,
        },
      });
    },
    onSuccess: (result) =>
      router.push(`/admin/ingestions/${result.id}${result.created ? "" : "?existing=1"}`),
    onError: (error) =>
      setProblem(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : "Could not start.",
      ),
  });

  if (config.data && !config.data.features.pipeline) {
    return (
      <Alert variant="warning" title="The paper pipeline is off on this instance">
        Uploading papers needs a model. Set ANTHROPIC_API_KEY in the backend&apos;s
        environment (apps/backend/.env, or .env for docker compose) and restart it.
      </Alert>
    );
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setProblem(null);
    if (!rights) {
      setProblem("Confirm that you may use this paper to make learning material.");
      return;
    }
    start.mutate();
  };

  return (
    <form onSubmit={submit} className="grid max-w-2xl gap-6" noValidate>
      {problem ? <Alert variant="destructive" title={problem} /> : null}
      <Tabs
        defaultValue="pdf"
        value={source}
        onValueChange={(value) => setSource(value === "arxiv" ? "arxiv" : "pdf")}
      >
        <TabList aria-label="Where the paper comes from">
          <Tab value="pdf">Upload a PDF</Tab>
          <Tab value="arxiv">From arXiv</Tab>
        </TabList>
        <TabPanel value="pdf" className="pt-4">
          <Field
            label="The paper"
            description={`A PDF of at most ${Math.round(PIPELINE_DEFAULTS.maxPdfBytes / 1024 / 1024)} MB and ${PIPELINE_DEFAULTS.maxPdfPages} pages. It is kept privately and never shown to learners.`}
          >
            <FileUpload
              accept="application/pdf,.pdf"
              maxSizeBytes={PIPELINE_DEFAULTS.maxPdfBytes}
              value={files}
              onValueChange={setFiles}
            />
          </Field>
        </TabPanel>
        <TabPanel value="arxiv" className="pt-4">
          <Field
            label="arXiv id"
            description="Such as 1706.03762. The PDF is downloaded from arxiv.org only."
          >
            <Input
              value={arxivId}
              onChange={(event) => setArxivId(event.target.value)}
              placeholder="1706.03762"
              autoComplete="off"
            />
          </Field>
        </TabPanel>
      </Tabs>

      <fieldset className="grid gap-4">
        <legend className="mb-2 text-base font-semibold">Options</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Roughly how many steps"
            description={`Leave blank to let the planner choose (${PIPELINE_DEFAULTS.minSteps}–${PIPELINE_DEFAULTS.maxSteps}).`}
          >
            <Input
              type="number"
              inputMode="numeric"
              min={PIPELINE_DEFAULTS.minSteps}
              max={PIPELINE_DEFAULTS.maxSteps}
              value={targetSteps}
              onChange={(event) => setTargetSteps(event.target.value)}
            />
          </Field>
          <Field
            label="Environment"
            description="Force one for every step, or let each step choose."
          >
            <Select
              value={environment}
              onChange={(event) => setEnvironment(event.target.value)}
            >
              <option value="">Chosen per step</option>
              {RUN_ENVIRONMENTS.map((name) => (
                <option key={name} value={name}>
                  {name === "numpy" ? "NumPy" : "PyTorch"}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field
          label="Focus"
          description="Optional, such as “only the attention mechanism, skip training”."
        >
          <Textarea
            rows={2}
            maxLength={500}
            value={focus}
            onChange={(event) => setFocus(event.target.value)}
          />
        </Field>
        <Checkbox
          id="pause-after-plan"
          checked={pauseAfterPlan}
          onChange={(event) => setPauseAfterPlan(event.target.checked)}
          label="Stop after planning"
          description="Review and edit the plan before any step is written."
        />
      </fieldset>

      <Checkbox
        id="rights"
        checked={rights}
        onChange={(event) => setRights(event.target.checked)}
        label="I may use this paper to make learning material"
        description="The model writes original explanations and links to the paper; the PDF is not redistributed."
      />

      <div>
        <Button type="submit" loading={start.isPending}>
          <FileUp aria-hidden="true" />
          Start
        </Button>
      </div>
    </form>
  );
}
