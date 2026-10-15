"""
Timeout-safe subprocess execution for factory verification checks.
"""

from __future__ import annotations

import os
import subprocess
import time
from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence


@dataclass(frozen=True)
class SubprocessResult:
    command: List[str]
    exit_code: int
    stdout: str
    stderr: str
    duration_ms: float
    timed_out: bool = False


def run_subprocess(
    command: Sequence[str],
    *,
    cwd: str,
    timeout_seconds: float,
    env: Optional[Dict[str, str]] = None,
) -> SubprocessResult:
    """
    Run a subprocess with a hard timeout.

    On timeout the process is killed and ``timed_out=True`` is returned.
    """
    started = time.perf_counter()
    merged_env = os.environ.copy()
    if env:
        merged_env.update(env)

    try:
        completed = subprocess.run(
            list(command),
            cwd=cwd,
            env=merged_env,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
        duration_ms = (time.perf_counter() - started) * 1000
        return SubprocessResult(
            command=list(command),
            exit_code=int(completed.returncode),
            stdout=completed.stdout or "",
            stderr=completed.stderr or "",
            duration_ms=duration_ms,
            timed_out=False,
        )
    except subprocess.TimeoutExpired as error:
        duration_ms = (time.perf_counter() - started) * 1000
        stdout = error.stdout.decode("utf-8", errors="replace") if error.stdout else ""
        stderr = error.stderr.decode("utf-8", errors="replace") if error.stderr else ""
        if not stderr:
            stderr = f"Process timed out after {timeout_seconds}s"
        return SubprocessResult(
            command=list(command),
            exit_code=-1,
            stdout=stdout,
            stderr=stderr,
            duration_ms=duration_ms,
            timed_out=True,
        )


def truncate_output(text: str, *, limit: int = 8000) -> str:
    if len(text) <= limit:
        return text
    return f"{text[:limit]}\n… [truncated {len(text) - limit} chars]"
