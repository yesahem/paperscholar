import { ENVIRONMENT_PACKAGES, RUN_ENVIRONMENTS } from "@repo/shared";
import { expect, test } from "bun:test";

/** Package names pinned by a requirements file, following `-r` includes. */
async function pinnedPackages(file: string): Promise<string[]> {
  const text = await Bun.file(new URL(`../environments/${file}`, import.meta.url)).text();
  const names: string[] = [];
  for (const line of text.split("\n").map((l) => l.trim())) {
    if (line.startsWith("-r "))
      names.push(...(await pinnedPackages(line.slice(3).trim())));
    else if (line && !line.startsWith("#")) names.push(line.split("==")[0] ?? line);
  }
  return names;
}

test("ENVIRONMENT_PACKAGES matches the pinned requirement files", async () => {
  for (const environment of RUN_ENVIRONMENTS) {
    const pinned = (await pinnedPackages(`${environment}.txt`)).filter(
      (name) => name !== "pytest",
    );
    expect(pinned.sort()).toEqual([...ENVIRONMENT_PACKAGES[environment]].sort());
  }
});

test("every requirement is pinned to an exact version", async () => {
  for (const environment of RUN_ENVIRONMENTS) {
    const text = await Bun.file(
      new URL(`../environments/${environment}.txt`, import.meta.url),
    ).text();
    for (const line of text.split("\n").map((l) => l.trim())) {
      if (line && !line.startsWith("#") && !line.startsWith("-r "))
        expect(line).toMatch(/^[a-z0-9_-]+==[0-9][^\s]*$/);
    }
  }
});
