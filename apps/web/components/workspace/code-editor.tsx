"use client";

import Editor, { loader, type OnMount } from "@monaco-editor/react";
import { useEffect, useRef } from "react";
import { useResolvedTheme } from "@/components/theme/theme-store";

/** Editor files are served from this origin (docs/specs/08-web.md §5.2). */
loader.config({ paths: { vs: "/monaco/vs" } });

/** Widgets that use Escape themselves; outside them, Escape leaves the editor. */
const ESCAPE_LEAVES_EDITOR =
  "!suggestWidgetVisible && !findWidgetVisible && !parameterHintsVisible && !renameInputVisible && !inSnippetMode";

export interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Called once the editor is mounted and can take over from the fallback. */
  onReady: () => void;
  label: string;
  /** Ctrl/Cmd + Enter. */
  onRun: () => void;
  /** Ctrl/Cmd + Shift + Enter. */
  onSubmit: () => void;
}

function editorFontFamily(): string {
  const geistMono = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-geist-mono")
    .trim();
  return [geistMono, "ui-monospace", "monospace"].filter(Boolean).join(", ");
}

/** Monaco, set up for Python. Loaded only in the browser, only on the workspace. */
export function CodeEditor({
  value,
  onChange,
  onReady,
  label,
  onRun,
  onSubmit,
}: CodeEditorProps) {
  const theme = useResolvedTheme();
  // Monaco keeps the first callbacks it is given; these refs always hold the latest.
  const actions = useRef({ onRun, onSubmit });
  useEffect(() => {
    actions.current = { onRun, onSubmit };
  }, [onRun, onSubmit]);

  const handleMount: OnMount = (editor, monaco) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () =>
      actions.current.onRun(),
    );
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter,
      () => actions.current.onSubmit(),
    );
    editor.addCommand(
      monaco.KeyCode.Escape,
      () => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      },
      ESCAPE_LEAVES_EDITOR,
    );
    onReady();
  };

  return (
    <Editor
      language="python"
      value={value}
      theme={theme === "dark" ? "vs-dark" : "vs"}
      onChange={(next) => onChange(next ?? "")}
      onMount={handleMount}
      loading={null}
      options={{
        ariaLabel: label,
        automaticLayout: true,
        fontFamily: editorFontFamily(),
        fontSize: 14,
        insertSpaces: true,
        minimap: { enabled: false },
        padding: { top: 12, bottom: 12 },
        scrollBeyondLastLine: false,
        tabSize: 4,
        detectIndentation: false,
      }}
    />
  );
}
