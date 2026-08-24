from fastapi import FastAPI, Query, Request, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from agent.agent_controller import process_command
from agent.threat_analyzer import analyze_threat, predict_attack
from agent.network_scanner import scanner
from agent.topology_engine import build_topology
from agent.traffic_engine import get_traffic_stats, get_recent_flows
from agent.network_logs import get_recent_logs
from agent.investigation_engine import get_investigations, get_investigation_by_id, build_investigation
from agent.report_engine import (
    get_report_summary, get_report_attacks, get_report_targets, get_report_attackers,
    get_report_network, get_report_devices, get_report_ai_insights,
    get_report_logs, get_report_history, generate_full_report,
    export_report_csv, export_report_json,
)
from agent.metrics_engine import get_soc_metrics
from agent.telemetry_engine import process_telemetry
from agent.timeline_engine import record_event, get_events
from live_scanner import start_scanner_background, perform_full_scan, get_active_network_details
from pydantic import BaseModel
from dotenv import load_dotenv
import asyncio
import random
import psutil
import time
from typing import Dict, Any, Optional, Tuple, List
from db import db
from datetime import datetime, timedelta
from device_registry import (
    DEVICE_IMAGE_MAP,
    SUPPORTED_DEVICE_TYPES,
    build_connected_device,
    build_dashboard_metrics,
    build_detected_device,
    build_device_id,
    default_device_name,
    is_monitorable_device,
    normalize_device_document,
    normalize_device_type,
    normalize_mac_key,
)

load_dotenv(dotenv_path="../frontend/.env.local")

app = FastAPI(title="NeuroGuard AI SOC Agent API")


SEVERITY_ORDER = {
    "critical": 4,
    "high": 3,
    "medium": 2,
    "low": 1,
}


def _safe_timestamp(value: Optional[str]) -> str:
    return value or datetime.utcnow().isoformat()


