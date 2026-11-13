# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub:
**Security → Advisories → Report a vulnerability** on this repository.

Include what is affected, how to reproduce it, and the impact you expect. You will get an
acknowledgement within a few days. Please do not disclose the issue publicly until a fix is
released.

## Scope

This project runs untrusted code in a sandbox, so reports about sandbox escapes, access to
another user's data, hidden test or solution leaks, and authentication or authorisation bypasses
are especially welcome.

Reports about a self-hosted instance that the operator has deliberately configured insecurely
(for example, running the bundled runner without isolation on a public server) are out of scope.

## Supported versions

Only the latest commit on `main` receives security fixes.
