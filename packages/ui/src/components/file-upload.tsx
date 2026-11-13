"use client";

import { FileText, Upload, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
} from "react";
import { cn } from "../lib/cn";
import {
  describeAccept,
  fileKey,
  validateFiles,
  type FileRejection,
} from "../lib/file-validation";
import { formatBytes } from "../lib/format";
import { Button } from "./button";
import { useFieldControl } from "./field";

export interface FileUploadProps {
  id?: string;
  /** Form field name. The native input stays in sync, so FormData includes the files. */
  name?: string;
  /** Same syntax as `<input accept>`: "application/pdf,.pdf", "image/*". */
  accept?: string;
  /** Allow more than one file. Without it, a new file replaces the current one. */
  multiple?: boolean;
  /** Most files allowed when `multiple` is set. */
  maxFiles?: number;
  /** Largest allowed size of one file, in bytes. */
  maxSizeBytes?: number;
  disabled?: boolean;
  required?: boolean;
  /** Marks the control invalid. Inside a Field, the Field's error does this. */
  invalid?: boolean;
  /** Controlled list of files. */
  value?: File[];
  /** Initial files when uncontrolled. */
  defaultValue?: File[];
  /** Called with the full list of accepted files whenever it changes. */
  onValueChange?: (files: File[]) => void;
  /** Called with the files refused by the type, size or count checks. */
  onReject?: (rejections: FileRejection[]) => void;
  /** Main text inside the drop zone. */
  prompt?: ReactNode;
  /** Constraint line under the prompt. Derived from accept, size and count when omitted. */
  hint?: ReactNode;
  className?: string;
  "aria-describedby"?: string;
}

/**
 * Drag-and-drop or click-to-browse file picker with type, size and count
 * checks and a removable list of chosen files. Keyboard users reach it as a
 * normal file input. Browser checks are for feedback only; the server must
 * validate uploads again.
 */
export function FileUpload({
  id,
  name,
  accept,
  multiple = false,
  maxFiles,
  maxSizeBytes,
  disabled,
  required,
  invalid,
  value,
  defaultValue,
  onValueChange,
  onReject,
  prompt,
  hint,
  className,
  "aria-describedby": ariaDescribedBy,
}: FileUploadProps) {
  const generatedId = useId();
  const control = useFieldControl({
    id,
    invalid,
    required,
    disabled,
    "aria-describedby": ariaDescribedBy,
  });
  const inputId = control.id ?? `file-upload-${generatedId}`;
  const hintId = `${inputId}-hint`;
  const rejectionsId = `${inputId}-rejections`;

  const isControlled = value !== undefined;
  const [uncontrolledFiles, setUncontrolledFiles] = useState<File[]>(defaultValue ?? []);
  const files = isControlled ? value : uncontrolledFiles;
  const [rejections, setRejections] = useState<FileRejection[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isDisabled = Boolean(control.disabled);

  /** Mirrors the chosen files onto the native input for forms and `required`. */
  const syncInput = useCallback((list: readonly File[]) => {
    const input = inputRef.current;
    if (!input || typeof DataTransfer === "undefined") return;
    const transfer = new DataTransfer();
    for (const file of list) transfer.items.add(file);
    input.files = transfer.files;
  }, []);

  useEffect(() => {
    syncInput(files);
  }, [files, syncInput]);

  const commit = (next: File[]) => {
    if (!isControlled) setUncontrolledFiles(next);
    onValueChange?.(next);
  };

  const addFiles = (incoming: File[]) => {
    if (isDisabled || incoming.length === 0) return;
    const existing = multiple ? files : [];
    const known = new Set(existing.map(fileKey));
    const fresh = incoming.filter((file) => !known.has(fileKey(file)));
    const { accepted, rejected } = validateFiles(
      multiple ? [...existing, ...fresh] : fresh,
      { accept, maxSizeBytes, maxFiles: multiple ? maxFiles : 1 },
    );

    setRejections(rejected);
    if (rejected.length > 0) onReject?.(rejected);

    const changed = multiple ? accepted.length !== existing.length : accepted.length > 0;
    if (changed) {
      commit(accepted);
    } else {
      // Nothing new was accepted: put the native input back to the current list.
      syncInput(files);
    }
  };

  const removeFile = (file: File) => {
    setRejections([]);
    commit(files.filter((candidate) => candidate !== file));
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(event.currentTarget.files ?? []));
  };

  const handleDragOver = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    if (isDisabled) return;
    event.dataTransfer.dropEffect = "copy";
    setDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLLabelElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    setDragging(false);
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    addFiles(Array.from(event.dataTransfer.files));
  };

  const derivedHint = [
    describeAccept(accept),
    maxSizeBytes !== undefined ? `up to ${formatBytes(maxSizeBytes)}` : undefined,
    multiple && maxFiles !== undefined ? `${maxFiles} files max` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
  const hintContent = hint ?? (derivedHint || undefined);

  const describedBy =
    [
      control["aria-describedby"],
      hintContent ? hintId : undefined,
      rejections.length > 0 ? rejectionsId : undefined,
    ]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div className={cn("grid gap-3", className)}>
      <label
        onDragEnter={handleDragOver}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        data-dragging={dragging || undefined}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-input",
          "bg-background px-6 py-8 text-center transition-colors hover:bg-muted",
          "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
          "data-dragging:border-primary data-dragging:bg-accent",
          control.invalid && "border-destructive",
          isDisabled && "cursor-not-allowed opacity-50 hover:bg-background",
        )}
      >
        <Upload aria-hidden="true" className="size-6 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">
          {prompt ??
            (multiple
              ? "Drop files here or click to browse"
              : "Drop a file here or click to browse")}
        </span>
        {hintContent ? (
          <span id={hintId} className="text-xs text-muted-foreground">
            {hintContent}
          </span>
        ) : null}
        <input
          ref={inputRef}
          id={inputId}
          name={name}
          type="file"
          accept={accept}
          multiple={multiple}
          required={control.required && files.length === 0}
          disabled={isDisabled}
          aria-invalid={control.invalid || undefined}
          aria-describedby={describedBy}
          onChange={handleChange}
          className="sr-only"
        />
      </label>

      {rejections.length > 0 ? (
        <ul
          id={rejectionsId}
          aria-live="polite"
          className="grid gap-1 text-sm font-medium text-destructive"
        >
          {rejections.map((rejection) => (
            <li key={`${fileKey(rejection.file)}:${rejection.reason}`}>
              {rejection.message}
            </li>
          ))}
        </ul>
      ) : null}

      {files.length > 0 ? (
        <ul aria-label="Selected files" className="grid gap-2">
          {files.map((file) => (
            <li
              key={fileKey(file)}
              className="flex items-center gap-3 rounded-md border bg-card px-3 py-2 text-sm"
            >
              <FileText
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground"
              />
              <span className="min-w-0 flex-1 truncate" title={file.name}>
                {file.name}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {formatBytes(file.size)}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => removeFile(file)}
                disabled={isDisabled}
                aria-label={`Remove ${file.name}`}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
