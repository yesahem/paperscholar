"use client";

import type { Me } from "@repo/shared";
import { AVATAR_ACCEPT, AVATAR_MAX_BYTES, AVATAR_SIZE_PX } from "@repo/shared/progress";
import { Alert } from "@repo/ui/components/alert";
import { Avatar } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import { Field } from "@repo/ui/components/field";
import { FileUpload } from "@repo/ui/components/file-upload";
import { useToast } from "@repo/ui/components/toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { removeAvatar, uploadAvatar } from "@/lib/api/account";
import { ApiError } from "@/lib/api/errors";
import { queryKeys } from "@/lib/queries";

/**
 * Choose an image, see it as it will appear, then upload it. The server
 * checks it again, crops nothing and stores it as a 256 px WebP.
 */
export function AvatarForm({ me }: { me: Me }) {
  const queries = useQueryClient();
  const toast = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const file = files[0] ?? null;

  // The preview is a blob: URL of the chosen file, released when it changes.
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const changed = (avatarUrl: string | null) => {
    queries.setQueryData<Me | null>(queryKeys.me, (current) =>
      current ? { ...current, avatarUrl } : current,
    );
    void queries.invalidateQueries({ queryKey: ["profile"] });
    void queries.invalidateQueries({ queryKey: ["leaderboard"] });
  };

  const upload = useMutation({
    mutationFn: (chosen: File) => uploadAvatar(chosen),
    onSuccess: ({ avatarUrl }) => {
      changed(avatarUrl);
      setFiles([]);
      toast({ title: "Avatar updated", variant: "success" });
    },
  });
  const remove = useMutation({
    mutationFn: () => removeAvatar(),
    onSuccess: () => {
      changed(null);
      toast({ title: "Avatar removed", variant: "success" });
    },
  });
  const failure = upload.error ?? remove.error;

  return (
    <div className="grid gap-4">
      {failure ? (
        <Alert
          variant="destructive"
          title={
            failure instanceof ApiError
              ? failure.message
              : "Could not change your avatar."
          }
        />
      ) : null}
      <div className="flex items-center gap-4">
        <Avatar src={preview ?? me.avatarUrl} name={me.username} size="xl" />
        <p className="text-sm text-muted-foreground">
          {preview
            ? "This is how it will look. Upload it to use it."
            : me.avatarUrl
              ? "Your current avatar."
              : "No avatar yet: your initial is shown instead."}
        </p>
      </div>
      <Field
        label="New avatar"
        description={`JPEG, PNG or WebP, up to 2 MB. Stored at ${AVATAR_SIZE_PX} px, without the photo's metadata.`}
      >
        <FileUpload
          accept={AVATAR_ACCEPT}
          maxSizeBytes={AVATAR_MAX_BYTES}
          value={files}
          onValueChange={(next) => {
            upload.reset();
            setFiles(next);
          }}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!file}
          loading={upload.isPending}
          onClick={() => {
            if (file) upload.mutate(file);
          }}
        >
          <Upload aria-hidden="true" />
          Upload
        </Button>
        {me.avatarUrl ? (
          <Button
            variant="ghost"
            loading={remove.isPending}
            onClick={() => remove.mutate()}
          >
            <Trash2 aria-hidden="true" />
            Remove avatar
          </Button>
        ) : null}
      </div>
    </div>
  );
}
