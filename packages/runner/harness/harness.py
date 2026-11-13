"""Sandbox harness: checks a submission's imports, runs its tests and writes result.json.

This is the single command a sandbox runs (docs/specs/07-runner.md §5). It reads
spec.json from its own directory and never executes the submission itself: the
tests run in a child process with resource limits and a wall-clock limit.

Actions:
  test     scan solution.py, then run pytest on tests/ and report every test
  inspect  parse the listed files and report their structure, without running them
"""

from __future__ import annotations

import ast
import json
import os
import platform
import signal
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

WORKDIR = Path(__file__).resolve().parent
SPEC_PATH = WORKDIR / "spec.json"
RESULT_PATH = WORKDIR / "result.json"
EVENTS_PATH = WORKDIR / "events.jsonl"

MAX_RESULT_BYTES = 256 * 1024
MAX_ERROR_OUTPUT_CHARS = 4000
# Address space for the interpreter, NumPy and pytest on top of the problem's limit.
MEMORY_HEADROOM_MB = 768
MAX_WRITTEN_FILE_BYTES = 16 * 1024 * 1024

# Standard-library modules a submission may not import (docs/specs/07-runner.md §5).
DENYLIST = frozenset(
    {
        "_thread",
        "asyncio",
        "builtins",
        "code",
        "codeop",
        "concurrent",
        "ctypes",
        "fcntl",
        "ftplib",
        "gc",
        "http",
        "importlib",
        "inspect",
        "io",
        "marshal",
        "mmap",
        "multiprocessing",
        "os",
        "pathlib",
        "pickle",
        "pty",
        "requests",
        "resource",
        "runpy",
        "select",
        "selectors",
        "shutil",
        "signal",
        "smtplib",
        "socket",
        "ssl",
        "subprocess",
        "sys",
        "tempfile",
        "threading",
        "tty",
        "urllib",
        "xmlrpc",
    }
)
# Built-ins whose call means reaching around the import rules or the file system.
BANNED_CALLS = frozenset({"breakpoint", "compile", "eval", "exec", "input", "open"})
# Names and attributes used to escape into the interpreter's internals. Any use of
# `__import__`, called or not, is caught as a name.
BANNED_NAMES = frozenset({"__builtins__", "__import__", "__loader__", "__spec__"})
BANNED_ATTRIBUTES = frozenset(
    {"__base__", "__bases__", "__builtins__", "__code__", "__globals__", "__mro__", "__subclasses__"}
)


def load_spec() -> dict[str, Any]:
    with SPEC_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


def describe_syntax_error(error: SyntaxError, filename: str) -> str:
    location = f"{filename}, line {error.lineno}" if error.lineno else filename
    text = (error.text or "").rstrip()
    pointer = ""
    if text and error.offset:
        pointer = "\n    " + " " * max(error.offset - 1, 0) + "^"
    snippet = f"\n    {text}{pointer}" if text else ""
    return f"SyntaxError: {error.msg} ({location}){snippet}"


def top_level_module(name: str) -> str:
    return name.split(".", 1)[0]


def dotted_name(node: ast.AST, aliases: dict[str, str]) -> str | None:
    """`torch.optim.Adam` for an attribute chain rooted at a name, resolving import aliases."""
    if isinstance(node, ast.Name):
        return aliases.get(node.id, node.id)
    if isinstance(node, ast.Attribute):
        base = dotted_name(node.value, aliases)
        return f"{base}.{node.attr}" if base else None
    return None