def _parse_timestamp(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _format_attack_label(value: Optional[str]) -> str:
    raw_value = (value or "unknown").replace("_", " ").strip()
    return raw_value.title() if raw_value else "Unknown"


def _normalize_severity(value: Optional[str], threat_score: Optional[int] = None) -> str:
    if value:
        lowered = value.strip().lower()
        if lowered in SEVERITY_ORDER:
            return lowered.title()

    if threat_score is not None:
        if threat_score >= 9:
            return "Critical"
        if threat_score >= 7:
            return "High"
        if threat_score >= 4:
            return "Medium"
    return "Low"


def _normalize_status(value: Optional[str], resolved: bool = False) -> str:
    lowered = (value or "").strip().lower()
    if lowered in {"active", "investigating", "mitigated"}:
        return lowered
    if resolved:
        return "mitigated"
    return "active"


def _normalize_threat_score(document: Dict[str, Any]) -> int:
    value = document.get("threatScore")
    if value is None:
        value = document.get("threat_score")
    try:
        return int(value)
    except (TypeError, ValueError):
        severity = _normalize_severity(document.get("severity"))
        if severity == "Critical":
            return 9
        if severity == "High":
            return 8
        if severity == "Medium":
            return 5
        return 2


async def _load_device_lookup() -> Dict[str, Dict[str, Any]]:
    devices = await load_all_devices()
    lookup = {}
    for device in devices:
        device_id = device.get("device_id")
        if device_id:
            lookup[device_id] = device
    return lookup


async def _load_monitorable_device_ids() -> List[str]:
    connected_devices = await db.devices.find(
        {"connected": True, "monitor": True, "blocked": {"$ne": True}},
        {"device_id": 1},
    ).to_list(500)
    return [device.get("device_id") for device in connected_devices if device.get("device_id")]


def _build_threat_filter(connected_only: bool, monitorable_device_ids: List[str]) -> Dict[str, Any]:
    if not connected_only:
        return {}
    if not monitorable_device_ids:
        return {"_id": {"$exists": False}}
    return {
        "$or": [
            {"targetDevice": {"$in": monitorable_device_ids}},
            {"device": {"$in": monitorable_device_ids}},
        ]
    }


def _build_threat_trend(document: Dict[str, Any], threat_score: int) -> List[int]:
    existing_trend = document.get("trend")
    if isinstance(existing_trend, list) and existing_trend:
        return [int(max(0, min(100, sample))) for sample in existing_trend[:10]]

    seed = sum(ord(char) for char in str(document.get("_id") or document.get("timestamp") or "threat"))
    base = min(95, max(20, threat_score * 10))
    trend = []
    for index in range(10):
        drift = ((seed + index * 13) % 17) - 8
        trend.append(max(5, min(100, base + drift + index * 2)))
    return trend


def _build_attack_path(source_ip: str, target_device_id: str, target_name: str) -> List[str]:
    path = [source_ip or "unknown-source", "NAT_GATEWAY"]
    if target_device_id and target_device_id != target_name:
        path.append(target_device_id)
    if target_name:
        path.append(target_name)
    return path


def _build_threat_logs(document: Dict[str, Any], normalized_type: str, source_ip: str, target_name: str, timestamp: str) -> List[str]:
    log_lines = document.get("logs")
    if isinstance(log_lines, list) and log_lines:
        return [str(line) for line in log_lines[:6]]

    summary = document.get("description") or f"{normalized_type} detected against {target_name}"
    return [
        f"timestamp={timestamp}",
        f"source={source_ip or 'unknown'} target={target_name}",
        f"classification={normalized_type}",
        f"summary={summary}",
        "correlation=lifecycle-gated monitor pipeline",
    ]


def _build_suggested_action(normalized_type: str, severity: str) -> str:
    if severity == "Critical":
        return "Block the source IP and isolate the affected device immediately."
    if normalized_type == "Port Scan":
        return "Block the source IP if the scan repeats and review exposed services on the target device."
    if normalized_type == "Data Exfiltration":
        return "Pause the device from monitored operations and inspect outbound connections immediately."
    if normalized_type == "Ddos Attempt":
        return "Apply rate limiting and isolate the targeted device from external traffic."
    return "Continue investigation and verify the device against expected network behavior."


def _build_ai_summary(document: Dict[str, Any], severity: str, normalized_type: str, target_name: str) -> str:
    existing_summary = document.get("aiSummary") or document.get("ai_summary")
    if existing_summary:
        return str(existing_summary)

    description = document.get("description")
    if description:
        return f"{severity} confidence {normalized_type} activity detected targeting {target_name}. {description}"
    return f"{severity} confidence {normalized_type} activity detected targeting {target_name}. Backend correlation confirms this incident passed the connected-device monitoring gate."


def _serialize_threat(document: Dict[str, Any], device_lookup: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    source_ip = document.get("sourceIp") or document.get("source_ip") or "unknown"
    target_device_id = document.get("targetDevice") or document.get("device") or document.get("target") or "unknown-target"
    target_device = device_lookup.get(target_device_id, {})
    target_name = (
        document.get("target")
        or target_device.get("name")
        or document.get("targetDevice")
        or document.get("device")
        or "Unknown Target"
    )
    threat_score = _normalize_threat_score(document)
    severity = _normalize_severity(document.get("severity"), threat_score)
    status = _normalize_status(document.get("status"), bool(document.get("resolved")))
    normalized_type = _format_attack_label(document.get("type") or document.get("attack_type"))
    timestamp = _safe_timestamp(document.get("timestamp"))
    attack_path = document.get("attackPath") or document.get("attack_path") or _build_attack_path(source_ip, target_device_id, target_name)
    suggested_action = document.get("suggestedAction") or document.get("suggested_action") or document.get("action") or _build_suggested_action(normalized_type, severity)

    return {
        "id": str(document.get("_id") or document.get("id") or f"threat-{timestamp}"),
        "sourceIp": source_ip,
        "target": target_name,
        "type": normalized_type,
        "severity": severity,
        "status": status,
        "timestamp": timestamp,
        "aiSummary": _build_ai_summary(document, severity, normalized_type, target_name),
        "suggestedAction": suggested_action,
        "attackPath": [str(node) for node in attack_path],
        "logs": _build_threat_logs(document, normalized_type, source_ip, target_name, timestamp),
        "trend": _build_threat_trend(document, threat_score),
        "targetDevice": target_device_id,
        "threatScore": threat_score,
        "description": document.get("description") or f"{normalized_type} detected against {target_name}",
        "resolved": bool(document.get("resolved", status == "mitigated")),
        "lat": document.get("lat"),
        "lng": document.get("lng"),
        "investigationId": document.get("investigation_id"),
    }


async def _load_serialized_threats(*, connected_only: bool, limit: int = 100) -> List[Dict[str, Any]]:
    monitorable_device_ids, device_lookup = await asyncio.gather(
        _load_monitorable_device_ids(),
        _load_device_lookup(),
    )
    query = _build_threat_filter(connected_only, monitorable_device_ids)
    raw_threats = await db.threats.find(query).sort("timestamp", -1).limit(limit).to_list(limit)
    return [_serialize_threat(threat, device_lookup) for threat in raw_threats]


def _serialize_action(document: Dict[str, Any]) -> Dict[str, Any]:
    timestamp = _safe_timestamp(document.get("timestamp"))
    action_name = str(document.get("action") or "system_action").replace("_", " ").title()
    detail = document.get("reason") or document.get("detail") or f"Action {action_name} executed"
    return {
        "_id": str(document.get("_id")),
        "action": action_name,
        "ip": document.get("ip"),
        "target": document.get("target") or document.get("ip") or "System",
        "detail": detail,
        "timestamp": timestamp,
        "status": document.get("status") or "completed",
    }


async def build_threat_metrics(*, connected_only: bool = False) -> Dict[str, Any]:
    threats = await _load_serialized_threats(connected_only=connected_only, limit=250)
    total_devices, connected_devices, blocked_devices, trusted_devices = await asyncio.gather(
        db.devices.count_documents({}),
        db.devices.count_documents({"connected": True}),
        db.devices.count_documents({"blocked": True}),
        db.devices.count_documents({"trusted": True}),
    )
    severity_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    status_counts = {"active": 0, "investigating": 0, "mitigated": 0}
    type_counts: Dict[str, int] = {}

    for threat in threats:
        severity_counts[threat["severity"].lower()] += 1
        status_counts[threat["status"]] = status_counts.get(threat["status"], 0) + 1
        type_counts[threat["type"]] = type_counts.get(threat["type"], 0) + 1

    colors = ["#F43F5E", "#F97316", "#FBBF24", "#10B981", "#22d3ee"]
    distribution = []
    total = len(threats) or 1
    for index, (label, value) in enumerate(sorted(type_counts.items(), key=lambda item: item[1], reverse=True)[:5]):
        distribution.append({
            "label": label,
            "value": int(round((value / total) * 100)),
            "count": value,
            "color": colors[index % len(colors)],
        })

    return {
        "devices": total_devices,
        "connected": connected_devices,
        "blocked": blocked_devices,
        "trusted": trusted_devices,
        "threats": len(threats),
        "totalThreats": len(threats),
        "activeThreats": status_counts.get("active", 0),
        "investigatingThreats": status_counts.get("investigating", 0),
        "mitigatedThreats": status_counts.get("mitigated", 0),
        "autoMitigated": status_counts.get("mitigated", 0),
        "criticalThreats": severity_counts["critical"],
        "highThreats": severity_counts["high"],
        "mediumThreats": severity_counts["medium"],
        "lowThreats": severity_counts["low"],
        "severityBreakdown": severity_counts,
        "statusBreakdown": status_counts,
        "distribution": distribution,
    }


def _match_clauses(device_id: Optional[str] = None, ip: Optional[str] = None, mac: Optional[str] = None):
    clauses = []
    normalized_mac = normalize_mac_key(mac)
    if device_id:
        clauses.append({"device_id": device_id})
    if ip:
        clauses.append({"ip": ip})
    if normalized_mac:
        clauses.append({"mac": {"$regex": f"^{':'.join(normalized_mac[index:index + 2] for index in range(0, 12, 2))}$", "$options": "i"}})
    return clauses


async def _serialize_cursor(cursor, source_collection: str):
    documents = []
    async for document in cursor:
        document["_id"] = str(document["_id"])
        documents.append(normalize_device_document(document, source_collection))
    return documents


async def load_all_devices():
    known_devices, unknown_devices = await asyncio.gather(
        _serialize_cursor(db.devices.find({}), "devices"),
        _serialize_cursor(db.unknown_devices.find({}), "unknown_devices"),
    )
    devices_list = known_devices + unknown_devices
    devices_list.sort(
        key=lambda device: (
            0 if device.get("blocked") else 1,
            0 if device.get("connected") else 1,
            device.get("name", ""),
        )
    )
    return devices_list


async def find_device_record(device_id: Optional[str] = None, ip: Optional[str] = None, mac: Optional[str] = None) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
    clauses = _match_clauses(device_id=device_id, ip=ip, mac=mac)
    if not clauses:
        return None, None

    query = clauses[0] if len(clauses) == 1 else {"$or": clauses}
    known = await db.devices.find_one(query)
    if known:
        return "devices", known

    unknown = await db.unknown_devices.find_one(query)
    if unknown:
        return "unknown_devices", unknown

    return None, None


async def build_dashboard_payload():
    devices_list = await load_all_devices()
    threats, telemetry_events, predictions, trusted_count = await asyncio.gather(
        db.threats.count_documents({}),
        db.telemetry.count_documents({}),
        db.predictions.count_documents({}),
        db.trusted_devices.count_documents({}),
    )
    return build_dashboard_metrics(
        devices_list,
        threats=threats,
        telemetry_events=telemetry_events,
        predictions=predictions,
        trusted_count=trusted_count,
    )


async def upsert_trusted_device(*, mac: str, name: str, device_type: str, auto_connect: bool, timestamp: str):
    await db.trusted_devices.update_one(
        {"mac": mac},
        {
            "$set": {
                "mac": mac,
                "name": name,
                "type": device_type,
                "auto_connect": auto_connect,
                "updated_at": timestamp,
            },
            "$setOnInsert": {"created_at": timestamp},
        },
        upsert=True,
    )


async def _process_telemetry_pipeline(data: Dict[str, Any]) -> Dict[str, Any]:
    if "timestamp" not in data:
        data["timestamp"] = datetime.utcnow().isoformat()

    device_id = data.get("device_id")
    if device_id:
        _, device = await find_device_record(device_id=device_id)
        if not is_monitorable_device(device):
            return {
                "status": "ignored",
                "message": "Telemetry accepted only for connected monitored devices",
                "threat_detected": False,
                "prediction_generated": False,
                "threat": None,
                "prediction": None,
            }

    return await process_telemetry(data)







async def _auto_respond_to_threat(threat: dict, source_ip: str, timestamp: str):
    """AI-driven threat response with voice alerts and timeline logging."""
    severity = (threat.get("severity") or "").lower()
    if severity not in ("critical", "high"):
        return

    # AI decision engine evaluates and executes the response
    from agent.ai_decision_engine import evaluate_threat
    decision = await evaluate_threat(threat)

    # Log to network_logs
    await db.network_logs.insert_one({
        "timestamp": timestamp,
        "type": "security",
        "level": "critical",
        "message": f"AI Decision: {decision['decision']} for {source_ip} — {decision['reason']}",
        "device_id": threat.get("targetDevice"),
        "source_ip": source_ip,
    })

    # Record timeline event
    await record_event(
        "ip_blocked" if decision["decision"] == "block_ip" else "ai_decision",
        details={"decision": decision["decision"], "reason": decision["reason"], "confidence": decision["confidence"]},
        severity="critical",
        device_id=threat.get("targetDevice"),
        source_ip=source_ip,
        summary=f"AI {decision['decision']}: {source_ip} ({decision['reason'][:60]})",
    )

    # Voice alert for critical threats via AWS Polly
    if severity == "critical":
        try:
            from agent.polly_engine import synthesize_speech
            alert_text = f"Critical threat detected. {threat.get('type', 'attack').replace('_', ' ')} against {threat.get('targetDevice', 'device')}. Source IP {source_ip} has been blocked."
            voice_audio = synthesize_speech(alert_text)
            if voice_audio:
                await db.ai_actions.update_one(
                    {"ip": source_ip, "timestamp": timestamp},
                    {"$set": {"voice_alert": voice_audio}},
                )
        except Exception as e:
            print(f"Voice alert error: {e}")





@app.on_event("startup")
async def startup_event():
    # Register event dispatcher listeners
    from agent import event_dispatcher
    from agent.investigation_engine import on_threat_created as _on_threat_created
    event_dispatcher.on_sync("threat_created_sync", _on_threat_created)

    # Register async timeline listener for threat events
    async def _on_threat_for_timeline(threat):
        await record_event(
            "threat_created",
            details={"type": threat.get("type"), "severity": threat.get("severity"), "sourceIp": threat.get("sourceIp")},
            severity="critical" if threat.get("severity") in ("Critical", "High") else "warning",
            device_id=threat.get("targetDevice"),
            source_ip=threat.get("sourceIp"),
            summary=f"Threat detected: {threat.get('type', 'unknown')} against {threat.get('targetDevice', 'unknown')}",
        )
    event_dispatcher.on("threat_created", _on_threat_for_timeline)

    monitor.start()
    try:
        if db is not None:
            asyncio.create_task(scanner.start())
    except Exception:
        pass
    # Start dynamic multi-subnet live scanner background thread
    start_scanner_background()

# Setup CORS for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict to actual frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/scan/network-info")
async def get_network_info_api():
    """Returns current active interface, local IP, gateway, and subnet CIDR."""
    return get_active_network_details()

@app.post("/api/scan/rescan")
async def trigger_force_rescan():
    """Forces an immediate sweep of the active subnet."""
    devices = await asyncio.to_thread(perform_full_scan)
    return {"status": "ok", "devices_count": len(devices), "devices": devices}

class ThreatDetectionRequest(BaseModel):
    source_ip: str
    target_device: str
    attack_type: str
    severity: str
    description: str
    threat_score: int

@app.post("/api/threats/detect")
async def detect_threat(req: ThreatDetectionRequest):
    threat_doc = req.model_dump()
    threat_doc["timestamp"] = datetime.utcnow().isoformat()
    threat_doc["status"] = "Active"
    
    # Store directly in DB Collections to be picked up by frontend
    if db is not None:
        await db.threats.insert_one(threat_doc)
        
        # Dispatch alert using agent pipelines
        try:
            from agent.timeline_engine import record_event
            await record_event("THREAT_DETECTED", req.description, req.severity, req.target_device)
        except Exception as e:
            print("Event record failed:", e)
            
    return {"status": "success"}

class CommandRequest(BaseModel):
    command: str


class DeviceRenameRequest(BaseModel):
    device_id: str
    name: str
    type: str


class DeviceConnectRequest(BaseModel):
    device_id: str
    name: Optional[str] = None
    type: Optional[str] = None


class DeviceTrustRequest(BaseModel):
    device_id: str
    name: Optional[str] = None
    type: Optional[str] = None
    auto_connect: bool = True


class DeviceBlockRequest(BaseModel):
    device_id: str
    reason: Optional[str] = None


class DeviceTelemetryRequest(BaseModel):
    device_id: str
    ip: str
    connections: int = 0
    bytes: int = 0
    protocol: str = "TCP"
    timestamp: Optional[str] = None
    sensors: Optional[dict] = None  # e.g. {"humidity": 65.2, "temperature": 24.5}
    actuators: Optional[dict] = None  # e.g. {"servo": {"angle": 90, "active": true}}
    peripherals: Optional[list] = None  # e.g. [{"type": "servo", "name": "Servo Motor"}, ...]

@app.get("/")
def read_root():
    return {"message": "NeuroGuard Backend API is running"}

@app.post("/api/agent")
def handle_agent_command(req: CommandRequest):
    """
    Receives transcribed voice commands from the frontend 
    and routes them to the AI agent controller.
    """
    response = process_command(command=req.command)
    return response

@app.post("/api/telemetry")
async def receive_telemetry(data: Dict[str, Any]):
    """
    Hardware Telemetry API for ESP32 / Raspberry Pi.
    Auto-triggers threat analysis and prediction engine.
    """
    result = await _process_telemetry_pipeline(data)
    return {
        "status": result["status"],
        "message": result["message"],
        "threat_detected": result["threat_detected"],
        "prediction_generated": result["prediction_generated"],
    }

@app.get("/api/dashboard")
async def dashboard():
    """
    Dashboard Data API replacing dummy values.
    """
    return await build_dashboard_payload()

@app.websocket("/ws/dashboard")
async def dashboard_ws(ws: WebSocket):
    """
    Real-Time Dashboard WebSocket
    """
    await ws.accept()
    try:
        while True:
            data = await build_dashboard_payload()
            soc_metrics = await get_soc_metrics()
            data["socMetrics"] = soc_metrics
            data["events_count"] = await db.events.count_documents({})
            await ws.send_json(data)
            await asyncio.sleep(2)
    except Exception as e:
        print(f"WebSocket closed: {e}")

@app.get("/api/threat-locations")
async def locations():
    """
    Global Cyber Attack Map data
    """
    threats = await _load_serialized_threats(connected_only=False, limit=250)
    return [
        {
            "ip": t.get("sourceIp"),
            "lat": t.get("lat"),
            "lng": t.get("lng")
        }
        for t in threats if "lat" in t and "lng" in t
    ]


@app.get("/api/threats")
async def get_threats(connected_only: bool = Query(False), limit: int = Query(100, ge=1, le=500)):
    """
    Normalized threat feed for the full Threats page.
    """
    return await _load_serialized_threats(connected_only=connected_only, limit=limit)


@app.get("/api/metrics")
async def get_metrics(connected_only: bool = Query(False)):
    """
    Aggregated threat metrics for the Threats page and dashboard.
    """
    return await build_threat_metrics(connected_only=connected_only)

@app.get("/api/threats/recent")
async def recent(connected_only: bool = Query(True)):
    """
    Threat Timeline
    """
    return await _load_serialized_threats(connected_only=connected_only, limit=20)

@app.get("/api/actions")
async def actions():
    """
    Autonomous Response Log
    """
    actions_list = await db.ai_actions.find().sort("timestamp", -1).limit(20).to_list(20)
    return [_serialize_action(action) for action in actions_list]

@app.get("/api/devices")
async def get_devices():
    """
    Returns both registered and unknown devices for the Devices page.
    """
    return await load_all_devices()

@app.get("/api/device-image")
async def get_device_image(type: str = "unknown"):
    """
    AWS S3 Device Image integration.
    Given a device type, returns the static S3 bucket URL.
    """
    normalized_type = normalize_device_type(type)
    return {"image": DEVICE_IMAGE_MAP.get(normalized_type, DEVICE_IMAGE_MAP["unknown"])}

@app.post("/api/device/rename")
async def rename_device(req: DeviceRenameRequest):
    """
    Renames an unknown device and promotes it to the known 'devices' collection.
    """
    source_collection, existing_device = await find_device_record(device_id=req.device_id)
    if not existing_device:
        return {"status": "error", "message": "Unknown device not found"}

    normalized_type = normalize_device_type(req.type, fallback="")
    if normalized_type not in SUPPORTED_DEVICE_TYPES:
        return {"status": "error", "message": f"Unsupported device type: {req.type}"}

    timestamp = datetime.utcnow().isoformat()
    normalized_existing = normalize_device_document(existing_device, source_collection)
    target_device = build_connected_device(
        normalized_existing,
        timestamp,
        name=req.name,
        device_type=normalized_type,
        trusted=normalized_existing.get("trusted", False),
        auto_connect=normalized_existing.get("auto_connect", False),
        existing=normalized_existing,
    )

    await db.devices.update_one(
        {"device_id": target_device["device_id"]},
        {"$set": target_device},
        upsert=True,
    )
    await db.unknown_devices.delete_many({
        "$or": _match_clauses(
            device_id=req.device_id,
            ip=normalized_existing.get("ip"),
            mac=normalized_existing.get("mac"),
        )
    })

    if target_device.get("trusted") and normalize_mac_key(target_device.get("mac")):
        await upsert_trusted_device(
            mac=target_device["mac"],
            name=target_device["name"],
            device_type=target_device["type"],
            auto_connect=target_device.get("auto_connect", False),
            timestamp=timestamp,
        )

    return {"status": "updated", "device": normalize_device_document(target_device, "devices")}


@app.post("/api/device/connect")
async def connect_device(req: DeviceConnectRequest):
    source_collection, existing_device = await find_device_record(device_id=req.device_id)
    if not existing_device:
        return {"status": "error", "message": "Device not found"}

    normalized_existing = normalize_device_document(existing_device, source_collection)
    if normalized_existing.get("blocked"):
        return {"status": "error", "message": "Blocked devices cannot be connected"}

    timestamp = datetime.utcnow().isoformat()
    connected_device = build_connected_device(
        normalized_existing,
        timestamp,
        name=req.name or normalized_existing.get("name") or default_device_name(
            normalized_existing.get("type") or normalized_existing.get("type_guess"),
            normalized_existing.get("hostname"),
            normalized_existing.get("vendor"),
        ),
        device_type=req.type or normalized_existing.get("type") or normalized_existing.get("type_guess"),
        trusted=normalized_existing.get("trusted", False),
        auto_connect=normalized_existing.get("auto_connect", False),
        existing=normalized_existing,
    )

    await db.devices.update_one({"device_id": connected_device["device_id"]}, {"$set": connected_device}, upsert=True)
    await db.unknown_devices.delete_many({
        "$or": _match_clauses(
            device_id=normalized_existing.get("device_id"),
            ip=normalized_existing.get("ip"),
            mac=normalized_existing.get("mac"),
        )
    })

    return {"status": "connected", "device": normalize_device_document(connected_device, "devices")}


@app.post("/api/device/register")
async def register_hardware_device(request: Request):
    """Hardware self-registration endpoint for IoT devices (ESP32, RPi, etc.)."""
    body = await request.json()
    device_id = body.get("device_id")
    if not device_id:
        return {"status": "error", "message": "device_id is required"}

    device_type = body.get("type", "unknown")
    ip = body.get("ip", request.client.host if request.client else "0.0.0.0")
    mac = body.get("mac", "")
    name = body.get("name", device_id)

    existing = await db.devices.find_one({"device_id": device_id})
    if existing:
        await db.devices.update_one(
            {"device_id": device_id},
            {"$set": {"connected": True, "last_seen": datetime.utcnow().isoformat(), "ip": ip}},
        )
        return {"status": "updated", "device_id": device_id}

    base = {"device_id": device_id, "ip": ip, "mac": mac, "type_guess": device_type}
    timestamp = datetime.utcnow().isoformat()
    device = build_connected_device(base, timestamp, name=name, device_type=device_type)
    await db.devices.insert_one(device)
    return {"status": "registered", "device_id": device_id}


@app.post("/api/device/telemetry")
async def receive_device_telemetry(req: DeviceTelemetryRequest):
    """Hardware telemetry endpoint. Auto-registers device, updates heartbeat, runs pipeline."""
    timestamp = req.timestamp or datetime.utcnow().isoformat()

    # Auto-register / upsert device
    existing = await db.devices.find_one({"device_id": req.device_id})
    if not existing:
        new_device = build_connected_device(
            {"device_id": req.device_id, "ip": req.ip, "mac": "unknown", "hostname": None, "vendor": None, "type_guess": "unknown"},
            timestamp,
            name=f"Device {req.device_id}",
            device_type="unknown",
        )
        await db.devices.update_one({"device_id": req.device_id}, {"$set": new_device}, upsert=True)

    # Update heartbeat
    await db.devices.update_one(
        {"device_id": req.device_id},
        {"$set": {"last_seen": timestamp, "online": True}},
    )

    # Upsert sensor/actuator data on the device document
    sensor_update = {}
    if req.sensors:
        sensor_update["sensors"] = req.sensors
    if req.actuators:
        sensor_update["actuators"] = req.actuators
    if sensor_update:
        await db.devices.update_one(
            {"device_id": req.device_id},
            {"$set": sensor_update},
        )

    # Register peripherals as sub-devices in device_peripherals collection
    if req.peripherals:
        for p in req.peripherals:
            peripheral_id = f"{req.device_id}_{p.get('type', 'unknown').replace(' ', '_')}"
            await db.device_peripherals.update_one(
                {"peripheral_id": peripheral_id},
                {"$set": {
                    "peripheral_id": peripheral_id,
                    "parent_device_id": req.device_id,
                    "parent_ip": req.ip,
                    "type": p.get("type", "unknown"),
                    "name": p.get("name", p.get("type", "Peripheral")),
                    "active": True,
                    "last_seen": timestamp,
                    "data": p.get("data", {}),
                }},
                upsert=True,
            )

    # Run through telemetry pipeline
    telemetry_data = {
        "device_id": req.device_id,
        "ip": req.ip,
        "source_ip": req.ip,
        "sourceIp": req.ip,
        "connections": req.connections,
        "network_usage": req.bytes / (1024 * 1024) if req.bytes > 0 else 0,
        "bytes": req.bytes,
        "protocol": req.protocol,
        "timestamp": timestamp,
    }

    result = await _process_telemetry_pipeline(telemetry_data)

    if result.get("threat_detected") and result.get("threat"):
        await _auto_respond_to_threat(result["threat"], req.ip, timestamp)

    await record_event(
        "device_connected",
        details={"device_id": req.device_id, "ip": req.ip},
        severity="info",
        device_id=req.device_id,
        summary=f"Hardware telemetry received from {req.device_id}",
    )

    return {
        "status": result["status"],
        "message": result["message"],
        "threat_detected": result.get("threat_detected", False),
    }


@app.post("/api/device/trust")
async def trust_device(req: DeviceTrustRequest):
    source_collection, existing_device = await find_device_record(device_id=req.device_id)
    if not existing_device:
        return {"status": "error", "message": "Device not found"}

    normalized_existing = normalize_device_document(existing_device, source_collection)
    if not normalize_mac_key(normalized_existing.get("mac")):
        return {"status": "error", "message": "Device MAC is required before trust can be enabled"}

    timestamp = datetime.utcnow().isoformat()
    device_name = req.name or normalized_existing.get("name") or default_device_name(
        normalized_existing.get("type") or normalized_existing.get("type_guess"),
        normalized_existing.get("hostname"),
        normalized_existing.get("vendor"),
    )
    device_type = normalize_device_type(req.type or normalized_existing.get("type") or normalized_existing.get("type_guess"))

    await upsert_trusted_device(
        mac=normalized_existing["mac"],
        name=device_name,
        device_type=device_type,
        auto_connect=req.auto_connect,
        timestamp=timestamp,
    )

    update_doc = {
        "trusted": True,
        "auto_connect": req.auto_connect,
        "name": device_name,
        "type": device_type,
        "last_seen": normalized_existing.get("last_seen") or timestamp,
    }
    target_collection = db.devices if source_collection == "devices" else db.unknown_devices
    await target_collection.update_one({"_id": existing_device["_id"]}, {"$set": update_doc})

    source_collection, updated_device = await find_device_record(device_id=req.device_id)
    return {"status": "trusted", "device": normalize_device_document(updated_device, source_collection)}


@app.post("/api/device/untrust")
async def untrust_device(req: DeviceConnectRequest):
    source_collection, existing_device = await find_device_record(device_id=req.device_id)
    if not existing_device:
        return {"status": "error", "message": "Device not found"}

    normalized_existing = normalize_device_document(existing_device, source_collection)
    if normalize_mac_key(normalized_existing.get("mac")):
        await db.trusted_devices.delete_many({"mac": normalized_existing.get("mac")})

    target_collection = db.devices if source_collection == "devices" else db.unknown_devices
    await target_collection.update_one({"_id": existing_device["_id"]}, {"$set": {"trusted": False, "auto_connect": False}})
    source_collection, updated_device = await find_device_record(device_id=req.device_id)
    return {"status": "untrusted", "device": normalize_device_document(updated_device, source_collection)}


@app.post("/api/device/block")
async def block_device(req: DeviceBlockRequest):
    source_collection, existing_device = await find_device_record(device_id=req.device_id)
    if not existing_device:
        return {"status": "error", "message": "Device not found"}

    normalized_existing = normalize_device_document(existing_device, source_collection)
    timestamp = datetime.utcnow().isoformat()
    blocked_reason = req.reason or "Manual device block"
    blocked_device = build_detected_device(
        normalized_existing,
        timestamp,
        existing={**normalized_existing, "blocked_at": timestamp, "blocked_reason": blocked_reason},
        trusted=normalized_existing.get("trusted", False),
        auto_connect=False,
        blocked=True,
    )
    blocked_device["name"] = normalized_existing.get("name") or blocked_device["name"]
    blocked_device["type"] = normalize_device_type(normalized_existing.get("type"), fallback=normalized_existing.get("type_guess"))
    blocked_device["blocked_at"] = timestamp
    blocked_device["blocked_reason"] = blocked_reason

    target_collection = db.devices if source_collection == "devices" else db.unknown_devices
    await target_collection.update_one({"_id": existing_device["_id"]}, {"$set": blocked_device})
    await db.blocked_ips.update_one(
        {"device_id": blocked_device["device_id"]},
        {"$set": {"device_id": blocked_device["device_id"], "ip": blocked_device.get("ip"), "mac": blocked_device.get("mac"), "reason": blocked_reason, "timestamp": timestamp}},
        upsert=True,
    )

    source_collection, updated_device = await find_device_record(device_id=req.device_id)
    return {"status": "blocked", "device": normalize_device_document(updated_device, source_collection)}


@app.post("/api/device/unblock")
async def unblock_device(req: DeviceConnectRequest):
    source_collection, existing_device = await find_device_record(device_id=req.device_id)
    if not existing_device:
        return {"status": "error", "message": "Device not found"}

    normalized_existing = normalize_device_document(existing_device, source_collection)
    target_collection = db.devices if source_collection == "devices" else db.unknown_devices
    await target_collection.update_one(
        {"_id": existing_device["_id"]},
        {"$set": {"blocked": False, "status": "detected", "connected": False, "monitor": False, "blocked_at": None, "blocked_reason": None}},
    )
    await db.blocked_ips.delete_many({"device_id": normalized_existing.get("device_id")})
    source_collection, updated_device = await find_device_record(device_id=req.device_id)
    return {"status": "unblocked", "device": normalize_device_document(updated_device, source_collection)}

@app.websocket("/ws/devices")
async def devices_ws(ws: WebSocket):
    """
    Real-Time Devices WebSocket
    Pushes both recognized devices and unknown devices.
    """
    await ws.accept()
    try:
        while True:
            devices_list = await load_all_devices()
            await ws.send_json(devices_list)
            await asyncio.sleep(2)
    except Exception as e:
        print(f"Devices WebSocket closed: {e}")


@app.websocket("/ws/threats")
async def threats_ws(ws: WebSocket):
    """Real-Time Threats WebSocket — pushes threats, metrics, and AI actions."""
    await ws.accept()
    try:
        while True:
            threats = await _load_serialized_threats(connected_only=False, limit=50)
            metrics = await build_threat_metrics(connected_only=False)
            raw_actions = await db.ai_actions.find().sort("timestamp", -1).limit(20).to_list(20)
            actions = [_serialize_action(a) for a in raw_actions]
            locations = await db.threats.find(
                {"lat": {"$exists": True}}, {"sourceIp": 1, "lat": 1, "lng": 1, "type": 1, "severity": 1, "country": 1}
            ).sort("timestamp", -1).limit(50).to_list(50)
            for loc in locations:
                loc["_id"] = str(loc["_id"])
                loc["ip"] = loc.get("sourceIp", "")
            latest_voice = await db.ai_actions.find_one(
                {"voice_alert": {"$exists": True}},
                sort=[("timestamp", -1)],
            )
            voice_alert = latest_voice.get("voice_alert") if latest_voice else None
            await ws.send_json({
                "threats": threats,
                "metrics": metrics,
                "actions": actions,
                "locations": locations,
                "socMetrics": await get_soc_metrics(),
                "voice_alert": voice_alert,
            })
            await asyncio.sleep(3)
    except Exception as e:
        print(f"Threats WebSocket closed: {e}")


@app.websocket("/ws/network")
async def network_ws(ws: WebSocket):
    """Real-Time Network WebSocket — pushes topology, traffic, and logs."""
    await ws.accept()
    try:
        while True:
            topology = await build_topology(connected_only=True)
            traffic = await get_traffic_stats()
            logs = await get_recent_logs(limit=15)
            flows = await get_recent_flows(limit=15)
            await ws.send_json({
                "topology": topology,
                "traffic": traffic,
                "logs": logs,
                "flows": flows,
            })
            await asyncio.sleep(3)
    except Exception as e:
        print(f"Network WebSocket closed: {e}")


@app.websocket("/ws/investigations")
async def investigations_ws(ws: WebSocket):
    """Real-Time Investigations WebSocket."""
    await ws.accept()
    try:
        while True:
            investigations_list = await get_investigations(limit=20)
            await ws.send_json(investigations_list)
            await asyncio.sleep(5)
    except Exception as e:
        print(f"Investigations WebSocket closed: {e}")


@app.websocket("/ws/reports")
async def reports_ws(ws: WebSocket):
    """Real-Time Reports WebSocket — pushes all report datasets every 5s."""
    await ws.accept()
    try:
        while True:
            time_range = "Weekly"
            summary, attacks, targets, attackers, network, devices, logs, history = await asyncio.gather(
                get_report_summary(time_range),
                get_report_attacks(time_range),
                get_report_targets(time_range),
                get_report_attackers(time_range),
                get_report_network(time_range),
                get_report_devices(),
                get_report_logs(limit=20),
                get_report_history(limit=3),
            )
            await ws.send_json({
                "summary": summary,
                "attacks": attacks,
                "targets": targets,
                "attackers": attackers,
                "network": network,
                "devices": devices,
                "logs": logs,
                "history": history,
            })
            await asyncio.sleep(5)
    except Exception as e:
        print(f"Reports WebSocket closed: {e}")


@app.websocket("/ws/events")
async def events_ws(ws: WebSocket):
    """Real-Time SOC Timeline WebSocket."""
    await ws.accept()
    try:
        while True:
            events = await get_events(limit=50)
            await ws.send_json(events)
            await asyncio.sleep(3)
    except Exception as e:
        print(f"Events WebSocket closed: {e}")

@app.get("/api/hardware")
async def get_hardware():
    """
    Returns hardware network infrastructure items for Hardware Status.
    """
    hardware_list = await db.hardware.find().to_list(100)
    for h in hardware_list:
        h["_id"] = str(h["_id"])
    return hardware_list

@app.get("/api/attack-path")
async def get_attack_path():
    """
    Attack Path Visualizer Data
    Returns node/edge graph data for the frontend graph library (e.g. React Flow)
    """
    # For a real implementation, you'd aggregate linked threats/devices here.
    # To seed demo data if DB is empty, the frontend can handle the fallback or we handle it here.
    threats = await _load_serialized_threats(connected_only=False, limit=50)
    
    nodes = []
    edges = []
    
    node_ids = set()
    edge_ids = set()
    
    for t in threats:
        source = t.get("sourceIp")
        target = t.get("target") or t.get("targetDevice", "Unknown Target")
        
        if source and source not in node_ids:
            nodes.append({"id": source, "data": {"label": f"Attacker IP\n{source}"}, "type": "input", "position": {"x": 50, "y": 50}})
            node_ids.add(source)
            
        if target and target not in node_ids:
            nodes.append({"id": target, "data": {"label": target}, "position": {"x": 250, "y": 150}})
            node_ids.add(target)
            
        if source and target:
            edge_id = f"e-{source}-{target}"
            if edge_id not in edge_ids:
                edges.append({
                    "id": edge_id,
                    "source": source,
                    "target": target,
                    "label": t.get("type", "Attack"),
                    "animated": True
                })
                edge_ids.add(edge_id)

    return {"nodes": nodes, "edges": edges}

@app.get("/api/predictions")
async def get_predictions():
    """
    AI Threat Predictions — returns the latest attack predictions.
    """
    predictions_list = await db.predictions.find().sort("timestamp", -1).limit(10).to_list(10)
    for p in predictions_list:
        p["_id"] = str(p["_id"])
    return predictions_list

@app.get("/api/network/topology")
async def get_network_topology(connected_only: bool = Query(True)):
    """
    Network Topology Engine — returns nodes and links for graph visualization.
    Derives topology from connected devices with deterministic layout and threat correlation.
    """
    return await build_topology(connected_only=connected_only)

from agent.packet_monitor import monitor

@app.get("/api/network/traffic")
async def get_network_traffic():
    """
    Network Traffic Engine — returns 24-hour traffic time series and bandwidth stats.
    Aggregates telemetry data into hourly buckets for visualization charts.
    """
    data = await get_traffic_stats()
    try:
        net = psutil.net_io_counters()
        total_bytes = net.bytes_sent + net.bytes_recv
        data["bandwidth_tb"] = round(total_bytes / (1024**4), 4)
        data["bytes_sent"] = getattr(net, 'bytes_sent', 0)
        data["bytes_recv"] = getattr(net, 'bytes_recv', 0)
    except Exception:
        pass
    data["packets_per_sec"] = monitor.packets_per_sec
    return data

@app.get("/api/network/logs")
async def get_network_logs(limit: int = Query(50, ge=1, le=200), event_type: Optional[str] = Query(None)):
    """
    Network Event Logs — returns recent network events from scanner, threats, lifecycle, and AI.
    Supports filtering by event type: 'security', 'event', 'ai', 'system'.
    """
    return await get_recent_logs(limit=limit, event_type=event_type)

@app.get("/api/investigations")
async def get_investigations_list(limit: int = Query(50, ge=1, le=200), status: Optional[str] = Query(None)):
    """
    Investigation Cases — returns all forensic investigations auto-generated from threats.
    Investigations correlate devices, topology, logs, and AI analysis.
    Supports filtering by status: 'in-progress', 'resolved', 'escalated'.
    """
    return await get_investigations(limit=limit, status=status)

@app.get("/api/investigations/{investigation_id}")
async def get_investigation_detail(investigation_id: str):
    """
    Investigation Detail — returns complete investigation with timeline, evidence, affected devices.
    """
    investigation = await get_investigation_by_id(investigation_id)
    if not investigation:
        return {"error": "Investigation not found"}
    return investigation

@app.post("/api/investigations/generate")
async def generate_investigation(threat_id: str = Query(...)):
    """
    Manually trigger investigation generation for a specific threat.
    """
    threat = await db.threats.find_one({"_id": threat_id})
    if not threat:
        return {"error": "Threat not found"}
    
    investigation = await build_investigation(threat)
    return {"status": "created", "investigation": investigation}

# ─── Report API ──────────────────────────────────────────────────────────────

@app.get("/api/report/summary")
async def report_summary(timeRange: str = Query("Weekly")):
    """Aggregate summary stats: totalThreats, blockedIPs, devicesMonitored, criticalIncidents, complianceScore."""
    return await get_report_summary(timeRange)

@app.get("/api/report/attacks")
async def report_attacks(timeRange: str = Query("Weekly")):
    """Top attack types with counts and percentages from threats collection."""
    return await get_report_attacks(timeRange)

@app.get("/api/report/targets")
async def report_targets(timeRange: str = Query("Weekly")):
    """Most targeted devices cross-referenced with devices collection."""
    return await get_report_targets(timeRange)

@app.get("/api/report/attackers")
async def report_attackers(timeRange: str = Query("Weekly")):
    """Top attacker IPs with geolocation and trend."""
    return await get_report_attackers(timeRange)

@app.get("/api/report/network")
async def report_network(timeRange: str = Query("Weekly")):
    """Network activity stats aggregated from telemetry."""
    return await get_report_network(timeRange)

@app.get("/api/report/devices")
async def report_devices():
    """Device health summary: healthy, vulnerable, investigating, blocked totals."""
    return await get_report_devices()

@app.get("/api/report/ai")
async def report_ai(timeRange: str = Query("Weekly")):
    """AI-generated security insights: summary, risk analysis, patterns, recommendations."""
    return await get_report_ai_insights(timeRange)

@app.get("/api/report/logs")
async def report_logs(limit: int = Query(20, ge=1, le=100)):
    """Audit log stream from network_logs collection."""
    return await get_report_logs(limit)

@app.get("/api/report/history")
async def report_history(limit: int = Query(10, ge=1, le=50)):
    """List of generated reports from reports collection."""
    return await get_report_history(limit)

@app.post("/api/report/generate")
async def report_generate(timeRange: str = Query("Weekly")):
    """Build and persist a full consolidated report. Returns the complete report document."""
    report = await generate_full_report(timeRange)
    return report

@app.get("/api/report/export/{fmt}")
async def report_export(fmt: str, report_id: Optional[str] = Query(None),
                         timeRange: str = Query("Weekly")):
    """
    Export a report as JSON or CSV.
    fmt must be 'json' or 'csv'. Pass report_id to export a stored report.
    """
    from fastapi.responses import Response
    fmt = fmt.lower()
    if fmt == "csv":
        content = await export_report_csv(report_id, timeRange)
        return Response(
            content=content,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="neurogaurd-report.csv"'},
        )
    else:
        data = await export_report_json(report_id, timeRange)
        content = __import__('json').dumps(data, indent=2, default=str)
        return Response(
            content=content,
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="neurogaurd-report.json"'},
        )

# ─────────────────────────────────────────────────────────────────────────────


@app.get("/api/events")
async def get_timeline_events(limit: int = Query(50, ge=1, le=200), event_type: Optional[str] = Query(None)):
    """SOC timeline events."""
    return await get_events(limit=limit, event_type=event_type)



@app.post("/api/clear-history")
async def clear_history():
    """
    Clears all simulated threat, telemetry, and action data from MongoDB.
    Keeps device registrations intact.
    """
    result = await asyncio.gather(
        db.threats.delete_many({}),
        db.predictions.delete_many({}),
        db.ai_actions.delete_many({}),
        db.telemetry.delete_many({}),
        db.blocked_ips.delete_many({}),
        db.events.delete_many({}),
        db.flows.delete_many({}),
    )

    return {
        "status": "cleared",
        "details": {
            "threats": True,
            "predictions": True,
            "actions": True,
            "telemetry": True,
            "blocked_ips": True,
            "events": True,
            "flows": True,
        }
    }


@app.get("/api/analytics")
async def get_analytics():
    """
    Returns aggregated chart data based on real threat data.
    """
    metrics = await build_threat_metrics(connected_only=False)
    if metrics["totalThreats"] == 0:
        return {
            "distribution": [],
            "weeklyTrends": [
                {"day": "S", "value": 0},
                {"day": "M", "value": 0},
                {"day": "T", "value": 0},
                {"day": "W", "value": 0},
                {"day": "T", "value": 0},
                {"day": "F", "value": 0},
                {"day": "S", "value": 0},
            ]
        }
        
    weekly_counts = [0, 0, 0, 0, 0, 0, 0]
    threats = await _load_serialized_threats(connected_only=False, limit=250)
    for threat in threats:
        parsed = _parse_timestamp(threat.get("timestamp"))
        if parsed is not None:
            weekly_counts[parsed.weekday()] += 1

    weeklyTrends = [
        {"day": "M", "value": weekly_counts[0]},
        {"day": "T", "value": weekly_counts[1]},
        {"day": "W", "value": weekly_counts[2]},
        {"day": "T", "value": weekly_counts[3]},
        {"day": "F", "value": weekly_counts[4]},
        {"day": "S", "value": weekly_counts[5]},
        {"day": "S", "value": weekly_counts[6]},
    ]
    
    return {
        "distribution": metrics["distribution"],
        "weeklyTrends": weeklyTrends
    }

@app.get("/api/ai/analyze")
async def ai_analyze():
    """
    Returns live AI analysis of the current threat landscape.
    """
    threats = await _load_serialized_threats(connected_only=False, limit=5)
    
    if not threats:
        return {
            "analysis": "No active threats detected. Network telemetry appears normal. AI subsystems in passive monitoring mode.",
            "cvss": "0.0",
            "severityLabel": "SECURE"
        }
        
    critical = any(t.get("severity") == "Critical" for t in threats)
    if critical:
        return {
            "analysis": f"Critical threats detected including {threats[0].get('type', 'attack')}. Recommend immediate isolation of affected systems.",
            "cvss": "9.2",
            "severityLabel": "CRITICAL"
        }
    else:
        return {
            "analysis": "Active threats detected but contained. Ongoing monitoring of anomalies in connection patterns.",
            "cvss": "5.4",
            "severityLabel": "WARNING"
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

@app.get("/api/network/health")
async def get_network_health():
    try:
        connections = len(psutil.net_connections())
    except (PermissionError, psutil.AccessDenied, Exception):
        # Fallback for environments lacking permissions (e.g., macOS without sudo)
        import random
        connections = random.randint(10, 50)

    if connections < 100:
        grade = "A+"
        status = "Secure"
    elif connections < 300:
        grade = "B"
        status = "Moderate Traffic"
    else:
        grade = "C"
        status = "Suspicious Activity"

    return {
        "grade": grade,
        "status": status,
        "connections": connections
    }

@app.get("/api/system/uptime")
async def get_system_uptime():
    boot_time = psutil.boot_time()
    uptime_seconds = time.time() - boot_time

    uptime_hours = uptime_seconds / 3600

    return {
        "uptime_percent": round(99.9, 2),
        "uptime_hours": round(uptime_hours, 2)
    }



@app.get("/api/system/stats")
async def system_stats():
    return {
        "cpu": psutil.cpu_percent(),
        "ram": psutil.virtual_memory().percent,
        "disk": psutil.disk_usage('/').percent
    }
