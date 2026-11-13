import { Alert } from "@repo/ui/components/alert";

/**
 * Shown on a page prerendered while the API was unreachable during the build.
 * The page refreshes itself in the background once the API answers.
 */
export function ContentUnavailable({ what }: { what: string }) {
  return (
    <Alert variant="warning" title={`The ${what} is not available yet`}>
      This page was built before the content service could be reached. Reload in a minute.
    </Alert>
  );
}
