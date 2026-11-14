"use client";

import { Alert } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import { Dialog } from "@repo/ui/components/dialog";
import { ResizablePanels } from "@repo/ui/components/resizable-panels";
import { Tab, TabList, TabPanel, Tabs } from "@repo/ui/components/tabs";
import { Textarea } from "@repo/ui/components/textarea";
import { useToast } from "@repo/ui/components/toast";
import { Play, RotateCcw, Send } from "lucide-react";
import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useInstanceConfig, useMe } from "@/lib/queries";
import {
  browserDraftStorage,
  draftKey,
  DRAFT_SAVE_DELAY_MS,
  hashStarter,
  initialCode,
  readDraft,
  removeDraft,
  writeDraft,
} from "@/lib/content/drafts";
import { ResultsPanel } from "./results-panel";
import { SubmissionsPanel } from "./submissions-panel";
import { isBusy, useRun } from "./use-run";

const CodeEditor = dynamic(
  () => import("./code-editor").then((module) => module.CodeEditor),
  { ssr: false },
);

export interface WorkspaceProps {
  paperId: string;
  problemId: string;
  problemTitle: string;
  starter: string;
  allowedPackages: string[];
  timeLimitSeconds: number;
  memoryLimitMb: number;
  /** The next step, offered after a solved submit; null on the last one. */
  next: { href: string; title: string } | null;
  /** Breadcrumb and badges, rendered on the server. */
  heading: ReactNode;
  /** The Description tab's content, rendered on the server. */
  description: ReactNode;
  /** The Tutorial tab's content, rendered on the server; null hides the tab. */
  tutorial: ReactNode | null;
}

type PaneTab = "description" | "tutorial" | "results" | "submissions";

type DraftState = "loading" | "saved" | "unsaved" | "unavailable";

/**
 * The problem workspace (docs/specs/08-web.md §5): instructions beside the
 * editor. The editor's text is saved to this browser as a draft and restored
 * on return. Run checks the public tests; Submit checks every test.
 */
