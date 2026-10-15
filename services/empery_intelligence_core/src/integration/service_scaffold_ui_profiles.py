"""Profile-keyed ECC UI + BFF content (EliteEW-inspired, Empery anatomy)."""

from __future__ import annotations


def _pascal(service_name: str) -> str:
    return "".join(p[:1].upper() + p[1:] for p in service_name.split("_") if p)


def companion_ui_bundle(
    service_name: str,
    *,
    pascal: str,
    camel_client: str,
    i18n_ns: str,
    bff_slug: str,
    env_key: str,
    default_base: str,
) -> dict[str, object]:
    """Chat transcript + composer — adapted from ewa_companion EliteEW pack."""
    return {
        "page": _companion_page(pascal, camel_client, i18n_ns),
        "hook": _companion_hook(pascal, camel_client, i18n_ns),
        "client": _companion_client(camel_client, bff_slug),
        "bff_schemas": _companion_bff_schemas(service_name),
        "bff_client": _companion_bff_client(service_name, default_base),
        "bff_use_cases": _companion_bff_use_cases(service_name),
        "bff_routes": _companion_bff_routes(service_name, bff_slug),
        "screens": ["chat_transcript", "message_compose"],
        "i18n_en": {
            "title": " ".join(p.capitalize() for p in service_name.split("_")),
            "subtitle": "Chat via living peer — EliteEW CompanionSlim adapted",
            "placeholder": "Ask anything…",
            "send": "Send",
            "empty": "Start a conversation — replies come from the service peer.",
            "you": "You",
            "assistant": "Assistant",
        },
        "i18n_ru": {
            "title": " ".join(p.capitalize() for p in service_name.split("_")),
            "subtitle": "Чат через живой peer — по мотивам EliteEW CompanionSlim",
            "placeholder": "Спросите что угодно…",
            "send": "Отправить",
            "empty": "Начните диалог — ответы приходят от peer-сервиса.",
            "you": "Вы",
            "assistant": "Ассистент",
        },
    }


def studio_ui_bundle(
    service_name: str,
    *,
    pascal: str,
    camel_client: str,
    i18n_ns: str,
    bff_slug: str,
    env_key: str,
    default_base: str,
) -> dict[str, object]:
    """Studio job chrome — adapted from EliteEW studios / MusicForge patterns."""
    _ = env_key
    return {
        "page": _studio_page(pascal, camel_client, i18n_ns),
        "hook": _studio_hook(pascal, camel_client, i18n_ns),
        "client": _studio_client(camel_client, bff_slug),
        "bff_schemas": _studio_bff_schemas(service_name),
        "bff_client": _studio_bff_client(service_name, default_base),
        "bff_use_cases": _studio_bff_use_cases(service_name),
        "bff_routes": _studio_bff_routes(service_name, bff_slug),
        "screens": ["job_create", "job_list"],
        "i18n_en": {
            "title": " ".join(p.capitalize() for p in service_name.split("_")),
            "subtitle": "Studio jobs — chrome from EliteEW packs",
            "prompt": "Prompt",
            "placeholder": "Describe what to generate…",
            "create": "Create job",
            "empty": "No jobs yet — create one from a prompt.",
            "status": "Status",
        },
        "i18n_ru": {
            "title": " ".join(p.capitalize() for p in service_name.split("_")),
            "subtitle": "Студийные задачи — chrome из EliteEW packs",
            "prompt": "Промпт",
            "placeholder": "Опишите, что сгенерировать…",
            "create": "Создать задачу",
            "empty": "Пока нет задач — создайте из промпта.",
            "status": "Статус",
        },
    }


def ops_dashboard_ui_bundle(
    service_name: str,
    *,
    pascal: str,
    camel_client: str,
    i18n_ns: str,
    bff_slug: str,
    env_key: str,
    default_base: str,
) -> dict[str, object]:
    """KPI/metrics tile list + refresh — adapted from EliteEW ops_dashboard pack."""
    _ = env_key
    return {
        "page": _ops_dashboard_page(pascal, camel_client, i18n_ns),
        "hook": _ops_dashboard_hook(pascal, camel_client, i18n_ns),
        "client": _ops_dashboard_client(camel_client, bff_slug),
        "bff_schemas": _ops_dashboard_bff_schemas(service_name),
        "bff_client": _ops_dashboard_bff_client(service_name, default_base),
        "bff_use_cases": _ops_dashboard_bff_use_cases(service_name),
        "bff_routes": _ops_dashboard_bff_routes(service_name, bff_slug),
        "screens": ["metric_list", "metric_detail"],
        "i18n_en": {
            "title": " ".join(p.capitalize() for p in service_name.split("_")),
            "subtitle": "KPI and metrics — EliteEW ops dashboard adapted",
            "refresh": "Refresh",
            "empty": "No metrics yet — check the peer service.",
            "value": "Value",
            "updated": "Updated",
        },
        "i18n_ru": {
            "title": " ".join(p.capitalize() for p in service_name.split("_")),
            "subtitle": "KPI и метрики — по мотивам EliteEW ops dashboard",
            "refresh": "Обновить",
            "empty": "Пока нет метрик — проверьте peer-сервис.",
            "value": "Значение",
            "updated": "Обновлено",
        },
    }


def task_board_ui_bundle(
    service_name: str,
    *,
    pascal: str,
    camel_client: str,
    i18n_ns: str,
    bff_slug: str,
    env_key: str,
    default_base: str,
) -> dict[str, object]:
    """Task board columns/list + create — kanban-style operator surface."""
    _ = env_key
    return {
        "page": _task_board_page(pascal, camel_client, i18n_ns),
        "hook": _task_board_hook(pascal, camel_client, i18n_ns),
        "client": _task_board_client(camel_client, bff_slug),
        "bff_schemas": _task_board_bff_schemas(service_name),
        "bff_client": _task_board_bff_client(service_name, default_base),
        "bff_use_cases": _task_board_bff_use_cases(service_name),
        "bff_routes": _task_board_bff_routes(service_name, bff_slug),
        "screens": ["board", "task_detail"],
        "i18n_en": {
            "title": " ".join(p.capitalize() for p in service_name.split("_")),
            "subtitle": "Task board — columns and tasks via living peer",
            "titlePlaceholder": "Task title",
            "create": "Add task",
            "empty": "No tasks yet — add the first one.",
            "status": "Status",
            "column": "Column",
        },
        "i18n_ru": {
            "title": " ".join(p.capitalize() for p in service_name.split("_")),
            "subtitle": "Доска задач — колонки и задачи через живой peer",
            "titlePlaceholder": "Название задачи",
            "create": "Добавить задачу",
            "empty": "Пока нет задач — добавьте первую.",
            "status": "Статус",
            "column": "Колонка",
        },
    }


