"""BFF use cases for asm_prod_acc_20261006110325 metrics."""

from __future__ import annotations

from core.container import ServiceContainer

from services.empery_control_center_api.src.data.asm_prod_acc_20261006110325_schemas import (
    EccMetricListResponse,
    EccMetricView,
)


class EccAsmProdAcc20261006110325BffUseCases:
    def __init__(self, container: ServiceContainer) -> None:
        self._container = container

    def _client(self):
        return self._container.resolve("asm_prod_acc_20261006110325_client")

    async def list_metrics(
        self, authorization: str | None, *, limit: int = 50
    ) -> EccMetricListResponse:
        raw = await self._client().list_metrics(authorization, limit=limit)
        metrics = [
            EccMetricView.model_validate(m) for m in (raw.get("metrics") or [])
        ]
        return EccMetricListResponse(
            metrics=metrics, count=int(raw.get("count") or len(metrics))
        )
