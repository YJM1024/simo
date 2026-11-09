"""最小对话冒烟（不打印 key）。"""
import json
import os
import urllib.request

CONFIG = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "agentd", "config.local.json")
with open(CONFIG, "r", encoding="utf-8") as fh:
    cfg = json.load(fh)

base = cfg.get("baseURL", "https://api.deepseek.com").rstrip("/")
model = cfg.get("model", "deepseek-flash")
body = json.dumps({
    "model": model,
    "messages": [{"role": "user", "content": "只回复两个字：收到"}],
    "max_tokens": 512,
    "temperature": 0,
}).encode("utf-8")

req = urllib.request.Request(
    base + "/chat/completions",
    data=body,
    headers={"Authorization": f"Bearer {cfg['apiKey']}", "Content-Type": "application/json"},
    method="POST",
)
with urllib.request.urlopen(req, timeout=120) as resp:
    data = json.loads(resp.read().decode("utf-8"))

choice = data.get("choices", [{}])[0]
msg = choice.get("message", {})
print("model:", data.get("model"))
print("finish_reason:", choice.get("finish_reason"))
print("content:", repr(msg.get("content")))
print("reasoning_len:", len(msg.get("reasoning_content") or ""))
print("usage:", data.get("usage"))
