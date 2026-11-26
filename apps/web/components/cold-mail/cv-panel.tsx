"use client";

import {
  CV_ACCEPT,
  CV_MAX_BYTES,
  CV_MAX_PAGES,
  CV_MAX_PER_USER,
} from "@repo/shared/cold-mail";
import { Alert } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import { Field } from "@repo/ui/components/field";
import { FileUpload } from "@repo/ui/components/file-upload";
import { Skeleton } from "@repo/ui/components/skeleton";
import { useToast } from "@repo/ui/components/toast";
import { formatBytes } from "@repo/ui/lib/format";
import { ApiError } from "@repo/web-core/api/errors";
import { EmptyState } from "@repo/web-core/states/empty-state";
import { LoadError } from "@repo/web-core/states/load-error";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { deleteCv, uploadCv } from "@/lib/api/cold-mail";
import { queryKeys, useCvs } from "@/lib/queries";

/**
 * The user's CVs: upload a PDF, see the ones kept, delete one. Files stay
 * private to their owner and are deleted with the account.
 */
export function CvPanel() {
  const cvs = useCvs();
  const queries = useQueryClient();
  const toast = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const refresh = () => void queries.invalidateQueries({ queryKey: queryKeys.cvs });

  const upload = useMutation({
    mutationFn: (file: File) => uploadCv(file),
    onSuccess: (cv) => {
      setFiles([]);
      refresh();
      toast({ title: `${cv.filename} uploaded`, variant: "success" });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteCv(id),
    onSuccess: () => {
      refresh();
      toast({ title: "CV deleted", variant: "success" });
    },
    onError: (error) =>
      toast({
        title: error instanceof ApiError ? error.message : "Could not delete the CV",
        variant: "destructive",
      }),
  });

  return (
    <div className="grid gap-4">
      {cvs.isPending ? (
        <Skeleton className="h-20 w-full" />
      ) : cvs.isError ? (
        <LoadError
          what="your CVs"
          message={cvs.error.message}
          onRetry={() => void cvs.refetch()}
          retrying={cvs.isFetching}
        />
      ) : cvs.data.items.length === 0 ? (
        <EmptyState title="No CV yet">
          Upload your CV as a PDF; the draft is written from it.
        </EmptyState>
      ) : (
        <ul className="grid gap-2">
          {cvs.data.items.map((cv) => (
            <li
              key={cv.id}
              className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm"
            >
              <FileText
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{cv.filename}</span>
                <span className="text-xs text-muted-foreground">
                  {formatBytes(cv.sizeBytes)}
                  {cv.pages ? ` · ${cv.pages} page${cv.pages === 1 ? "" : "s"}` : ""} ·
                  uploaded {new Date(cv.uploadedAt).toLocaleDateString()}
                </span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Delete ${cv.filename}`}
                loading={remove.isPending && remove.variables === cv.id}
                onClick={() => remove.mutate(cv.id)}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {upload.isError ? (
        <Alert
          variant="destructive"
          title={
            upload.error instanceof ApiError
              ? upload.error.message
              : "Could not upload the CV."
          }
        />
      ) : null}
      <Field
        label="Upload a CV"
        description={`One PDF, at most ${formatBytes(CV_MAX_BYTES)} and ${CV_MAX_PAGES} pages. You can keep ${CV_MAX_PER_USER}; another upload replaces the oldest.`}
      >
        <FileUpload
          accept={CV_ACCEPT}
          maxSizeBytes={CV_MAX_BYTES}
          value={files}
          onValueChange={(next) => {
            upload.reset();
            setFiles(next);
          }}
        />
      </Field>
      <div>
        <Button
          variant="outline"
          disabled={files.length === 0}
          loading={upload.isPending}
          onClick={() => {
            const file = files[0];
            if (file) upload.mutate(file);
          }}
        >
          <Upload aria-hidden="true" />
          Upload CV
        </Button>
      </div>
    </div>
  );
}
