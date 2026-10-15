# Nervas living brain — model inventory & chat templates

Empery talks to llama.cpp via **OpenAI-compatible** HTTP (`/v1/chat/completions`, later `/v1/embeddings`).  
These Jinja files are **server-side** chat templates (pass with `--chat-template-file` or bake into the GGUF). The client does **not** render them.

## Registry

Machine catalog: [`registry.yaml`](registry.yaml)

| Role | Lab URL | Model | Template | Status |
|------|---------|-------|----------|--------|
| Primary chat | `192.168.1.111:8080` | Gemma 4 | `templates/gemma4_canonical.jinja` | **active** (`EIC_LLM_BASE_URL`) |
| Secondary instruct | `192.168.1.141:8083` | Qwen3-4B-Instruct | `templates/qwen3_instruct.jinja` | optional (`EIC_LLM_SECONDARY_BASE_URL`) |
| Embedding | `192.168.1.141:8081` | Qwen3-Embedding-8B | `templates/qwen3_embedding.jinja` | **deferred** |
| Rerank | `192.168.1.141:8082` | Qwen3-Reranker-8B | `templates/qwen3_reranker.jinja` | **deferred** |

Portable defaults in `.env.example` use `host.containers.internal` — set LAN IPs in `.env` for this lab.

## Tool-call dialects (client parse)

Hands `parse_eic_actions` accepts:

1. JSON `eic_actions` / `tool_call(name, {…})` (legacy)
2. **Qwen** `<tool_call>{"name":…,"arguments":…}</tool_call>`
3. **Gemma 4** `<|tool_call>call:name{key:value…}<tool_call|>`

## llama.cpp tip

```bash
llama-server -m /models/gemma-4-26B.gguf --port 8080 \
  --chat-template-file /path/to/gemma4_canonical.jinja
```

Verify: `curl -m 10 "$EIC_LLM_BASE_URL/v1/models"` and `python3 scripts/verify_living_brain.py`.
