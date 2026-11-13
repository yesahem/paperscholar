"use client";

import type { PaperSummary } from "@repo/shared";
import { DIFFICULTIES, type ContentTag, type Difficulty } from "@repo/shared/vocabulary";
import { Button } from "@repo/ui/components/button";
import { Field } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  catalogueFilterToParams,
  EMPTY_FILTER,
  filterPapers,
  parseCatalogueFilter,
  tagsInUse,
  type CatalogueFilter,
} from "@/lib/content/catalogue-filter";
import { formatTag, pluralise } from "@/lib/content/format";
import { PaperGrid } from "./paper-card";

function FilterChip({
  pressed,
  onToggle,
  children,
}: {
  pressed: boolean;
  onToggle: () => void;
  children: string;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      aria-pressed={pressed}
      onClick={onToggle}
      className="rounded-full capitalize aria-pressed:border-primary aria-pressed:bg-accent aria-pressed:text-accent-foreground"
    >
      {children}
    </Button>
  );
}

/**
 * The catalogue with search, tag and difficulty filters. Filtering happens in
 * the browser and is kept in the URL, so a filtered view can be shared
 * (docs/specs/08-web.md §6).
 */
export function PaperCatalogue({ papers }: { papers: PaperSummary[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filter = parseCatalogueFilter(new URLSearchParams(searchParams.toString()));
  // The box keeps exactly what was typed; the URL keeps the trimmed query.
  const [query, setQuery] = useState(filter.query);
  const tags = useMemo(() => tagsInUse(papers), [papers]);
  const visible = filterPapers(papers, filter);
  const filtered =
    filter.query !== "" || filter.tags.length > 0 || filter.difficulty !== null;

  const update = (next: CatalogueFilter) => {
    const query = catalogueFilterToParams(next).toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
  const toggleTag = (tag: ContentTag) =>
    update({
      ...filter,
      tags: filter.tags.includes(tag)
        ? filter.tags.filter((selected) => selected !== tag)
        : [...filter.tags, tag],
    });
  const toggleDifficulty = (difficulty: Difficulty) =>
    update({
      ...filter,
      difficulty: filter.difficulty === difficulty ? null : difficulty,
    });

  return (
    <div className="flex flex-col gap-6">
      <div
        role="search"
        aria-label="Filter papers"
        className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
      >
        <Field label="Search papers" description="Matches titles and authors.">
          <Input
            type="search"
            value={query}
            placeholder="Attention, Adam, Vapnik…"
            autoComplete="off"
            onChange={(event) => {
              setQuery(event.target.value);
              update({ ...filter, query: event.target.value });
            }}
          />
        </Field>
        <div className="flex flex-col gap-2">
          <span id="difficulty-filter" className="text-sm font-medium">
            Has a problem that is
          </span>
          <div
            role="group"
            aria-labelledby="difficulty-filter"
            className="flex flex-wrap gap-2"
          >
            {DIFFICULTIES.map((difficulty) => (
              <FilterChip
                key={difficulty}
                pressed={filter.difficulty === difficulty}
                onToggle={() => toggleDifficulty(difficulty)}
              >
                {difficulty}
              </FilterChip>
            ))}
          </div>
        </div>
        {tags.length > 0 ? (
          <div className="flex flex-col gap-2">
            <span id="tag-filter" className="text-sm font-medium">
              Topics
            </span>
            <div
              role="group"
              aria-labelledby="tag-filter"
              className="flex flex-wrap gap-2"
            >
              {tags.map((tag) => (
                <FilterChip
                  key={tag}
                  pressed={filter.tags.includes(tag)}
                  onToggle={() => toggleTag(tag)}
                >
                  {formatTag(tag)}
                </FilterChip>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex min-h-9 items-center justify-between gap-4">
        <p role="status" className="text-sm text-muted-foreground">
          {filtered
            ? `${pluralise(visible.length, "paper")} of ${papers.length} match.`
            : `${pluralise(papers.length, "paper")}.`}
        </p>
        {filtered ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQuery("");
              update(EMPTY_FILTER);
            }}
          >
            <X aria-hidden="true" />
            Clear filters
          </Button>
        ) : null}
      </div>

      {visible.length > 0 ? (
        <PaperGrid papers={visible} />
      ) : (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="font-medium">No paper matches these filters.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Remove a topic or difficulty, or search for another title.
          </p>
        </div>
      )}
    </div>
  );
}
