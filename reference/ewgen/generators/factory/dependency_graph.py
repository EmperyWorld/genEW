"""
Semantic Dependency Graph (SDG) — DAG of module/file/symbol relationships for CAG.
"""

from __future__ import annotations

import heapq
import re
from enum import Enum
from typing import TYPE_CHECKING, Dict, Iterable, List, Optional, Set, Tuple

from pydantic import BaseModel, Field

from .context_knowledge import ContextSnippet

if TYPE_CHECKING:
    from .graph_impact import NodeImpactProfile

TS_IMPORT_FROM = re.compile(
    r"""import\s+(?:type\s+)?(?:\{[^}]+\}|\w+)\s+from\s+['"]([^'"]+)['"]""",
)
TS_IMPORT_SIDE = re.compile(r"""import\s+['"]([^'"]+)['"]""")
TS_EXTENDS = re.compile(r"\bextends\s+(\w+)")
TS_IMPLEMENTS = re.compile(r"\bimplements\s+([\w,\s]+)")
PY_FROM_IMPORT = re.compile(r"from\s+([\w.]+)\s+import")
PY_IMPORT = re.compile(r"^import\s+([\w.]+)", re.MULTILINE)


class EdgeKind(str, Enum):
    IMPORT = "import"
    EXTENDS = "extends"
    IMPLEMENTS = "implements"
    MODULE_DEPENDS = "module_depends"
    REVERSE_DEPENDS = "reverse_depends"


class DependencyEdge(BaseModel):
    source: str
    target: str
    kind: EdgeKind
    symbol: Optional[str] = None


class GraphNode(BaseModel):
    node_id: str
    module_id: str
    path: str
    symbols: List[str] = Field(default_factory=list)