export function Workspace({
  paperId,
  problemId,
  problemTitle,
  starter,
  allowedPackages,
  timeLimitSeconds,
  memoryLimitMb,
  next,
  heading,
  description,
  tutorial,
}: WorkspaceProps) {
  const key = draftKey(paperId, problemId);
  const starterHash = hashStarter(starter);
  const [code, setCode] = useState(starter);
  const [draftState, setDraftState] = useState<DraftState>("loading");
  const [starterChanged, setStarterChanged] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const pendingSave = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestCode = useRef(code);
  const [tab, setTab] = useState<PaneTab>("description");
  const me = useMe();
  const toast = useToast();
  const config = useInstanceConfig();
  const signedIn = Boolean(me.data);
  const canRun =
    signedIn &&
    (me.data?.emailVerified === true ||
      config.data?.features.emailVerification === false);
  const { state: run, start, resume } = useRun({ paperId, problemId, signedIn });
  const busy = isBusy(run);
  const busyMode = run.kind === "creating" || run.kind === "polling" ? run.mode : null;
  const lastMode = useRef<"run" | "submit">("run");

  const save = useCallback(
    (next: string) => {
      const storage = browserDraftStorage();
      if (next === starter) {
        removeDraft(storage, key);
        setDraftState(storage ? "saved" : "unavailable");
        return;
      }
      const saved = writeDraft(storage, key, {
        code: next,
        starterHash,
        updatedAt: new Date().toISOString(),
      });
      setDraftState(saved ? "saved" : "unavailable");
    },
    [key, starter, starterHash],
  );

  const flush = useCallback(() => {
    if (pendingSave.current === null) return;
    clearTimeout(pendingSave.current);
    pendingSave.current = null;
    save(latestCode.current);
  }, [save]);

  // Restore the draft once in the browser; the server always renders the starter.
  useEffect(() => {
    const storage = browserDraftStorage();
    const restored = initialCode(readDraft(storage, key), starter);
    latestCode.current = restored.code;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser storage after hydration
    setCode(restored.code);
    setStarterChanged(restored.starterChanged);
    setDraftState(storage ? "saved" : "unavailable");
  }, [key, starter]);

  // Never lose the last keystrokes: save before the page goes away.
  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);

  const handleChange = (next: string) => {
    setCode(next);
    latestCode.current = next;
    setDraftState((state) => (state === "unavailable" ? state : "unsaved"));
    if (pendingSave.current !== null) clearTimeout(pendingSave.current);
    pendingSave.current = setTimeout(() => {
      pendingSave.current = null;
      save(latestCode.current);
    }, DRAFT_SAVE_DELAY_MS);
  };

  const replaceWithStarter = () => {
    if (pendingSave.current !== null) clearTimeout(pendingSave.current);
    pendingSave.current = null;
    latestCode.current = starter;
    setCode(starter);
    removeDraft(browserDraftStorage(), key);
    setStarterChanged(false);
  };

  const keepDraft = () => {
    save(latestCode.current);
    setStarterChanged(false);
  };

  const launch = useCallback(
    (mode: "run" | "submit") => {
      if (busy) return;
      lastMode.current = mode;
      if (signedIn) setTab("results");
      void start(mode, latestCode.current);
    },
    [busy, signedIn, start],
  );
  const runCode = useCallback(() => launch("run"), [launch]);
  const submitCode = useCallback(() => launch("submit"), [launch]);

  const restore = (restored: string) => {
    handleChange(restored);
    toast({ title: "Code restored into the editor", variant: "success" });
  };

  /** The fallback editor gets the same shortcuts as Monaco. */
  const onFallbackKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    launch(event.shiftKey ? "submit" : "run");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2">
        <div className="min-w-0">{heading}</div>
        <div className="flex items-center gap-2">
          <DraftStatus state={draftState} />
          <Button variant="outline" size="sm" onClick={() => setConfirmingReset(true)}>
            <RotateCcw aria-hidden="true" />
            Reset
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={runCode}
            disabled={busy}
            loading={busyMode === "run"}
            title="Run the public tests (Ctrl/⌘ + Enter)"
          >
            <Play aria-hidden="true" />
            Run
          </Button>
          <Button
            size="sm"
            onClick={submitCode}
            disabled={busy}
            loading={busyMode === "submit"}
            title="Run every test, public and hidden (Ctrl/⌘ + Shift + Enter)"
          >
            <Send aria-hidden="true" />
            Submit
          </Button>
        </div>
      </div>

      {starterChanged ? (
        <div className="border-b border-border p-3">
          <Alert variant="warning" title="The starter code for this problem has changed">
            <span className="flex flex-wrap items-center gap-2">
              You have a draft from the previous version.
              <Button size="sm" variant="outline" onClick={keepDraft}>
                Keep my draft
              </Button>
              <Button size="sm" variant="ghost" onClick={replaceWithStarter}>
                Load the new starter
              </Button>
            </span>
          </Alert>
        </div>
      ) : null}

      <ResizablePanels
        label="Resize the instructions and the editor"
        startClassName="border-border min-[900px]:overflow-y-auto"
        start={
          <Tabs
            defaultValue="description"
            value={tab}
            onValueChange={(value) => setTab(value as PaneTab)}
            className="min-h-full"
          >
            <TabList
              aria-label="Problem"
              className="sticky top-0 z-10 bg-background px-4"
            >
              <Tab value="description">Description</Tab>
              {tutorial ? <Tab value="tutorial">Tutorial</Tab> : null}
              <Tab value="results">Results</Tab>
              <Tab value="submissions">Submissions</Tab>
            </TabList>
            <TabPanel value="description" className="flex flex-col gap-6 p-4 sm:p-6">
              {description}
            </TabPanel>
            {tutorial ? (
              <TabPanel value="tutorial" className="p-4 sm:p-6">
                {tutorial}
              </TabPanel>
            ) : null}
            <TabPanel value="results">
              <ResultsPanel
                state={run}
                allowedPackages={allowedPackages}
                timeLimitSeconds={timeLimitSeconds}
                memoryLimitMb={memoryLimitMb}
                next={next}
                onRetry={() => launch(lastMode.current)}
                onResume={resume}
              />
            </TabPanel>
            <TabPanel value="submissions">
              <SubmissionsPanel
                paperId={paperId}
                problemId={problemId}
                signedIn={signedIn}
                canRun={canRun}
                onRestore={restore}
              />
            </TabPanel>
          </Tabs>
        }
        endClassName="h-[70dvh] border-t border-border min-[900px]:h-auto min-[900px]:border-t-0"
        end={
          <section
            aria-label={`Code editor for ${problemTitle}`}
            className="relative h-full"
          >
            {editorReady ? null : (
              <Textarea
                aria-label={`Solution code for ${problemTitle}`}
                value={code}
                onChange={(event) => handleChange(event.target.value)}
                onKeyDown={onFallbackKeyDown}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                className="absolute inset-0 z-10 h-full resize-none rounded-none border-0 px-4 py-3 font-mono text-sm leading-6"
              />
            )}
            <CodeEditor
              value={code}
              onChange={handleChange}
              onReady={() => setEditorReady(true)}
              onRun={runCode}
              onSubmit={submitCode}
              label={`Solution code for ${problemTitle}. Press Escape to leave the editor.`}
            />
          </section>
        }
      />

      <Dialog
        open={confirmingReset}
        onOpenChange={setConfirmingReset}
        title="Reset the editor?"
        description="Your code for this problem is replaced by the starter code. This cannot be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmingReset(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                replaceWithStarter();
                setConfirmingReset(false);
              }}
            >
              Reset to starter
            </Button>
          </>
        }
      />
    </div>
  );
}

function DraftStatus({ state }: { state: DraftState }) {
  const text = {
    loading: "",
    saved: "Draft saved in this browser",
    unsaved: "Saving…",
    unavailable: "Drafts are off in this browser",
  }[state];
  return (
    <p role="status" className="hidden text-xs text-muted-foreground sm:block">
      {text}
    </p>
  );
}
