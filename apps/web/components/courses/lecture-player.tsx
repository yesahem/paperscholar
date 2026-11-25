"use client";

import type { ItemProgress } from "@repo/shared";
import { Alert } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";
import { ApiError } from "@repo/web-core/api/errors";
import { RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { putProgress } from "@/lib/api/courses";
import { usePlayback } from "@/lib/queries";
import {
  PROGRESS_REPORT_INTERVAL_MS,
  needsFreshUrl,
  resumeFrom,
  watchedEnough,
} from "@/lib/courses/player";

/** How often the player checks whether its URL needs replacing. */
const URL_CHECK_MS = 5_000;

/**
 * A lecture video on the native `<video>` element
 * (docs/specs/10-secondary-features.md §5). Playback URLs last five minutes,
 * so the player swaps in a fresh one before the current one expires, keeping
 * the position and whether it was playing. It resumes from the saved
 * position, reports progress while playing and on pause, and completes the
 * lecture at 90% watched.
 */
export function LecturePlayer({
  courseId,
  itemId,
  title,
  durationSeconds,
  savedSeconds,
  completed,
  onProgress,
}: {
  courseId: string;
  itemId: string;
  title: string;
  durationSeconds: number;
  savedSeconds: number;
  completed: boolean;
  onProgress: (progress: ItemProgress) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const playback = usePlayback(courseId, itemId);
  const [broken, setBroken] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  /** Where to seek when the next source has loaded, and whether to keep playing. */
  const pending = useRef<{ seconds: number; play: boolean } | null>({
    seconds: resumeFrom(savedSeconds, durationSeconds),
    play: false,
  });
  const lastReport = useRef(0);
  const isCompleted = useRef(completed);
  /** Load failures since the last successful load; stops retrying a broken file. */
  const failures = useRef(0);
  const { refetch, isFetching, data, dataUpdatedAt } = playback;

  /** Swaps in a fresh URL, keeping the position and play state. */
  const refresh = useCallback(() => {
    if (isFetching) return;
    const element = video.current;
    if (element) {
      pending.current = { seconds: element.currentTime, play: !element.paused };
    }
    void refetch();
  }, [isFetching, refetch]);

  useEffect(() => {
    if (!data) return;
    const timer = window.setInterval(() => {
      if (needsFreshUrl(dataUpdatedAt, Date.now(), data.expiresInSeconds)) refresh();
    }, URL_CHECK_MS);
    return () => window.clearInterval(timer);
  }, [data, dataUpdatedAt, refresh]);

  const report = useCallback(async () => {
    const element = video.current;
    if (!element) return;
    const length = Number.isFinite(element.duration) ? element.duration : durationSeconds;
    const done = isCompleted.current || watchedEnough(element.currentTime, length);
    isCompleted.current = done;
    lastReport.current = Date.now();
    try {
      onProgress(
        await putProgress(courseId, itemId, {
          completed: done,
          lastWatchedSeconds: Math.floor(element.currentTime),
        }),
      );
      setSaveFailed(false);
    } catch {
      // The next report retries; the learner is told their place may not be saved.
      setSaveFailed(true);
    }
  }, [courseId, itemId, durationSeconds, onProgress]);

  function onTimeUpdate() {
    const element = video.current;
    if (!element || element.paused) return;
    const length = Number.isFinite(element.duration) ? element.duration : durationSeconds;
    const justCompleted =
      !isCompleted.current && watchedEnough(element.currentTime, length);
    if (justCompleted || Date.now() - lastReport.current >= PROGRESS_REPORT_INTERVAL_MS) {
      void report();
    }
  }

  function onMediaError() {
    failures.current += 1;
    if (failures.current > 2) {
      setBroken(true);
      return;
    }
    refresh();
  }

  function onLoadedMetadata() {
    failures.current = 0;
    const element = video.current;
    const next = pending.current;
    if (!element || !next) return;
    pending.current = null;
    if (next.seconds > 0) element.currentTime = next.seconds;
    if (next.play) void element.play();
  }

  if (broken || playback.isError) {
    return (
      <Alert
        variant="destructive"
        title={
          broken
            ? "This video could not be played."
            : playback.error instanceof ApiError
              ? playback.error.message
              : "Could not load the video."
        }
      >
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            failures.current = 0;
            setBroken(false);
            void refetch();
          }}
        >
          <RotateCcw aria-hidden="true" />
          Try again
        </Button>
      </Alert>
    );
  }
  if (!data) return <Skeleton className="aspect-video w-full" />;
  return (
    <div className="grid gap-2">
      <video
        ref={video}
        key={itemId}
        src={data.url}
        controls
        preload="metadata"
        playsInline
        aria-label={`Lecture: ${title}`}
        className="aspect-video w-full rounded-lg bg-black"
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onPause={() => void report()}
        onEnded={() => void report()}
        // An expired URL fails to load: fetch a fresh one, but not forever.
        onError={onMediaError}
      />
      {saveFailed ? (
        <p role="status" className="text-sm text-muted-foreground">
          Your place could not be saved just now. It will be saved on the next try.
        </p>
      ) : null}
    </div>
  );
}