class DependencyGraph(BaseModel):
    """Lightweight adjacency-list DAG — traversal limited only by token budget downstream."""

    nodes: Dict[str, GraphNode] = Field(default_factory=dict)
    edges: List[DependencyEdge] = Field(default_factory=list)
    forward: Dict[str, Set[str]] = Field(default_factory=dict)
    reverse: Dict[str, Set[str]] = Field(default_factory=dict)

    def add_node(self, node: GraphNode) -> None:
        self.nodes[node.node_id] = node
        self.forward.setdefault(node.node_id, set())
        self.reverse.setdefault(node.node_id, set())

    def add_edge(self, edge: DependencyEdge) -> None:
        if edge.source not in self.nodes or edge.target not in self.nodes:
            return
        self.edges.append(edge)
        self.forward.setdefault(edge.source, set()).add(edge.target)
        self.reverse.setdefault(edge.target, set()).add(edge.source)

    def distances_from_anchors(self, anchor_nodes: Iterable[str]) -> Dict[str, int]:
        """Unlimited BFS distances from anchor nodes through the full graph."""
        distances: Dict[str, int] = {}
        queue: List[Tuple[int, str]] = []
        for anchor in anchor_nodes:
            if anchor in self.nodes:
                heapq.heappush(queue, (0, anchor))
                distances[anchor] = 0

        while queue:
            dist, current = heapq.heappop(queue)
            if dist > distances.get(current, dist):
                continue
            for neighbor in self.forward.get(current, ()):
                next_dist = dist + 1
                if next_dist < distances.get(neighbor, 10**9):
                    distances[neighbor] = next_dist
                    heapq.heappush(queue, (next_dist, neighbor))
            for neighbor in self.reverse.get(current, ()):
                next_dist = dist + 1
                if next_dist < distances.get(neighbor, 10**9):
                    distances[neighbor] = next_dist
                    heapq.heappush(queue, (next_dist, neighbor))
        return distances

    def rank_reachable_nodes(
        self,
        target_module: str,
        direct_dependencies: List[str],
        profiles: Dict[str, NodeImpactProfile],
    ) -> List[str]:
        """
        Return all reachable snippet nodes ordered by graph-derived impact.

        No node-count cap — ordering is used by budget-bounded packing.
        """
        target_key = target_module.strip().lower()
        target_node = f"target:{target_key}"
        dep_modules = {dep.strip().lower() for dep in direct_dependencies if dep.strip()}

        seeds: Set[str] = set()
        if target_node in self.nodes:
            seeds.add(target_node)
        for node_id, node in self.nodes.items():
            if node.module_id.lower() in dep_modules:
                seeds.add(node_id)
        for node_id, profile in profiles.items():
            if profile.is_downstream_dependent or profile.is_upstream_dependency:
                seeds.add(node_id)

        visited: Set[str] = set()
        queue: List[Tuple[float, int, str]] = []
        for seed in seeds:
            if seed not in self.nodes:
                continue
            profile = profiles.get(seed)
            priority = -(profile.score if profile else 0.0)
            heapq.heappush(queue, (priority, 0, seed))

        ordered: List[str] = []
        seen_order: Set[str] = set()

        while queue:
            _neg_score, dist, current = heapq.heappop(queue)
            if current in visited or current not in self.nodes:
                continue
            visited.add(current)

            if not current.startswith("target:") and current not in seen_order:
                ordered.append(current)
                seen_order.add(current)

            for neighbor in self.forward.get(current, ()):
                if neighbor not in visited:
                    profile = profiles.get(neighbor)
                    priority = -(profile.score if profile else 0.0)
                    heapq.heappush(queue, (priority, dist + 1, neighbor))
            for neighbor in self.reverse.get(current, ()):
                if neighbor not in visited:
                    profile = profiles.get(neighbor)
                    priority = -(profile.score if profile else 0.0)
                    heapq.heappush(queue, (priority, dist + 1, neighbor))

        remaining = [
            node_id
            for node_id, profile in sorted(
                profiles.items(),
                key=lambda item: (-item[1].score, item[1].graph_distance, item[0]),
            )
            if node_id not in seen_order and not node_id.startswith("target:")
        ]
        return ordered + remaining

    def to_dependency_map(self, *, selected_node_ids: Optional[Set[str]] = None) -> List[Dict[str, str]]:
        """Serialize edges for ContextWindow.dependency_map."""
        selected = selected_node_ids
        return [
            {
                "source": edge.source,
                "target": edge.target,
                "kind": edge.kind.value,
                **({"symbol": edge.symbol} if edge.symbol else {}),
            }
            for edge in self.edges
            if selected is None
            or edge.source in selected
            or edge.target in selected
            or edge.source.startswith("target:")
            or edge.target.startswith("target:")
        ]

    def relationship_lines(
        self,
        target_module: str,
        selected_node_ids: Set[str],
        profiles: Optional[Dict[str, NodeImpactProfile]] = None,
    ) -> List[str]:
        """Human-readable relationship summary for LLM prompt."""
        lines: List[str] = []
        target_key = target_module.strip().lower()

        if profiles:
            for node_id in sorted(selected_node_ids):
                profile = profiles.get(node_id)
                node = self.nodes.get(node_id)
                if not profile or not node:
                    continue
                if profile.is_downstream_dependent:
                    lines.append(
                        f"{node.module_id} depends on this module — preserve shared interfaces",
                    )
                for reason in profile.reasons[:2]:
                    detail = f"{node.module_id}/{node.path}: {reason}"
                    if detail not in lines:
                        lines.append(detail)

        upstream_modules: Set[str] = set()
        downstream_modules: Set[str] = set()

        for edge in self.edges:
            if edge.source not in selected_node_ids and edge.target not in selected_node_ids:
                if not edge.source.startswith("target:") and not edge.target.startswith("target:"):
                    continue
            src = self.nodes.get(edge.source)
            tgt = self.nodes.get(edge.target)
            if edge.kind == EdgeKind.MODULE_DEPENDS and src and tgt:
                if src.node_id.startswith("target:"):
                    upstream_modules.add(tgt.module_id)
            elif edge.kind == EdgeKind.REVERSE_DEPENDS and src and tgt:
                if tgt.node_id.startswith("target:") or tgt.module_id.lower() == target_key:
                    downstream_modules.add(src.module_id)

        for module in sorted(upstream_modules):
            lines.append(f"This module depends on {module}")
        for module in sorted(downstream_modules):
            if f"{module} depends on this module" not in " ".join(lines):
                lines.append(f"{module} depends on this module — preserve shared interfaces")

        if not lines:
            modules = sorted(
                {self.nodes[nid].module_id for nid in selected_node_ids if nid in self.nodes},
            )
            if modules:
                lines.append(f"Context spans modules: {', '.join(modules)}")

        return lines[:16]

    @classmethod
    def from_snippets(
        cls,
        snippets: List[ContextSnippet],
        *,
        target_module: str,
        direct_dependencies: List[str],
    ) -> DependencyGraph:
        graph = cls()
        symbol_index: Dict[str, str] = {}
        path_index: Dict[Tuple[str, str], str] = {}

        for snippet in snippets:
            node_id = _node_id(snippet)
            graph.add_node(
                GraphNode(
                    node_id=node_id,
                    module_id=snippet.source_id,
                    path=snippet.path,
                    symbols=list(snippet.symbols),
                ),
            )
            path_index[(snippet.source_id.lower(), snippet.path.lower())] = node_id
            for symbol in snippet.symbols:
                symbol_index.setdefault(symbol, node_id)

        target_key = target_module.strip().lower()
        target_node = GraphNode(
            node_id=f"target:{target_key}",
            module_id=target_module,
            path=f"<generating:{target_module}>",
            symbols=[],
        )
        graph.add_node(target_node)

        for dep in direct_dependencies:
            dep_key = dep.strip()
            if not dep_key:
                continue
            dep_nodes = [
                node_id
                for node_id, node in graph.nodes.items()
                if node.module_id.lower() == dep_key.lower()
            ]
            for dep_node in dep_nodes:
                graph.add_edge(
                    DependencyEdge(
                        source=target_node.node_id,
                        target=dep_node,
                        kind=EdgeKind.MODULE_DEPENDS,
                        symbol=dep_key,
                    ),
                )

        for snippet in snippets:
            source_id = _node_id(snippet)
            if source_id not in graph.nodes:
                continue
            for edge in _extract_snippet_edges(snippet, symbol_index, path_index, graph):
                graph.add_edge(edge)

        _link_target_dependents(graph, target_module, snippets)
        return graph


