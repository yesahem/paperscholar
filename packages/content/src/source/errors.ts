export interface ContentIssue {
  /** Path of the offending file or folder, starting at the content root's name. */
  file: string;
  message: string;
}

/** The content folder breaks one or more rules. Every problem is listed. */
export class ContentValidationError extends Error {
  constructor(readonly issues: ContentIssue[]) {
    super(
      `Content has ${issues.length} problem${issues.length === 1 ? "" : "s"}:\n${issues
        .map((issue) => `  - ${issue.file}: ${issue.message}`)
        .join("\n")}`,
    );
    this.name = "ContentValidationError";
  }
}
