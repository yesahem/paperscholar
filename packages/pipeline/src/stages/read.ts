import { eq, schema } from "@repo/db";
import { CONTENT_TAGS } from "@repo/shared";
import { enqueue } from "../engine/queue";
import { failIngestion, type TaskHandler } from "../engine/tick";
import { ingestionKeys } from "../keys";
import { writeJson } from "../objects";
import { PROMPTS } from "../prompts";
import { outlineSchema } from "../schemas";
import { callModel, documentFor, loadIngestion } from "./common";

/** Stage 1 (docs/specs/09-paper-pipeline.md §5): one call with the whole PDF. */
export const readTask: TaskHandler = async (context) => {
  const row = await loadIngestion(context);
  const document = await documentFor(context, row);
  const outline = await callModel(context, {
    purpose: "read",
    subject: null,
    system: PROMPTS.system,
    document,
    context: [],
    prompt: `${PROMPTS.read}\n\nAllowed tags: ${CONTENT_TAGS.join(", ")}.`,
    schema: outlineSchema,
    schemaName: "outline",
    effort: "high",
    maxTokens: 32_000,
  });
  await writeJson(context.deps.storage, ingestionKeys(row.id).outline, outline);

  return async (tx) => {
    const now = context.now();
    if (!outline.suitability.ok) {
      await failIngestion(
        tx,
        row.id,
        "read",
        `This paper cannot become exercises: ${outline.suitability.reason}`,
        now,
      );
      return;
    }
    await tx
      .update(schema.ingestions)
      .set({ status: "planning", title: outline.title, updatedAt: now })
      .where(eq(schema.ingestions.id, row.id));
    await enqueue(tx, row.id, "plan");
  };
};
