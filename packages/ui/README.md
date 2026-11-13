# `@repo/ui`

The shared component kit. Every button, text box, file picker and status label in the
product comes from here. Apps never hand-roll these with raw elements and ad-hoc classes.

## Use

```css
/* app/globals.css */
@import "tailwindcss";
@import "@repo/ui/styles.css";
```

```tsx
import { Button } from "@repo/ui/components/button";
import { Field } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";

<Field label="Email" error={errors.email} required>
  <Input type="email" name="email" autoComplete="email" />
</Field>;
```

## Components

| Import                     | Use for                                                                                                        |
| -------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `components/button`        | Every clickable action. `buttonVariants()` styles links as buttons. `loading` shows a spinner and disables it. |
| `components/field`         | Label, help text and error around one control. Wires `id`, `aria-describedby`, `aria-invalid`, `required`.     |
| `components/input`         | Single-line text.                                                                                              |
| `components/textarea`      | Multi-line text.                                                                                               |
| `components/file-upload`   | Choosing files by drag-and-drop or browsing, with type, size and count checks.                                 |
| `components/label`         | A standalone label. Inside a `Field`, use the Field's `label` instead.                                         |
| `components/card`          | Grouped content: `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`.            |
| `components/badge`         | Short status or category labels.                                                                               |
| `components/alert`         | Inline info, success, warning or error messages.                                                               |
| `components/spinner`       | Indeterminate loading.                                                                                         |
| `components/skeleton`      | Placeholder while content loads.                                                                               |
| `components/separator`     | A dividing line.                                                                                               |
| `components/dialog`        | A modal on the native `<dialog>`: focus is trapped and restored, Escape and the backdrop close it.             |
| `components/tabs`          | `Tabs`, `TabList`, `Tab`, `TabPanel`: the WAI-ARIA tabs pattern with a roving tab index.                       |
| `components/dropdown-menu` | `DropdownMenu`, `DropdownMenuItem`, `DropdownMenuLabel`, `DropdownMenuSeparator`: a menu button (WAI-ARIA).    |

| Import                | Provides                                                  |
| --------------------- | --------------------------------------------------------- |
| `lib/cn`              | `cn()`: join classes, later Tailwind classes win.         |
| `lib/format`          | `formatBytes()`.                                          |
| `lib/file-validation` | `validateFiles()`, `matchesAccept()`, `describeAccept()`. |

## Rules

- A component missing from this table is added here first, with variants, then used.
  Feature-specific compositions live in the app under `components/<feature>/`.
- Style with the design tokens (`bg-primary`, `text-muted-foreground`, `border-input`),
  never raw colours, so both themes keep working.
- Components accept `className` for layout adjustments; `cn()` makes it override safely.
- Every interactive component works by keyboard and exposes its state to assistive
  technology. Colour is never the only signal.
- No Next.js imports and no server-only packages (enforced by lint).
