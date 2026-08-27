"""
NeuroGuard AI Engine — Multi-Provider (Google Gemini / Vertex AI + OpenRouter + Offline Heuristics)
Provides real-time autonomous threat classification, root cause analysis, and defensive recommendations.
"""

import json
import os
import time
import urllib.request
import urllib.error
import ssl
from typing import Dict, Any, Optional

from dotenv import load_dotenv

load_dotenv()
load_dotenv(dotenv_path="../frontend/.env.local", override=False)

# Provider Configuration
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY", "")
GEMINI_MODEL   = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL   = os.getenv("OPENROUTER_MODEL", "inclusionai/ling-3.0-tiny:free")
OPENROUTER_BASE    = "https://openrouter.ai/api/v1/chat/completions"

# In-memory incident cache to debounce repetitive attack telemetry (avoids 429 quota limits)
_INCIDENT_CACHE: Dict[str, Dict[str, Any]] = {}
CACHE_TTL_SECONDS = 15

SYSTEM_PROMPT = """
SYSTEM PROMPT — NEUROGUARD AUTONOMOUS SOC AGENT

You are Neuro AI, an autonomous cybersecurity operations center assistant designed to monitor IoT devices (ESP32 nodes, ESP32-CAM video streams, gateways), analyze network threats, investigate suspicious activity, and assist users in real-time.

Your goals are:
1. Detect and investigate threats automatically
2. Assist the user with cybersecurity insights
3. Navigate the dashboard when needed
4. Trigger defensive actions when necessary (e.g., block_ip, isolate_device)
5. Provide clear spoken explanations for alerts

Whenever new telemetry or suspicious events appear:
1. Analyze the event
2. Determine the attack type (Port Scan, SYN Flood, Stream Hijack/DDoS, Brute Force, Device Spoofing)
3. Calculate a threat score from 1–10
4. Recommend actions to the user

RESPONSE FORMAT:
Always respond in strictly valid JSON format matching this schema without markdown fences:
{
  "response": "Concise SOC analyst spoken explanation",
  "threat_level": 8,
  "actions": [
    {
      "type": "tool",
      "name": "block_ip",
      "arguments": {"ip": "192.168.1.5"}
    },
    {
      "type": "navigate",
      "page": "/threats"
    }
  ]
}
"""


def _generate_cache_key(event_data: Optional[dict], command_override: Optional[str]) -> str:
    """Creates a lightweight signature key for debouncing."""
    if command_override:
        return f"cmd:{command_override.strip().lower()}"
    if not event_data:
        return "generic"
    src = event_data.get("source_ip") or event_data.get("sourceIp") or event_data.get("ip", "")
    etype = event_data.get("event") or event_data.get("type") or event_data.get("protocol", "")
    dport = event_data.get("port") or event_data.get("dport", "")
    return f"{src}:{etype}:{dport}"


def _call_gemini_api(prompt_text: str) -> Optional[dict]:
    """Calls Google Gemini REST API."""
    if not GEMINI_API_KEY:
        return None

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": f"{SYSTEM_PROMPT}\n\nTask:\n{prompt_text}"}
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 800,
            "responseMimeType": "application/json"
        }
    }

    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, context=ctx, timeout=12) as response:
            res_data = json.loads(response.read().decode("utf-8"))

        raw_text = (
            res_data.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("text", "{}")
        )

        start = raw_text.find("{")
        end   = raw_text.rfind("}")
        if start != -1 and end != -1 and start < end:
            return json.loads(raw_text[start : end + 1])
    except Exception as e:
        print(f"[Gemini AI] Request notice: {e}")
    return None


def _call_openrouter_api(prompt_text: str) -> Optional[dict]:
    """Calls OpenRouter API."""
    if not OPENROUTER_API_KEY:
        return None

    payload = {
        "model": OPENROUTER_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": prompt_text},
        ],
        "max_tokens": 800,
        "temperature": 0.2,
    }
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type":  "application/json",
        "HTTP-Referer":  "https://neuroguard.app",
        "X-Title":       "NeuroGuard SOC Agent",
    }
    try:
        req = urllib.request.Request(
            OPENROUTER_BASE,
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, context=ctx, timeout=3) as response:
            res_data = json.loads(response.read().decode("utf-8"))

        raw_text = (
            res_data.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "{}")
        )
        start = raw_text.find("{")
        end   = raw_text.rfind("}")
        if start != -1 and end != -1 and start < end:
            return json.loads(raw_text[start : end + 1])
    except Exception as e:
        print(f"[OpenRouter] Request notice: {e}")
    return None


def _offline_heuristic_engine(event_data: Optional[dict], command_override: Optional[str]) -> dict:
    """Fast, reliable fallback reasoning when APIs are offline or rate-limited."""
    if command_override:
        cmd = command_override.lower()
        if "block" in cmd or "mitigate" in cmd:
            return {
                "response": "Initiating automated defensive quarantine for malicious IP.",
                "threat_level": 8,
                "actions": [{"type": "tool", "name": "block_ip", "arguments": {}}],
            }
        if "threat" in cmd or "scan" in cmd or "status" in cmd:
            return {
                "response": "Displaying active security investigations and device telemetry.",
                "threat_level": 2,
                "actions": [{"type": "navigate", "page": "/threats"}],
            }

    connections = (event_data or {}).get("connections", 0)
    bytes_val = (event_data or {}).get("bytes", 0)
    src_ip = (event_data or {}).get("source_ip") or (event_data or {}).get("sourceIp", "192.168.1.42")

    if connections > 80 or bytes_val > 100000:
        return {
            "response": f"High anomalous traffic volume detected from {src_ip}. Possible DoS or stream flooding attack against IoT node. Recommending immediate quarantine.",
            "threat_level": 9,
            "actions": [
                {"type": "tool", "name": "block_ip", "arguments": {"ip": src_ip}},
                {"type": "navigate", "page": "/threats"}
            ],
        }

    return {
        "response": f"IoT telemetry normal. Active monitoring active for host {src_ip}.",
        "threat_level": 2,
        "actions": [],
    }


def invoke_autonomous_agent(event_data: dict = None, command_override: str = None) -> dict:
    """
    Unified AI invoker with Debouncing, Gemini AI priority, OpenRouter fallback, and offline heuristic safety net.
    """
    now = time.time()
    cache_key = _generate_cache_key(event_data, command_override)

    # Check cache for debouncing repetitive bursts (e.g. fast port scans)
    if cache_key in _INCIDENT_CACHE:
        cached_entry = _INCIDENT_CACHE[cache_key]
        if now - cached_entry["time"] < CACHE_TTL_SECONDS:
            return cached_entry["result"]

    # Build prompt
    prompt_text = "Analyze the current IoT security situation and provide assessment in JSON."
    if event_data:
        prompt_text += f"\n\nContext Event:\n{json.dumps(event_data, indent=2, default=str)}"
    if command_override:
        prompt_text += f'\n\nUser Voice/Command: "{command_override}"'

    # Try Google Gemini first
    result = _call_gemini_api(prompt_text)

    # Try OpenRouter if Gemini did not succeed
    if not result:
        result = _call_openrouter_api(prompt_text)

    # Heuristic fallback if both cloud AI calls are unavailable
    if not result:
        result = _offline_heuristic_engine(event_data, command_override)

    # Cache result
    _INCIDENT_CACHE[cache_key] = {"time": now, "result": result}
    return result

