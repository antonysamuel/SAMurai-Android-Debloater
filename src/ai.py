"""AI provider configuration and chat."""
import json
import ssl
import urllib.request
from pathlib import Path

AI_CONFIG_FILE = Path(__file__).resolve().parent.parent / ".ai_config.json"

BUILTIN_PROVIDERS = {
    "nvidia": {
        "name": "NVIDIA Nemotron",
        "base_url": "https://integrate.api.nvidia.com/v1",
        "default_model": "nvidia/nemotron-3.5-lightning-30b-a3b",
        "format": "openai",
    },
    "gemini": {
        "name": "Google Gemini",
        "base_url": "https://generativelanguage.googleapis.com/v1beta",
        "default_model": "gemini-2.0-flash",
        "format": "gemini",
    },
    "openai": {
        "name": "OpenAI",
        "base_url": "https://api.openai.com/v1",
        "default_model": "gpt-4o-mini",
        "format": "openai",
    },
    "openrouter": {
        "name": "OpenRouter",
        "base_url": "https://openrouter.ai/api/v1",
        "default_model": "meta-llama/llama-3.1-8b-instruct:free",
        "format": "openai",
    },
    "groq": {
        "name": "Groq",
        "base_url": "https://api.groq.com/openai/v1",
        "default_model": "llama-3.1-70b-versatile",
        "format": "openai",
    },
    "ollama": {
        "name": "Ollama (Local)",
        "base_url": "http://localhost:11434/v1",
        "default_model": "llama3.1",
        "format": "openai",
    },
    "custom": {
        "name": "Custom OpenAI-Compatible",
        "base_url": "",
        "default_model": "",
        "format": "openai",
    },
}

_ai_config = {"provider": "", "api_key": "", "model": "", "base_url": ""}


def load_ai_config():
    global _ai_config
    if AI_CONFIG_FILE.exists():
        try:
            _ai_config = json.loads(AI_CONFIG_FILE.read_text())
        except Exception:
            pass


def save_ai_config(provider, api_key, model, base_url=""):
    global _ai_config
    if not api_key:
        api_key = _ai_config.get("api_key", "")
    _ai_config = {"provider": provider, "api_key": api_key, "model": model, "base_url": base_url}
    AI_CONFIG_FILE.write_text(json.dumps(_ai_config))


def list_models():
    cfg = _ai_config
    if not cfg.get("provider"):
        return {"error": "AI not configured."}

    provider_id = cfg["provider"]
    provider = BUILTIN_PROVIDERS.get(provider_id, BUILTIN_PROVIDERS["custom"])
    base_url = cfg.get("base_url", "").rstrip("/") or provider["base_url"]
    if not base_url:
        return {"error": "No API URL configured."}

    api_key = cfg.get("api_key", "")
    url = f"{base_url}/models"

    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    try:
        headers = {}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
            data = json.loads(resp.read())
            models = []
            for m in data.get("data", []):
                models.append({"id": m.get("id", ""), "owned_by": m.get("owned_by", "")})
            models.sort(key=lambda x: x["id"])
            return {"models": models}
    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else ""
        return {"error": f"API error {e.code}: {body[:300]}"}
    except Exception as e:
        return {"error": f"Failed to list models: {str(e)}"}


def get_ai_config_safe():
    """Return config with masked API key for frontend."""
    safe = dict(_ai_config)
    if safe.get("api_key"):
        safe["api_key"] = safe["api_key"][:8] + "..." + safe["api_key"][-4:]
    safe["providers"] = {
        k: {"name": v["name"], "default_model": v["default_model"], "base_url": v["base_url"]}
        for k, v in BUILTIN_PROVIDERS.items()
    }
    return safe


def ai_chat(messages):
    cfg = _ai_config
    if not cfg.get("provider"):
        return {"error": "AI not configured. Add your API key in AI Settings."}

    provider_id = cfg["provider"]
    provider = BUILTIN_PROVIDERS.get(provider_id, BUILTIN_PROVIDERS["custom"])

    base_url = cfg.get("base_url", "").rstrip("/") or provider["base_url"]
    if not base_url:
        return {"error": "No API URL configured. Set a base URL for custom providers."}

    model = cfg.get("model") or provider["default_model"]
    api_key = cfg.get("api_key", "")

    fmt = provider.get("format", "openai")
    if provider_id == "gemini" or "generativelanguage.googleapis.com" in base_url:
        fmt = "gemini"

    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    try:
        if fmt == "openai":
            url = f"{base_url}/chat/completions"
            body = {
                "model": model,
                "messages": messages,
                "temperature": 0.3,
                "max_tokens": 16384,
                "stream": False,
            }
            payload = json.dumps(body).encode()
            headers = {"Content-Type": "application/json"}
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"
            req = urllib.request.Request(url, data=payload, headers=headers)
            with urllib.request.urlopen(req, context=ctx, timeout=180) as resp:
                data = json.loads(resp.read())
                msg = data["choices"][0]["message"]
                content = msg.get("content") or ""
                reasoning = msg.get("reasoning_content") or ""
                print(f"[AI] content length={len(content)}, reasoning length={len(reasoning)}, content[:200]={content[:200]!r}")
                if not content and reasoning:
                    content = reasoning
                result = {"response": content}
                if reasoning and reasoning != content:
                    result["reasoning"] = reasoning
                return result

        elif fmt == "gemini":
            url = f"{base_url}/models/{model}:generateContent?key={api_key}"
            contents = []
            for m in messages:
                role = "user" if m["role"] in ("user", "system") else "model"
                contents.append({"role": role, "parts": [{"text": m["content"]}]})
            payload = json.dumps({"contents": contents}).encode()
            req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, context=ctx, timeout=180) as resp:
                data = json.loads(resp.read())
                text = data["candidates"][0]["content"]["parts"][0]["text"]
                return {"response": text}

    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else ""
        return {"error": f"API error {e.code}: {body[:300]}"}
    except Exception as e:
        return {"error": f"AI request failed: {str(e)}"}