def research_report_ui_bundle(
    service_name: str,
    *,
    pascal: str,
    camel_client: str,
    i18n_ns: str,
    bff_slug: str,
    env_key: str,
    default_base: str,
) -> dict[str, object]:
    """Report list + generate via peer — Nervas-backed research surface."""
    _ = env_key
    return {
        "page": _research_report_page(pascal, camel_client, i18n_ns),
        "hook": _research_report_hook(pascal, camel_client, i18n_ns),
        "client": _research_report_client(camel_client, bff_slug),
        "bff_schemas": _research_report_bff_schemas(service_name),
        "bff_client": _research_report_bff_client(service_name, default_base),
        "bff_use_cases": _research_report_bff_use_cases(service_name),
        "bff_routes": _research_report_bff_routes(service_name, bff_slug),
        "screens": ["report_list", "report_detail"],
        "i18n_en": {
            "title": " ".join(p.capitalize() for p in service_name.split("_")),
            "subtitle": "Research reports — generate summaries via living peer",
            "topic": "Topic",
            "placeholder": "Describe the research question or market…",
            "generate": "Generate report",
            "empty": "No reports yet — generate one from a topic.",
            "status": "Status",
        },
        "i18n_ru": {
            "title": " ".join(p.capitalize() for p in service_name.split("_")),
            "subtitle": "Исследовательские отчёты — генерация через живой peer",
            "topic": "Тема",
            "placeholder": "Опишите исследовательский вопрос или рынок…",
            "generate": "Сгенерировать отчёт",
            "empty": "Пока нет отчётов — создайте из темы.",
            "status": "Статус",
        },
    }


def _client_file(camel_client: str) -> str:
    return camel_client


def _companion_page(pascal: str, camel_client: str, i18n_ns: str) -> str:
    return f'''import {{ useState }} from "react";
import {{ useTranslation }} from "react-i18next";
import {{ ErrorBanner }} from "@/components/ErrorBanner";
import {{ Panel }} from "@/components/Panel";
import {{ RequireAuth }} from "@/features/auth/RequireAuth";
import {{ BaseChatPanel, BaseComposer }} from "@/assembly_lib";
import {{ use{pascal}Session }} from "./use{pascal}Session";

/** ECC chat surface — assembly_lib slot + peer DI. */
function {pascal}PageInner() {{
  const {{ t }} = useTranslation();
  const session = use{pascal}Session();
  const [message, setMessage] = useState("");
  const busy = session.busy;

  async function onSend() {{
    const text = message.trim();
    if (!text || session.busy) return;
    setMessage("");
    await session.sendMessage(text);
  }}

  function chatMessages() {{
    return session.messages.map((m) => ({{
      id: m.id,
      role: m.role,
      content: m.content,
    }}));
  }}

  return (
    <div className="flex h-full min-h-0 flex-col gap-px bg-line">
      <Panel
        title={{t("{i18n_ns}.title")}}
        className="min-h-0 w-full rounded-none border-0 bg-field"
        flush
      >
        <div className="flex min-h-0 flex-col gap-3 p-4">
          <p className="font-body text-sm text-ink-muted">
            {{t("{i18n_ns}.subtitle")}}
          </p>
          {{session.error ? (
            <ErrorBanner
              message={{session.error}}
              onDismiss={{() => void session.reload()}}
            />
          ) : null}}
          <div
            className="grid min-h-0 flex-1 gap-3 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]"
            data-assembly-data-source="/api/v1/messages"
          >
            {{/* @assembler-slot: widgets */}}
            <div data-assembler-slot="widgets" className="contents">
              <BaseChatPanel
                title={{t("{i18n_ns}.title")}}
                emptyHint={{t("{i18n_ns}.empty")}}
                messages={{chatMessages()}}
              />
              <BaseComposer
                title={{t("{i18n_ns}.you")}}
                placeholder="Ask…"
                sendLabel="Send"
                value={{message}}
                busy={{busy}}
                onChange={{setMessage}}
                onSend={{() => void onSend()}}
              />
            </div>
            {{/* @assembler-slot-end: widgets */}}
          </div>
        </div>
      </Panel>
    </div>
  );
}}

export function {pascal}Page() {{
  return (
    <RequireAuth>
      <{pascal}PageInner />
    </RequireAuth>
  );
}}
'''


def _companion_hook(pascal: str, camel_client: str, i18n_ns: str) -> str:
    cf = _client_file(camel_client)
    return f'''import {{ useCallback, useEffect, useState }} from "react";
import {{ useTranslation }} from "react-i18next";
import {{
  {camel_client},
  type ChatMessage,
}} from "@/api/{cf}";

export function use{pascal}Session() {{
  const {{ t }} = useTranslation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {{
    setLoading(true);
    setError(null);
    try {{
      const res = await {camel_client}.listMessages();
      setMessages(res.messages);
    }} catch (err) {{
      setError(err instanceof Error ? err.message : t("{i18n_ns}.subtitle"));
    }} finally {{
      setLoading(false);
    }}
  }}, [t]);

  useEffect(() => {{
    void reload();
  }}, [reload]);

  const sendMessage = useCallback(
    async (content: string) => {{
      setBusy(true);
      setError(null);
      try {{
        await {camel_client}.sendMessage(content);
        await reload();
        return true;
      }} catch (err) {{
        setError(err instanceof Error ? err.message : "send failed");
        return false;
      }} finally {{
        setBusy(false);
      }}
    }},
    [reload],
  );

  return {{ messages, loading, busy, error, reload, sendMessage }};
}}
'''


def _companion_client(camel_client: str, bff_slug: str) -> str:
    return f'''import {{ eccFetch }} from "@/api/http";

export type ChatMessage = {{
  id: string;
  role: string;
  content: string;
  created_at: string;
}};

export type MessageListResponse = {{
  messages: ChatMessage[];
  count: number;
}};

export const {camel_client} = {{
  listMessages(limit = 50): Promise<MessageListResponse> {{
    return eccFetch<MessageListResponse>("/{bff_slug}/messages", {{
      query: {{ limit: String(limit) }},
    }});
  }},
  sendMessage(content: string): Promise<ChatMessage> {{
    return eccFetch<ChatMessage>("/{bff_slug}/messages", {{
      method: "POST",
      body: {{ content }},
    }});
  }},
}};
'''


def _companion_bff_schemas(service_name: str) -> str:
    return f'''"""Pydantic contracts for ECC → {service_name} chat BFF."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class EccSendMessageRequest(BaseModel):
    content: str = Field(min_length=1, max_length=8000)


class EccMessageView(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: UUID
    role: str
    content: str
    created_at: datetime


class EccMessageListResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    messages: list[EccMessageView]
    count: int
'''


def _companion_bff_client(service_name: str, default_base: str) -> str:
    pascal = _pascal(service_name)
    err = service_name.upper()[:12]
    return f'''"""HTTP adapter for {service_name} chat peer."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from core.errors import ServiceError, StandardizedErrorResponse
from services.empery_control_center_api.src.integration.identity_client import (
    strip_bearer_token,
)


def _unavailable(reason: str) -> ServiceError:
    return ServiceError(
        StandardizedErrorResponse(
            error_code="{err}_UNAVAILABLE",
            message="{service_name} service is not available",
            details={{"reason": reason}},
        ),
        http_status=503,
    )


class {pascal}Client:
    def __init__(
        self,
        *,
        base_url: str = "{default_base}",
        logger: logging.Logger,
        timeout_seconds: float = 30.0,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._logger = logger
        self._timeout_seconds = timeout_seconds

    async def list_messages(
        self, authorization: str | None, *, limit: int = 50
    ) -> dict[str, Any]:
        token = strip_bearer_token(authorization)
        url = f"{{self._base_url}}/api/v1/messages"
        return await self._json("GET", url, token, params={{"limit": limit}})

    async def send_message(
        self, authorization: str | None, *, content: str
    ) -> dict[str, Any]:
        token = strip_bearer_token(authorization)
        url = f"{{self._base_url}}/api/v1/messages"
        return await self._json(
            "POST", url, token, json_body={{"content": content}}
        )

    async def _json(
        self,
        method: str,
        url: str,
        token: str | None,
        *,
        params: dict[str, Any] | None = None,
        json_body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        headers: dict[str, str] = {{}}
        if token:
            headers["Authorization"] = f"Bearer {{token}}"
        try:
            async with httpx.AsyncClient(timeout=self._timeout_seconds) as client:
                res = await client.request(
                    method, url, headers=headers, params=params, json=json_body
                )
        except httpx.HTTPError as exc:
            raise _unavailable(str(exc)) from exc
        if res.status_code >= 400:
            raise _unavailable(f"HTTP {{res.status_code}}: {{res.text[:200]}}")
        data = res.json()
        if not isinstance(data, dict):
            raise _unavailable("invalid JSON object")
        return data
'''


