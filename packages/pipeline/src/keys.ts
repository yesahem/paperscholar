/** Object keys of an ingestion's working files (docs/specs/09-paper-pipeline.md §15). */

export const ingestionPrefix = (ingestionId: string) => `ingestions/${ingestionId}/`;

export const ingestionKeys = (ingestionId: string) => {
  const root = ingestionPrefix(ingestionId);
  return {
    source: `${root}source.pdf`,
    outline: `${root}outline.json`,
    plan: `${root}plan.json`,
    report: `${root}report.json`,
    attempt: (stepId: string, attempt: number) =>
      `${root}steps/${stepId}/attempt-${attempt}.json`,
    current: (stepId: string) => `${root}steps/${stepId}/current.json`,
    stepPrefix: (stepId: string) => `${root}steps/${stepId}/`,
  };
};

/**
 * Where a browser uploads a PDF before the ingestion exists. The key is random
 * and per uploader, so nobody can guess or overwrite another's upload.
 */
export const uploadKey = (userId: string, uploadId: string) =>
  `uploads/papers/${userId}/${uploadId}.pdf`;
