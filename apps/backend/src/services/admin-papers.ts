import type { ContentStore } from "@repo/content";
import { desc, inArray, schema, sql, type Database } from "@repo/db";
import type { AdminPaper } from "@repo/shared";
import { AppError } from "../lib/errors";

/**
 * Every paper a maintainer can see (docs/specs/05-api.md §8): the catalogue in
 * any status, plus pipeline drafts not yet published, each linked to the
 * ingestion that made it.
 */
export function createAdminPapers({
  db,
  content,
}: {
  db: Database;
  content: ContentStore;
}) {
  return {
    async list(): Promise<AdminPaper[]> {
      const index = await content.getIndex({ fresh: true });
      const ingestions = await db
        .select({
          id: schema.ingestions.id,
          paperId: schema.ingestions.paperId,
          title: schema.ingestions.title,
          status: schema.ingestions.status,
          updatedAt: schema.ingestions.updatedAt,
        })
        .from(schema.ingestions)
        .where(
          sql`${schema.ingestions.paperId} is not null and ${schema.ingestions.status} in ('ready_for_review', 'published')`,
        )
        .orderBy(desc(schema.ingestions.updatedAt));
      const ingestionOf = new Map<string, string>();
      for (const row of ingestions)
        if (row.paperId && !ingestionOf.has(row.paperId))
          ingestionOf.set(row.paperId, row.id);

      const published: AdminPaper[] = index.papers.map((entry) => ({
        id: entry.id,
        title: entry.title,
        status: entry.status,
        source: entry.source,
        version: entry.version,
        problemCount: entry.problems.length,
        publishedAt: entry.publishedAt,
        updatedAt: entry.updatedAt,
        ingestionId: ingestionOf.get(entry.id) ?? null,
      }));
      const known = new Set(published.map((paper) => paper.id));
      const drafts = await Promise.all(
        ingestions
          .filter(
            (row) =>
              row.paperId && row.status === "ready_for_review" && !known.has(row.paperId),
          )
          .map(async (row): Promise<AdminPaper | null> => {
            const draft = row.paperId ? await content.getDraft(row.paperId) : null;
            if (!draft || !row.paperId) return null;
            return {
              id: row.paperId,
              title: draft.public.paper.title,
              status: "draft",
              source: "pipeline",
              version: null,
              problemCount: draft.public.problems.length,
              publishedAt: null,
              updatedAt: draft.public.updatedAt,
              ingestionId: row.id,
            };
          }),
      );
      return [
        ...drafts.filter((paper): paper is AdminPaper => paper !== null),
        ...published,
      ];
    },

    /**
     * Archives a published paper or publishes an archived one again, without a
     * new version. Drafts are published through their ingestion (§11).
     */
    async setStatus(
      paperId: string,
      status: "published" | "archived",
      by: string,
    ): Promise<AdminPaper> {
      const entry = await content.getEntry(paperId);
      if (!entry) {
        throw new AppError("not_found", {
          message:
            "No published paper has that id. Publish a draft from its review screen.",
        });
      }
      const updated = await content.setPaperStatus(paperId, status, { by });
      const [ingestion] = await db
        .select({ id: schema.ingestions.id })
        .from(schema.ingestions)
        .where(inArray(schema.ingestions.paperId, [paperId]))
        .orderBy(desc(schema.ingestions.updatedAt))
        .limit(1);
      return {
        id: updated.id,
        title: updated.title,
        status: updated.status,
        source: updated.source,
        version: updated.version,
        problemCount: updated.problems.length,
        publishedAt: updated.publishedAt,
        updatedAt: updated.updatedAt,
        ingestionId: ingestion?.id ?? null,
      };
    },
  };
}

export type AdminPapers = ReturnType<typeof createAdminPapers>;