def _companion_bff_use_cases(service_name: str) -> str:
    pascal = _pascal(service_name)
    return f'''"""BFF use cases for {service_name} chat."""

from __future__ import annotations

from core.container import ServiceContainer

from services.empery_control_center_api.src.data.{service_name}_schemas import (
    EccMessageListResponse,
    EccMessageView,
    EccSendMessageRequest,
)


class Ecc{pascal}BffUseCases:
    def __init__(self, container: ServiceContainer) -> None:
        self._container = container

    def _client(self):
        return self._container.resolve("{service_name}_client")

    async def list_messages(
        self, authorization: str | None, *, limit: int = 50
    ) -> EccMessageListResponse:
        raw = await self._client().list_messages(authorization, limit=limit)
        msgs = [
            EccMessageView.model_validate(m) for m in (raw.get("messages") or [])
        ]
        return EccMessageListResponse(
            messages=msgs, count=int(raw.get("count") or len(msgs))
        )

    async def send_message(
        self, authorization: str | None, body: EccSendMessageRequest
    ) -> EccMessageView:
        raw = await self._client().send_message(
            authorization, content=body.content
        )
        return EccMessageView.model_validate(raw)
'''


def _companion_bff_routes(service_name: str, bff_slug: str) -> str:
    pascal = _pascal(service_name)
    return f'''"""ECC BFF routes for {service_name} chat."""

from __future__ import annotations

from fastapi import APIRouter, Query, Request

from services.empery_control_center_api.src.core.{service_name}_bff_use_cases import (
    Ecc{pascal}BffUseCases,
)
from services.empery_control_center_api.src.data.{service_name}_schemas import (
    EccMessageListResponse,
    EccMessageView,
    EccSendMessageRequest,
)

router = APIRouter(prefix="/{bff_slug}", tags=["{bff_slug}"])


def _uc(request: Request) -> Ecc{pascal}BffUseCases:
    return request.app.state.container.resolve("ecc_{service_name}_bff_use_cases")


@router.get("/messages", response_model=EccMessageListResponse)
async def list_messages(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
) -> EccMessageListResponse:
    auth = request.headers.get("authorization")
    return await _uc(request).list_messages(auth, limit=limit)


@router.post("/messages", response_model=EccMessageView, status_code=201)
async def send_message(
    request: Request, body: EccSendMessageRequest
) -> EccMessageView:
    auth = request.headers.get("authorization")
    return await _uc(request).send_message(auth, body)
'''


def _studio_page(pascal: str, camel_client: str, i18n_ns: str) -> str:
    return f'''import {{ useState }} from "react";
import {{ useTranslation }} from "react-i18next";
import {{ ErrorBanner }} from "@/components/ErrorBanner";
import {{ Panel }} from "@/components/Panel";
import {{ RequireAuth }} from "@/features/auth/RequireAuth";
import {{ BaseJobForm, BaseJobList }} from "@/assembly_lib";
import {{ use{pascal}Session }} from "./use{pascal}Session";

/** ECC studio chrome — assembly_lib slot + peer DI. */
function {pascal}PageInner() {{
  const {{ t }} = useTranslation();
  const session = use{pascal}Session();
  const [prompt, setPrompt] = useState("");
  const busy = session.busy;

  async function onGenerate() {{
    const text = prompt.trim();
    if (!text) return;
    const ok = await session.createJob(text);
    if (ok) setPrompt("");
  }}

  function studioJobs() {{
    return session.jobs.map((job) => ({{
      id: job.id,
      prompt: job.prompt,
      status: job.status,
      result_url: job.result_url ?? null,
    }}));
  }}

  return (
    <div className="flex h-full min-h-0 flex-col gap-px bg-line">
      <Panel
        title={{t("{i18n_ns}.title")}}
        className="min-h-0 w-full rounded-none border-0 bg-field"
        flush
      >
        <div className="flex min-h-0 flex-col gap-4 overflow-auto p-4">
          <p className="font-body text-sm text-ink-muted">
            {{t("{i18n_ns}.subtitle")}}
          </p>
          {{session.error ? (
            <ErrorBanner
              message={{session.error}}
              onDismiss={{() => void session.reload()}}
            />
          ) : null}}
          <div
            className="flex min-h-0 flex-1 flex-col gap-3"
            data-assembly-data-source="/api/v1/jobs"
          >
            {{/* @assembler-slot: widgets */}}
            <div data-assembler-slot="widgets" className="contents">
              <BaseJobForm
                title={{t("{i18n_ns}.prompt")}}
                placeholder={{t("{i18n_ns}.placeholder")}}
                buttonLabel={{t("{i18n_ns}.create")}}
                value={{prompt}}
                busy={{busy}}
                onChange={{setPrompt}}
                onGenerate={{() => void onGenerate()}}
              />
              <BaseJobList
                title={{t("{i18n_ns}.title")}}
                emptyHint={{t("{i18n_ns}.empty")}}
                jobs={{studioJobs()}}
              />
            </div>
            {{/* @assembler-slot-end: widgets */}}
          </div>
        </div>
      </Panel>
    </div>
  );
}}

export function {pascal}Page() {{
  return (
    <RequireAuth>
      <{pascal}PageInner />
    </RequireAuth>
  );
}}
'''


def _studio_hook(pascal: str, camel_client: str, i18n_ns: str) -> str:
    cf = _client_file(camel_client)
    return f'''import {{ useCallback, useEffect, useState }} from "react";
import {{ useTranslation }} from "react-i18next";
import {{ {camel_client}, type StudioJob }} from "@/api/{cf}";

export function use{pascal}Session() {{
  const {{ t }} = useTranslation();
  const [jobs, setJobs] = useState<StudioJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {{
    setLoading(true);
    setError(null);
    try {{
      const res = await {camel_client}.listJobs();
      setJobs(res.jobs);
    }} catch (err) {{
      setError(err instanceof Error ? err.message : t("{i18n_ns}.subtitle"));
    }} finally {{
      setLoading(false);
    }}
  }}, [t]);

  useEffect(() => {{
    void reload();
  }}, [reload]);

  const createJob = useCallback(
    async (prompt: string) => {{
      setBusy(true);
      setError(null);
      try {{
        await {camel_client}.createJob(prompt);
        await reload();
        return true;
      }} catch (err) {{
        setError(err instanceof Error ? err.message : "create failed");
        return false;
      }} finally {{
        setBusy(false);
      }}
    }},
    [reload],
  );

  return {{ jobs, loading, busy, error, reload, createJob }};
}}
'''