def _node_id(snippet: ContextSnippet) -> str:
    return f"{snippet.source_id}:{snippet.path}"


def _extract_snippet_edges(
    snippet: ContextSnippet,
    symbol_index: Dict[str, str],
    path_index: Dict[Tuple[str, str], str],
    graph: DependencyGraph,
) -> List[DependencyEdge]:
    source_id = _node_id(snippet)
    edges: List[DependencyEdge] = []
    content = snippet.content

    if snippet.language == "typescript":
        for pattern in (TS_IMPORT_FROM, TS_IMPORT_SIDE):
            for match in pattern.finditer(content):
                target = _resolve_import_target(
                    match.group(1),
                    snippet,
                    path_index,
                    symbol_index,
                )
                if target and target != source_id:
                    edges.append(
                        DependencyEdge(
                            source=source_id,
                            target=target,
                            kind=EdgeKind.IMPORT,
                            symbol=match.group(1),
                        ),
                    )

        for match in TS_EXTENDS.finditer(content):
            parent = match.group(1)
            target = symbol_index.get(parent)
            if target and target != source_id:
                edges.append(
                    DependencyEdge(
                        source=source_id,
                        target=target,
                        kind=EdgeKind.EXTENDS,
                        symbol=parent,
                    ),
                )

        for match in TS_IMPLEMENTS.finditer(content):
            for iface in re.findall(r"\w+", match.group(1)):
                target = symbol_index.get(iface)
                if target and target != source_id:
                    edges.append(
                        DependencyEdge(
                            source=source_id,
                            target=target,
                            kind=EdgeKind.IMPLEMENTS,
                            symbol=iface,
                        ),
                    )
    else:
        for match in PY_FROM_IMPORT.finditer(content):
            target = _resolve_python_import(match.group(1), snippet, path_index)
            if target and target != source_id:
                edges.append(
                    DependencyEdge(
                        source=source_id,
                        target=target,
                        kind=EdgeKind.IMPORT,
                        symbol=match.group(1),
                    ),
                )

    return edges


def _resolve_import_target(
    import_path: str,
    snippet: ContextSnippet,
    path_index: Dict[Tuple[str, str], str],
    symbol_index: Dict[str, str],
) -> Optional[str]:
    normalized = import_path.replace("\\", "/").lower()
    basename = normalized.split("/")[-1].replace(".ts", "").replace(".tsx", "")

    for (module_id, path), node_id in path_index.items():
        if module_id in normalized or normalized.endswith(path.rsplit("/", 1)[-1].lower()):
            return node_id
        if basename and basename in path.lower():
            return node_id

    return symbol_index.get(basename)


def _resolve_python_import(
    module_path: str,
    snippet: ContextSnippet,
    path_index: Dict[Tuple[str, str], str],
) -> Optional[str]:
    parts = module_path.split(".")
    for (module_id, path), node_id in path_index.items():
        if module_id.startswith(parts[0]) or path.lower().endswith(f"{parts[-1]}.py"):
            return node_id
    return None


def _link_target_dependents(
    graph: DependencyGraph,
    target_module: str,
    snippets: List[ContextSnippet],
) -> None:
    """
    Link downstream modules that import or implement the generation target.

    Enables transitive discovery: generating module-a pulls in module-c when
    module-c imports module-a — without module-c in ComponentSpec.dependencies.
    """
    target_key = target_module.strip().lower()
    target_node = f"target:{target_key}"
    if target_node not in graph.nodes:
        return

    target_surface_nodes = {
        node_id
        for node_id, node in graph.nodes.items()
        if node.module_id.lower() == target_key and not node_id.startswith("target:")
    }

    for snippet in snippets:
        node_id = _node_id(snippet)
        if node_id not in graph.nodes or node_id.startswith("target:"):
            continue
        if snippet.source_id.lower() == target_key:
            continue

        content_lower = snippet.content.lower()
        imports_target = (
            target_key in content_lower
            or target_key.replace("-", "") in content_lower.replace("-", "")
            or any(
                target_key in edge.symbol.lower()
                for edge in graph.edges
                if edge.source == node_id and edge.kind == EdgeKind.IMPORT
            )
        )
        implements_target = any(
            edge.source == node_id
            and edge.target in target_surface_nodes
            and edge.kind in {EdgeKind.IMPLEMENTS, EdgeKind.EXTENDS}
            for edge in graph.edges
        )

        if imports_target or implements_target:
            graph.add_edge(
                DependencyEdge(
                    source=node_id,
                    target=target_node,
                    kind=EdgeKind.REVERSE_DEPENDS,
                    symbol=target_module,
                ),
            )

        for surface_node in target_surface_nodes:
            if any(
                edge.source == node_id and edge.target == surface_node
                for edge in graph.edges
            ):
                graph.add_edge(
                    DependencyEdge(
                        source=node_id,
                        target=target_node,
                        kind=EdgeKind.REVERSE_DEPENDS,
                        symbol=target_module,
                    ),
                )
