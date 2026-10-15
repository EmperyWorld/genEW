"""Load and parameterize the AceStep 1.5 MusicForge MVP workflow."""

from __future__ import annotations

import copy
import json
import secrets
from pathlib import Path
from typing import Any
from uuid import uuid4


def load_workflow_template(path: str | Path) -> dict[str, Any]:
    raw = Path(path).read_text(encoding="utf-8")
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise ValueError("workflow template must be a JSON object")
    return data


def build_text_to_music_workflow(
    template: dict[str, Any],
    *,
    prompt: str,
    lyrics: str = "",
    instrumental: bool = True,
    duration: int = 45,
    bpm: int = 112,
    steps: int = 30,
    seed: int | None = None,
    run_id: str | None = None,
) -> dict[str, Any]:
    """
    Inject caption / lyrics / timing into Elite music_forge_ace15_mvp.json:
    AceStepSFTGenerate 202, AceStepSFTTextEncode 203, SaveAudioMP3 207.
    """
    workflow = copy.deepcopy(template)
    caption = (prompt or "").strip()
    if not caption:
        raise ValueError("prompt is required")

    required = ("202", "203", "205", "207")
    missing = [node for node in required if node not in workflow]
    if missing:
        raise ValueError(f"workflow missing expected ACE node ids: {missing}")

    resolved_seed = seed if seed is not None else secrets.randbelow(2**31 - 1) + 1
    resolved_run = run_id or uuid4().hex[:12]
    lyric_text = "" if instrumental else (lyrics or "").strip()

    workflow["203"]["inputs"]["caption"] = caption
    workflow["203"]["inputs"]["lyrics"] = lyric_text
    workflow["203"]["inputs"]["instrumental"] = bool(instrumental)
    workflow["203"]["inputs"]["seed"] = resolved_seed
    workflow["203"]["inputs"]["duration"] = duration
    workflow["203"]["inputs"]["bpm"] = bpm

    workflow["202"]["inputs"]["seed"] = resolved_seed
    workflow["202"]["inputs"]["steps"] = steps
    workflow["202"]["inputs"]["duration"] = duration

    workflow["207"]["inputs"]["filename_prefix"] = f"audio/MusicForge_ACE15_{resolved_run}"
    return workflow
