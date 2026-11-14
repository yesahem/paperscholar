import { EnvError } from "@repo/shared";
import { describe, expect, test } from "bun:test";
import { loadConfig } from "../src/env";

const token = "t".repeat(32);

describe("runner configuration", () => {
  test("needs only a token; everything else has a default", () => {
    const config = loadConfig({ RUNNER_TOKEN: token });
    expect(config).toMatchObject({
      port: 8798,
      images: {
        numpy: "paperscholar-sandbox-numpy",
        torch: "paperscholar-sandbox-torch",
      },
      runtime: null,
      maxConcurrent: 2,
      maxQueue: 20,
      cpus: 1,
      docker: { bin: "docker", host: null },
    });
  });

  test("a missing or short token is refused by name", () => {
    expect(() => loadConfig({})).toThrow(EnvError);
    expect(() => loadConfig({})).toThrow("RUNNER_TOKEN");
    expect(() => loadConfig({ RUNNER_TOKEN: "short" })).toThrow("at least 32");
  });

  test("a sandboxed runtime is named, not given as arbitrary flags", () => {
    expect(
      loadConfig({ RUNNER_TOKEN: token, RUNNER_DOCKER_RUNTIME: "runsc" }).runtime,
    ).toBe("runsc");
    expect(() =>
      loadConfig({ RUNNER_TOKEN: token, RUNNER_DOCKER_RUNTIME: "runc --privileged" }),
    ).toThrow("RUNNER_DOCKER_RUNTIME");
  });
});
