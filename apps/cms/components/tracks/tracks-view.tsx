"use client";

import type { AdminPaper, AdminTrack } from "@repo/shared";
import { TRACK_LIMITS } from "@repo/shared";
import { Alert } from "@repo/ui/components/alert";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Field } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { Select } from "@repo/ui/components/select";
import { Skeleton } from "@repo/ui/components/skeleton";
import { Textarea } from "@repo/ui/components/textarea";
import { useToast } from "@repo/ui/components/toast";
import { ApiError } from "@repo/web-core/api/errors";
import { LoadError } from "@repo/web-core/states/load-error";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import { useState } from "react";
import { adminKeys, useAdminPapers, useAdminTracks } from "@/lib/admin/queries";
import { moved } from "@/lib/admin/order";
import { putTracks } from "@/lib/api/cms";
import {
  isDirty,
  newDraft,
  slugFromTitle,
  toDrafts,
  toRequest,
  trackProblems,
  type TrackDraft,
} from "@/lib/tracks/draft";

/** `/tracks`: the ordered groups of papers on the learners' roadmap (docs/specs/14-cms.md §7). */
export function TracksView() {
  const tracks = useAdminTracks();
  const papers = useAdminPapers();

  if (tracks.isPending || papers.isPending) {
    return <Skeleton className="h-96 w-full" />;
  }
  if (tracks.isError || papers.isError) {
    const error = tracks.error ?? papers.error;
    return (
      <LoadError
        what="the tracks"
        message={error?.message ?? "Try again."}
        onRetry={() => {
          void tracks.refetch();
          void papers.refetch();
        }}
      />
    );
  }
  const published = papers.data.papers.filter((paper) => paper.status === "published");
  // Keyed by the saved revision, so reloading starts the editor afresh.
  return (
    <TracksEditor
      key={tracks.data.revision}
      revision={tracks.data.revision}
      saved={tracks.data.tracks}
      published={published}
    />
  );
}

