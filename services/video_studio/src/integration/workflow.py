"""Load and parameterize the Wan 2.2 image-to-video workflow."""

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


def build_image_to_video_workflow(
    template: dict[str, Any],
    *,
    image_filename: str,
    prompt: str,
    negative_prompt: str = "",
    seed: int | None = None,
    width: int | None = None,
    height: int | None = None,
    length: int | None = None,
    run_id: str | None = None,
) -> dict[str, Any]:
    """
    Inject image / prompts / seed into Elite video_wan2_2_14B_image.json node IDs:
    LoadImage 97, positive CLIP 129:93, negative CLIP 129:89,
    WanImageToVideo 129:98, KSampler seed 129:86, SaveVideo 108.
    """
    workflow = copy.deepcopy(template)
    text = (prompt or "").strip()
    if not text:
        raise ValueError("prompt is required")
    image_name = (image_filename or "").strip()
    if not image_name:
        raise ValueError("image_filename is required")

    required = ("97", "129:93", "129:89", "129:98", "129:86", "108")
    missing = [node for node in required if node not in workflow]
    if missing:
        raise ValueError(f"workflow missing expected Wan I2V node ids: {missing}")

    resolved_seed = seed if seed is not None else secrets.randbelow(2**31 - 1) + 1
    resolved_run = run_id or uuid4().hex[:12]

    workflow["97"]["inputs"]["image"] = image_name
    workflow["129:93"]["inputs"]["text"] = text
    workflow["129:89"]["inputs"]["text"] = (negative_prompt or "").strip()
    workflow["129:86"]["inputs"]["noise_seed"] = resolved_seed
    if width is not None:
        workflow["129:98"]["inputs"]["width"] = width
    if height is not None:
        workflow["129:98"]["inputs"]["height"] = height
    if length is not None:
        workflow["129:98"]["inputs"]["length"] = length
    workflow["108"]["inputs"]["filename_prefix"] = f"video/Wan2.2_i2v_{resolved_run}"
    return workflow
