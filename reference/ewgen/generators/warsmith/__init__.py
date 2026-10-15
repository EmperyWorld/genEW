"""
Warsmith - Fullstack module composer (Fortune Seaker + Scavenger)
"""

from .compose import compose_warsmith_module
from .pairing import list_pair_candidates, suggest_pairs

__all__ = [
    "compose_warsmith_module",
    "list_pair_candidates",
    "suggest_pairs",
]
