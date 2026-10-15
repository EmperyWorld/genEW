# ---
# EliteEW · Empery World
# https://eliteew.ru
# Author: po&T <keysray70@gmail.com>
# ---
# Purpose:
# ORM для EWRP: задание генерации презентации (landing HTML → контент LLM → UGS-картинки → PDF).
# Invariants:
# - — (нет)
# Related:
# - `database_models.Base`; routers/services для EWRP pipeline.
# ---

"""
EWRP (EliteEW Revolutionary Presentations) — job pipeline distinct from классического Reveal.js.
"""

import uuid
from typing import Any

from sqlalchemy import (  # type: ignore[import-not-found]
    TIMESTAMP,  # type: ignore[import-not-found]
    Boolean,
    Column,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID  # type: ignore[import-not-found]
from sqlalchemy.sql import func  # type: ignore[import-not-found]

from api.models.database_models import Base


class EwrpJob(Base):
    """One EWRP generation job: status, progress, result PDF path."""

    __tablename__ = "ewrp_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    title = Column(String(500), nullable=False)
    topic = Column(Text, nullable=False)
    num_slides = Column(Integer, default=5, nullable=False)

    status = Column(
        String(50), default="queued"
    )  # queued, generating_content, generating_images, building_pdf, completed, failed
    progress = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)

    # Пользовательские вводные и источники
    extra_context = Column(Text, nullable=True)
    source_content_id = Column(UUID(as_uuid=True), nullable=True)
    default_slide_layout = Column(String(32), nullable=True)
    presentation_theme = Column(String(32), nullable=True)
    use_web_search = Column(Boolean, default=False, nullable=False)
    web_search_quality = Column(String(16), nullable=True)

    slides_json = Column(JSONB, nullable=True)  # [{ title, bullets[], image_prompt, image_path? }]
    pdf_path = Column(String(500), nullable=True)
    html_path = Column(String(500), nullable=True)

    created_at = Column(TIMESTAMP(timezone=False), server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=False), server_default=func.now(), onupdate=func.now())
    completed_at = Column(TIMESTAMP(timezone=False), nullable=True)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "title": self.title,
            "topic": self.topic,
            "num_slides": self.num_slides,
            "status": self.status,
            "progress": self.progress,
            "error_message": self.error_message,
            "pdf_path": self.pdf_path,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }
