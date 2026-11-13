import "katex/dist/katex.min.css";

import { cn } from "@repo/ui/lib/cn";
import type { ComponentProps } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

function isExternal(href: string | undefined): boolean {
  return href !== undefined && /^https?:\/\//i.test(href);
}

const components: Components = {
  a: ({
    href,
    children,
    node: _node,
    ...props
  }: ComponentProps<"a"> & { node?: unknown }) =>
    isExternal(href) ? (
      <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
        {children}
      </a>
    ) : (
      <a href={href} {...props}>
        {children}
      </a>
    ),
};

/**
 * Renders authored markdown on the server (docs/specs/08-web.md §7): GitHub
 * flavoured markdown, maths with KaTeX, highlighted code. Raw HTML is dropped,
 * never rendered. KaTeX's stylesheet and fonts are bundled, so they load from
 * this origin.
 */
export function Markdown({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div className={cn("markdown", className)}>
      <ReactMarkdown
        skipHtml
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, [rehypeHighlight, { detect: false }]]}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