def scan_imports(source: str, spec: dict[str, Any]) -> tuple[str | None, list[str]]:
    """Returns (syntax error description, sorted unique violations).

    Prohibited entries are top-level modules (`torch`) or dotted paths (`torch.optim`).
    Dotted paths are caught in imports, `from` imports and attribute chains such as
    `torch.optim.Adam`, including through `import torch as t`.
    """
    try:
        tree = ast.parse(source, filename="solution.py")
    except SyntaxError as error:
        return describe_syntax_error(error, "solution.py"), []

    allowed = set(spec["allowedPackages"])
    prohibited_modules = {name for name in spec["prohibitedImports"] if "." not in name}
    prohibited_paths = [name for name in spec["prohibitedImports"] if "." in name]
    if spec.get("hasHelpers"):
        allowed.add("helpers")
    stdlib = sys.stdlib_module_names

    violations: set[str] = set()
    aliases: dict[str, str] = {}

    def check_module(name: str) -> None:
        module = top_level_module(name)
        if module in prohibited_modules or module in DENYLIST:
            violations.add(module)
        elif module not in allowed and module not in stdlib:
            violations.add(module)

    def check_path(name: str) -> None:
        for path in prohibited_paths:
            if name == path or name.startswith(path + "."):
                violations.add(path)

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                check_module(alias.name)
                check_path(alias.name)
                aliases[alias.asname or top_level_module(alias.name)] = alias.name if alias.asname else top_level_module(alias.name)
        elif isinstance(node, ast.ImportFrom):
            if node.level and node.level > 0:
                violations.add("relative import")
            elif node.module:
                check_module(node.module)
                check_path(node.module)
                for alias in node.names:
                    check_path(f"{node.module}.{alias.name}")

    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            if node.func.id in BANNED_CALLS:
                violations.add(f"{node.func.id}()")
        elif isinstance(node, ast.Name) and node.id in BANNED_NAMES:
            violations.add(node.id)
        elif isinstance(node, ast.Attribute):
            if node.attr in BANNED_ATTRIBUTES:
                violations.add(node.attr)
            name = dotted_name(node, aliases)
            if name:
                check_path(name)

    return None, sorted(violations)


def limit_resources(spec: dict[str, Any]) -> None:
    """Runs in the child before pytest starts. Best effort: not every OS honours every limit."""
    import resource

    os.setsid()

    def set_limit(kind: int, value: int) -> None:
        try:
            resource.setrlimit(kind, (value, value))
        except (ValueError, OSError):
            pass

    set_limit(resource.RLIMIT_CORE, 0)
    set_limit(resource.RLIMIT_FSIZE, MAX_WRITTEN_FILE_BYTES)
    # PyTorch reserves far more address space than it uses, so its environment
    # relies on the sandbox's own memory size instead (docs/specs/07-runner.md §5).
    if spec.get("applyMemoryLimit") and platform.system() == "Linux":
        set_limit(resource.RLIMIT_AS, (spec["memoryLimitMb"] + MEMORY_HEADROOM_MB) * 1024 * 1024)
    if spec.get("applyProcessLimit") and platform.system() == "Linux":
        set_limit(resource.RLIMIT_NPROC, 64)


def read_events() -> list[dict[str, Any]]:
    if not EVENTS_PATH.exists():
        return []
    events = []
    for line in EVENTS_PATH.read_text(encoding="utf-8", errors="replace").splitlines():
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return events


def child_environment(spec: dict[str, Any]) -> dict[str, str]:
    """A minimal environment: nothing from the host except PATH, so no secret can leak in."""
    return {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "HOME": str(WORKDIR),
        "LANG": "C.UTF-8",
        "PYTHONPATH": str(WORKDIR),
        "PYTHONHASHSEED": "0",
        "PYTHONDONTWRITEBYTECODE": "1",
        "PYTHONUNBUFFERED": "1",
        "OMP_NUM_THREADS": "1",
        "OPENBLAS_NUM_THREADS": "1",
        "MKL_NUM_THREADS": "1",
        "RUNNER_EVENTS_PATH": str(EVENTS_PATH),
        "RUNNER_ENTRY_POINT": spec["entryPoint"],
        "RUNNER_PER_TEST_TIMEOUT": str(spec["perTestTimeoutSeconds"]),
    }


