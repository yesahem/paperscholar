Review step `{{stepId}}` against the paper. It was written to teach the parts of the
paper cited in the plan ({{refs}}). Compare its description, tutorial and reference
solution with what the paper says, and list any issues.

- `blocking`: the formula, algorithm or definition contradicts the paper; a symbol or
  convention is changed in a way that would mislead a reader moving between the two; or
  text is copied from the paper at length.
- `note`: a simplification, an omission, or a difference worth a reviewer's attention
  that does not make the step wrong.

Return an empty list if there is nothing to report. Do not report matters of style. For
each issue give where in the paper it concerns (`paperRef`) and, in `summary`, what is
wrong in one or two sentences.

The step's files:

```json
{{files}}
```
