"use client";

import { Alert } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import { Dialog } from "@repo/ui/components/dialog";
import { Textarea } from "@repo/ui/components/textarea";
import { RotateCcw } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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

const CodeEditor = dynamic(
  () => import("./code-editor").then((module) => module.CodeEditor),
  { ssr: false },
);

export interface WorkspaceProps {
  paperId: string;
  problemId: string;
  problemTitle: string;
  starter: string;
  /** Breadcrumb and badges, rendered on the server. */
  heading: ReactNode;
  /** The description and tutorial tabs, rendered on the server. */
  instructions: ReactNode;
}

type DraftState = "loading" | "saved" | "unsaved" | "unavailable";

/**
 * The problem workspace (docs/specs/08-web.md §5): instructions beside the
 * editor. The editor's text is saved to this browser as a draft and restored
 * on return; Run and Submit arrive with the runner (M4).
 */
export function Workspace({
  paperId,
  problemId,
  problemTitle,
  starter,
  heading,
  instructions,
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2">
        <div className="min-w-0">{heading}</div>
        <div className="flex items-center gap-3">
          <DraftStatus state={draftState} />
          <Button variant="outline" size="sm" onClick={() => setConfirmingReset(true)}>
            <RotateCcw aria-hidden="true" />
            Reset
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

      <div className="grid min-h-0 flex-1 min-[900px]:grid-cols-2">
        <div className="min-h-0 border-border min-[900px]:overflow-y-auto min-[900px]:border-r">
          {instructions}
        </div>
        <section
          aria-label={`Code editor for ${problemTitle}`}
          className="relative h-[70dvh] border-t border-border min-[900px]:h-auto min-[900px]:border-t-0"
        >
          {editorReady ? null : (
            <Textarea
              aria-label={`Solution code for ${problemTitle}`}
              value={code}
              onChange={(event) => handleChange(event.target.value)}
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
            label={`Solution code for ${problemTitle}. Press Escape to leave the editor.`}
          />
        </section>
      </div>

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
