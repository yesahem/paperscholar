import { TracksConflictError, type ContentStore } from "@repo/content";
import type { AdminTracks, PutTracks } from "@repo/shared";
import { AppError } from "../lib/errors";

/**
 * The CMS's tracks (docs/specs/14-cms.md §7): read and replace the whole list,
 * with the revision check that keeps two editors from overwriting each other.
 * `content` must be a store that holds the content lock.
 */
export function createAdminTracks({ content }: { content: ContentStore }) {
  return {
    async get(): Promise<AdminTracks> {
      const doc = await content.getTracks({ fresh: true });
      return { revision: doc?.revision ?? 0, tracks: doc?.tracks ?? [] };
    },

    async put(body: PutTracks): Promise<AdminTracks> {
      const index = await content.getIndex({ fresh: true });
      const published = new Set(
        index.papers
          .filter((paper) => paper.status === "published")
          .map((paper) => paper.id),
      );
      const issues = body.tracks.flatMap((track, trackIndex) =>
        track.paperIds.flatMap((paperId, paperIndex) =>
          published.has(paperId)
            ? []
            : [
                {
                  path: `tracks.${trackIndex}.paperIds.${paperIndex}`,
                  message: `${paperId} is not a published paper`,
                },
              ],
        ),
      );
      if (issues.length > 0) {
        throw new AppError("validation_error", {
          message: "Only published papers can be in a track.",
          details: { issues },
        });
      }
      try {
        const saved = await content.replaceTracks(body.revision, body.tracks);
        return { revision: saved.revision, tracks: saved.tracks };
      } catch (error) {
        if (error instanceof TracksConflictError) {
          throw new AppError("conflict", {
            message:
              "The tracks were changed by someone else. Reload them and make your change again.",
            details: { revision: error.actual },
            cause: error,
          });
        }
        throw error;
      }
    },
  };
}

export type AdminTracksService = ReturnType<typeof createAdminTracks>;