def _studio_client(camel_client: str, bff_slug: str) -> str:
    return f'''import {{ eccFetch }} from "@/api/http";

export type StudioJob = {{
  id: string;
  prompt: string;
  status: string;
  result_uri?: string | null;
  error?: string | null;
  created_at: string;
}};

export type JobListResponse = {{
  jobs: StudioJob[];
  count: number;
}};

export const {camel_client} = {{
  listJobs(limit = 50): Promise<JobListResponse> {{
    return eccFetch<JobListResponse>("/{bff_slug}/jobs", {{
      query: {{ limit: String(limit) }},
    }});
  }},
  createJob(prompt: string): Promise<StudioJob> {{
    return eccFetch<StudioJob>("/{bff_slug}/jobs", {{
      method: "POST",
      body: {{ prompt }},
    }});
  }},
}};
'''


def _studio_bff_schemas(service_name: str) -> str:
    return f'''"""Pydantic contracts for ECC → {service_name} studio BFF."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class EccCreateJobRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)


class EccJobView(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: UUID
    prompt: str
    status: str
    result_uri: str | None = None
    error: str | None = None
    created_at: datetime


class EccJobListResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    jobs: list[EccJobView]
    count: int
'''


def _studio_bff_client(service_name: str, default_base: str) -> str:
    pascal = _pascal(service_name)
    err = service_name.upper()[:12]
    return f'''"""HTTP adapter for {service_name} studio peer."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from core.errors import ServiceError, StandardizedErrorResponse
from services.empery_control_center_api.src.integration.identity_client import (
    strip_bearer_token,
)


def _unavailable(reason: str) -> ServiceError:
    return ServiceError(
        StandardizedErrorResponse(
            error_code="{err}_UNAVAILABLE",
            message="{service_name} service is not available",
            details={{"reason": reason}},
        ),
        http_status=503,
    )


class {pascal}Client:
    def __init__(
        self,
        *,
        base_url: str = "{default_base}",
        logger: logging.Logger,
        timeout_seconds: float = 60.0,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._logger = logger
        self._timeout_seconds = timeout_seconds

    async def list_jobs(
        self, authorization: str | None, *, limit: int = 50
    ) -> dict[str, Any]:
        token = strip_bearer_token(authorization)
        url = f"{{self._base_url}}/api/v1/jobs"
        return await self._json("GET", url, token, params={{"limit": limit}})

    async def create_job(
        self, authorization: str | None, *, prompt: str
    ) -> dict[str, Any]:
        token = strip_bearer_token(authorization)
        url = f"{{self._base_url}}/api/v1/jobs"
        return await self._json(
            "POST", url, token, json_body={{"prompt": prompt}}
        )

    async def _json(
        self,
        method: str,
        url: str,
        token: str | None,
        *,
        params: dict[str, Any] | None = None,
        json_body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        headers: dict[str, str] = {{}}
        if token:
            headers["Authorization"] = f"Bearer {{token}}"
        try:
            async with httpx.AsyncClient(timeout=self._timeout_seconds) as client:
                res = await client.request(
                    method, url, headers=headers, params=params, json=json_body
                )
        except httpx.HTTPError as exc:
            raise _unavailable(str(exc)) from exc
        if res.status_code >= 400:
            raise _unavailable(f"HTTP {{res.status_code}}: {{res.text[:200]}}")
        data = res.json()
        if not isinstance(data, dict):
            raise _unavailable("invalid JSON object")
        return data
'''


def _studio_bff_use_cases(service_name: str) -> str:
    pascal = _pascal(service_name)
    return f'''"""BFF use cases for {service_name} studio jobs."""

from __future__ import annotations

from core.container import ServiceContainer

from services.empery_control_center_api.src.data.{service_name}_schemas import (
    EccCreateJobRequest,
    EccJobListResponse,
    EccJobView,
)


class Ecc{pascal}BffUseCases:
    def __init__(self, container: ServiceContainer) -> None:
        self._container = container

    def _client(self):
        return self._container.resolve("{service_name}_client")

    async def list_jobs(
        self, authorization: str | None, *, limit: int = 50
    ) -> EccJobListResponse:
        raw = await self._client().list_jobs(authorization, limit=limit)
        jobs = [EccJobView.model_validate(j) for j in (raw.get("jobs") or [])]
        return EccJobListResponse(
            jobs=jobs, count=int(raw.get("count") or len(jobs))
        )

    async def create_job(
        self, authorization: str | None, body: EccCreateJobRequest
    ) -> EccJobView:
        raw = await self._client().create_job(authorization, prompt=body.prompt)
        return EccJobView.model_validate(raw)
'''


def _studio_bff_routes(service_name: str, bff_slug: str) -> str:
    pascal = _pascal(service_name)
    return f'''"""ECC BFF routes for {service_name} studio jobs."""

from __future__ import annotations

from fastapi import APIRouter, Query, Request

from services.empery_control_center_api.src.core.{service_name}_bff_use_cases import (
    Ecc{pascal}BffUseCases,
)
from services.empery_control_center_api.src.data.{service_name}_schemas import (
    EccCreateJobRequest,
    EccJobListResponse,
    EccJobView,
)

router = APIRouter(prefix="/{bff_slug}", tags=["{bff_slug}"])


def _uc(request: Request) -> Ecc{pascal}BffUseCases:
    return request.app.state.container.resolve("ecc_{service_name}_bff_use_cases")


@router.get("/jobs", response_model=EccJobListResponse)
async def list_jobs(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
) -> EccJobListResponse:
    auth = request.headers.get("authorization")
    return await _uc(request).list_jobs(auth, limit=limit)


@router.post("/jobs", response_model=EccJobView, status_code=201)
async def create_job(
    request: Request, body: EccCreateJobRequest
) -> EccJobView:
    auth = request.headers.get("authorization")
    return await _uc(request).create_job(auth, body)
'''


# --- ops_dashboard ---