function TracksEditor({
  revision,
  saved,
  published,
}: {
  revision: number;
  saved: AdminTrack[];
  published: AdminPaper[];
}) {
  const queries = useQueryClient();
  const toast = useToast();
  const [drafts, setDrafts] = useState<TrackDraft[]>(() => toDrafts(saved));
  const [conflict, setConflict] = useState(false);
  const [nextKey, setNextKey] = useState(1);

  const problems = trackProblems(drafts);
  const dirty = isDirty(drafts, saved);
  const titleOf = new Map(published.map((paper) => [paper.id, paper.title]));

  const save = useMutation({
    mutationFn: () => putTracks({ revision, tracks: toRequest(drafts) }),
    onSuccess: (result) => {
      setConflict(false);
      queries.setQueryData(adminKeys.tracks, result);
      toast({ title: "Tracks saved", variant: "success" });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "conflict") {
        setConflict(true);
        return;
      }
      toast({
        title: error instanceof ApiError ? error.message : "Could not save the tracks",
        variant: "destructive",
      });
    },
  });

  const update = (key: string, change: Partial<TrackDraft>) =>
    setDrafts((current) =>
      current.map((draft) => (draft.key === key ? { ...draft, ...change } : draft)),
    );

  return (
    <div className="grid gap-6">
      {conflict ? (
        <Alert variant="destructive" title="Someone else changed the tracks">
          <span className="flex flex-wrap items-center gap-3">
            Your edit was not saved. Reload the tracks, then make your change again.
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setConflict(false);
                void queries.invalidateQueries({ queryKey: adminKeys.tracks });
              }}
            >
              <RotateCcw aria-hidden="true" />
              Reload
            </Button>
          </span>
        </Alert>
      ) : null}

      {published.length === 0 ? (
        <Alert variant="info" title="No paper is published yet">
          A track lists published papers. Publish a paper first.
        </Alert>
      ) : null}

      {drafts.length === 0 ? (
        <p className="text-muted-foreground">There are no tracks yet.</p>
      ) : (
        <ol className="grid gap-4">
          {drafts.map((draft, index) => (
            <li key={draft.key}>
              <TrackCard
                draft={draft}
                problems={problems.get(draft.key) ?? []}
                published={published}
                titleOf={titleOf}
                position={index}
                total={drafts.length}
                onChange={(change) => update(draft.key, change)}
                onMove={(offset) => setDrafts((current) => moved(current, index, offset))}
                onRemove={() =>
                  setDrafts((current) => current.filter((item) => item.key !== draft.key))
                }
              />
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          disabled={drafts.length >= TRACK_LIMITS.maxTracks}
          onClick={() => {
            setDrafts((current) => [...current, newDraft(`new-${nextKey}`)]);
            setNextKey((key) => key + 1);
          }}
        >
          <Plus aria-hidden="true" />
          Add a track
        </Button>
        <span className="flex-1" />
        {dirty ? (
          <Button variant="ghost" onClick={() => setDrafts(toDrafts(saved))}>
            <RotateCcw aria-hidden="true" />
            Discard changes
          </Button>
        ) : null}
        <Button
          onClick={() => save.mutate()}
          loading={save.isPending}
          disabled={!dirty || problems.size > 0}
        >
          <Save aria-hidden="true" />
          Save tracks
        </Button>
      </div>
      {problems.size > 0 ? (
        <p role="status" className="text-sm text-muted-foreground">
          Fix the notes above before saving.
        </p>
      ) : null}
    </div>
  );
}

function TrackCard({
  draft,
  problems,
  published,
  titleOf,
  position,
  total,
  onChange,
  onMove,
  onRemove,
}: {
  draft: TrackDraft;
  problems: string[];
  published: AdminPaper[];
  titleOf: Map<string, string>;
  position: number;
  total: number;
  onChange: (change: Partial<TrackDraft>) => void;
  onMove: (offset: number) => void;
  onRemove: () => void;
}) {
  const [idEdited, setIdEdited] = useState(draft.origin !== null);
  const available = published.filter((paper) => !draft.paperIds.includes(paper.id));
  const label = draft.title.trim() === "" ? `track ${position + 1}` : draft.title;

  return (
    <fieldset className="grid gap-4 rounded-lg border border-border p-4">
      <legend className="flex items-center gap-2 px-1 text-sm font-medium">
        Track {position + 1}
        {draft.origin === "library" ? (
          <Badge variant="outline">From the library files</Badge>
        ) : null}
        {draft.origin === "cms" ? <Badge variant="secondary">Managed here</Badge> : null}
        {draft.origin === null ? <Badge variant="warning">New</Badge> : null}
      </legend>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" required>
          <Input
            value={draft.title}
            maxLength={TRACK_LIMITS.titleMax}
            onChange={(event) =>
              onChange({
                title: event.target.value,
                ...(idEdited ? {} : { id: slugFromTitle(event.target.value) }),
              })
            }
          />
        </Field>
        <Field
          label="Id"
          description={
            draft.origin === null
              ? "Used in links. Lowercase letters, digits and hyphens."
              : "Used in links; it stays the same once saved."
          }
          required
        >
          <Input
            value={draft.id}
            readOnly={draft.origin !== null}
            spellCheck={false}
            className="font-mono"
            onChange={(event) => {
              setIdEdited(true);
              onChange({ id: event.target.value });
            }}
          />
        </Field>
      </div>
      <Field label="Summary" required>
        <Textarea
          rows={2}
          maxLength={TRACK_LIMITS.summaryMax}
          value={draft.summary}
          onChange={(event) => onChange({ summary: event.target.value })}
        />
      </Field>

      <div className="grid gap-2">
        <p className="text-sm font-medium">Papers, in reading order</p>
        {draft.paperIds.length === 0 ? (
          <p className="text-sm text-muted-foreground">No papers yet.</p>
        ) : (
          <ol className="grid gap-1.5">
            {draft.paperIds.map((paperId, paperIndex) => (
              <li
                key={paperId}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm"
              >
                <span className="w-5 text-right text-muted-foreground tabular-nums">
                  {paperIndex + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {titleOf.get(paperId) ?? paperId}
                  {titleOf.has(paperId) ? null : (
                    <span className="ml-2 text-xs text-destructive">not published</span>
                  )}
                </span>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Move ${titleOf.get(paperId) ?? paperId} up`}
                  disabled={paperIndex === 0}
                  onClick={() =>
                    onChange({ paperIds: moved(draft.paperIds, paperIndex, -1) })
                  }
                >
                  <ArrowUp aria-hidden="true" />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Move ${titleOf.get(paperId) ?? paperId} down`}
                  disabled={paperIndex === draft.paperIds.length - 1}
                  onClick={() =>
                    onChange({ paperIds: moved(draft.paperIds, paperIndex, 1) })
                  }
                >
                  <ArrowDown aria-hidden="true" />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Remove ${titleOf.get(paperId) ?? paperId} from ${label}`}
                  onClick={() =>
                    onChange({ paperIds: draft.paperIds.filter((id) => id !== paperId) })
                  }
                >
                  <X aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ol>
        )}
        <Field label="Add a paper" description="Only published papers can be in a track.">
          <Select
            value=""
            disabled={
              available.length === 0 ||
              draft.paperIds.length >= TRACK_LIMITS.maxPapersPerTrack
            }
            onChange={(event) => {
              if (event.target.value !== "")
                onChange({ paperIds: [...draft.paperIds, event.target.value] });
            }}
          >
            <option value="">Choose a paper…</option>
            {available.map((paper) => (
              <option key={paper.id} value={paper.id}>
                {paper.title}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {problems.length > 0 ? (
        <ul
          className="list-disc pl-5 text-sm text-destructive"
          aria-label={`Problems with ${label}`}
        >
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={position === 0}
          onClick={() => onMove(-1)}
        >
          <ArrowUp aria-hidden="true" />
          Move up
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={position === total - 1}
          onClick={() => onMove(1)}
        >
          <ArrowDown aria-hidden="true" />
          Move down
        </Button>
        <span className="flex-1" />
        <Button size="sm" variant="ghost" onClick={onRemove}>
          <Trash2 aria-hidden="true" />
          Delete track
        </Button>
      </div>
    </fieldset>
  );
}
