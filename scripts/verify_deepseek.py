"""验证 DeepSeek API key 与模型 id（不打印 key）。"""
import json
import os
import sys
import urllib.request

CONFIG = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "agentd", "config.local.json")

with open(CONFIG, "r", encoding="utf-8") as fh:
    cfg = json.load(fh)

base = cfg.get("baseURL", "https://api.deepseek.com").rstrip("/")
key = cfg["apiKey"]
model = cfg.get("model", "deepseek-flash")

def call(path):
    req = urllib.request.Request(
        base + path,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))

print(f"base={base} model={model} key_len={len(key)} prefix={key[:3]}***")
try:
    data = call("/models")
    ids = sorted({m.get("id") for m in data.get("data", []) if m.get("id")})
    print("models:", ", ".join(ids) if ids else "(empty)")
    print("model_found:", model in ids)
except Exception as exc:  # noqa: BLE001
    print("models_endpoint_error:", type(exc).__name__, str(exc)[:200])
    sys.exit(0)