def _ops_dashboard_page(pascal: str, camel_client: str, i18n_ns: str) -> str:
    return f'''import {{ useTranslation }} from "react-i18next";
import {{ BaseCard, BaseChart, BaseLayout }} from "@/assembly_lib";
import {{ Button }} from "@/components/Button";
import {{ ErrorBanner }} from "@/components/ErrorBanner";
import {{ Panel }} from "@/components/Panel";
import {{ SkeletonPulse }} from "@/components/SkeletonPulse";
import {{ RequireAuth }} from "@/features/auth/RequireAuth";
import {{ use{pascal}Session }} from "./use{pascal}Session";

/** ECC metrics dashboard — Configuration-Driven Assembly (Dashboard_Standard). */
function {pascal}PageInner() {{
  const {{ t }} = useTranslation();
  const session = use{pascal}Session();
  const metrics = session.metrics;

  /** Assembler DI: Manifest data_source → BFF metrics list. */
  const metricField = (
    label: string,
    field: "value" | "unit" | "label",
  ): string => {{
    const hit =
      metrics.find((m) => m.label === label) ??
      metrics.find((m) => m.id === label) ??
      metrics[0];
    if (!hit) return session.loading ? "…" : "—";
    const raw = hit[field as keyof typeof hit];
    return raw == null || raw === "" ? "—" : String(raw);
  }};
  const metricSeries = () =>
    metrics.slice(0, 12).map((m) => ({{
      label: m.label,
      value: Number.parseFloat(String(m.value)) || 0,
    }}));

  return (
    <div className="flex h-full min-h-0 flex-col gap-px bg-line">
      <Panel
        title={{t("{i18n_ns}.title")}}
        className="min-h-0 w-full rounded-none border-0 bg-field"
        flush
      >
        <BaseLayout
          title={{t("{i18n_ns}.title")}}
          subtitle={{t("{i18n_ns}.subtitle")}}
          actions={{
            <Button
              type="button"
              disabled={{session.loading || session.busy}}
              onClick={{() => void session.reload()}}
            >
              {{session.busy ? "…" : t("{i18n_ns}.refresh")}}
            </Button>
          }}
        >
          {{session.error ? (
            <ErrorBanner
              message={{session.error}}
              onDismiss={{() => void session.reload()}}
            />
          ) : null}}
          {{session.loading ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <SkeletonPulse className="h-28 w-full" />
              <SkeletonPulse className="h-28 w-full" />
            </div>
          ) : null}}
          {{!session.loading ? (
            <div
              className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
              data-assembly-data-source="/api/v1/metrics"
            >
              {{/* @assembler-slot: widgets */}}
              <div data-assembler-slot="widgets" className="contents">
                <BaseCard
                  title={{metricField("Metrics", "label")}}
                  value={{metricField("Metrics", "value")}}
                  unit={{metricField("Metrics", "unit")}}
                />
                <BaseChart
                  title="Trend"
                  chartType="area_line"
                  series={{metricSeries()}}
                />
              </div>
              {{/* @assembler-slot-end: widgets */}}
            </div>
          ) : null}}
        </BaseLayout>
      </Panel>
    </div>
  );
}}

export function {pascal}Page() {{
  return (
    <RequireAuth>
      <{pascal}PageInner />
    </RequireAuth>
  );
}}
'''


def _ops_dashboard_hook(pascal: str, camel_client: str, i18n_ns: str) -> str:
    cf = _client_file(camel_client)
    return f'''import {{ useCallback, useEffect, useState }} from "react";
import {{ useTranslation }} from "react-i18next";
import {{ {camel_client}, type DashboardMetric }} from "@/api/{cf}";

export function use{pascal}Session() {{
  const {{ t }} = useTranslation();
  const [metrics, setMetrics] = useState<DashboardMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {{
    setLoading(true);
    setBusy(true);
    setError(null);
    try {{
      const res = await {camel_client}.listMetrics();
      setMetrics(res.metrics);
    }} catch (err) {{
      setError(err instanceof Error ? err.message : t("{i18n_ns}.subtitle"));
    }} finally {{
      setLoading(false);
      setBusy(false);
    }}
  }}, [t]);

  useEffect(() => {{
    void reload();
  }}, [reload]);

  return {{ metrics, loading, busy, error, reload }};
}}
'''


def _ops_dashboard_client(camel_client: str, bff_slug: str) -> str:
    return f'''import {{ eccFetch }} from "@/api/http";

export type DashboardMetric = {{
  id: string;
  label: string;
  value: string;
  unit?: string | null;
  updated_at?: string | null;
}};

export type MetricListResponse = {{
  metrics: DashboardMetric[];
  count: number;
}};

export const {camel_client} = {{
  listMetrics(limit = 50): Promise<MetricListResponse> {{
    return eccFetch<MetricListResponse>("/{bff_slug}/metrics", {{
      query: {{ limit: String(limit) }},
    }});
  }},
}};
'''


def _ops_dashboard_bff_schemas(service_name: str) -> str:
    return f'''"""Pydantic contracts for ECC → {service_name} metrics BFF."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class EccMetricView(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: UUID
    label: str
    value: str
    unit: str | None = None
    updated_at: datetime | None = None


class EccMetricListResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    metrics: list[EccMetricView]
    count: int
'''


def _ops_dashboard_bff_client(service_name: str, default_base: str) -> str:
    pascal = _pascal(service_name)
    err = service_name.upper()[:12]
    return f'''"""HTTP adapter for {service_name} metrics peer."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from core.errors import ServiceError, StandardizedErrorResponse
from services.empery_control_center_api.src.integration.identity_client import (
    strip_bearer_token,
)


def _unavailable(reason: str) -> ServiceError:
    return ServiceError(
        StandardizedErrorResponse(
            error_code="{err}_UNAVAILABLE",
            message="{service_name} service is not available",
            details={{"reason": reason}},
        ),
        http_status=503,
    )


class {pascal}Client:
    def __init__(
        self,
        *,
        base_url: str = "{default_base}",
        logger: logging.Logger,
        timeout_seconds: float = 30.0,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._logger = logger
        self._timeout_seconds = timeout_seconds

    async def list_metrics(
        self, authorization: str | None, *, limit: int = 50
    ) -> dict[str, Any]:
        token = strip_bearer_token(authorization)
        url = f"{{self._base_url}}/api/v1/metrics"
        return await self._json("GET", url, token, params={{"limit": limit}})

    async def _json(
        self,
        method: str,
        url: str,
        token: str | None,
        *,
        params: dict[str, Any] | None = None,
        json_body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        headers: dict[str, str] = {{}}
        if token:
            headers["Authorization"] = f"Bearer {{token}}"
        try:
            async with httpx.AsyncClient(timeout=self._timeout_seconds) as client:
                res = await client.request(
                    method, url, headers=headers, params=params, json=json_body
                )
        except httpx.HTTPError as exc:
            raise _unavailable(str(exc)) from exc
        if res.status_code >= 400:
            raise _unavailable(f"HTTP {{res.status_code}}: {{res.text[:200]}}")
        data = res.json()
        if not isinstance(data, dict):
            raise _unavailable("invalid JSON object")
        return data
'''


def _ops_dashboard_bff_use_cases(service_name: str) -> str:
    pascal = _pascal(service_name)
    return f'''"""BFF use cases for {service_name} metrics."""

from __future__ import annotations

from core.container import ServiceContainer

from services.empery_control_center_api.src.data.{service_name}_schemas import (
    EccMetricListResponse,
    EccMetricView,
)


class Ecc{pascal}BffUseCases:
    def __init__(self, container: ServiceContainer) -> None:
        self._container = container

    def _client(self):
        return self._container.resolve("{service_name}_client")

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
'''


def _ops_dashboard_bff_routes(service_name: str, bff_slug: str) -> str:
    pascal = _pascal(service_name)
    return f'''"""ECC BFF routes for {service_name} metrics."""

from __future__ import annotations

from fastapi import APIRouter, Query, Request

from services.empery_control_center_api.src.core.{service_name}_bff_use_cases import (
    Ecc{pascal}BffUseCases,
)
from services.empery_control_center_api.src.data.{service_name}_schemas import (
    EccMetricListResponse,
)

router = APIRouter(prefix="/{bff_slug}", tags=["{bff_slug}"])


def _uc(request: Request) -> Ecc{pascal}BffUseCases:
    return request.app.state.container.resolve("ecc_{service_name}_bff_use_cases")


@router.get("/metrics", response_model=EccMetricListResponse)
async def list_metrics(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
) -> EccMetricListResponse:
    auth = request.headers.get("authorization")
    return await _uc(request).list_metrics(auth, limit=limit)
'''


