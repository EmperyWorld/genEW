# ---
# EliteEW · Empery World
# https://empery.world
# Author: po&T && TZBrand
# ---
# Purpose:
# ComfyUI workflow queueing, completion polling, and result extraction (image/audio/video).
# Invariants:
# - Unhealthy service fails before queue; completion polling respects caller timeout.
# Related:
# - api/services/ugs/providers/comfyui_provider.py
# ---
# pyright: reportAttributeAccessIssue=false
# Mixin/composed attrs resolved on facade class at runtime.

from __future__ import annotations

import asyncio
import base64
import logging
from datetime import UTC, datetime
from typing import Any

import httpx  # type: ignore[import-not-found]

from .comfyui_observability import (
    HTTP_STATUS_OK,
    HTTP_STATUS_TIMEOUT,
    maybe_save_comfyui_prompt_workflow,
    save_comfyui_audio_history_fact_from_response,
)

logger = logging.getLogger(__name__)


class ComfyUIExecutionMixin:
    """Queue ComfyUI prompts and extract image/audio/video outputs."""

    async def generate_image(
        self,
        workflow: dict[str, Any],
        output_node: str | list[str] = "save_image",
        timeout: int = 300,  # noqa: ASYNC109
    ) -> dict[str, Any]:
        """
        Generate image using ComfyUI workflow

        Args:
            workflow: ComfyUI workflow JSON
            output_node: Node ID that produces the final output
            timeout: Generation timeout in seconds

        Returns:
            Generation result with images and metadata
        """
        if not self.health_status:
            await self._check_health()
            if not self.health_status:
                msg = "ComfyUI service unavailable"
                raise RuntimeError(msg)

        try:
            if isinstance(output_node, list):
                primary_requested = output_node[0] if output_node else None
            else:
                primary_requested = output_node

            resolved_output_node = self._detect_output_node(workflow, primary_requested)

            extra_output_nodes: list[str] | None = None
            if isinstance(output_node, list):
                extra_output_nodes = [node_id for node_id in output_node if node_id != resolved_output_node]

            text_encode_nodes_in_workflow = []
            for node_id, node in workflow.items():
                class_type = str(node.get("class_type") or "")
                if class_type == "CLIPTextEncode" or "TextEncode" in class_type:
                    text_encode_nodes_in_workflow.append((node_id, node, class_type))
            if text_encode_nodes_in_workflow:
                for node_id, node, class_type in text_encode_nodes_in_workflow:
                    inputs = node.get("inputs", {})
                    prompt_raw = inputs.get("text")
                    prompt_field = "text"
                    if prompt_raw is None:
                        prompt_raw = inputs.get("prompt")
                        prompt_field = "prompt"
                    prompt_text = str(prompt_raw) if isinstance(prompt_raw, str) and prompt_raw.strip() else "(empty)"
                    truncated_text = (
                        f"{prompt_text[:HTTP_STATUS_TIMEOUT]}..."
                        if len(prompt_text) > HTTP_STATUS_TIMEOUT
                        else prompt_text
                    )
                    logger.info(
                        "ComfyUI workflow final state - Node %s (%s): %s='%s'",
                        node_id,
                        class_type,
                        prompt_field,
                        truncated_text,
                    )
            else:
                logger.warning("No text-encode nodes found in workflow before sending to ComfyUI!")

            if not self.client:
                msg = "ComfyUI client not initialized"
                raise RuntimeError(msg)
            timeout_obj = httpx.Timeout(60.0)
            maybe_save_comfyui_prompt_workflow(workflow, kind="image")
            queue_response = await self.client.post(
                f"{self.base_url}/prompt", json={"prompt": workflow}, timeout=timeout_obj
            )

            if queue_response.status_code != HTTP_STATUS_OK:
                error_text = queue_response.text
                logger.error(
                    "ComfyUI queue failed: HTTP %s - %s",
                    queue_response.status_code,
                    error_text,
                )
                msg = f"Failed to queue prompt: {error_text}"
                raise RuntimeError(msg)  # noqa: TRY301

            queue_data = queue_response.json()
            prompt_id = queue_data.get("prompt_id")

            if not prompt_id:
                msg = "No prompt ID received from ComfyUI"
                raise RuntimeError(msg)  # noqa: TRY301

            logger.info("🎨 Queued ComfyUI prompt: %s", prompt_id)

            return await self._wait_for_completion(
                prompt_id,
                resolved_output_node,
                timeout,
                output_kind="image",
                extra_output_nodes=extra_output_nodes,
            )

        except (httpx.RequestError, httpx.TimeoutException, httpx.HTTPStatusError, RuntimeError) as e:
            logger.exception("ComfyUI generation error")
            msg = f"Image generation failed: {e}"
            raise RuntimeError(msg) from e

    async def generate_video(
        self,
        workflow: dict[str, Any],
        output_node: str = "108",
        timeout: int = 600,
        output_filename_prefix: str | None = None,
    ) -> dict[str, Any]:
        """
        Generate video using ComfyUI workflow (e.g. Wan2.2 I2V SaveVideo).

        Args:
            workflow: ComfyUI workflow JSON
            output_node: Node ID that produces the video output (e.g. SaveVideo)
            timeout: Generation timeout in seconds (video can take several minutes)
            output_filename_prefix: If set (e.g. "video/Wan2.2_i2v_abc12"), fallback
                will fetch only this run's file instead of generic names.

        Returns:
            Result with "videos": [{"filename", "subfolder", "data": base64}], "metadata": {...}
        """
        if not self.health_status:
            await self._check_health()
            if not self.health_status:
                msg = "ComfyUI service unavailable"
                raise RuntimeError(msg)
        try:
            resolved_output_node = self._detect_output_node(workflow, output_node)
            if not self.client:
                msg = "ComfyUI client not initialized"
                raise RuntimeError(msg)
            timeout_obj = httpx.Timeout(60.0)
            maybe_save_comfyui_prompt_workflow(workflow, kind="video")
            queue_response = await self.client.post(
                f"{self.base_url}/prompt", json={"prompt": workflow}, timeout=timeout_obj
            )
            if queue_response.status_code != HTTP_STATUS_OK:
                error_text = queue_response.text
                logger.error(
                    "ComfyUI queue failed: HTTP %s - %s",
                    queue_response.status_code,
                    error_text,
                )
                msg = f"Failed to queue prompt: {error_text}"
                raise RuntimeError(msg)
            queue_data = queue_response.json()
            prompt_id = queue_data.get("prompt_id")
            if not prompt_id:
                msg = "No prompt ID received from ComfyUI"
                raise RuntimeError(msg)
            logger.info("🎬 Queued ComfyUI video prompt: %s", prompt_id)
            return await self._wait_for_completion(
                prompt_id,
                resolved_output_node,
                timeout,
                output_kind="video",
                video_fallback_prefix=output_filename_prefix,
            )
        except (httpx.RequestError, httpx.TimeoutException, httpx.HTTPStatusError, RuntimeError) as e:
            logger.exception("ComfyUI video generation error")
            msg = f"Video generation failed: {e}"
            raise RuntimeError(msg) from e

    async def generate_audio(
        self,
        workflow: dict[str, Any],
        output_node: str = "107",
        timeout: int = 1800,
    ) -> dict[str, Any]:
        """
        Generate audio using ComfyUI workflow (e.g. Ace Step 1.5 SaveAudioMP3).

        Args:
            workflow: ComfyUI workflow JSON
            output_node: Node ID that produces the audio output (e.g. SaveAudioMP3)
            timeout: Generation timeout in seconds (music can take several minutes; default ×3 vs legacy 600s)

        Returns:
            Result with "audio": [{"filename", "subfolder", "data": base64}], "metadata": {...}
        """
        if not self.health_status:
            await self._check_health()
            if not self.health_status:
                msg = "ComfyUI service unavailable"
                raise RuntimeError(msg)

        try:
            resolved_output_node = self._detect_output_node(workflow, output_node)
            if not self.client:
                msg = "ComfyUI client not initialized"
                raise RuntimeError(msg)
            timeout_obj = httpx.Timeout(60.0)
            maybe_save_comfyui_prompt_workflow(workflow, kind="audio")
            queue_response = await self.client.post(
                f"{self.base_url}/prompt", json={"prompt": workflow}, timeout=timeout_obj
            )
            if queue_response.status_code != HTTP_STATUS_OK:
                error_text = queue_response.text
                logger.error(
                    "ComfyUI queue failed: HTTP %s - %s",
                    queue_response.status_code,
                    error_text,
                )
                msg = f"Failed to queue prompt: {error_text}"
                raise RuntimeError(msg)
            queue_data = queue_response.json()
            prompt_id = queue_data.get("prompt_id")
            if not prompt_id:
                msg = "No prompt ID received from ComfyUI"
                raise RuntimeError(msg)
            logger.info("🎵 Queued ComfyUI audio prompt: %s", prompt_id)
            return await self._wait_for_completion(prompt_id, resolved_output_node, timeout, output_kind="audio")
        except (httpx.RequestError, httpx.TimeoutException, httpx.HTTPStatusError, RuntimeError) as e:
            logger.exception("ComfyUI audio generation error")
            msg = f"Audio generation failed: {e}"
            raise RuntimeError(msg) from e

    def _detect_output_node(
        self,
        workflow: dict[str, Any],
        requested: str | list[str] | None,
    ) -> str:
        """Determine which node should be treated as output"""
        if isinstance(requested, list):
            for node_id in requested:
                if node_id in workflow:
                    return node_id
        elif requested and requested in workflow:
            return requested

        candidates: list[str] = []
        for node_id, node in workflow.items():
            class_type = (node.get("class_type") or "").lower()
            if "save" in class_type:
                candidates.append(node_id)

        if candidates:
            logger.info("Detected ComfyUI output node(s) %s; using '%s'", candidates, candidates[0])
            return candidates[0]

        if requested:
            if isinstance(requested, list):
                return requested[0] if requested else "save_image"
            return requested

        first_key = next(iter(workflow.keys()), "save_image")
        logger.warning("Unable to detect ComfyUI output node. Using fallback '%s'", first_key)
        return first_key

    async def _wait_for_completion(
        self,
        prompt_id: str,
        output_node: str,
        timeout: int = 300,
        output_kind: str = "image",
        video_fallback_prefix: str | None = None,
        extra_output_nodes: list[str] | None = None,
    ) -> dict[str, Any]:
        """Wait for workflow completion and get results (image or audio)."""
        start_time = datetime.now(UTC)
        check_interval = 2.0

        if not self.client:
            msg = "ComfyUI client not initialized"
            raise RuntimeError(msg)
        while (datetime.now(UTC) - start_time).total_seconds() < timeout:
            try:
                timeout_obj = httpx.Timeout(90.0)
                history_response = await self.client.get(f"{self.base_url}/history/{prompt_id}", timeout=timeout_obj)
                if history_response.status_code != HTTP_STATUS_OK:
                    await asyncio.sleep(check_interval)
                    continue
                history_data = history_response.json()
                if prompt_id not in history_data:
                    await asyncio.sleep(check_interval)
                    continue
                execution = history_data[prompt_id]
                status = execution.get("status", {})
                if status.get("exception"):
                    error_msg = status.get("exception", "Unknown error")
                    logger.error("ComfyUI generation failed: %s", error_msg)
                    raise RuntimeError(f"Generation failed: {error_msg}")
                if status.get("completed"):
                    logger.info("ComfyUI generation completed: %s", prompt_id)
                    if output_kind == "audio":
                        await asyncio.to_thread(
                            save_comfyui_audio_history_fact_from_response,
                            history_data,
                            base_url=self.base_url,
                        )
                        return await self._extract_audio_results(execution, output_node)
                    if output_kind == "video":
                        return await self._extract_video_results(
                            execution, output_node, fallback_prefix=video_fallback_prefix
                        )
                    return await self._extract_results(execution, output_node, extra_output_nodes=extra_output_nodes)
                await asyncio.sleep(check_interval)
            except (httpx.RequestError, httpx.TimeoutException, httpx.HTTPStatusError) as e:
                logger.warning("Error checking ComfyUI status: %s", e)
                await asyncio.sleep(check_interval)

        msg = f"Generation timeout after {timeout} seconds"
        raise TimeoutError(msg)

    async def _extract_results(
        self,
        execution: dict[str, Any],
        output_node: str,
        extra_output_nodes: list[str] | None = None,
    ) -> dict[str, Any]:
        """Extract images and metadata from completed execution.

        Supports aggregating images from multiple output nodes (e.g. multi-angle workflows).
        """
        outputs = execution.get("outputs", {})

        if output_node not in outputs:
            logger.warning(
                "Output node '%s' not found. Available outputs: %s.",
                output_node,
                list(outputs.keys()),
            )
            fallback_output_node: str | None = next(iter(outputs.keys()), None) if outputs else None

            if not fallback_output_node:
                msg = "No outputs returned by ComfyUI execution"
                raise RuntimeError(msg)
            output_node = fallback_output_node

        node_ids: list[str] = [output_node]
        if extra_output_nodes:
            for node_id in extra_output_nodes:
                if node_id in outputs and node_id not in node_ids:
                    node_ids.append(node_id)

        result: dict[str, Any] = {
            "images": [],
            "metadata": {
                "prompt_id": execution.get("prompt_id"),
                "status": execution.get("status", {}),
                "execution_time": None,
            },
        }

        if not self.client:
            msg = "ComfyUI client not initialized"
            raise RuntimeError(msg)
        images_list: list[dict[str, Any]] = []
        result["images"] = images_list
        seen_files: set[tuple[str, str]] = set()

        for node_id in node_ids:
            node_outputs = outputs[node_id]
            images = node_outputs.get("images", [])

            for image_info in images:
                filename = image_info.get("filename")
                subfolder = image_info.get("subfolder", "")
                if not filename:
                    continue

                key = (filename, subfolder)
                if key in seen_files:
                    continue
                seen_files.add(key)

                try:
                    timeout_obj = httpx.Timeout(60.0)
                    image_response = await self.client.get(
                        f"{self.base_url}/view",
                        params={
                            "filename": filename,
                            "subfolder": subfolder,
                        },
                        timeout=timeout_obj,
                    )

                    if image_response.status_code == HTTP_STATUS_OK:
                        image_b64 = base64.b64encode(image_response.content).decode("utf-8")

                        images_list.append(
                            {
                                "filename": filename,
                                "subfolder": subfolder,
                                "data": image_b64,
                                "format": image_info.get("type", "png"),
                                "width": image_info.get("width"),
                                "height": image_info.get("height"),
                            }
                        )
                    else:
                        logger.warning(
                            "Failed to download image %s: HTTP %s",
                            filename,
                            image_response.status_code,
                        )

                except (httpx.RequestError, httpx.TimeoutException, httpx.HTTPStatusError):  # fmt: skip
                    logger.exception("Error extracting image %s", filename)

        if "status" in execution and "completed" in execution["status"]:
            metadata = result.get("metadata", {})
            if isinstance(metadata, dict):
                metadata["execution_time"] = "completed"
                result["metadata"] = metadata
        return result

    async def _extract_audio_results(self, execution: dict[str, Any], output_node: str) -> dict[str, Any]:
        """Extract audio from SaveAudio/SaveAudioMP3 node output."""
        outputs = execution.get("outputs", {})
        if output_node not in outputs:
            fallback = next(iter(outputs.keys()), None) if outputs else None
            if not fallback:
                raise RuntimeError("No outputs returned by ComfyUI execution")
            output_node = fallback
        node_outputs = outputs[output_node]
        audio_list = node_outputs.get("audio")
        if not audio_list:
            for node_id, node_out in outputs.items():
                if not isinstance(node_out, dict):
                    continue
                candidate = node_out.get("audio")
                if candidate:
                    logger.warning(
                        "ComfyUI audio missing on node %s; using node %s (keys=%s)",
                        output_node,
                        node_id,
                        list(node_outputs.keys()),
                    )
                    output_node = node_id
                    node_outputs = node_out
                    audio_list = candidate
                    break
        if not audio_list:
            raise RuntimeError(f"No audio in output node {output_node}. Keys: {list(node_outputs.keys())}")
        if not isinstance(audio_list, list):
            audio_list = [audio_list]
        result: dict[str, Any] = {
            "audio": [],
            "metadata": {
                "prompt_id": execution.get("prompt_id"),
                "status": execution.get("status", {}),
            },
        }
        if not self.client:
            raise RuntimeError("ComfyUI client not initialized")
        for item in audio_list:
            info = item if isinstance(item, dict) else {}
            filename = info.get("filename")
            if not filename:
                continue
            subfolder = info.get("subfolder", "")
            try:
                timeout_obj = httpx.Timeout(120.0)
                resp = await self.client.get(
                    f"{self.base_url}/view",
                    params={
                        "filename": filename,
                        "subfolder": subfolder,
                        "type": "output",
                    },
                    timeout=timeout_obj,
                )
                if resp.status_code == HTTP_STATUS_OK:
                    result["audio"].append(
                        {
                            "filename": filename,
                            "subfolder": subfolder,
                            "data": base64.b64encode(resp.content).decode("utf-8"),
                        }
                    )
                else:
                    logger.warning(
                        "Failed to download audio %s: HTTP %s",
                        filename,
                        resp.status_code,
                    )
            except (httpx.RequestError, httpx.TimeoutException, httpx.HTTPStatusError):  # fmt: skip
                logger.exception("Error fetching audio %s", filename)
        return result

    async def _extract_video_results(
        self,
        execution: dict[str, Any],
        output_node: str,
        fallback_prefix: str | None = None,
    ) -> dict[str, Any]:
        """Extract video from SaveVideo node output (gifs/videos array) or by known .mp4 path.
        If fallback_prefix is set (e.g. video/Wan2.2_i2v_abc12), only that run's file is fetched.
        """
        result: dict[str, Any] = {
            "videos": [],
            "metadata": {
                "prompt_id": execution.get("prompt_id"),
                "status": execution.get("status", {}),
            },
        }
        if not self.client:
            raise RuntimeError("ComfyUI client not initialized")

        outputs = execution.get("outputs", {})
        video_list: list[dict[str, Any]] = []

        if outputs:
            node_id = output_node if output_node in outputs else next(iter(outputs.keys()), None)
            if node_id:
                node_outputs = outputs[node_id]
                raw = (
                    node_outputs.get("gifs")
                    or node_outputs.get("videos")
                    or ([node_outputs["video"]] if isinstance(node_outputs.get("video"), dict) else [])
                )
                if isinstance(raw, list):
                    video_list = [i if isinstance(i, dict) else {} for i in raw]
                elif isinstance(raw, dict) and raw.get("filename"):
                    video_list = [raw]

        if not video_list:
            if fallback_prefix and "/" in fallback_prefix:
                subfolder, base = fallback_prefix.strip("/").rsplit("/", 1)
                subfolder = subfolder or "video"
                candidates = [f"{base}_00001_.mp4", f"{base}_00001.mp4"]
            else:
                subfolder = "video"
                candidates = ("Wan2.2_i2v_00001_.mp4", "Wan2.2_i2v_00001.mp4", "Wan2.2_i2v_00002_.mp4")
            for candidate in candidates:
                try:
                    timeout_obj = httpx.Timeout(120.0)
                    resp = await self.client.get(
                        f"{self.base_url}/view",
                        params={
                            "filename": candidate,
                            "subfolder": subfolder,
                            "type": "output",
                        },
                        timeout=timeout_obj,
                    )
                    if resp.status_code == HTTP_STATUS_OK and len(resp.content) > 1000:
                        video_list = [{"filename": candidate, "subfolder": subfolder, "_bytes": resp.content}]
                        logger.info("Video fetched by fallback path: %s/%s", subfolder, candidate)
                        break
                except (httpx.RequestError, httpx.TimeoutException, httpx.HTTPStatusError):  # fmt: skip
                    continue

        if not video_list:
            if outputs:
                raise RuntimeError(f"No video in output node. Keys: {list((outputs or {}).keys())}")
            raise RuntimeError("No outputs returned by ComfyUI execution")

        for item in video_list:
            if item.get("_bytes"):
                result["videos"].append(
                    {
                        "filename": item.get("filename", "video.mp4"),
                        "subfolder": item.get("subfolder", ""),
                        "data": base64.b64encode(item["_bytes"]).decode("utf-8"),
                    }
                )
                continue
            filename = item.get("filename")
            if not filename:
                continue
            subfolder = item.get("subfolder", "")
            try:
                timeout_obj = httpx.Timeout(120.0)
                resp = await self.client.get(
                    f"{self.base_url}/view",
                    params={
                        "filename": filename,
                        "subfolder": subfolder,
                        "type": "output",
                    },
                    timeout=timeout_obj,
                )
                if resp.status_code == HTTP_STATUS_OK:
                    result["videos"].append(
                        {
                            "filename": filename,
                            "subfolder": subfolder,
                            "data": base64.b64encode(resp.content).decode("utf-8"),
                        }
                    )
                else:
                    logger.warning(
                        "Failed to download video %s: HTTP %s",
                        filename,
                        resp.status_code,
                    )
            except (httpx.RequestError, httpx.TimeoutException, httpx.HTTPStatusError):  # fmt: skip
                logger.exception("Error fetching video %s", filename)

        if not result["videos"]:
            raise RuntimeError("ComfyUI video outputs were listed but file download failed")
        return result
