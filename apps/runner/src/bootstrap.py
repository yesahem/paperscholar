"""Runs first inside each sandbox container (docs/specs/13-self-hosting.md §5).

The root filesystem is read-only and the working directory is an empty tmpfs,
so the run's files arrive on standard input as JSON. This writes them, runs the
harness, and prints a marker line followed by result.json on standard output,
which is read by the runner service and nothing else.
"""

import json
import os
import subprocess
import sys

WORKDIR = "/work"

payload = json.load(sys.stdin)
marker = payload["marker"]
for item in payload["files"]:
    path = os.path.join(WORKDIR, item["path"])
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(item["content"])
del payload

completed = subprocess.run(
    [sys.executable, "harness.py"],
    cwd=WORKDIR,
    stdin=subprocess.DEVNULL,
    stdout=subprocess.DEVNULL,
    stderr=subprocess.PIPE,
    env={"PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"), "LANG": "C.UTF-8", "HOME": WORKDIR},
)

sys.stdout.write("\n" + marker + "\n")
try:
    with open(os.path.join(WORKDIR, "result.json"), encoding="utf-8") as handle:
        sys.stdout.write(handle.read())
except FileNotFoundError:
    sys.stderr.write(completed.stderr.decode("utf-8", "replace")[-2000:])
    sys.exit(3)
