import type { MetadataRoute } from "next";
import {
  getCourses,
  getPaper,
  getPapers,
  loadAtBuild,
  UNAVAILABLE_AT_BUILD,
} from "@/lib/api/content";
import { loadWebEnv } from "@/lib/env";

export const revalidate = 3600;

const STATIC_PATHS = [
  "/",
  "/papers",
  "/roadmap",
  "/test",
  "/feedback",
  "/about",
  "/terms",
  "/privacy",
];

/** Static pages plus every published paper and problem (docs/specs/08-web.md §9). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { NEXT_PUBLIC_SITE_URL: origin } = loadWebEnv();
  const entries: MetadataRoute.Sitemap = STATIC_PATHS.map((path) => ({
    url: `${origin}${path}`,
  }));

  const papers = await loadAtBuild(async () => {
    const list = await getPapers();
    return Promise.all(list.map((paper) => getPaper(paper.id)));
  });
  if (papers === UNAVAILABLE_AT_BUILD) return entries;

  // Courses are listed only on an instance that offers them.
  const courses = await loadAtBuild(getCourses);
  if (courses !== UNAVAILABLE_AT_BUILD && courses !== null) {
    entries.push({ url: `${origin}/courses` });
    for (const course of courses) entries.push({ url: `${origin}/courses/${course.id}` });
  }

  for (const paper of papers) {
    if (!paper) continue;
    entries.push({ url: `${origin}/papers/${paper.id}` });
    for (const problem of paper.problems) {
      entries.push({ url: `${origin}/papers/${paper.id}/problems/${problem.id}` });
    }
  }
  return entries;
}
