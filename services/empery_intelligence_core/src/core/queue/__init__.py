"""
Intention queue boundary — persistence owned by Implementer 3.

Architect 1 defines ``IntentionSource`` in ``core.engine.contracts`` and
registers ``InMemoryIntentionSource`` for tests/scaffold. Replace via DI.
"""

from services.empery_intelligence_core.src.core.engine.contracts import (
    InMemoryIntentionSource,
    IntentionHandle,
    IntentionSource,
)

__all__ = [
    "InMemoryIntentionSource",
    "IntentionHandle",
    "IntentionSource",
]
