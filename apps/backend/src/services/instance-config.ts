import { MAX_CODE_BYTES, type FeatureFlags, type InstanceConfig } from "@repo/shared";
import { verifiesEmail, type AppConfig } from "../env";

/**
 * Which optional features this instance offers (docs/specs/13-self-hosting.md §4).
 *
 * A feature is on only when this build contains it and the instance is
 * configured for it. Each one becomes configurable in the milestone that
 * builds it (docs/specs/12-milestones.md); until then it is reported as off,
 * so the web app never links to a screen that does not exist.
 */
export function featureFlags(config: Pick<AppConfig, "auth" | "email">): FeatureFlags {
  return {
    pipeline: false,
    coldMail: false,
    interview: false,
    courses: false,
    listings: false,
    googleSignIn: config.auth.google !== null,
    emailVerification: verifiesEmail(config),
    passwordReset: config.email.driver !== "none",
    signups: config.auth.signups,
  };
}

/** Body of GET /v1/config. */
export function instanceConfig(config: AppConfig): InstanceConfig {
  return {
    features: featureFlags(config),
    limits: { runsPerDay: config.limits.runsPerDay, codeBytes: MAX_CODE_BYTES },
    version: config.version,
  };
}
