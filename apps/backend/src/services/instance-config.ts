import type { ContentStore } from "@repo/content";
import { MAX_CODE_BYTES, type FeatureFlags, type InstanceConfig } from "@repo/shared";
import { verifiesEmail, type AppConfig } from "../env";

type FlagConfig = Pick<AppConfig, "auth" | "email" | "pipeline" | "courses" | "coldMail">;

/**
 * Which optional features this instance offers (docs/specs/13-self-hosting.md §4).
 *
 * A feature is on only when this build contains it and the instance is
 * configured for it. Each one becomes configurable in the milestone that
 * builds it (docs/specs/12-milestones.md); until then it is reported as off,
 * so the web app never links to a screen that does not exist. `hasCourses`
 * says whether course content has been synced.
 */
export function featureFlags(config: FlagConfig, hasCourses: boolean): FeatureFlags {
  return {
    pipeline: config.pipeline.enabled,
    coldMail: config.coldMail.enabled && config.pipeline.llm !== null,
    interview: false,
    courses: config.courses.enabled && hasCourses,
    listings: false,
    googleSignIn: config.auth.google !== null,
    emailVerification: verifiesEmail(config),
    passwordReset: config.email.driver !== "none",
    signups: config.auth.signups,
  };
}

export interface InstanceFeatures {
  /** The flags now. Content-dependent flags follow the content index's cache. */
  current(): Promise<FeatureFlags>;
  /** Body of GET /v1/config. */
  config(): Promise<InstanceConfig>;
}

export function createInstanceFeatures(
  config: FlagConfig & Pick<AppConfig, "limits" | "version">,
  content: ContentStore,
): InstanceFeatures {
  async function current(): Promise<FeatureFlags> {
    const hasCourses =
      config.courses.enabled && (await content.courses.list()).length > 0;
    return featureFlags(config, hasCourses);
  }
  return {
    current,
    async config() {
      return {
        features: await current(),
        limits: { runsPerDay: config.limits.runsPerDay, codeBytes: MAX_CODE_BYTES },
        version: config.version,
      };
    },
  };
}
