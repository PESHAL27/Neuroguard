"""
NeuroGuard AI Threat Analyzer & Prediction Engine
Converts raw telemetry into threat events and predicts future attacks.
"""

from datetime import datetime
import json
import os

try:
    from db import sync_db
except ImportError:
    sync_db = None

from device_registry import is_monitorable_device
from agent.ai_engine import invoke_autonomous_agent
from agent.event_dispatcher import dispatch_sync

try:
    from agent.investigation_engine import on_threat_created
except ImportError:
    on_threat_created = None


def _build_suggested_action(attack_type: str, severity: str) -> str:
    if severity == "Critical":
        return "Block the source IP and isolate the affected device immediately."
    if attack_type == "port_scan":
        return "Monitor the source closely and block the IP if the scan repeats."
    if attack_type == "data_exfiltration":
        return "Inspect outbound traffic and isolate the affected device from the network."
    return "Continue investigation and validate the device against expected behavior."


def _build_logs(device_id: str, attack_type: str, timestamp: str, description: str):
    return [
        f"timestamp={timestamp}",
        f"target_device={device_id}",
        f"attack_type={attack_type}",
        f"summary={description}",
        "pipeline=backend-threat-analyzer",
    ]


def _json_safe(value):
    return json.loads(json.dumps(value, default=str))


def _build_ai_summary(event_payload: dict, threat: dict) -> str:
    if not os.getenv("OPENROUTER_API_KEY"):
        return (
            f"{threat['severity']} confidence {threat['type'].replace('_', ' ')} detected against "
            f"{threat['targetDevice']}. Backend lifecycle checks confirmed the device was connected and monitored at ingest time."
        )

    ai_response = invoke_autonomous_agent(
        event_data={
            "telemetry": _json_safe(event_payload),
            "threat": _json_safe(threat),
        }
    )
    summary = ai_response.get("response") if isinstance(ai_response, dict) else None
    if summary and "AI Core is offline" not in summary and "processing error" not in summary.lower():
        return summary

    return (
        f"{threat['severity']} confidence {threat['type'].replace('_', ' ')} detected against "
        f"{threat['targetDevice']}. Threat record generated from backend telemetry correlation."
    )


def _build_threat(device_id: str, source_ip: str, attack_type: str, severity: str, threat_score: int, description: str, timestamp: str, event_payload: dict):
    threat = {
        "sourceIp": source_ip or "unknown",
        "type": attack_type,
        "targetDevice": device_id,
        "severity": severity,
        "threatScore": threat_score,
        "description": description,
        "timestamp": timestamp,
        "resolved": False,
        "status": "active",
    }
    threat["attackPath"] = [threat["sourceIp"], "NAT_GATEWAY", device_id]
    threat["suggestedAction"] = _build_suggested_action(attack_type, severity)
    threat["logs"] = _build_logs(device_id, attack_type, timestamp, description)
    threat["aiSummary"] = _build_ai_summary(event_payload, threat)
    return threat