# --- task_board ---


def _task_board_page(pascal: str, camel_client: str, i18n_ns: str) -> str:
    return f'''import {{ FormEvent, useState }} from "react";
import {{ useTranslation }} from "react-i18next";
import {{ Button }} from "@/components/Button";
import {{ ErrorBanner }} from "@/components/ErrorBanner";
import {{ Panel }} from "@/components/Panel";
import {{ SkeletonPulse }} from "@/components/SkeletonPulse";
import {{ RequireAuth }} from "@/features/auth/RequireAuth";
import {{ use{pascal}Session }} from "./use{pascal}Session";

/** ECC task board — kanban-style list + create via living peer. */
function {pascal}PageInner() {{
  const {{ t }} = useTranslation();
  const session = use{pascal}Session();
  const [title, setTitle] = useState("");

  async function onCreate(event: FormEvent) {{
    event.preventDefault();
    const text = title.trim();
    if (!text) return;
    const ok = await session.createTask(text);
    if (ok) setTitle("");
  }}

  return (
    <div className="flex h-full min-h-0 flex-col gap-px bg-line">
      <Panel
        title={{t("{i18n_ns}.title")}}
        className="min-h-0 w-full rounded-none border-0 bg-field"
        flush
      >
        <div className="flex min-h-0 flex-col gap-4 overflow-auto p-4">
          <p className="font-body text-sm text-ink-muted">
            {{t("{i18n_ns}.subtitle")}}
          </p>
          {{session.error ? (
            <ErrorBanner
              message={{session.error}}
              onDismiss={{() => void session.reload()}}
            />
          ) : null}}
          <form
            onSubmit={{(e) => void onCreate(e)}}
            className="flex flex-wrap items-end gap-2 rounded-[var(--ecc-radius-md)] border border-line bg-canvas p-4"
          >
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="font-[Sora,sans-serif] text-xs text-ink-muted">
                {{t("{i18n_ns}.titlePlaceholder")}}
              </span>
              <input
                className="rounded-[var(--ecc-radius-sm)] border border-line bg-field px-3 py-2 font-body text-sm outline-none focus:border-signal"
                value={{title}}
                disabled={{session.busy}}
                onChange={{(e) => setTitle(e.target.value)}}
                placeholder={{t("{i18n_ns}.titlePlaceholder")}}
              />
            </label>
            <Button type="submit" disabled={{session.busy || !title.trim()}}>
              {{t("{i18n_ns}.create")}}
            </Button>
          </form>
          <div className="space-y-2">
            {{session.loading ? <SkeletonPulse className="h-16 w-full" /> : null}}
            {{!session.loading && session.tasks.length === 0 ? (
              <p className="text-sm text-ink-muted">{{t("{i18n_ns}.empty")}}</p>
            ) : null}}
            {{session.tasks.map((task) => (
              <article
                key={{task.id}}
                className="rounded-[var(--ecc-radius-md)] border border-line bg-canvas px-4 py-3"
              >
                <p className="font-body text-sm text-ink">{{task.title}}</p>
                <div className="mt-2 flex flex-wrap gap-3 font-[Sora,sans-serif] text-xs uppercase tracking-wide text-ink-muted">
                  <span>{{t("{i18n_ns}.status")}}: {{task.status}}</span>
                  {{task.column ? (
                    <span>{{t("{i18n_ns}.column")}}: {{task.column}}</span>
                  ) : null}}
                </div>
              </article>
            ))}}
          </div>
        </div>
      </Panel>
    </div>
  );
}}

export function {pascal}Page() {{
  return (
    <RequireAuth>
      <{pascal}PageInner />
    </RequireAuth>
  );
}}
'''


def _task_board_hook(pascal: str, camel_client: str, i18n_ns: str) -> str:
    cf = _client_file(camel_client)
    return f'''import {{ useCallback, useEffect, useState }} from "react";
import {{ useTranslation }} from "react-i18next";
import {{ {camel_client}, type BoardTask }} from "@/api/{cf}";

export function use{pascal}Session() {{
  const {{ t }} = useTranslation();
  const [tasks, setTasks] = useState<BoardTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {{
    setLoading(true);
    setError(null);
    try {{
      const res = await {camel_client}.listTasks();
      setTasks(res.tasks);
    }} catch (err) {{
      setError(err instanceof Error ? err.message : t("{i18n_ns}.subtitle"));
    }} finally {{
      setLoading(false);
    }}
  }}, [t]);

  useEffect(() => {{
    void reload();
  }}, [reload]);

  const createTask = useCallback(
    async (title: string) => {{
      setBusy(true);
      setError(null);
      try {{
        await {camel_client}.createTask(title);
        await reload();
        return true;
      }} catch (err) {{
        setError(err instanceof Error ? err.message : "create failed");
        return false;
      }} finally {{
        setBusy(false);
      }}
    }},
    [reload],
  );

  return {{ tasks, loading, busy, error, reload, createTask }};
}}
'''


def _task_board_client(camel_client: str, bff_slug: str) -> str:
    return f'''import {{ eccFetch }} from "@/api/http";

export type BoardTask = {{
  id: string;
  title: string;
  status: string;
  column?: string | null;
  created_at: string;
}};

export type TaskListResponse = {{
  tasks: BoardTask[];
  count: number;
}};

export const {camel_client} = {{
  listTasks(limit = 50): Promise<TaskListResponse> {{
    return eccFetch<TaskListResponse>("/{bff_slug}/tasks", {{
      query: {{ limit: String(limit) }},
    }});
  }},
  createTask(title: string, column?: string): Promise<BoardTask> {{
    return eccFetch<BoardTask>("/{bff_slug}/tasks", {{
      method: "POST",
      body: {{ title, column: column ?? null }},
    }});
  }},
}};
'''


def _task_board_bff_schemas(service_name: str) -> str:
    return f'''"""Pydantic contracts for ECC → {service_name} task board BFF."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class EccCreateTaskRequest(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    column: str | None = None


class EccTaskView(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: UUID
    title: str
    status: str
    column: str | None = None
    created_at: datetime


class EccTaskListResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    tasks: list[EccTaskView]
    count: int
'''


