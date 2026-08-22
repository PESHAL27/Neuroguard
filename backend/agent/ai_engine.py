"""
NeuroGuard AI Engine — OpenRouter
Replaces AWS Bedrock with OpenRouter API (OpenAI-compatible).
Model: inclusionai/ling-3.0-tiny:free
"""

import json
import os
import urllib.request
import urllib.error
import ssl

from dotenv import load_dotenv

load_dotenv()
load_dotenv(dotenv_path="../frontend/.env.local", override=False)

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL   = os.getenv("OPENROUTER_MODEL", "inclusionai/ling-3.0-tiny:free")
OPENROUTER_BASE    = "https://openrouter.ai/api/v1/chat/completions"

SYSTEM_PROMPT = """
SYSTEM PROMPT — NEUROGUARD AUTONOMOUS SOC AGENT

You are Neuro AI, an autonomous cybersecurity operations center assistant designed to monitor IoT devices, analyze network threats, investigate suspicious activity, and assist users in real-time.

You operate inside a cybersecurity dashboard that protects IoT infrastructure.

Your goals are:
1. Detect and investigate threats automatically
2. Assist the user with cybersecurity insights
3. Navigate the dashboard when needed
4. Trigger defensive actions when necessary
5. Provide clear spoken explanations for alerts

You must behave like a professional SOC analyst.

⸻

AUTONOMOUS BEHAVIOR

You are not only reactive. You should proactively investigate.

Whenever new telemetry, alerts, or suspicious logs appear:
1. Analyze the event
2. Determine the attack type
3. Calculate a threat score from 1–10
4. Decide whether to monitor or block the attacker
5. Recommend actions to the user

If threat_score >= 8 you should automatically recommend blocking the attacker.
If threat_score >= 9 you should immediately trigger a block action.

⸻

AVAILABLE TOOLS

You can call these tools to interact with the system:
- check_device_status(device_id)
- scan_network()
- get_recent_threats()
- block_ip(ip_address)
- navigate_page(page_path)
- generate_threat_report()
- get_device_list()

Use tools whenever they are necessary to gather evidence.

⸻

THREAT INVESTIGATION PROCEDURE

When suspicious activity is detected:
1. Identify the source IP
2. Check connection frequency
3. Identify scanned ports
4. Determine attack pattern

Common attack types include:
- Port Scan
- Brute Force Login
- Suspicious Traffic Spike
- Unauthorized Device Communication
- Malware Beaconing

You should classify the attack type and explain it.

⸻

THREAT INTELLIGENCE CORRELATION

If you detect multiple isolated attack vectors occurring simultaneously (e.g., 'port scan' AND 'login brute force' AND 'device beaconing'), you MUST explicitly state:
"Possible coordinated attack detected. Investigating further."

⸻

AUTOMATED DEFENSE

When malicious activity is confirmed:
1. Recommend blocking the attacker
2. Trigger block_ip(ip_address)
3. Log the event
4. Inform the user

Keep responses concise because they will be spoken by the voice system.

⸻

DASHBOARD NAVIGATION

You can open dashboard pages when the user asks or when investigation is required.
Examples of path strings: "/", "/dashboard", "/network", "/devices", "/threats", "/investigations", "/reports".
If an attack is detected automatically, navigate to the threats page "/threats".

⸻

RESPONSE FORMAT

Always respond in strictly valid JSON format exactly matching this schema, DO NOT wrap it in markdown block quotes:

{
  "response": "spoken explanation for the user",
  "threat_level": number,
  "actions": [
    {
      "type": "tool",
      "name": "tool_name",
      "arguments": {}
    },
    {
      "type": "navigate",
      "page": "/dashboard/page"
    }
  ]
}

⸻

VOICE ALERT STYLE

Your responses will be spoken by a voice system.
Speak clearly and professionally.
Avoid unnecessary filler text.
"""


def invoke_autonomous_agent(event_data: dict = None, command_override: str = None) -> dict:
    """
    Sends a request to OpenRouter (OpenAI-compatible API) using the configured model.
    Falls back gracefully if API key is missing or request fails.
    """
    if not OPENROUTER_API_KEY:
        return {
            "response": "Warning: AI Core is offline. OPENROUTER_API_KEY not configured.",
            "threat_level": 0,
            "actions": [],
        }

    user_message = "Analyze the current situation and respond in JSON."
    if event_data:
        user_message += f"\n\nSystem Telemetry/Event Context:\n{json.dumps(event_data, indent=2, default=str)}"
    if command_override:
        user_message += f'\n\nUser Voice Command: "{command_override}"'

    payload = {
        "model": OPENROUTER_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": user_message},
        ],
        "max_tokens": 1000,
        "temperature": 0.2,
    }

    headers = {
        "Authorization":  f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type":   "application/json",
        "HTTP-Referer":   "https://neurogaurd.app",
        "X-Title":        "NeuroGuard SOC Agent",
    }

    try:
        req = urllib.request.Request(
            OPENROUTER_BASE,
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST",
        )

        # Use default SSL context (proper verification)
        ctx = ssl.create_default_context()

        with urllib.request.urlopen(req, context=ctx, timeout=30) as response:
            res_data = json.loads(response.read().decode("utf-8"))

        # OpenAI-compatible response structure
        raw_text = (
            res_data.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "{}")
        )

        # Robust JSON extraction: find first { … last }
        start = raw_text.find("{")
        end   = raw_text.rfind("}")
        if start != -1 and end != -1 and start < end:
            return json.loads(raw_text[start : end + 1])

        # If the model returned plain text, wrap it
        return {
            "response": raw_text.strip() or "Threat analyzed. No structured output returned.",
            "threat_level": 5,
            "actions": [],
        }

    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"[OpenRouter] HTTP {e.code} Error: {body}")
        return {
            "response": f"AI core encountered HTTP {e.code} error.",
            "threat_level": 0,
            "actions": [],
        }
    except Exception as e:
        print(f"[OpenRouter] Request error: {e}")
        return {
            "response": "AI core encountered a processing error.",
            "threat_level": 0,
            "actions": [],
        }
