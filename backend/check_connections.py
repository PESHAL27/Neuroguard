"""
NeuroGuard — Quick API + Env Verification
"""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import os, json, urllib.request, ssl
from dotenv import load_dotenv

load_dotenv()
load_dotenv(dotenv_path="../frontend/.env.local", override=False)

MONGO_URI = os.getenv("MONGODB_URI", "")
MONGO_DB  = os.getenv("MONGODB_DB", "")
OR_KEY    = os.getenv("OPENROUTER_API_KEY", "")
OR_MODEL  = os.getenv("OPENROUTER_MODEL", "")

def mask(v, n=8):
    if not v: return "[NOT SET]"
    return v[:n] + "..." + v[-4:] if len(v) > n+4 else v[:n]

print("=" * 55)
print("  NeuroGuard -- Environment & Connection Check")
print("=" * 55)

print("\n[ENV VARIABLES]")
print(f"  MONGODB_URI        : {mask(MONGO_URI, 20)}")
print(f"  MONGODB_DB         : {MONGO_DB or '[NOT SET]'}")
print(f"  OPENROUTER_API_KEY : {mask(OR_KEY)}")
print(f"  OPENROUTER_MODEL   : {OR_MODEL or '[NOT SET]'}")

# --- MongoDB ---
print("\n[MONGODB TEST]")
if not MONGO_URI:
    print("  [FAIL] MONGODB_URI not set.")
else:
    try:
        from pymongo import MongoClient
        import certifi
        is_atlas = MONGO_URI.startswith("mongodb+srv://")
        opts = {"serverSelectionTimeoutMS": 4000}
        if is_atlas:
            opts["tlsCAFile"] = certifi.where()
        c = MongoClient(MONGO_URI, **opts)
        c.admin.command("ping")
        db = c[MONGO_DB or "neurogaurd"]
        cols = db.list_collection_names()
        print(f"  [OK] Connected ({'Atlas' if is_atlas else 'Local'})")
        print(f"  [OK] DB: {MONGO_DB}  |  Collections: {cols if cols else '(empty - will be created on first write)'}")
        c.close()
    except Exception as e:
        print(f"  [FAIL] {e}")

# --- OpenRouter ---
print("\n[OPENROUTER AI TEST]")
if not OR_KEY:
    print("  [FAIL] OPENROUTER_API_KEY not set.")
else:
    try:
        payload = {
            "model": OR_MODEL or "inclusionai/ling-3.0-tiny:free",
            "messages": [
                {"role": "system", "content": "You are NeuroGuard SOC AI."},
                {"role": "user",   "content": "Reply with exactly: {\"status\": \"online\", \"message\": \"NeuroGuard AI online\"}"}
            ],
            "max_tokens": 60,
            "temperature": 0.0,
        }
        req = urllib.request.Request(
            "https://openrouter.ai/api/v1/chat/completions",
            data=json.dumps(payload).encode(),
            headers={
                "Authorization": f"Bearer {OR_KEY}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://neurogaurd.app",
                "X-Title": "NeuroGuard",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, context=ssl.create_default_context(), timeout=20) as r:
            data = json.loads(r.read().decode())
        reply = data["choices"][0]["message"]["content"]
        print(f"  [OK] OpenRouter responded!")
        print(f"  [OK] Model: {OR_MODEL}")
        print(f"  [OK] Response: {reply.strip()[:120]}")
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"  [FAIL] HTTP {e.code}: {body[:200]}")
    except Exception as e:
        print(f"  [FAIL] {e}")

print("\n" + "=" * 55)
