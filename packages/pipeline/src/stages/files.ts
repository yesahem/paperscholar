import { hashFiles, type HashableFile } from "@repo/content";
import type { StepFiles } from "../schemas";

/** A step's files under the names they have in a problem folder (docs/specs/03-content.md §6). */
export function stepFileList(files: StepFiles): HashableFile[] {
  return [
    { path: "description.md", content: files.description },
    { path: "tutorial.md", content: files.tutorial },
    { path: "starter.py", content: files.starter },
    { path: "solution.py", content: files.solution },
    { path: "tests/test_public.py", content: files.testsPublic },
    { path: "tests/test_hidden.py", content: files.testsHidden },
    ...(files.helpers === null ? [] : [{ path: "helpers.py", content: files.helpers }]),
  ];
}

/** Identifies the exact files a verification ran on. */
export const hashStepFiles = (files: StepFiles): string => hashFiles(stepFileList(files));
