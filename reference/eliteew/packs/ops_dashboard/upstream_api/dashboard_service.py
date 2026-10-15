#!/usr/bin/env python3
"""
Marketing Cabinet Dashboard Service
Business logic for dashboard layouts, widgets, and presets with RLS
"""

import json
import logging
from typing import Any
from uuid import UUID, uuid4

import asyncpg  # type: ignore[import-not-found]
from fastapi import HTTPException, status  # type: ignore[import-untyped]

from api.core.unified_config import unified_settings
from api.schemas.marketing_cabinet.dashboard import (
    DashboardLayoutCreate,
    DashboardLayoutResponse,
    DashboardLayoutType,
    DashboardLayoutUpdate,
    DashboardUsageStats,
    GridPosition,
    WidgetCreate,
    WidgetResponse,
    WidgetUpdate,
)
from api.services.marketing_cabinet.dashboard_widget_config import (
    MARKETING_DASHBOARD_WIDGET_KEYS,
    clamp_grid_position_for_widget_key,
    sanitize_widget_config,
)

# Must match EliteEW/web/frontend OverviewInteractiveDashboard DASHBOARD_LAYOUT_EXPORT_SCHEMA_VERSION
DASHBOARD_LAYOUT_EXPORT_SCHEMA_VERSION = 1

logger = logging.getLogger(__name__)

# Constants
MAX_VALUE_PREVIEW_LENGTH = 100


def parse_jsonb_field(value: Any, default: Any = None) -> Any:  # noqa: ANN401
    """
    Safely parse JSONB field from PostgreSQL

    PostgreSQL JSONB fields can come as:
    1. dict (if asyncpg auto-parses)
    2. JSON string (if asyncpg returns raw JSON)
    3. None (if NULL in DB)

    Args:
        value: Field value from PostgreSQL
        default: Default value if None (defaults to {} for dicts, [] for lists)

    Returns:
        Parsed Python object (dict/list) or default
    """
    if value is None:
        return default if default is not None else {}

    if isinstance(value, (dict, list)):
        # Already parsed by asyncpg
        return value

    if isinstance(value, str):
        # JSON string - need to parse
        try:
            return json.loads(value)
        except (json.JSONDecodeError, ValueError) as e:
            preview = value[:MAX_VALUE_PREVIEW_LENGTH] if len(value) > MAX_VALUE_PREVIEW_LENGTH else value
            logger.warning("Failed to parse JSONB field: %s. Value: %s", e, preview)
            return default if default is not None else {}

    # Unknown type - return as is or default
    logger.warning("Unexpected JSONB field type: %s. Value: %s", type(value), value)
    return default if default is not None else {}