def _task_board_bff_client(service_name: str, default_base: str) -> str:
    pascal = _pascal(service_name)
    err = service_name.upper()[:12]
    return f'''"""HTTP adapter for {service_name} task board peer."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from core.errors import ServiceError, StandardizedErrorResponse
from services.empery_control_center_api.src.integration.identity_client import (
    strip_bearer_token,
)


def _unavailable(reason: str) -> ServiceError:
    return ServiceError(
        StandardizedErrorResponse(
            error_code="{err}_UNAVAILABLE",
            message="{service_name} service is not available",
            details={{"reason": reason}},
        ),
        http_status=503,
    )


class {pascal}Client:
    def __init__(
        self,
        *,
        base_url: str = "{default_base}",
        logger: logging.Logger,
        timeout_seconds: float = 30.0,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._logger = logger
        self._timeout_seconds = timeout_seconds

    async def list_tasks(
        self, authorization: str | None, *, limit: int = 50
    ) -> dict[str, Any]:
        token = strip_bearer_token(authorization)
        url = f"{{self._base_url}}/api/v1/tasks"
        return await self._json("GET", url, token, params={{"limit": limit}})

    async def create_task(
        self, authorization: str | None, *, title: str, column: str | None = None
    ) -> dict[str, Any]:
        token = strip_bearer_token(authorization)
        url = f"{{self._base_url}}/api/v1/tasks"
        return await self._json(
            "POST", url, token, json_body={{"title": title, "column": column}}
        )

    async def _json(
        self,
        method: str,
        url: str,
        token: str | None,
        *,
        params: dict[str, Any] | None = None,
        json_body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        headers: dict[str, str] = {{}}
        if token:
            headers["Authorization"] = f"Bearer {{token}}"
        try:
            async with httpx.AsyncClient(timeout=self._timeout_seconds) as client:
                res = await client.request(
                    method, url, headers=headers, params=params, json=json_body
                )
        except httpx.HTTPError as exc:
            raise _unavailable(str(exc)) from exc
        if res.status_code >= 400:
            raise _unavailable(f"HTTP {{res.status_code}}: {{res.text[:200]}}")
        data = res.json()
        if not isinstance(data, dict):
            raise _unavailable("invalid JSON object")
        return data
'''


def _task_board_bff_use_cases(service_name: str) -> str:
    pascal = _pascal(service_name)
    return f'''"""BFF use cases for {service_name} task board."""

from __future__ import annotations

from core.container import ServiceContainer

from services.empery_control_center_api.src.data.{service_name}_schemas import (
    EccCreateTaskRequest,
    EccTaskListResponse,
    EccTaskView,
)


class Ecc{pascal}BffUseCases:
    def __init__(self, container: ServiceContainer) -> None:
        self._container = container

    def _client(self):
        return self._container.resolve("{service_name}_client")

    async def list_tasks(
        self, authorization: str | None, *, limit: int = 50
    ) -> EccTaskListResponse:
        raw = await self._client().list_tasks(authorization, limit=limit)
        tasks = [EccTaskView.model_validate(t) for t in (raw.get("tasks") or [])]
        return EccTaskListResponse(
            tasks=tasks, count=int(raw.get("count") or len(tasks))
        )

    async def create_task(
        self, authorization: str | None, body: EccCreateTaskRequest
    ) -> EccTaskView:
        raw = await self._client().create_task(
            authorization, title=body.title, column=body.column
        )
        return EccTaskView.model_validate(raw)
'''


def _task_board_bff_routes(service_name: str, bff_slug: str) -> str:
    pascal = _pascal(service_name)
    return f'''"""ECC BFF routes for {service_name} task board."""

from __future__ import annotations

from fastapi import APIRouter, Query, Request

from services.empery_control_center_api.src.core.{service_name}_bff_use_cases import (
    Ecc{pascal}BffUseCases,
)
from services.empery_control_center_api.src.data.{service_name}_schemas import (
    EccCreateTaskRequest,
    EccTaskListResponse,
    EccTaskView,
)

router = APIRouter(prefix="/{bff_slug}", tags=["{bff_slug}"])


def _uc(request: Request) -> Ecc{pascal}BffUseCases:
    return request.app.state.container.resolve("ecc_{service_name}_bff_use_cases")


@router.get("/tasks", response_model=EccTaskListResponse)
async def list_tasks(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
) -> EccTaskListResponse:
    auth = request.headers.get("authorization")
    return await _uc(request).list_tasks(auth, limit=limit)


@router.post("/tasks", response_model=EccTaskView, status_code=201)
async def create_task(
    request: Request, body: EccCreateTaskRequest
) -> EccTaskView:
    auth = request.headers.get("authorization")
    return await _uc(request).create_task(auth, body)
'''


# --- research_report ---


def _research_report_page(pascal: str, camel_client: str, i18n_ns: str) -> str:
    return f'''import {{ FormEvent, useState }} from "react";
import {{ useTranslation }} from "react-i18next";
import {{ Button }} from "@/components/Button";
import {{ ErrorBanner }} from "@/components/ErrorBanner";
import {{ Panel }} from "@/components/Panel";
import {{ SkeletonPulse }} from "@/components/SkeletonPulse";
import {{ RequireAuth }} from "@/features/auth/RequireAuth";
import {{ use{pascal}Session }} from "./use{pascal}Session";

/** ECC research reports — list + generate via living peer (Nervas-backed). */
function {pascal}PageInner() {{
  const {{ t }} = useTranslation();
  const session = use{pascal}Session();
  const [topic, setTopic] = useState("");

  async function onGenerate(event: FormEvent) {{
    event.preventDefault();
    const text = topic.trim();
    if (!text) return;
    const ok = await session.generateReport(text);
    if (ok) setTopic("");
  }}

  return (
    <div className="flex h-full min-h-0 flex-col gap-px bg-line">
      <Panel
        title={{t("{i18n_ns}.title")}}
        className="min-h-0 w-full rounded-none border-0 bg-field"
        flush
      >
        <div className="flex min-h-0 flex-col gap-4 overflow-auto p-4">
          <p className="font-body text-sm text-ink-muted">
            {{t("{i18n_ns}.subtitle")}}
          </p>
          {{session.error ? (
            <ErrorBanner
              message={{session.error}}
              onDismiss={{() => void session.reload()}}
            />
          ) : null}}
          <form
            onSubmit={{(e) => void onGenerate(e)}}
            className="flex flex-col gap-2 rounded-[var(--ecc-radius-md)] border border-line bg-canvas p-4"
          >
            <label className="flex flex-col gap-1">
              <span className="font-[Sora,sans-serif] text-xs text-ink-muted">
                {{t("{i18n_ns}.topic")}}
              </span>
              <textarea
                className="min-h-[6rem] w-full resize-y rounded-[var(--ecc-radius-sm)] border border-line bg-field px-3 py-2 font-body text-sm outline-none focus:border-signal"
                value={{topic}}
                disabled={{session.busy}}
                onChange={{(e) => setTopic(e.target.value)}}
                placeholder={{t("{i18n_ns}.placeholder")}}
              />
            </label>
            <Button type="submit" disabled={{session.busy || !topic.trim()}}>
              {{t("{i18n_ns}.generate")}}
            </Button>
          </form>
          <div className="space-y-2">
            {{session.loading ? <SkeletonPulse className="h-16 w-full" /> : null}}
            {{!session.loading && session.reports.length === 0 ? (
              <p className="text-sm text-ink-muted">{{t("{i18n_ns}.empty")}}</p>
            ) : null}}
            {{session.reports.map((report) => (
              <article
                key={{report.id}}
                className="rounded-[var(--ecc-radius-md)] border border-line bg-canvas px-4 py-3"
              >
                <p className="font-mono text-[10px] text-ink-muted">{{report.id}}</p>
                <p className="mt-1 font-body text-sm text-ink">{{report.topic}}</p>
                <p className="mt-2 font-[Sora,sans-serif] text-xs uppercase tracking-wide text-signal">
                  {{t("{i18n_ns}.status")}}: {{report.status}}
                </p>
              </article>
            ))}}
          </div>
        </div>
      </Panel>
    </div>
  );
}}

export function {pascal}Page() {{
  return (
    <RequireAuth>
      <{pascal}PageInner />
    </RequireAuth>
  );
}}
'''