def analyze_threat(data: dict):
    """
    Rule-based threat analyzer.
    Converts raw telemetry data into threat events when anomalies are detected.
    """
    if sync_db is None:
        return None

    connections = data.get("connections", 0)
    device_id = data.get("device_id", "unknown")
    timestamp = data.get("timestamp", datetime.utcnow().isoformat())
    source_ip = data.get("sourceIp") or data.get("source_ip") or "unknown"

    device = sync_db.devices.find_one({"device_id": device_id})
    if not device:
        return None
    if not device.get("connected"):
        return None
    if not device.get("monitor"):
        return None
    if device.get("blocked"):
        return None
    if not is_monitorable_device(device):
        return None

    threat = None

    # Rule 1: High connection rate → port scan
    if connections > 120:
        threat = _build_threat(
            device_id,
            source_ip,
            "port_scan",
            "High",
            8,
            f"Anomalous connection rate ({connections}) detected on {device_id}",
            timestamp,
            data,
        )

    # Rule 2: Very high connection rate → DDoS
    if connections > 200:
        threat = _build_threat(
            device_id,
            source_ip,
            "ddos_attempt",
            "Critical",
            10,
            f"Extreme connection flood ({connections}) on {device_id} - possible DDoS",
            timestamp,
            data,
        )

    # Rule 3: High network usage → data exfiltration
    network_usage = data.get("network_usage", 0)
    if network_usage > 500:
        threat = _build_threat(
            device_id,
            source_ip,
            "data_exfiltration",
            "Critical",
            9,
            f"Abnormal outbound data volume ({network_usage}MB) from {device_id}",
            timestamp,
            data,
        )

    # Rule 4: Brute force detection (high connections, low network usage)
    if not threat and 80 < connections <= 120 and network_usage < 50:
        threat = _build_threat(
            device_id,
            source_ip,
            "brute_force",
            "High",
            8,
            f"Sustained high-frequency connection attempts ({connections}) with low payload on {device_id}",
            timestamp,
            data,
        )

    # Rule 5: Malware C2 beacon pattern (moderate connections with suspicious data)
    if not threat and 60 < connections <= 100 and 100 < network_usage <= 300:
        threat = _build_threat(
            device_id,
            source_ip,
            "malware_detected",
            "Critical",
            10,
            f"C2 beacon pattern detected: {connections} connections with {network_usage}MB transfer from {device_id}",
            timestamp,
            data,
        )

    # Rule 6: IoT Botnet (high connections with moderate data — coordinated bot behavior)
    if not threat and connections > 180 and 100 < network_usage <= 250:
        threat = _build_threat(
            device_id,
            source_ip,
            "iot_botnet",
            "Critical",
            10,
            f"IoT botnet behavior: {connections} coordinated connections with {network_usage}MB C2 traffic from {device_id}",
            timestamp,
            data,
        )

    # Rule 7: Firmware Exploit (low connections but high data transfer — firmware exfiltration/injection)
    if not threat and connections <= 60 and network_usage > 300:
        threat = _build_threat(
            device_id,
            source_ip,
            "firmware_exploit",
            "High",
            9,
            f"Firmware exploit pattern: {network_usage}MB transferred with only {connections} connections on {device_id}",
            timestamp,
            data,
        )

    if threat:
        sync_db.threats.insert_one(threat)

        # Fire event for downstream listeners (investigation, logging, etc.)
        dispatch_sync("threat_created_sync", threat)

        return threat

    return None


def predict_attack():
    """
    AI Threat Prediction Engine.
    Analyzes recent telemetry patterns and predicts future attacks.
    Returns the prediction if generated, None otherwise.
    """
    if sync_db is None:
        return None

    events = list(
        sync_db.telemetry.find().sort("timestamp", -1).limit(10)
    )

    events = [event for event in events if is_monitorable_device(sync_db.devices.find_one({"device_id": event.get("device_id")}))]

    if not events:
        return None

    # Calculate averages from recent telemetry
    conn_values = [e.get("connections", 0) for e in events if "connections" in e]
    net_values = [e.get("network_usage", 0) for e in events if "network_usage" in e]

    if not conn_values:
        return None

    avg_connections = sum(conn_values) / len(conn_values) if conn_values else 0
    avg_network = sum(net_values) / len(net_values) if net_values else 0

    prediction = None
    device_id = events[0].get("device_id", "unknown")
    timestamp = datetime.utcnow().isoformat()

    # Prediction: brute force likely if sustained high connections
    if avg_connections > 100:
        confidence = min(round(avg_connections / 150, 2), 0.98)
        prediction = {
            "device_id": device_id,
            "predicted_attack": "brute_force",
            "confidence": confidence,
            "risk_level": "high" if confidence > 0.7 else "medium",
            "reasoning": f"Avg connection rate {avg_connections:.0f}/min exceeds safe threshold",
            "timestamp": timestamp
        }

    # Prediction: data exfiltration if high sustained network usage
    elif avg_network > 300:
        confidence = min(round(avg_network / 500, 2), 0.95)
        prediction = {
            "device_id": device_id,
            "predicted_attack": "data_exfiltration",
            "confidence": confidence,
            "risk_level": "high" if confidence > 0.6 else "medium",
            "reasoning": f"Avg outbound traffic {avg_network:.0f}MB exceeds baseline",
            "timestamp": timestamp
        }

    # Prediction: low-level reconnaissance if moderate activity
    elif avg_connections > 60:
        confidence = round(avg_connections / 120, 2)
        prediction = {
            "device_id": device_id,
            "predicted_attack": "reconnaissance",
            "confidence": confidence,
            "risk_level": "medium" if confidence > 0.5 else "low",
            "reasoning": f"Elevated connection patterns ({avg_connections:.0f}/min) suggest probing",
            "timestamp": timestamp
        }

    if prediction:
        sync_db.predictions.insert_one(prediction)
        return prediction

    return None
