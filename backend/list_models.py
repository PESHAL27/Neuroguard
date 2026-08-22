"""
List available free models on OpenRouter to find the correct model ID.
"""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import os, json, urllib.request, ssl
from dotenv import load_dotenv

load_dotenv()
load_dotenv(dotenv_path="../frontend/.env.local", override=False)

OR_KEY = os.getenv("OPENROUTER_API_KEY", "")

req = urllib.request.Request(
    "https://openrouter.ai/api/v1/models",
    headers={"Authorization": f"Bearer {OR_KEY}"},
    method="GET",
)

with urllib.request.urlopen(req, context=ssl.create_default_context(), timeout=15) as r:
    data = json.loads(r.read().decode())

models = data.get("data", [])
# Filter for free models and show matching "ling" or "inclusion"
print(f"Total models: {len(models)}\n")
print("--- Free models (id contains 'ling' or 'inclusion' or ':free') ---")
for m in models:
    mid = m.get("id", "")
    pricing = m.get("pricing", {})
    prompt_price = pricing.get("prompt", "?")
    if ":free" in mid or "ling" in mid.lower() or "inclusion" in mid.lower():
        print(f"  {mid}  (prompt: {prompt_price})")

print("\n--- All :free models ---")
for m in models:
    mid = m.get("id", "")
    if ":free" in mid:
        print(f"  {mid}")
