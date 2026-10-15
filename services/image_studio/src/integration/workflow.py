"""Load and parameterize the z-image-turbo text_to_image workflow."""

from __future__ import annotations

import copy
import json
import secrets
from pathlib import Path
from typing import Any


def load_workflow_template(path: str | Path) -> dict[str, Any]:
    raw = Path(path).read_text(encoding="utf-8")
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise ValueError("workflow template must be a JSON object")
    return data


def build_text_to_image_workflow(
    template: dict[str, Any],
    *,
    prompt: str,
    width: int = 1024,
    height: int = 1024,
    seed: int | None = None,
) -> dict[str, Any]:
    """
    Inject prompt / size / seed into Elite text_to_image.json node IDs:
    CLIPTextEncode 83:27, EmptySD3LatentImage 83:13, KSampler 83:3.
    """
    workflow = copy.deepcopy(template)
    resolved_seed = seed if seed is not None else secrets.randbelow(2**31 - 1) + 1
    text = (prompt or "").strip()
    if not text:
        raise ValueError("prompt is required")

    if "83:27" not in workflow or "83:13" not in workflow or "83:3" not in workflow:
        raise ValueError("workflow missing expected z-image-turbo node ids")

    workflow["83:27"]["inputs"]["text"] = text
    workflow["83:13"]["inputs"]["width"] = width
    workflow["83:13"]["inputs"]["height"] = height
    workflow["83:3"]["inputs"]["seed"] = resolved_seed
    return workflow
