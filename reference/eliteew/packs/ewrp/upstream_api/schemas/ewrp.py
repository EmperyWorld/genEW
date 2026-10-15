"""EWRP — Revolutionary Presentations: request/response schemas."""

from datetime import datetime
from uuid import UUID

from api.schemas.marketing_web_search import WebSearchQuality
from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator


class EwrpCreateRequest(BaseModel):
    """Тело create: snake_case и camelCase (например presentationTheme) принимаются оба."""

    model_config = ConfigDict(populate_by_name=True)

    topic: str = Field(..., min_length=2, max_length=2000, description="Тема презентации")
    title: str | None = Field(None, max_length=500, description="Заголовок (если не задан — из темы)")
    num_slides: int = Field(5, ge=3, le=20, description="Количество слайдов")
    extra_context: str | None = Field(
        default=None,
        max_length=8000,
        description="Дополнительные вводные/ограничения для генератора (текстом)",
    )
    source_content_id: UUID | None = Field(
        default=None,
        description="ID документа из Content Manager (unified_content.id) для использования как контекст",
    )
    presentation_theme: str | None = Field(
        default=None,
        max_length=32,
        validation_alias=AliasChoices("presentation_theme", "presentationTheme"),
        description="Визуальный стиль итогового PDF (фон, палитра): classic, midnight, …",
    )
    default_slide_layout: str | None = Field(
        default=None,
        max_length=32,
        validation_alias=AliasChoices("default_slide_layout", "defaultSlideLayout"),
        description="Раскладка текста на контентных слайдах (со 2-го); пусто — авто после генерации",
    )
    web_search_quality: WebSearchQuality = Field(
        default="off",
        validation_alias=AliasChoices("web_search_quality", "webSearchQuality"),
        description="Глубина live web-контекста для outline: off, light, standard, deep",
    )
    use_web_search: bool = Field(
        default=False,
        validation_alias=AliasChoices("use_web_search", "useWebSearch"),
        description="Legacy flag; true без quality → standard",
    )


class EwrpCreateResponse(BaseModel):
    id: UUID
    status: str = "queued"
    message: str = "Генерация запущена. Опрашивайте GET /ewrp/{id}/status"


class EwrpSlide(BaseModel):
    """Lightweight slide representation for status/preview."""

    title: str
    bullets: list[str]
    image_filename: str | None = None
    image_ready: bool = Field(
        default=False,
        description="True when GET /ewrp/{job_id}/slides/{index}/image can serve the PNG.",
    )
    image_prompt: str | None = Field(
        default=None,
        description="Последний промпт для визуала (UGS); опционально",
    )
    layout: str | None = Field(
        default=None,
        max_length=32,
        description="Шаблон оформления слайда (statement, split, grid, …); пусто — авто",
    )


class EwrpSlideUpdate(BaseModel):
    """Slide update payload from editor (text-only)."""

    title: str
    bullets: list[str]
    image_filename: str | None = None
    image_prompt: str | None = Field(
        default=None,
        max_length=2000,
        description="Последний промпт визуала (опционально; сохраняется в slides_json)",
    )
    layout: str | None = Field(
        default=None,
        max_length=32,
        description="Шаблон слайда; пустая строка сбрасывает к авто-выбору",
    )

    @field_validator("bullets", mode="before")
    @classmethod
    def coerce_bullets(cls, v: object) -> list[str]:
        """Accept newline-separated string (legacy clients) and non-str list items."""
        if v is None:
            return []
        if isinstance(v, str):
            return [ln.strip() for ln in v.splitlines() if ln.strip()]
        if isinstance(v, list):
            out: list[str] = []
            for item in v:
                if item is None:
                    continue
                s = str(item).strip()
                if s:
                    out.append(s)
            return out
        return []


class EwrpRegenerateImageRequest(BaseModel):
    """Перегенерация визуала одного слайда через UGS (платно)."""

    prompt: str = Field(..., min_length=4, max_length=2000, description="Промпт для изображения")


class EwrpRegenerateTextRequest(BaseModel):
    """Перегенерация текста одного слайда (платно, отдельный тип в каталоге)."""

    instruction: str | None = Field(
        default=None,
        max_length=2000,
        description="Дополнительная инструкция (тон, акценты); можно пусто",
    )


class EwrpSlidesUpdateRequest(BaseModel):
    """Request body for updating all slides of an EWRP job."""

    slides: list[EwrpSlideUpdate]


class EwrpStatusResponse(BaseModel):
    id: UUID
    status: str
    progress: int = 0
    error_message: str | None = None
    content_quality: str | None = Field(
        default=None,
        description="full | degraded — degraded when template fallback text was used",
    )
    content_warning: str | None = Field(
        default=None,
        description="User-visible hint when content_quality is degraded",
    )
    pdf_url: str | None = None  # relative path for download when completed
    pdf_download_token: str | None = None  # one-time token for GET /pdf?token=... (no Auth)
    slides: list[EwrpSlide] | None = None  # текстовый превью слайдов для управления/редакта
    # Вводные задачи (для «подставить в форму» / дубликата)
    topic: str | None = None
    title: str | None = None
    num_slides: int | None = None
    extra_context: str | None = None
    source_content_id: UUID | None = None
    presentation_theme: str | None = None
    default_slide_layout: str | None = None
    web_search_quality: WebSearchQuality | None = None
    use_web_search: bool | None = None
    updated_at: datetime | None = None


class EwrpJobListItem(BaseModel):
    """Краткая запись EWRP-задачи для списка «история генераций»."""

    id: UUID
    title: str
    topic: str
    num_slides: int
    status: str
    progress: int = 0
    error_message: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    completed_at: datetime | None = None