def run_tests(spec: dict[str, Any], started: float) -> dict[str, Any]:
    source = (WORKDIR / "solution.py").read_text(encoding="utf-8", errors="replace")
    syntax_error, violations = scan_imports(source, spec)
    if syntax_error:
        return result("collection_error", started, error_output=syntax_error)
    if violations:
        return result("import_violation", started, violations=violations)

    command = [
        sys.executable,
        "-m",
        "pytest",
        "tests",
        "-p",
        "no:cacheprovider",
        "-q",
        "--no-header",
        "--tb=no",
        "-o",
        "console_output_style=classic",
    ]
    log_path = WORKDIR / "pytest.log"
    timed_out = False
    with log_path.open("wb") as log:
        process = subprocess.Popen(
            command,
            cwd=WORKDIR,
            env=child_environment(spec),
            stdout=log,
            stderr=subprocess.STDOUT,
            preexec_fn=lambda: limit_resources(spec),
        )
        try:
            return_code = process.wait(timeout=spec["wallClockLimitSeconds"])
        except subprocess.TimeoutExpired:
            timed_out = True
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.wait()
            return_code = process.returncode

    events = read_events()
    tests = [event["test"] for event in events if event.get("event") == "test"]
    solution_errors = [event for event in events if event.get("event") == "solution_error"]
    collect_errors = [event for event in events if event.get("event") == "collect_error"]
    out_of_memory = any(event.get("event") == "out_of_memory" for event in events)

    if timed_out or any(event.get("kind") == "timeout" for event in solution_errors):
        return result("timeout", started, tests=tests)
    if solution_errors:
        return result("collection_error", started, tests=tests, error_output=solution_errors[0]["message"])
    if out_of_memory or return_code == -signal.SIGKILL:
        return result("out_of_memory", started, tests=tests)
    if collect_errors:
        # A test file failed to load: a content or harness fault, not the learner's.
        return result("harness_error", started, error_output="A test file could not be loaded.")
    if return_code < 0 or not tests:
        tail = log_path.read_text(encoding="utf-8", errors="replace")[-MAX_ERROR_OUTPUT_CHARS:]
        return result("harness_error", started, error_output=f"pytest exited with {return_code}.\n{tail}")
    return result("completed", started, tests=tests)


def inspect_files(spec: dict[str, Any], started: float) -> dict[str, Any]:
    files = []
    for name in spec["inspectFiles"]:
        entry: dict[str, Any] = {
            "path": name,
            "syntaxError": None,
            "definitions": [],
            "imports": [],
            "testFunctions": [],
            "asserts": [],
        }
        path = WORKDIR / name
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=name)
        except SyntaxError as error:
            entry["syntaxError"] = describe_syntax_error(error, name)
            files.append(entry)
            continue

        for node in tree.body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                entry["definitions"].append(node.name)
                if isinstance(node, ast.FunctionDef) and node.name.startswith("test_"):
                    entry["testFunctions"].append(node.name)
        imports: set[str] = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imports.update(top_level_module(alias.name) for alias in node.names)
            elif isinstance(node, ast.ImportFrom) and node.module and not node.level:
                imports.add(top_level_module(node.module))
            elif isinstance(node, ast.Assert):
                entry["asserts"].append({"line": node.lineno, "hasMessage": node.msg is not None})
        entry["imports"] = sorted(imports)
        files.append(entry)
    return result("completed", started, inspection={"files": files})


def result(
    outcome: str,
    started: float,
    *,
    tests: list[dict[str, Any]] | None = None,
    violations: list[str] | None = None,
    error_output: str | None = None,
    inspection: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "outcome": outcome,
        "tests": tests or [],
        "violations": violations or [],
        "errorOutput": error_output[:MAX_ERROR_OUTPUT_CHARS] if error_output else None,
        "durationMs": round((time.monotonic() - started) * 1000),
    }
    if inspection is not None:
        payload["inspection"] = inspection
    return payload


def fit_to_limit(payload: dict[str, Any]) -> str:
    """Drops captured output, then tracebacks, until the result fits MAX_RESULT_BYTES."""
    text = json.dumps(payload)
    for field in ("stdout", "traceback", "message"):
        if len(text.encode()) <= MAX_RESULT_BYTES:
            break
        for test in payload["tests"]:
            if test.get(field):
                test[field] = "[truncated: result too large]"
        text = json.dumps(payload)
    return text


def main() -> int:
    started = time.monotonic()
    try:
        spec = load_spec()
        action = spec.get("action", "test")
        if action == "inspect":
            payload = inspect_files(spec, started)
        elif action == "test":
            payload = run_tests(spec, started)
        else:
            payload = result("harness_error", started, error_output=f"Unknown action {action!r}.")
    except Exception as error:  # Report our own failures instead of dying silently.
        payload = result("harness_error", started, error_output=f"{type(error).__name__}: {error}")
    RESULT_PATH.write_text(fit_to_limit(payload), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
