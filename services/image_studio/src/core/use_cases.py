"""Use cases for image_studio."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from core.container import ServiceContainer
from services.image_studio.src.core.models import (
    GenerateRequest,
    GenerateResponse,
    ImageRef,
    JobStatus,
)
from services.image_studio.src.integration.comfy_client import ComfyClient
from services.image_studio.src.integration.workflow import (
    build_text_to_image_workflow,
    load_workflow_template,
)


class ImageStudioUseCases:
    def __init__(self, container: ServiceContainer) -> None:
        self._container = container

    def _config(self):
        return self._container.resolve("config")

    def _comfy(self) -> ComfyClient:
        return self._container.resolve("comfy_client")

    async def health(self) -> dict[str, Any]:
        cfg = self._config()
        comfy_ok = False
        comfy_detail: str | None = None
        try:
            stats = await self._comfy().system_stats()
            comfy_ok = True
            devices = stats.get("devices") if isinstance(stats, dict) else None
            if isinstance(devices, list) and devices:
                first = devices[0] if isinstance(devices[0], dict) else {}
                comfy_detail = str(first.get("name") or "ok")
            else:
                comfy_detail = "ok"
        except Exception as exc:  # noqa: BLE001
            comfy_detail = str(exc)[:200]
        return {
            "status": "ok" if comfy_ok else "degraded",
            "service": cfg.service_name,
            "comfy": {
                "base_url": cfg.comfy_base_url,
                "reachable": comfy_ok,
                "detail": comfy_detail,
            },
        }

    async def generate(self, body: GenerateRequest) -> GenerateResponse:
        cfg = self._config()
        template = load_workflow_template(Path(cfg.workflow_path))
        workflow = build_text_to_image_workflow(
            template,
            prompt=body.prompt,
            width=body.width,
            height=body.height,
            seed=body.seed,
        )
        prompt_id = await self._comfy().queue_prompt(workflow)
        return GenerateResponse(prompt_id=prompt_id)

    async def job_status(self, prompt_id: str) -> JobStatus:
        entry = await self._comfy().history(prompt_id)
        if entry is None:
            return JobStatus(prompt_id=prompt_id, status="queued")

        raw_status = entry.get("status")
        status_block: dict[str, Any] = raw_status if isinstance(raw_status, dict) else {}
        if status_block.get("exception"):
            return JobStatus(
                prompt_id=prompt_id,
                status="failed",
                error=str(status_block.get("exception")),
                raw_status=status_block,
            )

        images = _extract_image_refs(entry)
        if images or status_block.get("completed"):
            return JobStatus(
                prompt_id=prompt_id,
                status="completed",
                images=images,
                raw_status=status_block,
            )
        return JobStatus(
            prompt_id=prompt_id,
            status="running",
            raw_status=status_block,
        )

    async def view_image(
        self,
        *,
        filename: str,
        subfolder: str = "",
        folder_type: str = "output",
    ) -> bytes:
        return await self._comfy().view_image(
            filename=filename,
            subfolder=subfolder,
            folder_type=folder_type,
        )


def _extract_image_refs(execution: dict[str, Any]) -> list[ImageRef]:
    outputs = execution.get("outputs")
    if not isinstance(outputs, dict):
        return []
    refs: list[ImageRef] = []
    seen: set[tuple[str, str]] = set()
    for node_out in outputs.values():
        if not isinstance(node_out, dict):
            continue
        for image_info in node_out.get("images") or []:
            if not isinstance(image_info, dict):
                continue
            filename = image_info.get("filename")
            if not filename:
                continue
            subfolder = str(image_info.get("subfolder") or "")
            key = (str(filename), subfolder)
            if key in seen:
                continue
            seen.add(key)
            refs.append(
                ImageRef(
                    filename=str(filename),
                    subfolder=subfolder,
                    type=str(image_info.get("type") or "output"),
                )
            )
    return refs