class DashboardService:
    """
    Dashboard service with Row-Level Security
    Manages layouts, widgets, and presets per user
    """

    def __init__(self, db_pool: asyncpg.Pool) -> None:
        """
        Initialize service with database pool

        Args:
            db_pool: asyncpg connection pool
        """
        self.db_pool = db_pool

    async def _set_rls_context(self, conn: asyncpg.Connection, user_id: str) -> None:
        """Set RLS context for current user"""
        try:
            await conn.execute("SELECT set_config('app.current_user_id', $1, FALSE)", user_id)
            logger.debug("RLS context set for user: %s", user_id)
        except asyncpg.PostgresError:
            logger.exception("Failed to set RLS context")
            raise

    async def _touch_layout_updated_at(self, conn: asyncpg.Connection, layout_id: UUID) -> None:
        """Bump parent layout row so clients keyed on layout.updated_at see widget mutations."""
        await conn.execute(
            """
            UPDATE marketing_dashboard_layouts
            SET updated_at = CURRENT_TIMESTAMP
            WHERE id = $1::uuid
            """,
            str(layout_id),
        )

    async def _get_layout_on_conn(
        self, conn: asyncpg.Connection, layout_id: UUID, user_id: str
    ) -> DashboardLayoutResponse | None:
        """
        Load layout and widgets on an existing connection.
        Use inside an open transaction so uncommitted inserts/updates are visible.
        """
        await self._set_rls_context(conn, user_id)  # type: ignore[arg-type]

        layout_row = await conn.fetchrow(
            """
                SELECT id, user_id, project_id, name, type, description,
                       layout_config, settings, is_active, is_default,
                       created_at, updated_at, last_accessed_at
                FROM marketing_dashboard_layouts
                WHERE id = $1::uuid
                """,
            str(layout_id),
        )

        if not layout_row:
            return None

        widget_rows = await conn.fetch(
            """
                SELECT id, layout_id, widget_key, widget_title, widget_config,
                       grid_position, is_visible, is_locked, display_order,
                       created_at, updated_at
                FROM marketing_dashboard_widgets
                WHERE layout_id = $1::uuid
                ORDER BY display_order ASC, created_at ASC
                """,
            str(layout_id),
        )

        widgets = [
            WidgetResponse(
                id=w["id"],
                layout_id=w["layout_id"],
                widget_key=w["widget_key"],
                widget_title=w["widget_title"],
                widget_config=parse_jsonb_field(w["widget_config"], {}),
                grid_position=GridPosition(**parse_jsonb_field(w["grid_position"], {})),
                is_visible=w["is_visible"],
                is_locked=w["is_locked"],
                display_order=w["display_order"],
                created_at=w["created_at"],
                updated_at=w["updated_at"],
            )
            for w in widget_rows
        ]

        await conn.execute(
            """
                UPDATE marketing_dashboard_layouts
                SET last_accessed_at = CURRENT_TIMESTAMP
                WHERE id = $1::uuid
                """,
            str(layout_id),
        )

        return DashboardLayoutResponse(
            id=layout_row["id"],
            user_id=layout_row["user_id"],
            project_id=layout_row["project_id"],
            name=layout_row["name"],
            type=layout_row["type"],
            description=layout_row["description"],
            layout_config=parse_jsonb_field(layout_row["layout_config"], {}),
            settings=parse_jsonb_field(layout_row["settings"], {}),
            is_active=layout_row["is_active"],
            is_default=layout_row["is_default"],
            created_at=layout_row["created_at"],
            updated_at=layout_row["updated_at"],
            last_accessed_at=layout_row["last_accessed_at"],
            widgets=widgets,
        )

    # ============================================
    # LAYOUT CRUD OPERATIONS
    # ============================================

    async def create_layout(self, layout_data: DashboardLayoutCreate, user_id: str) -> DashboardLayoutResponse:
        """
        Create new dashboard layout

        Args:
            layout_data: Layout creation data
            user_id: User UUID from OAuth2

        Returns:
            Created layout with ID
        """
        async with self.db_pool.acquire() as conn, conn.transaction():
            await self._set_rls_context(conn, user_id)  # type: ignore[arg-type]

            # Check if layout name already exists for this user/project
            existing = await conn.fetchval(
                """
                SELECT id FROM marketing_dashboard_layouts
                WHERE user_id = $1::uuid
                  AND (project_id = $2::uuid OR (project_id IS NULL AND $2::uuid IS NULL))
                  AND name = $3
                """,
                user_id,
                str(layout_data.project_id) if layout_data.project_id else None,
                layout_data.name,
            )

            if existing:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Layout with name '{layout_data.name}' already exists",
                )

            # If new layout should be active, deactivate others first (explicit, not relying on trigger)
            if layout_data.is_active:
                deactivated = await conn.execute(
                    """
                    UPDATE marketing_dashboard_layouts
                    SET is_active = FALSE
                    WHERE user_id = $1::uuid
                      AND (project_id = $2::uuid OR (project_id IS NULL AND $2::uuid IS NULL))
                      AND is_active = TRUE
                    """,
                    user_id,
                    str(layout_data.project_id) if layout_data.project_id else None,
                )
                logger.info(
                    "Deactivated existing layouts for user %s (is_active=true requested): %s",
                    user_id,
                    deactivated,
                )

            # Create layout
            row = await conn.fetchrow(
                """
                INSERT INTO marketing_dashboard_layouts (
                    user_id, project_id, name, type, description,
                    layout_config, settings, is_active
                )
                VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::jsonb, $7::jsonb, $8)
                RETURNING id, user_id, project_id, name, type, description,
                          layout_config, settings, is_active, is_default,
                          created_at, updated_at, last_accessed_at
                """,
                user_id,
                str(layout_data.project_id) if layout_data.project_id else None,
                layout_data.name,
                layout_data.type.value,
                layout_data.description,
                json.dumps(layout_data.layout_config),
                json.dumps(layout_data.settings),
                layout_data.is_active,
            )

            logger.info("Created dashboard layout: %s for user %s", row["id"], user_id)

            return DashboardLayoutResponse(
                id=row["id"],
                user_id=row["user_id"],
                project_id=row["project_id"],
                name=row["name"],
                type=row["type"],
                description=row["description"],
                layout_config=parse_jsonb_field(row["layout_config"], {}),  # Parse JSONB
                settings=parse_jsonb_field(row["settings"], {}),  # Parse JSONB
                is_active=row["is_active"],
                is_default=row["is_default"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
                last_accessed_at=row["last_accessed_at"],
                widgets=[],
            )

    async def get_layout(self, layout_id: UUID, user_id: str) -> DashboardLayoutResponse | None:
        """
        Get layout by ID with widgets (RLS enforced)

        Args:
            layout_id: Layout UUID
            user_id: User UUID from OAuth2

        Returns:
            Layout with widgets or None
        """
        async with self.db_pool.acquire() as conn:
            return await self._get_layout_on_conn(conn, layout_id, user_id)

    async def list_layouts(
        self,
        user_id: str,
        project_id: UUID | None = None,
        name: str | None = None,
        page: int = 1,
        per_page: int = 20,
    ) -> dict[str, Any]:
        """
        List user's dashboard layouts (RLS enforced)

        Args:
            user_id: User UUID from OAuth2
            project_id: Optional project filter
            name: Optional name filter
            page: Page number
            per_page: Items per page

        Returns:
            Paginated layouts list
        """
        async with self.db_pool.acquire() as conn:
            await self._set_rls_context(conn, user_id)  # type: ignore[arg-type]

            offset = (page - 1) * per_page

            # Build query
            where_conditions = []
            params = []
            param_index = 1

            if project_id:
                where_conditions.append(f"project_id = ${param_index}::uuid")
                params.append(str(project_id))
                param_index += 1

            if name:
                where_conditions.append(f"name = ${param_index}")
                params.append(name)
                param_index += 1

            where_clause = "WHERE " + " AND ".join(where_conditions) if where_conditions else ""

            count_params = params.copy()

            # Get total count
            # Note: where_clause is built from validated inputs, params are passed separately
            total = await conn.fetchval(
                f"""
                SELECT COUNT(*) FROM marketing_dashboard_layouts
                {where_clause}
                """,  # noqa: S608
                *count_params,
            )

            # Get layouts
            order_clause = "ORDER BY is_active DESC, last_accessed_at DESC NULLS LAST, created_at DESC"
            if name:
                # If filtering by name, simple ordering
                order_clause = "ORDER BY created_at DESC"

            # Note: where_clause and order_clause are built from validated inputs, params are passed separately
            rows = await conn.fetch(
                f"""
                SELECT id, user_id, project_id, name, type, description,
                        layout_config, settings, is_active, is_default,
                        created_at, updated_at, last_accessed_at
                FROM marketing_dashboard_layouts
                {where_clause}
                {order_clause}
                LIMIT {per_page} OFFSET {offset}
                """,  # noqa: S608
                *params,
            )

            layouts = [
                DashboardLayoutResponse(
                    id=row["id"],
                    user_id=row["user_id"],
                    project_id=row["project_id"],
                    name=row["name"],
                    type=row["type"],
                    description=row["description"],
                    layout_config=parse_jsonb_field(row["layout_config"], {}),  # Parse JSONB
                    settings=parse_jsonb_field(row["settings"], {}),  # Parse JSONB
                    is_active=row["is_active"],
                    is_default=row["is_default"],
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                    last_accessed_at=row["last_accessed_at"],
                    widgets=[],  # Don't load widgets in list view for performance
                )
                for row in rows
            ]

            return {
                "success": True,
                "data": layouts,
                "total": total,
                "page": page,
                "per_page": per_page,
            }

    async def update_layout(
        self, layout_id: UUID, layout_data: DashboardLayoutUpdate, user_id: str
    ) -> DashboardLayoutResponse | None:
        """
        Update dashboard layout (RLS enforced)

        Args:
            layout_id: Layout UUID
            layout_data: Update data
            user_id: User UUID from OAuth2

        Returns:
            Updated layout or None
        """
        async with self.db_pool.acquire() as conn, conn.transaction():
            await self._set_rls_context(conn, user_id)  # type: ignore[arg-type]

            # Build dynamic update query
            updates = []
            params: list[Any] = [str(layout_id)]
            param_count = 2

            if layout_data.name is not None:
                updates.append(f"name = ${param_count}")
                params.append(layout_data.name)
                param_count += 1

            if layout_data.description is not None:
                updates.append(f"description = ${param_count}")
                params.append(layout_data.description)
                param_count += 1

            if layout_data.layout_config is not None:
                cfg_payload: dict[str, Any] = dict(layout_data.layout_config)
                if layout_data.layout_config_merge:
                    cur_cfg_row = await conn.fetchrow(
                        """
                        SELECT layout_config FROM marketing_dashboard_layouts
                        WHERE id = $1::uuid
                        """,
                        str(layout_id),
                    )
                    base_raw = parse_jsonb_field(cur_cfg_row["layout_config"], {}) if cur_cfg_row else {}
                    base: dict[str, Any] = base_raw if isinstance(base_raw, dict) else {}
                    cfg_payload = {**base, **layout_data.layout_config}
                updates.append(f"layout_config = ${param_count}::jsonb")
                params.append(json.dumps(cfg_payload))
                param_count += 1

            if layout_data.settings is not None:
                updates.append(f"settings = ${param_count}::jsonb")
                params.append(json.dumps(layout_data.settings))
                param_count += 1

            if layout_data.is_active is not None:
                updates.append(f"is_active = ${param_count}")
                params.append(layout_data.is_active)  # asyncpg handles bool directly
                param_count += 1

            if not updates:
                # No updates, return current layout
                return await self._get_layout_on_conn(conn, layout_id, user_id)

            updates.append("updated_at = CURRENT_TIMESTAMP")

            # Note: updates are built from validated inputs, params are passed separately
            row = await conn.fetchrow(
                f"""
                    UPDATE marketing_dashboard_layouts
                    SET {", ".join(updates)}
                    WHERE id = $1::uuid
                    RETURNING id, user_id, project_id, name, type, description,
                              layout_config, settings, is_active, is_default,
                              created_at, updated_at, last_accessed_at
                    """,  # noqa: S608
                *params,
            )

            if not row:
                return None

            logger.info("Updated dashboard layout: %s", layout_id)

            return DashboardLayoutResponse(
                id=row["id"],
                user_id=row["user_id"],
                project_id=row["project_id"],
                name=row["name"],
                type=row["type"],
                description=row["description"],
                layout_config=parse_jsonb_field(row["layout_config"], {}),  # Parse JSONB
                settings=parse_jsonb_field(row["settings"], {}),  # Parse JSONB
                is_active=row["is_active"],
                is_default=row["is_default"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
                last_accessed_at=row["last_accessed_at"],
                widgets=[],
            )

    async def delete_layout(self, layout_id: UUID, user_id: str) -> bool:
        """
        Delete dashboard layout (RLS enforced, cascades to widgets)

        Args:
            layout_id: Layout UUID
            user_id: User UUID from OAuth2

        Returns:
            True if deleted, False if not found
        """
        async with self.db_pool.acquire() as conn, conn.transaction():
            await self._set_rls_context(conn, user_id)  # type: ignore[arg-type]

            result = await conn.execute(
                """
                    DELETE FROM marketing_dashboard_layouts
                    WHERE id = $1::uuid
                    """,
                str(layout_id),
            )

            deleted = result.split()[-1] == "1"
            if deleted:
                logger.info("Deleted dashboard layout: %s", layout_id)

            return bool(deleted)

    # ============================================
    # LAYOUT ACTIVATION
    # ============================================

    async def activate_layout(self, layout_id: UUID, user_id: str, project_id: UUID | None = None) -> dict[str, Any]:
        """
        Set layout as active (automatically deactivates others via trigger)

        Args:
            layout_id: Layout UUID to activate
            user_id: User UUID from OAuth2
            project_id: Optional project context

        Returns:
            Activation result with previous active ID
        """
        async with self.db_pool.acquire() as conn, conn.transaction():
            await self._set_rls_context(conn, user_id)  # type: ignore[arg-type]

            # Get current active layout
            previous_active = await conn.fetchval(
                """
                    SELECT id FROM marketing_dashboard_layouts
                    WHERE user_id = $1::uuid
                      AND (project_id = $2::uuid OR (project_id IS NULL AND $2::uuid IS NULL))
                      AND is_active = TRUE
                    """,
                user_id,
                str(project_id) if project_id else None,
            )

            # Activate new layout (trigger will deactivate others)
            updated = await conn.fetchval(
                """
                    UPDATE marketing_dashboard_layouts
                    SET is_active = TRUE
                    WHERE id = $1::uuid
                    RETURNING id
                    """,
                str(layout_id),
            )

            if not updated:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Layout not found")

            logger.info("Activated dashboard layout: %s (previous: %s)", layout_id, previous_active)

            return {
                "success": True,
                "message": "Layout activated successfully",
                "layout_id": layout_id,
                "previous_active_id": previous_active,
            }

    async def get_active_layout(self, user_id: str, project_id: UUID | None = None) -> DashboardLayoutResponse | None:
        """
        Get currently active layout for user/project

        Args:
            user_id: User UUID from OAuth2
            project_id: Optional project filter

        Returns:
            Active layout or None
        """
        async with self.db_pool.acquire() as conn:
            await self._set_rls_context(conn, user_id)  # type: ignore[arg-type]

            row = await conn.fetchrow(
                """
                SELECT id FROM marketing_dashboard_layouts
                WHERE user_id = $1::uuid
                  AND (project_id = $2::uuid OR (project_id IS NULL AND $2::uuid IS NULL))
                  AND is_active = TRUE
                LIMIT 1
                """,
                user_id,
                str(project_id) if project_id else None,
            )

            if not row:
                return None

            return await self._get_layout_on_conn(conn, row["id"], user_id)

    # ============================================
    # PRESET OPERATIONS
    # ============================================

    async def _rebuild_layout_from_preset_template(
        self,
        conn: asyncpg.Connection,
        *,
        layout_id: UUID,
        preset_name: str,
    ) -> None:
        """Replace all widgets and layout metadata from the preset row in DB (same source as SQL create_layout_from_preset)."""
        preset_row = await conn.fetchrow(
            """
            SELECT id, description, template_config
            FROM marketing_dashboard_presets
            WHERE name = $1 AND is_active = TRUE
            """,
            preset_name,
        )
        if not preset_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Preset '{preset_name}' not found",
            )

        template_config = parse_jsonb_field(preset_row["template_config"], {})
        layout_obj = template_config.get("layout")
        if not isinstance(layout_obj, dict):
            layout_obj = {}

        widgets_raw = template_config.get("widgets")
        if not isinstance(widgets_raw, list):
            widgets_raw = []

        cap = unified_settings.marketing_dashboard_max_widgets_per_layout
        if len(widgets_raw) > cap:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Preset template exceeds dashboard widget limit ({cap})",
            )

        description = layout_obj.get("description")
        if not isinstance(description, str):
            description = preset_row["description"]

        layout_config = layout_obj.get("layout_config")
        if not isinstance(layout_config, dict):
            layout_config = {}
        settings = layout_obj.get("settings")
        if not isinstance(settings, dict):
            settings = {}

        layout_type = await conn.fetchval(
            """
            SELECT type FROM marketing_dashboard_layouts
            WHERE id = $1::uuid
            """,
            str(layout_id),
        )
        if layout_type != "preset":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="rebuild_existing applies only to preset-type layouts",
            )

        await conn.execute(
            """
            UPDATE marketing_dashboard_layouts
            SET description = $2,
                layout_config = $3::jsonb,
                settings = $4::jsonb,
                updated_at = CURRENT_TIMESTAMP,
                is_active = TRUE
            WHERE id = $1::uuid
            """,
            str(layout_id),
            description,
            json.dumps(layout_config),
            json.dumps(settings),
        )

        await conn.execute(
            "DELETE FROM marketing_dashboard_widgets WHERE layout_id = $1::uuid",
            str(layout_id),
        )

        for w in widgets_raw:
            if not isinstance(w, dict):
                continue
            wk = w.get("widget_key") or "widget"
            if not isinstance(wk, str) or wk not in MARKETING_DASHBOARD_WIDGET_KEYS:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid widget_key in preset template: {wk!r}",
                )
            title_raw = w.get("widget_title") or wk
            title = title_raw.strip() if isinstance(title_raw, str) else str(wk)
            if not title:
                title = str(wk)
            cfg = sanitize_widget_config(wk, parse_jsonb_field(w.get("widget_config"), {}))
            gp_raw = w.get("grid_position")
            if isinstance(gp_raw, dict):
                try:
                    gp = GridPosition.model_validate(gp_raw)
                except Exception:
                    gp = GridPosition()
            else:
                gp = GridPosition()

            is_vis = w.get("is_visible")
            if not isinstance(is_vis, bool):
                is_vis = True
            is_lk = w.get("is_locked")
            if not isinstance(is_lk, bool):
                is_lk = False
            disp_raw = w.get("display_order")
            if isinstance(disp_raw, bool):
                disp = 0
            elif isinstance(disp_raw, int):
                disp = disp_raw
            elif isinstance(disp_raw, float) and not isinstance(disp_raw, bool):
                disp = int(disp_raw)
            else:
                disp = 0

            await conn.execute(
                """
                INSERT INTO marketing_dashboard_widgets (
                    layout_id, widget_key, widget_title, widget_config,
                    grid_position, is_visible, is_locked, display_order
                )
                VALUES ($1::uuid, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8)
                """,
                str(layout_id),
                wk,
                title,
                json.dumps(cfg),
                json.dumps(clamp_grid_position_for_widget_key(wk, gp.model_dump())),
                is_vis,
                is_lk,
                disp,
            )

        await conn.execute(
            """
            UPDATE marketing_dashboard_presets
            SET usage_count = usage_count + 1, updated_at = NOW()
            WHERE id = $1::uuid
            """,
            str(preset_row["id"]),
        )

        await self._touch_layout_updated_at(conn, layout_id)
        logger.info("Rebuilt preset layout %s from template %s", layout_id, preset_name)

    async def import_layout_from_export(
        self,
        *,
        layout_payload: dict[str, Any],
        user_id: str,
        project_id: UUID,
    ) -> DashboardLayoutResponse:
        """Create a new custom layout and widgets from a frontend export envelope ``layout`` object."""
        widgets = layout_payload.get("widgets")
        if not isinstance(widgets, list) or len(widgets) < 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Import requires a non-empty widgets array",
            )

        cap = unified_settings.marketing_dashboard_max_widgets_per_layout
        if len(widgets) > cap:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Import exceeds dashboard widget limit ({cap})",
            )

        for w in widgets:
            if not isinstance(w, dict):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Each widget must be an object",
                )
            wk = w.get("widget_key")
            if not isinstance(wk, str) or wk not in MARKETING_DASHBOARD_WIDGET_KEYS:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Unknown or invalid widget_key: {wk!r}",
                )

        base_name = str(layout_payload.get("name") or "Imported layout").strip() or "Imported layout"
        import_name = f"{base_name[:120]} ({uuid4().hex[:8]})"
        description = layout_payload.get("description")
        if description is not None and not isinstance(description, str):
            description = None
        layout_config = layout_payload.get("layout_config")
        if not isinstance(layout_config, dict):
            layout_config = {}
        settings = layout_payload.get("settings")
        if not isinstance(settings, dict):
            settings = {}

        async with self.db_pool.acquire() as conn, conn.transaction():
            await self._set_rls_context(conn, user_id)  # type: ignore[arg-type]

            await conn.execute(
                """
                UPDATE marketing_dashboard_layouts
                SET is_active = FALSE
                WHERE user_id = $1::uuid
                  AND (project_id = $2::uuid OR (project_id IS NULL AND $2::uuid IS NULL))
                  AND is_active = TRUE
                """,
                user_id,
                str(project_id),
            )

            row = await conn.fetchrow(
                """
                INSERT INTO marketing_dashboard_layouts (
                    user_id, project_id, name, type, description,
                    layout_config, settings, is_active
                )
                VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::jsonb, $7::jsonb, TRUE)
                RETURNING id
                """,
                user_id,
                str(project_id),
                import_name,
                DashboardLayoutType.custom.value,
                description,
                json.dumps(layout_config),
                json.dumps(settings),
            )
            if not row:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to create imported layout",
                )
            layout_id = UUID(str(row["id"]))

            for w in widgets:
                assert isinstance(w, dict)
                wk = str(w["widget_key"])
                title_raw = w.get("widget_title") or wk
                title = title_raw.strip() if isinstance(title_raw, str) else wk
                if not title:
                    title = wk
                cfg = sanitize_widget_config(wk, parse_jsonb_field(w.get("widget_config"), {}))
                gp_raw = w.get("grid_position")
                if isinstance(gp_raw, dict):
                    try:
                        gp = GridPosition.model_validate(gp_raw)
                    except Exception:
                        gp = GridPosition()
                else:
                    gp = GridPosition()

                is_vis = w.get("is_visible")
                if not isinstance(is_vis, bool):
                    is_vis = True
                is_lk = w.get("is_locked")
                if not isinstance(is_lk, bool):
                    is_lk = False
                disp_raw = w.get("display_order")
                if isinstance(disp_raw, bool):
                    disp = 0
                elif isinstance(disp_raw, int):
                    disp = disp_raw
                elif isinstance(disp_raw, float) and not isinstance(disp_raw, bool):
                    disp = int(disp_raw)
                else:
                    disp = 0

                await conn.execute(
                    """
                    INSERT INTO marketing_dashboard_widgets (
                        layout_id, widget_key, widget_title, widget_config,
                        grid_position, is_visible, is_locked, display_order
                    )
                    VALUES ($1::uuid, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8)
                    """,
                    str(layout_id),
                    wk,
                    title,
                    json.dumps(cfg),
                    json.dumps(clamp_grid_position_for_widget_key(wk, gp.model_dump())),
                    is_vis,
                    is_lk,
                    disp,
                )

            await self._touch_layout_updated_at(conn, layout_id)
            out = await self._get_layout_on_conn(conn, layout_id, user_id)
            if out is None:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to load imported layout",
                )
            return out

    # ============================================
    # USER LAYOUT TEMPLATES (project_id NULL, cross-project)
    # ============================================

    async def list_layout_templates(
        self,
        user_id: str,
        *,
        page: int = 1,
        per_page: int = 50,
    ) -> dict[str, Any]:
        """List saved dashboard layout templates for the user (``project_id IS NULL``, type ``custom``)."""
        async with self.db_pool.acquire() as conn:
            await self._set_rls_context(conn, user_id)  # type: ignore[arg-type]

            offset = (page - 1) * per_page
            total = await conn.fetchval(
                """
                SELECT COUNT(*) FROM marketing_dashboard_layouts
                WHERE user_id = $1::uuid
                  AND project_id IS NULL
                  AND type = $2
                """,
                user_id,
                DashboardLayoutType.custom.value,
            )

            rows = await conn.fetch(
                """
                SELECT id, user_id, project_id, name, type, description,
                       layout_config, settings, is_active, is_default,
                       created_at, updated_at, last_accessed_at
                FROM marketing_dashboard_layouts
                WHERE user_id = $1::uuid
                  AND project_id IS NULL
                  AND type = $2
                ORDER BY updated_at DESC, created_at DESC
                LIMIT $3 OFFSET $4
                """,
                user_id,
                DashboardLayoutType.custom.value,
                per_page,
                offset,
            )

            layouts = [
                DashboardLayoutResponse(
                    id=row["id"],
                    user_id=row["user_id"],
                    project_id=row["project_id"],
                    name=row["name"],
                    type=row["type"],
                    description=row["description"],
                    layout_config=parse_jsonb_field(row["layout_config"], {}),
                    settings=parse_jsonb_field(row["settings"], {}),
                    is_active=row["is_active"],
                    is_default=row["is_default"],
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                    last_accessed_at=row["last_accessed_at"],
                    widgets=[],
                )
                for row in rows
            ]

            return {
                "success": True,
                "data": layouts,
                "total": int(total or 0),
                "page": page,
                "per_page": per_page,
            }

    async def save_active_layout_as_template(
        self,
        *,
        user_id: str,
        source_project_id: UUID,
        name: str,
        description: str | None = None,
    ) -> DashboardLayoutResponse:
        """Snapshot the active project layout into a user template row (no ``project_id``)."""
        trimmed = name.strip()
        if not trimmed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Template name must not be empty",
            )

        active = await self.get_active_layout(user_id, source_project_id)
        if active is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No active dashboard layout for this project",
            )
        if not active.widgets:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Active layout has no widgets to save",
            )

        cap = unified_settings.marketing_dashboard_max_widgets_per_layout
        if len(active.widgets) > cap:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Layout exceeds dashboard widget limit ({cap})",
            )

        desc = description if description is not None else active.description

        async with self.db_pool.acquire() as conn, conn.transaction():
            await self._set_rls_context(conn, user_id)  # type: ignore[arg-type]

            existing = await conn.fetchval(
                """
                SELECT id FROM marketing_dashboard_layouts
                WHERE user_id = $1::uuid
                  AND project_id IS NULL
                  AND name = $2
                """,
                user_id,
                trimmed,
            )
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Template with name '{trimmed}' already exists",
                )

            row = await conn.fetchrow(
                """
                INSERT INTO marketing_dashboard_layouts (
                    user_id, project_id, name, type, description,
                    layout_config, settings, is_active
                )
                VALUES ($1::uuid, NULL, $2, $3, $4, $5::jsonb, $6::jsonb, FALSE)
                RETURNING id
                """,
                user_id,
                trimmed,
                DashboardLayoutType.custom.value,
                desc,
                json.dumps(active.layout_config),
                json.dumps(active.settings),
            )
            if not row:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to create template",
                )
            new_id = UUID(str(row["id"]))

            for w in active.widgets:
                await conn.execute(
                    """
                    INSERT INTO marketing_dashboard_widgets (
                        layout_id, widget_key, widget_title, widget_config,
                        grid_position, is_visible, is_locked, display_order
                    )
                    VALUES ($1::uuid, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8)
                    """,
                    str(new_id),
                    w.widget_key,
                    w.widget_title,
                    json.dumps(w.widget_config),
                    json.dumps(w.grid_position.model_dump()),
                    w.is_visible,
                    w.is_locked,
                    w.display_order,
                )

            await self._touch_layout_updated_at(conn, new_id)
            out = await self._get_layout_on_conn(conn, new_id, user_id)
            if out is None:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to load template",
                )
            return out

    async def delete_layout_template(self, layout_id: UUID, user_id: str) -> None:
        """Delete a user template (must be ``project_id IS NULL`` and type ``custom``)."""
        async with self.db_pool.acquire() as conn, conn.transaction():
            await self._set_rls_context(conn, user_id)  # type: ignore[arg-type]

            row = await conn.fetchrow(
                """
                SELECT id, project_id, type FROM marketing_dashboard_layouts
                WHERE id = $1::uuid
                """,
                str(layout_id),
            )
            if not row:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
            if row["project_id"] is not None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Not a user layout template (project-bound layout)",
                )
            if row["type"] != DashboardLayoutType.custom.value:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Only custom templates can be deleted here",
                )

            result = await conn.execute(
                """
                DELETE FROM marketing_dashboard_layouts
                WHERE id = $1::uuid
                """,
                str(layout_id),
            )
            if result.split()[-1] != "1":
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")

    async def apply_layout_template_to_project(
        self,
        *,
        template_layout_id: UUID,
        user_id: str,
        target_project_id: UUID,
    ) -> DashboardLayoutResponse:
        """Create a new active custom layout in ``target_project_id`` from a user template."""
        template = await self.get_layout(template_layout_id, user_id)
        if template is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
        if template.project_id is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Layout is not a user template (expected no project binding)",
            )
        if template.type != DashboardLayoutType.custom.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only custom user layouts can be applied as templates",
            )
        if not template.widgets:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Template has no widgets",
            )

        widgets_payload: list[dict[str, Any]] = []
        for w in template.widgets:
            widgets_payload.append(
                {
                    "widget_key": w.widget_key,
                    "widget_title": w.widget_title,
                    "widget_config": w.widget_config,
                    "grid_position": w.grid_position.model_dump(),
                    "is_visible": w.is_visible,
                    "is_locked": w.is_locked,
                    "display_order": w.display_order,
                }
            )

        layout_payload: dict[str, Any] = {
            "name": template.name,
            "description": template.description,
            "layout_config": template.layout_config,
            "settings": template.settings,
            "widgets": widgets_payload,
        }
        return await self.import_layout_from_export(
            layout_payload=layout_payload,
            user_id=user_id,
            project_id=target_project_id,
        )

    async def create_layout_from_preset(
        self,
        preset_name: str,
        user_id: str,
        project_id: UUID | None = None,
        custom_name: str | None = None,
        rebuild_existing: bool = False,
    ) -> DashboardLayoutResponse:
        """
        Create layout from system preset using SQL function, or activate an existing preset layout.

        Args:
            preset_name: Preset identifier
            user_id: User UUID from OAuth2
            project_id: Optional project ID
            custom_name: Optional custom name (defaults to preset display name)
            rebuild_existing: When a matching preset layout already exists, replace its widgets
                from the current DB template instead of only activating the row.

        Returns:
            Created layout with widgets
        """
        async with self.db_pool.acquire() as conn, conn.transaction():
            await self._set_rls_context(conn, user_id)  # type: ignore[arg-type]

            # Display name + template (for widget-count cap before SQL create_layout_from_preset)
            preset_info = await conn.fetchrow(
                """
                SELECT display_name, template_config FROM marketing_dashboard_presets
                WHERE name = $1 AND is_active = TRUE
                """,
                preset_name,
            )

            if not preset_info:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Preset '{preset_name}' not found",
                )

            layout_name = custom_name or preset_info["display_name"]
            template_cfg = parse_jsonb_field(preset_info["template_config"], {})
            widgets_tpl = template_cfg.get("widgets")
            if not isinstance(widgets_tpl, list):
                widgets_tpl = []
            widget_cap = unified_settings.marketing_dashboard_max_widgets_per_layout

            # Check if layout already exists (find the most recent one)
            existing_layout = await conn.fetchrow(
                """
                SELECT id FROM marketing_dashboard_layouts
                WHERE user_id = $1::uuid
                  AND (project_id = $2::uuid OR (project_id IS NULL AND $2::uuid IS NULL))
                  AND name = $3
                  AND type = 'preset'
                ORDER BY created_at DESC
                LIMIT 1
                """,
                user_id,
                str(project_id) if project_id else None,
                layout_name,
            )

            if existing_layout:
                # Clean up any duplicate layouts (keep only the most recent one)
                await conn.execute(
                    """
                    DELETE FROM marketing_dashboard_layouts
                    WHERE user_id = $1::uuid
                      AND (project_id = $2::uuid OR (project_id IS NULL AND $2::uuid IS NULL))
                      AND name = $3
                      AND type = 'preset'
                      AND id != $4::uuid
                    """,
                    user_id,
                    str(project_id) if project_id else None,
                    layout_name,
                    str(existing_layout["id"]),
                )

                if rebuild_existing:
                    await self._rebuild_layout_from_preset_template(
                        conn,
                        layout_id=UUID(str(existing_layout["id"])),
                        preset_name=preset_name,
                    )
                    layout = await self._get_layout_on_conn(conn, UUID(str(existing_layout["id"])), user_id)
                    if layout is None:
                        msg = f"Layout {existing_layout['id']} not found after rebuild"
                        raise ValueError(msg)
                    return layout

                # Clean up duplicate widgets within this layout (keep only the oldest one per widget_key)
                await conn.execute(
                    """
                    DELETE FROM marketing_dashboard_widgets
                    WHERE layout_id = $1::uuid
                      AND id NOT IN (
                          SELECT DISTINCT ON (widget_key) id
                          FROM marketing_dashboard_widgets
                          WHERE layout_id = $1::uuid
                          ORDER BY widget_key, created_at ASC
                      )
                    """,
                    str(existing_layout["id"]),
                )

                # Layout already exists, just activate it
                await conn.execute(
                    """
                    UPDATE marketing_dashboard_layouts
                    SET is_active = TRUE
                    WHERE id = $1::uuid
                    """,
                    str(existing_layout["id"]),
                )
                logger.info(
                    "Activated existing layout from preset '%s': %s",
                    preset_name,
                    existing_layout["id"],
                )
                layout = await self._get_layout_on_conn(conn, existing_layout["id"], user_id)
                if layout is None:
                    msg = f"Layout {existing_layout['id']} not found after activation"
                    raise ValueError(msg)
                return layout

            # Create new layout from preset (SQL function has no cap; enforce here — C.34 / Wave 21)
            if len(widgets_tpl) > widget_cap:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Preset template exceeds dashboard widget limit ({widget_cap})",
                )

            new_layout_id = await conn.fetchval(
                """
                SELECT create_layout_from_preset($1, $2::uuid, $3::uuid)
                """,
                preset_name,
                user_id,
                str(project_id) if project_id else None,
            )

            if not new_layout_id:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Failed to create layout from preset '{preset_name}'",
                )

            # Clean up any duplicate widgets that might have been created
            await conn.execute(
                """
                DELETE FROM marketing_dashboard_widgets
                WHERE layout_id = $1::uuid
                  AND id NOT IN (
                      SELECT DISTINCT ON (widget_key) id
                      FROM marketing_dashboard_widgets
                      WHERE layout_id = $1::uuid
                      ORDER BY widget_key, created_at ASC
                  )
                """,
                str(new_layout_id),
            )

            # Optionally rename layout
            if custom_name:
                await conn.execute(
                    """
                    UPDATE marketing_dashboard_layouts
                    SET name = $2
                    WHERE id = $1::uuid
                    """,
                    str(new_layout_id),
                    custom_name,
                )

            logger.info("Created layout from preset '%s': %s", preset_name, new_layout_id)

            layout = await self._get_layout_on_conn(conn, UUID(str(new_layout_id)), user_id)
            if not layout:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Failed to retrieve created layout from preset '{preset_name}'",
                )
            return layout

    async def cleanup_duplicate_widgets(self, user_id: str) -> dict[str, Any]:
        """
        Remove duplicate widgets from user's layouts
        Keeps only one widget per layout per widget_key
        """
        async with self.db_pool.acquire() as conn, conn.transaction():
            await self._set_rls_context(conn, user_id)  # type: ignore[arg-type]

            # Find and remove duplicates, keeping the one with smallest ID (oldest)
            result = await conn.fetch(
                """
                    DELETE FROM marketing_dashboard_widgets
                    WHERE id IN (
                        SELECT id FROM (
                            SELECT id,
                                   ROW_NUMBER() OVER (
                                       PARTITION BY layout_id, widget_key
                                       ORDER BY created_at ASC
                                   ) as rn
                            FROM marketing_dashboard_widgets w
                            WHERE layout_id IN (
                                SELECT id FROM marketing_dashboard_layouts
                                WHERE user_id = $1::uuid
                            )
                        ) duplicates
                        WHERE rn > 1
                    )
                    """,
                user_id,
            )

            deleted_count = len(result)

            logger.info("Cleaned up %s duplicate widgets for user %s", deleted_count, user_id)

            return {
                "success": True,
                "deleted_count": deleted_count,
                "message": f"Removed {deleted_count} duplicate widgets",
            }

    async def list_presets(self) -> list[dict[str, Any]]:
        """
        List all public active presets

        Returns:
            List of preset configurations (always returns a list, never None)
        """
        try:
            async with self.db_pool.acquire() as conn:
                rows = await conn.fetch(
                    """
                    SELECT id, name, display_name, description, category,
                           template_config, usage_count, version,
                           created_at, updated_at
                    FROM marketing_dashboard_presets
                    WHERE is_public = TRUE AND is_active = TRUE
                    ORDER BY category, display_name
                    """
                )

                result: list[dict[str, Any]] = []
                for row in rows or []:
                    d = dict(row)
                    d["template_config"] = parse_jsonb_field(d.get("template_config"), {})
                    result.append(d)
                return result
        except asyncpg.PostgresError:
            logger.exception("Failed to list presets")
            return []
        except (TimeoutError, OSError, ConnectionError) as e:
            logger.warning("List presets unavailable (connection): %s", e)
            return []

    # ============================================
    # WIDGET OPERATIONS
    # ============================================

    async def add_widget(self, widget_data: WidgetCreate, user_id: str) -> WidgetResponse:
        """
        Add widget to layout (RLS enforced via layout ownership)

        Args:
            widget_data: Widget creation data
            user_id: User UUID from OAuth2

        Returns:
            Created widget
        """
        async with self.db_pool.acquire() as conn, conn.transaction():
            await self._set_rls_context(conn, user_id)  # type: ignore[arg-type]

            # Verify layout ownership (RLS will handle this)
            layout_exists = await conn.fetchval(
                """
                    SELECT EXISTS(
                        SELECT 1 FROM marketing_dashboard_layouts WHERE id = $1::uuid
                    )
                    """,
                str(widget_data.layout_id),
            )

            if not layout_exists:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Layout not found or access denied",
                )

            widget_count = await conn.fetchval(
                """
                SELECT COUNT(*)::int FROM marketing_dashboard_widgets
                WHERE layout_id = $1::uuid
                """,
                str(widget_data.layout_id),
            )
            cap = unified_settings.marketing_dashboard_max_widgets_per_layout
            if int(widget_count or 0) >= cap:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Dashboard widget limit reached ({cap} per layout)",
                )

            safe_config = sanitize_widget_config(widget_data.widget_key, widget_data.widget_config)
            grid_json = clamp_grid_position_for_widget_key(
                widget_data.widget_key,
                widget_data.grid_position.model_dump(),
            )

            row = await conn.fetchrow(
                """
                    INSERT INTO marketing_dashboard_widgets (
                        layout_id, widget_key, widget_title, widget_config,
                        grid_position, is_visible, is_locked, display_order
                    )
                    VALUES ($1::uuid, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8)
                    RETURNING id, layout_id, widget_key, widget_title, widget_config,
                              grid_position, is_visible, is_locked, display_order,
                              created_at, updated_at
                    """,
                str(widget_data.layout_id),
                widget_data.widget_key,
                widget_data.widget_title,
                json.dumps(safe_config),
                json.dumps(grid_json),
                widget_data.is_visible,
                widget_data.is_locked,
                widget_data.display_order,
            )

            logger.info("Added widget %s to layout %s", row["id"], widget_data.layout_id)

            await self._touch_layout_updated_at(conn, widget_data.layout_id)

            return WidgetResponse(
                id=row["id"],
                layout_id=row["layout_id"],
                widget_key=row["widget_key"],
                widget_title=row["widget_title"],
                widget_config=parse_jsonb_field(row["widget_config"], {}),  # Parse JSONB
                grid_position=GridPosition(**parse_jsonb_field(row["grid_position"], {})),  # Parse JSONB
                is_visible=row["is_visible"],
                is_locked=row["is_locked"],
                display_order=row["display_order"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )

    async def update_widget(self, widget_id: UUID, widget_data: WidgetUpdate, user_id: str) -> WidgetResponse | None:
        """
        Update widget (RLS enforced via layout ownership)

        Args:
            widget_id: Widget UUID
            widget_data: Update data
            user_id: User UUID from OAuth2

        Returns:
            Updated widget or None
        """
        async with self.db_pool.acquire() as conn, conn.transaction():
            await self._set_rls_context(conn, user_id)  # type: ignore[arg-type]

            # Build dynamic update ($1 = widget id, $2 = owner user for subquery)
            updates = []
            params: list[Any] = [str(widget_id), user_id]
            param_count = 3

            row_meta = None
            if widget_data.widget_config is not None or widget_data.grid_position is not None:
                row_meta = await conn.fetchrow(
                    """
                    SELECT widget_key FROM marketing_dashboard_widgets
                    WHERE id = $1::uuid
                      AND layout_id IN (
                          SELECT id FROM marketing_dashboard_layouts
                          WHERE user_id = $2::uuid
                      )
                    """,
                    str(widget_id),
                    user_id,
                )
                if not row_meta:
                    return None

            if widget_data.widget_title is not None:
                updates.append(f"widget_title = ${param_count}")
                params.append(widget_data.widget_title)
                param_count += 1

            if widget_data.widget_config is not None:
                assert row_meta is not None
                safe_config = sanitize_widget_config(str(row_meta["widget_key"]), widget_data.widget_config)
                updates.append(f"widget_config = ${param_count}::jsonb")
                params.append(json.dumps(safe_config))
                param_count += 1

            if widget_data.grid_position is not None:
                assert row_meta is not None
                grid_json = clamp_grid_position_for_widget_key(
                    str(row_meta["widget_key"]),
                    widget_data.grid_position.model_dump(),
                )
                updates.append(f"grid_position = ${param_count}::jsonb")
                params.append(json.dumps(grid_json))
                param_count += 1

            if widget_data.is_visible is not None:
                updates.append(f"is_visible = ${param_count}")
                params.append(widget_data.is_visible)
                param_count += 1

            if widget_data.is_locked is not None:
                updates.append(f"is_locked = ${param_count}")
                params.append(widget_data.is_locked)
                param_count += 1

            if widget_data.display_order is not None:
                updates.append(f"display_order = ${param_count}")
                params.append(widget_data.display_order)
                param_count += 1

            if not updates:
                return None

            updates.append("updated_at = CURRENT_TIMESTAMP")

            row = await conn.fetchrow(
                f"""
                    UPDATE marketing_dashboard_widgets
                    SET {", ".join(updates)}
                    WHERE id = $1::uuid
                      AND layout_id IN (
                          SELECT id FROM marketing_dashboard_layouts
                          WHERE user_id = $2::uuid
                      )
                    RETURNING id, layout_id, widget_key, widget_title, widget_config,
                              grid_position, is_visible, is_locked, display_order,
                              created_at, updated_at
                    """,  # noqa: S608
                *params,
            )

            if not row:
                return None

            logger.info("Updated widget: %s", widget_id)

            await self._touch_layout_updated_at(conn, row["layout_id"])

            return WidgetResponse(
                id=row["id"],
                layout_id=row["layout_id"],
                widget_key=row["widget_key"],
                widget_title=row["widget_title"],
                widget_config=parse_jsonb_field(row["widget_config"], {}),  # Parse JSONB
                grid_position=GridPosition(**parse_jsonb_field(row["grid_position"], {})),  # Parse JSONB
                is_visible=row["is_visible"],
                is_locked=row["is_locked"],
                display_order=row["display_order"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )

    async def delete_widget(self, widget_id: UUID, user_id: str) -> bool:
        """
        Delete widget (RLS enforced via layout ownership)

        Args:
            widget_id: Widget UUID
            user_id: User UUID from OAuth2

        Returns:
            True if deleted
        """
        async with self.db_pool.acquire() as conn, conn.transaction():
            await self._set_rls_context(conn, user_id)  # type: ignore[arg-type]

            del_row = await conn.fetchrow(
                """
                    DELETE FROM marketing_dashboard_widgets
                    WHERE id = $1::uuid
                      AND layout_id IN (
                          SELECT id FROM marketing_dashboard_layouts
                          WHERE user_id = $2::uuid
                      )
                    RETURNING layout_id
                    """,
                str(widget_id),
                user_id,
            )

            if del_row:
                await self._touch_layout_updated_at(conn, del_row["layout_id"])
                logger.info("Deleted widget: %s", widget_id)

            return del_row is not None

    # ============================================
    # CLONE OPERATIONS
    # ============================================

    async def clone_layout(self, source_layout_id: UUID, new_name: str, user_id: str) -> dict[str, Any]:
        """
        Clone existing layout using SQL function

        Args:
            source_layout_id: Layout to clone
            new_name: Name for cloned layout
            user_id: User UUID from OAuth2

        Returns:
            Clone result with new layout ID
        """
        async with self.db_pool.acquire() as conn, conn.transaction():
            await self._set_rls_context(conn, user_id)  # type: ignore[arg-type]

            src_wcount = await conn.fetchval(
                """
                SELECT COUNT(*)::int FROM marketing_dashboard_widgets
                WHERE layout_id = $1::uuid
                """,
                str(source_layout_id),
            )
            cap = unified_settings.marketing_dashboard_max_widgets_per_layout
            if int(src_wcount or 0) > cap:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cannot clone layout: exceeds dashboard widget limit ({cap} per layout)",
                )

            # Call SQL clone function
            new_layout_id = await conn.fetchval(
                """
                    SELECT clone_dashboard_layout($1::uuid, $2, $3::uuid)
                    """,
                str(source_layout_id),
                new_name,
                user_id,
            )

            if not new_layout_id:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Source layout not found or access denied",
                )

            # Get widget count
            widget_count = await conn.fetchval(
                """
                    SELECT COUNT(*) FROM marketing_dashboard_widgets
                    WHERE layout_id = $1::uuid
                    """,
                str(new_layout_id),
            )

            logger.info(
                "Cloned layout %s to %s with %s widgets",
                source_layout_id,
                new_layout_id,
                widget_count,
            )

            return {
                "success": True,
                "message": "Layout cloned successfully",
                "new_layout_id": new_layout_id,
                "widget_count": widget_count,
            }

    # ============================================
    # STATISTICS
    # ============================================

    async def get_usage_stats(self, user_id: str, project_id: UUID | None = None) -> DashboardUsageStats:
        """
        Get dashboard usage statistics for user

        Args:
            user_id: User UUID from OAuth2
            project_id: Optional project filter

        Returns:
            Usage statistics
        """
        async with self.db_pool.acquire() as conn:
            await self._set_rls_context(conn, user_id)  # type: ignore[arg-type]

            row = await conn.fetchrow(
                """
                SELECT
                    total_layouts,
                    preset_layouts,
                    custom_layouts,
                    total_widgets,
                    visible_widgets,
                    unique_widget_types,
                    last_dashboard_access
                FROM dashboard_usage_stats
                WHERE user_id = $1::uuid
                  AND (project_id = $2::uuid OR (project_id IS NULL AND $2::uuid IS NULL))
                """,
                user_id,
                str(project_id) if project_id else None,
            )

            cap = unified_settings.marketing_dashboard_max_widgets_per_layout
            disabled_raw = (unified_settings.marketing_dashboard_disabled_widget_keys or "").strip()
            disabled_keys = [k.strip() for k in disabled_raw.split(",") if k.strip()]
            if not row:
                # No layouts yet
                return DashboardUsageStats(
                    total_layouts=0,
                    preset_layouts=0,
                    custom_layouts=0,
                    total_widgets=0,
                    visible_widgets=0,
                    unique_widget_types=0,
                    last_dashboard_access=None,
                    max_widgets_per_layout=cap,
                    disabled_widget_keys=disabled_keys,
                )

            data = dict(row)
            data["max_widgets_per_layout"] = cap
            data["disabled_widget_keys"] = disabled_keys
            return DashboardUsageStats(**data)
