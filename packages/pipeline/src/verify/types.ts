import type { RunEnvironment } from "@repo/shared";

/** Every part of a problem, public and private: what verification checks. */
export interface VerifiableProblem {
  /** `paper-id/problem-id`, for messages and run ids. */
  ref: string;
  entryPoint: string;
  environment: RunEnvironment;
  allowedPackages: string[];
  prohibitedImports: string[];
  timeLimitSeconds: number;
  memoryLimitMb: number;
  description: string;
  tutorial: string | null;
  starter: string;
  solution: string;
  helpers: string | null;
  testsPublic: string;
  testsHidden: string;
}

/** Checks from docs/specs/09-paper-pipeline.md §8. V7–V9 need a model and arrive with the pipeline (M6). */
export const CHECKS = {
  V1: "Well-formed",
  V2: "Solution is correct",
  V3: "Starter is unsolved",
  V4: "Import policy",
  V5: "Fast enough",
  V6: "Deterministic",
  V10: "Test hygiene",
} as const;
export type CheckId = keyof typeof CHECKS;

export interface CheckResult {
  id: CheckId;
  name: string;
  status: "passed" | "failed" | "skipped";
  /** Why it failed or was skipped; empty when passed. */
  details: string[];
}

export interface VerificationReport {
  ref: string;
  passed: boolean;
  checks: CheckResult[];
  runs: number;
  durationMs: number;
}
