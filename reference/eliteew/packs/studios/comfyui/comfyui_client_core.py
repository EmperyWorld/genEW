# ---
# EliteEW · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# ComfyUI HTTP client core: lifecycle, health, checkpoints, fetch/upload, provider status.
# Invariants:
# - base_url resolves from ctor arg or COMFYUI_URL env with stable trailing-slash strip.
# Related:
# - api/services/ugs/providers/comfyui_provider.py
# ---

from __future__ import annotations

import base64
import json
import logging
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx  # type: ignore[import-not-found]

from api.core.redis_db_constants import (
    REDIS_DB_COMFYUI_CACHE,
    STACK2_CACHE_TTL_COMFYUI_CHECKPOINTS,
)

from .comfyui_observability import HTTP_STATUS_OK

logger = logging.getLogger(__name__)

COMFYUI_CACHE_KEY_CHECKPOINTS = "comfyui:checkpoints"


class ComfyUIClientCoreMixin:
    """HTTP client, health, checkpoints, and file fetch/upload for ComfyUI."""

    def __init__(self, base_url: str | None = None):
        """Initialize ComfyUI provider. Reads COMFYUI_URL env if base_url not given."""
        resolved = (base_url or os.environ.get("COMFYUI_URL") or "http://stack2-comfyui:3000").strip().rstrip("/")
        self.base_url = resolved
        self.client: httpx.AsyncClient | None = None
        self.workflows_cache: dict[str, Any] = {}
        self.last_health_check: datetime | None = None
        self.health_status = False

        self.project_root = Path(__file__).resolve().parents[4]
        self.workflows_dir = self.project_root / "comfyui"

        self._checkpoint_cache: list[str] = []
        self._checkpoint_cache_fetched_at: datetime | None = None
        self._checkpoint_cache_ttl_seconds = 300

        self.timeout = httpx.Timeout(300.0, connect=30.0)
        self.max_retries = 2
        self.retry_delay = 2.0

    async def initialize(self) -> None:
        """Initialize HTTP client and check availability"""
        if not self.client:
            self.client = httpx.AsyncClient(
                timeout=self.timeout,
                limits=httpx.Limits(max_keepalive_connections=5, max_connections=10),
            )

        await self._check_health()
        logger.info("ComfyUI provider initialized at %s", self.base_url)

    async def close(self) -> None:
        """Close HTTP client"""
        if self.client:
            await self.client.aclose()
            self.client = None

    async def _check_health(self) -> bool:
        """Check ComfyUI service health"""
        if not self.client:
            return False
        try:
            timeout = httpx.Timeout(30.0)
            response = await self.client.get(f"{self.base_url}/system_stats", timeout=timeout)

            if response.status_code == HTTP_STATUS_OK:
                stats_json = response.json()
                if isinstance(stats_json, list):
                    stats_json = stats_json[0] if stats_json else {}

                self.health_status = True
                self.last_health_check = datetime.now(UTC)

                cuda_devices = "unknown"
                if isinstance(stats_json, dict):
                    devices = stats_json.get("devices")
                    if isinstance(devices, dict):
                        cuda_devices = devices.get("cuda", "unknown")
                    elif isinstance(devices, list) and devices:
                        cuda_devices = devices[0].get("name", "unknown") if isinstance(devices[0], dict) else "unknown"

                logger.info("ComfyUI healthy: %s", cuda_devices)
                return True
            logger.warning("ComfyUI health check failed: HTTP %s", response.status_code)
            self.health_status = False
            return False

        except (httpx.RequestError, httpx.TimeoutException, httpx.HTTPStatusError):  # fmt: skip
            logger.exception("ComfyUI health check error")
            self.health_status = False
            return False

    async def get_checkpoint_names(self, *, force_refresh: bool = False) -> list[str]:
        """Fetch available checkpoint names from ComfyUI (Redis DB 6 for shared cache)."""
        if self.client is None:
            await self.initialize()

        if not force_refresh and self._checkpoint_cache and self._checkpoint_cache_fetched_at:
            age = (datetime.now(UTC) - self._checkpoint_cache_fetched_at).total_seconds()
            if age < self._checkpoint_cache_ttl_seconds:
                return self._checkpoint_cache

        if not force_refresh:
            try:
                from api.core.database_manager import get_database_manager  # noqa: PLC0415

                manager = await get_database_manager()
                redis = await manager.get_redis_client(db=REDIS_DB_COMFYUI_CACHE)
                if redis:
                    cached = await redis.get(COMFYUI_CACHE_KEY_CHECKPOINTS)
                    if cached:
                        options = json.loads(cached)
                        if isinstance(options, list) and options:
                            self._checkpoint_cache = options
                            self._checkpoint_cache_fetched_at = datetime.now(UTC)
                            logger.debug("ComfyUI checkpoints from Redis cache: %s", len(options))
                            return self._checkpoint_cache
            except Exception as exc:  # noqa: BLE001 — Redis cache is best-effort before ComfyUI fetch
                logger.debug("ComfyUI checkpoints Redis read skipped: %s", exc, exc_info=True)

        if not self.client:
            return []
        try:
            timeout = httpx.Timeout(30.0)
            response = await self.client.get(f"{self.base_url}/object_info/CheckpointLoaderSimple", timeout=timeout)

            if response.status_code == HTTP_STATUS_OK:
                data = response.json()
                checkpoint_info = (
                    data.get("CheckpointLoaderSimple", {}).get("input", {}).get("required", {}).get("ckpt_name", [])
                )

                if isinstance(checkpoint_info, list) and checkpoint_info:
                    options = checkpoint_info[0] if isinstance(checkpoint_info[0], list) else []
                    if isinstance(options, list) and options:
                        self._checkpoint_cache = options
                        self._checkpoint_cache_fetched_at = datetime.now(UTC)
                        try:
                            from api.core.database_manager import get_database_manager  # noqa: PLC0415

                            manager = await get_database_manager()
                            redis = await manager.get_redis_client(db=REDIS_DB_COMFYUI_CACHE)
                            if redis:
                                await redis.setex(
                                    COMFYUI_CACHE_KEY_CHECKPOINTS,
                                    STACK2_CACHE_TTL_COMFYUI_CHECKPOINTS,
                                    json.dumps(self._checkpoint_cache),
                                )
                        except Exception as exc:  # noqa: BLE001 — Redis cache write is best-effort
                            logger.debug("ComfyUI checkpoints Redis write skipped: %s", exc, exc_info=True)
                        return self._checkpoint_cache
                return self._checkpoint_cache

        except (httpx.RequestError, httpx.TimeoutException, httpx.HTTPStatusError) as e:
            logger.warning("Failed to fetch ComfyUI checkpoints: %s", e)

        return self._checkpoint_cache

    async def resolve_checkpoint_name(self, model: str | None) -> str:
        """Resolve user-provided model name to a valid checkpoint entry"""
        requested = (model or "DreamShaperXL_Lightning.safetensors").strip()
        if not requested:
            requested = "DreamShaperXL_Lightning.safetensors"

        requested_with_ext = requested if requested.endswith(".safetensors") else f"{requested}.safetensors"

        available = await self.get_checkpoint_names()
        if available:
            if requested_with_ext in available:
                return requested_with_ext

            requested_basename = requested_with_ext.split("/")[-1]
            for option in available:
                if option == requested_with_ext:
                    return option
                if option.endswith(requested_basename):
                    logger.info("Resolved ComfyUI checkpoint '%s' to '%s'", requested, option)
                    return option

            logger.warning(
                "Requested checkpoint '%s' not found. Falling back to '%s'",
                requested,
                available[0],
            )
            return available[0]

        return requested_with_ext

    async def get_system_stats(self) -> dict[str, Any]:
        """Get ComfyUI system statistics"""
        if not self.client:
            return {}
        try:
            timeout = httpx.Timeout(30.0)
            response = await self.client.get(f"{self.base_url}/system_stats", timeout=timeout)

            if response.status_code == HTTP_STATUS_OK:
                stats_data = response.json()
                return dict(stats_data) if isinstance(stats_data, dict) else {}
            logger.warning("Failed to get system stats: HTTP %s", response.status_code)
            return {}

        except Exception:
            logger.exception("Error getting system stats: ")
            return {}

    async def get_queue_status(self) -> dict[str, Any]:
        """Get current queue status"""
        if not self.client:
            return {"error": "Client not initialized"}
        try:
            timeout = httpx.Timeout(30.0)
            response = await self.client.get(f"{self.base_url}/queue", timeout=timeout)

            if response.status_code == HTTP_STATUS_OK:
                queue_data = response.json()
                return dict(queue_data) if isinstance(queue_data, dict) else {}
            logger.warning("Failed to get queue status: HTTP %s", response.status_code)
            return {"error": f"HTTP {response.status_code}"}

        except (httpx.RequestError, httpx.TimeoutException, httpx.HTTPStatusError) as e:
            logger.exception("Error getting queue status")
            return {"error": str(e)}

    async def fetch_image_data(self, filename: str, subfolder: str = "") -> str | None:
        if self.client is None:
            await self.initialize()

        if not self.client:
            return None

        try:
            timeout_obj = httpx.Timeout(60.0)
            response = await self.client.get(
                f"{self.base_url}/view",
                params={"filename": filename, "subfolder": subfolder},
                timeout=timeout_obj,
            )

            if response.status_code == HTTP_STATUS_OK:
                return base64.b64encode(response.content).decode("utf-8")
            logger.warning("Failed to fetch ComfyUI image %s: HTTP %s", filename, response.status_code)
        except (httpx.RequestError, httpx.TimeoutException, httpx.HTTPStatusError):  # fmt: skip
            logger.exception("Error fetching ComfyUI image %s", filename)

        return None

    async def fetch_output_file_data_b64(self, filename: str, subfolder: str = "") -> str | None:
        """Fetch a file from ComfyUI output folder (SaveAudio/SaveVideo outputs). Returns base64."""
        if self.client is None:
            await self.initialize()

        if not self.client:
            return None

        try:
            timeout_obj = httpx.Timeout(120.0)
            response = await self.client.get(
                f"{self.base_url}/view",
                params={
                    "filename": filename,
                    "subfolder": subfolder,
                    "type": "output",
                },
                timeout=timeout_obj,
            )

            if response.status_code == HTTP_STATUS_OK:
                return base64.b64encode(response.content).decode("utf-8")
            logger.warning(
                "Failed to fetch ComfyUI output file %s: HTTP %s",
                filename,
                response.status_code,
            )
        except (httpx.RequestError, httpx.TimeoutException, httpx.HTTPStatusError):  # fmt: skip
            logger.exception("Error fetching ComfyUI output file %s", filename)

        return None

    async def cancel_generation(self, prompt_id: str) -> bool:
        """Cancel a running generation"""
        if not self.client:
            return False
        try:
            timeout_obj = httpx.Timeout(30.0)
            response = await self.client.post(f"{self.base_url}/interrupt", timeout=timeout_obj)

            if response.status_code == HTTP_STATUS_OK:
                logger.info("Cancelled ComfyUI generation: %s", prompt_id)
                return True
            logger.warning("Failed to cancel generation: HTTP %s", response.status_code)
            return False

        except (httpx.RequestError, httpx.TimeoutException, httpx.HTTPStatusError):  # fmt: skip
            logger.exception("Error cancelling generation")
            return False

    async def get_available_models(self) -> list[dict[str, Any]]:
        """Return structured information about available checkpoints"""
        checkpoints = await self.get_checkpoint_names()
        models: list[dict[str, Any]] = []

        for checkpoint in checkpoints:
            base_name = checkpoint.rsplit("/", 1)[-1]
            short_name = base_name.replace(".safetensors", "")

            family = checkpoint.split("/", 1)[0].upper() if "/" in checkpoint else "CUSTOM"

            models.append({"name": short_name, "checkpoint": checkpoint, "type": "checkpoint", "base": family})

        return models

    async def validate_workflow(self, workflow: dict[str, Any]) -> dict[str, Any]:
        """
        Validate a ComfyUI workflow

        Args:
            workflow: Workflow JSON to validate

        Returns:
            Validation result
        """
        try:
            if not isinstance(workflow, dict):
                return {"valid": False, "error": "Workflow must be a dictionary"}

            if not workflow:
                return {"valid": False, "error": "Workflow is empty"}

            nodes = 0
            for value in workflow.values():
                if isinstance(value, dict) and "class_type" in value:
                    nodes += 1

            if nodes == 0:
                return {"valid": False, "error": "No valid nodes found in workflow"}

            return {
                "valid": True,
                "nodes_count": nodes,
                "workflow_info": f"Workflow with {nodes} nodes",
            }

        except (ValueError, TypeError, KeyError) as e:
            return {"valid": False, "error": f"Validation error: {e}"}

    async def upload_image(self, image_bytes: bytes, filename: str) -> str:
        """
        Upload image to ComfyUI input folder for use in LoadImage nodes.
        ComfyUI endpoint: POST /upload/image (multipart).

        Returns:
            Filename to use in LoadImage node (name, or subfolder/name if subfolder set).
        """
        if not self.client:
            await self.initialize()
        if not self.client:
            msg = "ComfyUI client not initialized"
            raise RuntimeError(msg)
        if not filename.lower().endswith((".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp")):
            filename = f"{filename}.png"
        files = {"image": (filename, image_bytes, "image/png")}
        data = {"overwrite": "false"}
        try:
            timeout_obj = httpx.Timeout(30.0)
            response = await self.client.post(
                f"{self.base_url}/upload/image",
                files=files,
                data=data,
                timeout=timeout_obj,
            )
            if response.status_code != HTTP_STATUS_OK:
                logger.error("ComfyUI upload failed: HTTP %s %s", response.status_code, response.text)
                raise RuntimeError(f"ComfyUI upload failed: {response.status_code} {response.text}")
            out = response.json()
            name = out.get("name") or filename
            subfolder = (out.get("subfolder") or "").strip()
            if subfolder:
                return f"{subfolder}/{name}"
            return name
        except (httpx.RequestError, httpx.TimeoutException, httpx.HTTPStatusError) as e:
            logger.exception("ComfyUI upload_image error: %s", e)
            raise RuntimeError(f"ComfyUI upload failed: {e}") from e

    async def upload_audio(self, audio_bytes: bytes, filename: str) -> str:
        """
        Upload audio to ComfyUI input folder for use in LoadAudio nodes (e.g. M2M editing).
        Uses the same multipart endpoint as images; many ComfyUI setups accept any file for input.

        Returns:
            Filename to use in LoadAudio node (name, or subfolder/name if subfolder set).
        """
        if not self.client:
            await self.initialize()
        if not self.client:
            msg = "ComfyUI client not initialized"
            raise RuntimeError(msg)
        if not filename.lower().endswith((".mp3", ".wav", ".flac", ".ogg", ".m4a")):
            filename = f"{filename}.mp3"
        files = {"image": (filename, audio_bytes, "audio/mpeg")}
        data = {"overwrite": "false"}
        try:
            timeout_obj = httpx.Timeout(60.0)
            response = await self.client.post(
                f"{self.base_url}/upload/image",
                files=files,
                data=data,
                timeout=timeout_obj,
            )
            if response.status_code != HTTP_STATUS_OK:
                logger.error(
                    "ComfyUI audio upload failed: HTTP %s %s",
                    response.status_code,
                    response.text,
                )
                raise RuntimeError(f"ComfyUI audio upload failed: {response.status_code} {response.text}")
            out = response.json()
            name = out.get("name") or filename
            subfolder = (out.get("subfolder") or "").strip()
            if subfolder:
                return f"{subfolder}/{name}"
            return name
        except (httpx.RequestError, httpx.TimeoutException, httpx.HTTPStatusError) as e:
            logger.exception("ComfyUI upload_audio error: %s", e)
            raise RuntimeError(f"ComfyUI audio upload failed: {e}") from e

    async def is_available(self) -> bool:
        """Check if provider is available"""
        return await self._check_health()

    async def get_capabilities(self) -> dict[str, Any]:
        """Get provider capabilities"""
        models = await self.get_available_models()

        return {
            "provider": "comfyui",
            "type": "image_generation",
            "capabilities": [
                "text_to_image",
                "image_to_image",
                "inpainting",
                "workflow_orchestration",
            ],
            "models": [model["name"] for model in models],
            "max_resolution": "2048x2048",
            "features": ["custom_workflows", "batch_processing", "real_time_progress"],
        }

    async def get_status(self) -> dict[str, Any]:
        """Get provider status"""
        available = await self.is_available()
        queue_status = await self.get_queue_status() if available else {}
        system_stats = await self.get_system_stats() if available else {}

        return {
            "provider": "comfyui",
            "available": available,
            "queue_status": queue_status,
            "system_stats": system_stats,
            "base_url": self.base_url,
            "last_checked": self.last_health_check.isoformat() if self.last_health_check else None,
        }
