# Empery Intelligence Core (EIC)

Modular intelligence layer: Nervas providers, memory atoms, reflexes queue, and **Autonomous Mode** facade for the Control Center.

## Autonomous API

Prefix: `/api/v1/autonomous` (also mounted on ECC :8006).

| Method | Path |
|--------|------|
| POST | `/intentions` |
| GET | `/jobs`, `/jobs/{id}` |
| POST | `/jobs/{id}/pause\|resume\|cancel` |
| GET/PUT | `/mode` |
| GET/PUT | `/providers` |
| GET | `/memory/search` |
| GET | `/llm/health` |

## Env

| Variable | Default | Purpose |
|----------|---------|---------|
| `EIC_LLM_BASE_URL` | `http://127.0.0.1:8080` | llama.cpp OpenAI-compatible base (`EIC_LLAMA_BASE_URL` alias) |
| `EIC_PROVIDER` | `local` | `local` / `openai` / `anthropic` / `fake` |
| `EIC_USE_FAKE_NERVAS` | `false` | Force FakeNervas (CI) |
| `EIC_OPENAI_API_KEY` / `EIC_ANTHROPIC_API_KEY` | empty | Cloud adapters (graceful if missing) |
| `EIC_AUTONOMOUS_ENABLED` | `false` | Autonomous Mode boot default |
| `EIC_DATABASE_URL` | sqlite `.data/eic/memory.db` | Atom memory |
| `EIC_ALLOW_DOC_APPLY` | `false` | Gate self-doc apply |
| `EIC_ALLOW_RULES_APPLY` | `false` | Dual-gate for `.cursor/rules/**` |

Runtime provider switch: `PUT /api/v1/autonomous/providers` → `EIC_PROVIDER_RUNTIME_PATH` (no secrets in body).

## Run

```bash
# Optional local LLM
docker compose -f services/empery_intelligence_core/docker-compose.llama.yml up -d
export EIC_LLM_BASE_URL=http://127.0.0.1:8080
export EIC_PROVIDER=local

uvicorn services.empery_intelligence_core.src.api.main:create_app --factory --host 0.0.0.0 --port 8007
```

ECC mounts the same Autonomous API at `:8006/api/v1/autonomous/*`. UI: `/ops/autonomous`.

## Honesty

Headless “subagents” are LLM role turns using `.cursor/agents/*.md` + skills as **prompt templates**. There is **no** Cursor Task API dependency at runtime.

## Tests

```bash
# Unit / CI (FakeNervas)
pytest services/empery_intelligence_core/tests -q

# Live llama (skipped when :8080 unreachable)
pytest services/empery_intelligence_core/tests/test_llama_live.py -q
```
