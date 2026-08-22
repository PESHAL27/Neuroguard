"""
NeuroGuard AI Decision Engine
Uses AWS Bedrock to evaluate threats and return actionable decisions.
Replaces hardcoded auto-block with AI-driven response.
"""

import os
from typing import Dict, Any

try:
    from db import db
except ImportError:
    db = None

from agent.ai_engine import invoke_autonomous_agent
from agent.tools import block_ip


def _fallback_decision(threat_data: Dict[str, Any]) -> Dict[str, Any]:
    """Severity-based fallback when Bedrock is unavailable."""
    severity = (threat_data.get("severity") or "").lower()
    if severity == "critical":
        return {"decision": "block_ip", "reason": "Critical severity — auto-blocked by fallback rules", "confidence": 0.95}
    elif severity == "high":
        return {"decision": "block_ip", "reason": "High severity — auto-blocked by fallback rules", "confidence": 0.85}
    elif severity == "medium":
        return {"decision": "monitor", "reason": "Medium severity — monitoring recommended", "confidence": 0.7}
    else:
        return {"decision": "ignore", "reason": "Low severity — no immediate action required", "confidence": 0.6}


async def evaluate_threat(threat_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Evaluate a threat using Bedrock AI and return an actionable decision.
    Falls back to severity-based rules if AI is unavailable.
    """
    source_ip = threat_data.get("sourceIp") or threat_data.get("source_ip") or "unknown"
    device_id = threat_data.get("targetDevice") or threat_data.get("device_id") or "unknown"
    threat_type = threat_data.get("type", "unknown")
    severity = threat_data.get("severity", "Medium")
    score = threat_data.get("threatScore", 5)

    # Try AI decision
    decision_payload = _fallback_decision(threat_data)

    if os.getenv("OPENROUTER_API_KEY"):
        try:
            ai_context = {
                "event_type": "threat_evaluation",
                "threat_type": threat_type,
                "severity": severity,
                "threat_score": score,
                "source_ip": source_ip,
                "target_device": device_id,
                "instruction": (
                    "Evaluate this threat. Decide one action: block_ip, isolate_device, monitor, or ignore. "
                    "Return JSON with keys: decision, reason, confidence (0.0-1.0)."
                ),
            }
            ai_response = invoke_autonomous_agent(event_data=ai_context)

            if isinstance(ai_response, dict):
                # Handle cases where 'response' might be a plain string from error fallbacks
                resp_obj = ai_response.get("response", {})
                if not isinstance(resp_obj, dict):
                    resp_obj = {}
                
                ai_decision = ai_response.get("decision") or resp_obj.get("decision")
                ai_reason = ai_response.get("reason") or resp_obj.get("reason")
                ai_confidence = ai_response.get("confidence") or resp_obj.get("confidence")

                if ai_decision in ("block_ip", "isolate_device", "monitor", "ignore"):
                    decision_payload = {
                        "decision": ai_decision,
                        "reason": str(ai_reason or "AI-driven decision"),
                        "confidence": float(ai_confidence) if ai_confidence else 0.8,
                    }
        except Exception as e:
            print(f"AI decision engine error (using fallback): {e}")

    # Execute the decision
    actions_taken = []

    if decision_payload["decision"] == "block_ip":
        block_ip(source_ip)
        actions_taken.append(f"Blocked IP {source_ip}")
    elif decision_payload["decision"] == "isolate_device":
        if db is not None:
            await db.devices.update_one(
                {"device_id": device_id},
                {"$set": {"blocked": True, "connected": False, "monitor": False}},
            )
        actions_taken.append(f"Isolated device {device_id}")

    decision_payload["actions_taken"] = actions_taken

    # Store AI decision in ai_actions
    if db is not None:
        timestamp = threat_data.get("timestamp") or __import__("datetime").datetime.utcnow().isoformat()
        await db.ai_actions.insert_one({
            "action": f"ai_{decision_payload['decision']}",
            "decision": decision_payload["decision"],
            "reason": decision_payload["reason"],
            "confidence": decision_payload["confidence"],
            "ip": source_ip,
            "target": device_id,
            "threat_type": threat_type,
            "severity": severity,
            "timestamp": timestamp,
            "status": "completed",
        })

    return decision_payload