def _research_report_hook(pascal: str, camel_client: str, i18n_ns: str) -> str:
    cf = _client_file(camel_client)
    return f'''import {{ useCallback, useEffect, useState }} from "react";
import {{ useTranslation }} from "react-i18next";
import {{ {camel_client}, type ResearchReport }} from "@/api/{cf}";

export function use{pascal}Session() {{
  const {{ t }} = useTranslation();
  const [reports, setReports] = useState<ResearchReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {{
    setLoading(true);
    setError(null);
    try {{
      const res = await {camel_client}.listReports();
      setReports(res.reports);
    }} catch (err) {{
      setError(err instanceof Error ? err.message : t("{i18n_ns}.subtitle"));
    }} finally {{
      setLoading(false);
    }}
  }}, [t]);

  useEffect(() => {{
    void reload();
  }}, [reload]);

  const generateReport = useCallback(
    async (topic: string) => {{
      setBusy(true);
      setError(null);
      try {{
        await {camel_client}.generateReport(topic);
        await reload();
        return true;
      }} catch (err) {{
        setError(err instanceof Error ? err.message : "generate failed");
        return false;
      }} finally {{
        setBusy(false);
      }}
    }},
    [reload],
  );

  return {{ reports, loading, busy, error, reload, generateReport }};
}}
'''


def _research_report_client(camel_client: str, bff_slug: str) -> str:
    return f'''import {{ eccFetch }} from "@/api/http";

export type ResearchReport = {{
  id: string;
  topic: string;
  status: string;
  summary?: string | null;
  created_at: string;
}};

export type ReportListResponse = {{
  reports: ResearchReport[];
  count: number;
}};

export const {camel_client} = {{
  listReports(limit = 50): Promise<ReportListResponse> {{
    return eccFetch<ReportListResponse>("/{bff_slug}/reports", {{
      query: {{ limit: String(limit) }},
    }});
  }},
  generateReport(topic: string): Promise<ResearchReport> {{
    return eccFetch<ResearchReport>("/{bff_slug}/reports", {{
      method: "POST",
      body: {{ topic }},
    }});
  }},
}};
'''


def _research_report_bff_schemas(service_name: str) -> str:
    return f'''"""Pydantic contracts for ECC → {service_name} research report BFF."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class EccGenerateReportRequest(BaseModel):
    topic: str = Field(min_length=1, max_length=4000)


class EccReportView(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: UUID
    topic: str
    status: str
    summary: str | None = None
    created_at: datetime


class EccReportListResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    reports: list[EccReportView]
    count: int
'''


def _research_report_bff_client(service_name: str, default_base: str) -> str:
    pascal = _pascal(service_name)
    err = service_name.upper()[:12]
    return f'''"""HTTP adapter for {service_name} research report peer."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from core.errors import ServiceError, StandardizedErrorResponse
from services.empery_control_center_api.src.integration.identity_client import (
    strip_bearer_token,
)


def _unavailable(reason: str) -> ServiceError:
    return ServiceError(
        StandardizedErrorResponse(
            error_code="{err}_UNAVAILABLE",
            message="{service_name} service is not available",
            details={{"reason": reason}},
        ),
        http_status=503,
    )


class {pascal}Client:
    def __init__(
        self,
        *,
        base_url: str = "{default_base}",
        logger: logging.Logger,
        timeout_seconds: float = 60.0,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._logger = logger
        self._timeout_seconds = timeout_seconds

    async def list_reports(
        self, authorization: str | None, *, limit: int = 50
    ) -> dict[str, Any]:
        token = strip_bearer_token(authorization)
        url = f"{{self._base_url}}/api/v1/reports"
        return await self._json("GET", url, token, params={{"limit": limit}})

    async def generate_report(
        self, authorization: str | None, *, topic: str
    ) -> dict[str, Any]:
        token = strip_bearer_token(authorization)
        url = f"{{self._base_url}}/api/v1/reports"
        return await self._json(
            "POST", url, token, json_body={{"topic": topic}}
        )

    async def _json(
        self,
        method: str,
        url: str,
        token: str | None,
        *,
        params: dict[str, Any] | None = None,
        json_body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        headers: dict[str, str] = {{}}
        if token:
            headers["Authorization"] = f"Bearer {{token}}"
        try:
            async with httpx.AsyncClient(timeout=self._timeout_seconds) as client:
                res = await client.request(
                    method, url, headers=headers, params=params, json=json_body
                )
        except httpx.HTTPError as exc:
            raise _unavailable(str(exc)) from exc
        if res.status_code >= 400:
            raise _unavailable(f"HTTP {{res.status_code}}: {{res.text[:200]}}")
        data = res.json()
        if not isinstance(data, dict):
            raise _unavailable("invalid JSON object")
        return data
'''


def _research_report_bff_use_cases(service_name: str) -> str:
    pascal = _pascal(service_name)
    return f'''"""BFF use cases for {service_name} research reports."""

from __future__ import annotations

from core.container import ServiceContainer

from services.empery_control_center_api.src.data.{service_name}_schemas import (
    EccGenerateReportRequest,
    EccReportListResponse,
    EccReportView,
)


class Ecc{pascal}BffUseCases:
    def __init__(self, container: ServiceContainer) -> None:
        self._container = container

    def _client(self):
        return self._container.resolve("{service_name}_client")

    async def list_reports(
        self, authorization: str | None, *, limit: int = 50
    ) -> EccReportListResponse:
        raw = await self._client().list_reports(authorization, limit=limit)
        reports = [
            EccReportView.model_validate(r) for r in (raw.get("reports") or [])
        ]
        return EccReportListResponse(
            reports=reports, count=int(raw.get("count") or len(reports))
        )

    async def generate_report(
        self, authorization: str | None, body: EccGenerateReportRequest
    ) -> EccReportView:
        raw = await self._client().generate_report(
            authorization, topic=body.topic
        )
        return EccReportView.model_validate(raw)
'''


def _research_report_bff_routes(service_name: str, bff_slug: str) -> str:
    pascal = _pascal(service_name)
    return f'''"""ECC BFF routes for {service_name} research reports."""

from __future__ import annotations

from fastapi import APIRouter, Query, Request

from services.empery_control_center_api.src.core.{service_name}_bff_use_cases import (
    Ecc{pascal}BffUseCases,
)
from services.empery_control_center_api.src.data.{service_name}_schemas import (
    EccGenerateReportRequest,
    EccReportListResponse,
    EccReportView,
)

router = APIRouter(prefix="/{bff_slug}", tags=["{bff_slug}"])


def _uc(request: Request) -> Ecc{pascal}BffUseCases:
    return request.app.state.container.resolve("ecc_{service_name}_bff_use_cases")


@router.get("/reports", response_model=EccReportListResponse)
async def list_reports(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
) -> EccReportListResponse:
    auth = request.headers.get("authorization")
    return await _uc(request).list_reports(auth, limit=limit)


@router.post("/reports", response_model=EccReportView, status_code=201)
async def generate_report(
    request: Request, body: EccGenerateReportRequest
) -> EccReportView:
    auth = request.headers.get("authorization")
    return await _uc(request).generate_report(auth, body)
'''
