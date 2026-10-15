# Recipe: nervas_llm_peer

## Goal

Wire Empery intelligence to the living OpenAI-compatible LLM. Never default FakeNervas / FakeAI on the runtime path.

## Living peer inventory

Canonical catalog + Jinja chat templates (server-side):  
[`.cursor/orchestration/nervas/`](../nervas/README.md) · [`registry.yaml`](../nervas/registry.yaml)

| Role | Env | Lab example | Status |
|------|-----|-------------|--------|
| Primary chat (Gemma 4) | `EIC_LLM_BASE_URL` / `AI_CHAT_BASE_URL` | `http://192.168.1.111:8080` | **active** |
| Secondary instruct (Qwen3-4B) | `EIC_LLM_SECONDARY_BASE_URL` | `http://192.168.1.141:8083` | optional |
| Embedding (Qwen3-Embedding) | `EIC_EMBEDDING_BASE_URL` | `http://192.168.1.141:8081` | deferred |
| Rerank (Qwen3-Reranker) | `EIC_RERANK_BASE_URL` | `http://192.168.1.141:8082` | deferred |

Portable compose default: `host.containers.internal:8080`. Set LAN IPs in `.env` for this lab.

- Models: `GET {base}/v1/models`
- Provider: `EIC_PROVIDER=local`, `EIC_USE_FAKE_NERVAS=false`
- Intelligence: `INTELLIGENCE_USE_FAKE_AI=false`, `AI_CHAT_FALLBACK_FAKE=false`
- Chat templates: pass `--chat-template-file` from `nervas/templates/*.jinja` on the llama.cpp host (client does not render Jinja).

## Source parts

| Path | Role |
|------|------|
| `core/integration/nervas.py` | `NervasProvider` port |
| `services/empery_intelligence_core/src/integration/llama_cpp.py` | LlamaCpp adapter |
| `services/empery_intelligence_core/src/core/reflexes/agent_loop.py` | Parses eic JSON + Qwen/Gemma native tool markup |
| `PODMAN.md` § External Living Brain | Env contract |
| `tests/fakes/` | Test-only stubs — never copy into `services/*/src/` |

## Empery layout

Resolve via `ServiceContainer` key `nervas_provider`. Peers call the port or EIC/ECC HTTP — never another service's `src.core`.

## Assembly steps

1. Point compose/env at LAN llama — do not enable compose profile `llm` when external brain is used.
2. Match `EIC_LLAMA_MODEL` / `AI_CHAT_MODEL` to `GET /v1/models` id.
3. Health/readiness: nervas backend `local_llama`, `ready=true`, correct `base_url`.
4. Forbidden in runtime `src/`: FakeNervas, FakeAI, demo stub providers.
5. Verify from host: `curl -m 10 "$EIC_LLM_BASE_URL/v1/models"` and `python3 scripts/verify_living_brain.py`.

## Out of scope (now)

- Embedding / rerank adapter wiring (inventory only — see registry `status: deferred`)
- Training, multi-model routing UI, cloud OpenAI/Anthropic keys (optional later adapters only)
