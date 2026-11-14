import type { TaskHandlers } from "../engine/tick";
import { assembleTask } from "./assemble";
import { planTask } from "./plan";
import { readTask } from "./read";
import { verifyTask } from "./verify";
import { writeTask } from "./write";

/** The task handler for each kind (docs/specs/09-paper-pipeline.md §13). */
export const PIPELINE_HANDLERS: TaskHandlers = {
  read: readTask,
  plan: planTask,
  write: writeTask,
  verify: verifyTask,
  assemble: assembleTask,
};
