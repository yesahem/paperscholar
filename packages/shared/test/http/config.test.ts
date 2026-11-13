import { describe, expect, test } from "bun:test";
import { FEATURES, instanceConfigSchema, type InstanceConfig } from "../../src";

const config: InstanceConfig = {
  features: {
    pipeline: false,
    coldMail: false,
    interview: false,
    courses: false,
    listings: false,
    googleSignIn: false,
    emailVerification: false,
    passwordReset: false,
    signups: true,
  },
  limits: { runsPerDay: 100, codeBytes: 65536 },
  version: "dev",
};

describe("instance config contract", () => {
  test("lists every feature", () => {
    expect(Object.keys(config.features).sort()).toEqual([...FEATURES].sort());
    expect(instanceConfigSchema.parse(config)).toEqual(config);
  });

  test("a missing feature is rejected", () => {
    const { signups: _signups, ...features } = config.features;
    expect(instanceConfigSchema.safeParse({ ...config, features }).success).toBe(false);
  });
});
