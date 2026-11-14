"""pytest plugin for the sandbox harness (docs/specs/07-runner.md §5).

Records one structured event per test in RUNNER_EVENTS_PATH, enforces the
per-test time limit, and decides what a failure may reveal: public tests show
messages, tracebacks and output; hidden tests show only the test name and the
author's message.
"""

from __future__ import annotations

import importlib
import io
import json
import os
import signal
import sys
import traceback
from pathlib import Path
from typing import Any

import pytest

EVENTS_PATH = Path(os.environ["RUNNER_EVENTS_PATH"])
ENTRY_POINT = os.environ["RUNNER_ENTRY_POINT"]
PER_TEST_TIMEOUT = float(os.environ["RUNNER_PER_TEST_TIMEOUT"])

MAX_MESSAGE_CHARS = 500
MAX_TRACEBACK_CHARS = 2000
MAX_STDOUT_CHARS = 4096
GROUPS = {"test_public.py": "public", "test_hidden.py": "hidden"}


class TimeLimitExceeded(BaseException):
    """Raised by the alarm. A BaseException, so `except Exception` in a submission cannot swallow it."""


class CappedOutput(io.TextIOBase):
    """Stands in for sys.stdout during a test: keeps the start, drops the rest.

    Output never reaches a file, so printing far more than can be shown still
    lets the test finish instead of failing on the sandbox's file-size limit.
    """

    def __init__(self, limit: int) -> None:
        super().__init__()
        self.limit = limit
        self.parts: list[str] = []
        self.kept = 0
        self.dropped = 0

    def writable(self) -> bool:
        return True

    def write(self, text: str) -> int:
        if not isinstance(text, str):
            raise TypeError(f"write() argument must be str, not {type(text).__name__}")
        room = self.limit - self.kept
        if room > 0:
            self.parts.append(text[:room])
            self.kept += min(room, len(text))
        self.dropped += max(0, len(text) - max(room, 0))
        return len(text)

    def value(self) -> str | None:
        text = "".join(self.parts)
        if self.dropped:
            note = f"\n… {self.dropped} more characters not shown"
            text = text[: self.limit - len(note)] + note
        return text or None


STDOUT_KEY = pytest.StashKey[CappedOutput]()


def emit(event: dict[str, Any]) -> None:
    with EVENTS_PATH.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event) + "\n")
        handle.flush()


def first_line(text: str) -> str:
    return text.strip().splitlines()[0] if text.strip() else ""


def describe(error: BaseException) -> str:
    detail = first_line(str(error))
    name = type(error).__name__
    return f"{name}: {detail}"[:MAX_MESSAGE_CHARS] if detail else name


def visible_frames(error: BaseException, test_file: str | None) -> str | None:
    """Frames from solution.py, plus the failing line of the test file when it is public."""
    lines = []
    for frame in traceback.extract_tb(error.__traceback__):
        name = Path(frame.filename).name
        if name == "solution.py" or (test_file is not None and name == test_file):
            lines.append(f'{name}, line {frame.lineno}, in {frame.name}\n    {(frame.line or "").strip()}')
    text = "\n".join(lines)
    return text[:MAX_TRACEBACK_CHARS] or None


def on_alarm(signum: int, frame: Any) -> None:
    raise TimeLimitExceeded()


def run_with_alarm(seconds: float, action: Any) -> Any:
    previous = signal.signal(signal.SIGALRM, on_alarm)
    signal.setitimer(signal.ITIMER_REAL, seconds)
    try:
        return action()
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, previous)


def pytest_sessionstart(session: pytest.Session) -> None:
    """Imports the submission once, so its own errors are reported as the learner's."""
    try:
        module = run_with_alarm(PER_TEST_TIMEOUT, lambda: importlib.import_module("solution"))
    except TimeLimitExceeded:
        emit(
            {
                "event": "solution_error",
                "kind": "timeout",
                "message": f"Importing solution.py took longer than {PER_TEST_TIMEOUT:g} s.",
            }
        )
        pytest.exit("solution import timed out", returncode=3)
    except BaseException as error:
        frames = visible_frames(error, None)
        message = describe(error) + (f"\n{frames}" if frames else "")
        emit({"event": "solution_error", "message": message})
        pytest.exit("solution failed to import", returncode=3)
    if not hasattr(module, ENTRY_POINT):
        emit({"event": "solution_error", "message": f"solution.py does not define `{ENTRY_POINT}`."})
        pytest.exit("entry point missing", returncode=3)


def pytest_collectreport(report: pytest.CollectReport) -> None:
    if report.failed:
        emit({"event": "collect_error", "nodeid": report.nodeid})


# trylast: innermost, inside pytest's own capture, which would replace sys.stdout again.
@pytest.hookimpl(wrapper=True, trylast=True)
def pytest_runtest_call(item: pytest.Item) -> Any:
    output = CappedOutput(MAX_STDOUT_CHARS)
    item.stash[STDOUT_KEY] = output
    previous_stdout = sys.stdout
    sys.stdout = output
    signal.signal(signal.SIGALRM, on_alarm)
    signal.setitimer(signal.ITIMER_REAL, PER_TEST_TIMEOUT)
    try:
        return (yield)
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        sys.stdout = previous_stdout


@pytest.hookimpl(wrapper=True)
def pytest_runtest_makereport(item: pytest.Item, call: pytest.CallInfo[None]) -> pytest.TestReport:
    report = yield
    is_call = call.when == "call"
    if not is_call and not report.failed:
        return report

    file_name = Path(str(item.path)).name
    group = GROUPS.get(file_name)
    if group is None:
        return report
    public = group == "public"

    status = "passed" if report.passed else ("failed" if is_call else "error")
    message = None
    trace = None
    timed_out = False
    error = call.excinfo.value if call.excinfo is not None else None

    if isinstance(error, TimeLimitExceeded):
        timed_out = True
        message = f"Time limit exceeded ({PER_TEST_TIMEOUT:g} s)"
    elif isinstance(error, MemoryError):
        emit({"event": "out_of_memory"})
        message = "MemoryError: the test used more memory than allowed"
    elif isinstance(error, AssertionError):
        text = str(error)
        message = (text if public else first_line(text))[:MAX_MESSAGE_CHARS] or "Assertion failed"
    elif error is not None:
        message = describe(error)

    if error is not None and public and not timed_out:
        trace = visible_frames(error, file_name)

    output = item.stash.get(STDOUT_KEY, None)
    stdout = output.value() if public and output is not None else None

    emit(
        {
            "event": "test",
            "test": {
                "name": item.name,
                "group": group,
                "status": status,
                "durationMs": round(call.duration * 1000, 1),
                "message": message,
                "traceback": trace,
                "stdout": stdout,
                "timedOut": timed_out,
            },
        }
    )
    return report
