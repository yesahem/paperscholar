Read the whole paper and produce its outline.

**Metadata.** The title exactly as printed; authors in order; the publication year if you
can tell it, otherwise null; an `https` arXiv or DOI link to the paper if one is printed in
it, otherwise null. `summary` says in at most 300 characters, in your own words, what the
paper contributes. Choose `tags` from the allowed values that genuinely fit; one to four.

**Chunks.** Split the paper along its own logical structure — sections and, where a section
holds several distinct ideas, its subsections — not into equal lengths. Number them `c01`,
`c02`, … in reading order. For each chunk give:

- `heading`: the paper's own section title, with its number if it has one;
- `pageStart`, `pageEnd`: the PDF page numbers it spans, counting the first page of the
  file as 1;
- `summary`: what this part establishes, in two to four sentences;
- `equations`: the equations a learner would need to implement anything here, each with
  the paper's label (or a short description if unnumbered), its LaTeX, and what it means
  with every symbol defined;
- `algorithms`: named procedures described here, such as "Algorithm 1";
- `implementable`: whether a learner could write a small, self-contained, testable function
  from this part.

Skip references, acknowledgements and appendices of proofs unless they define something the
method needs.

**Suitability.** Set `suitability.ok` to false, with a plain-language `reason` a maintainer
will understand, if this document cannot become exercises: it is not a research paper; it
is a survey or position paper with no method to implement; it is purely theoretical; it is
a scan you cannot read reliably; or every idea worth implementing needs a GPU, large data
downloads or long training. Otherwise set it to true and say in one sentence what a learner
will build.
