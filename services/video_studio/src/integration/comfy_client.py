"""
Thin ComfyUI HTTP client for video_studio — adapted from EliteEW comfyui_client_core
and Empery image_studio. Empery-owned; no EliteEW imports.
"""

from __future__ import annotations

from typing import Any

import httpx


class ComfyClient:
    def __init__(self, base_url: str, *, timeout_seconds: float = 120.0) -> None:
        self.base_url = base_url.rstrip("/")
        self._timeout = httpx.Timeout(timeout_seconds, connect=15.0)

    async def system_stats(self) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            res = await client.get(f"{self.base_url}/system_stats")
            res.raise_for_status()
            data = res.json()
            if isinstance(data, list):
                return data[0] if data else {}
            if isinstance(data, dict):
                return data
            return {}

    async def upload_image(self, image_bytes: bytes, filename: str) -> str:
        if not filename.lower().endswith((".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp")):
            filename = f"{filename}.png"
        files = {"image": (filename, image_bytes, "application/octet-stream")}
        data = {"overwrite": "true"}
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            res = await client.post(
                f"{self.base_url}/upload/image",
                files=files,
                data=data,
            )
            if res.status_code >= 400:
                raise RuntimeError(
                    f"ComfyUI upload failed: HTTP {res.status_code} — {res.text[:500]}"
                )
            out = res.json()
            name = str(out.get("name") or filename)
            subfolder = str(out.get("subfolder") or "").strip()
            return f"{subfolder}/{name}" if subfolder else name

    async def queue_prompt(self, workflow: dict[str, Any]) -> str:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            res = await client.post(
                f"{self.base_url}/prompt",
                json={"prompt": workflow},
            )
            if res.status_code >= 400:
                raise RuntimeError(
                    f"ComfyUI queue failed: HTTP {res.status_code} — {res.text[:500]}"
                )
            data = res.json()
            prompt_id = data.get("prompt_id")
            if not prompt_id:
                raise RuntimeError("ComfyUI returned no prompt_id")
            return str(prompt_id)

    async def history(self, prompt_id: str) -> dict[str, Any] | None:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            res = await client.get(f"{self.base_url}/history/{prompt_id}")
            if res.status_code >= 400:
                return None
            data = res.json()
            if not isinstance(data, dict):
                return None
            entry = data.get(prompt_id)
            return entry if isinstance(entry, dict) else None

    async def view_file(
        self,
        *,
        filename: str,
        subfolder: str = "",
        folder_type: str = "output",
    ) -> bytes:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            res = await client.get(
                f"{self.base_url}/view",
                params={
                    "filename": filename,
                    "subfolder": subfolder,
                    "type": folder_type,
                },
            )
            res.raise_for_status()
            return res.content
