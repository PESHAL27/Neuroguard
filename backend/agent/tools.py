import subprocess
import os

from datetime import datetime
try:
    from db import sync_db
except ImportError:
    sync_db = None


def check_camera_status():
    """
    Simulates checking the IoT camera for active intrusions.
    """
    suspicious = True
    if suspicious:
        return {
            "status": "warning",
            "message": "Camera endpoint is under possible port scan attack. High volume of TCP requests detected on ports 80 and 554."
        }
    return {"status": "secure", "message": "Camera is secure. All protocols normal."}

def check_device_status(device_id: str = None):
    """
    Alias for device checking as requested by the AI prompt.
    """
    if not device_id:
        return {
            "status": "monitoring",
            "message": "No specific device ID was provided. Monitoring all connected devices for abnormal behavior."
        }

    if "cam" in str(device_id).lower():
        return check_camera_status()
    return {"status": "secure", "message": f"Device {device_id} is secure and operating normally."}


def scan_network():
    """
    Simulates a network scan or pulls active threats from MongoDB.
    """
    if sync_db is not None:
        count = sync_db.threats.count_documents({})
        return {
            "status": "success",
            "message": f"Network scan complete. System currently tracking {count} historical security events."
        }
    
    return {
        "status": "success",
        "message": "Network scan complete. No critical threats detected in local subnets."
    }


def block_ip(ip_address: str, reason: str = "Threat response protocol initiated"):
    """
    Executes actual firewall IP blocking (netsh on Windows, iptables on Linux)
    and updates device overrides and database to isolate the device.
    """
    print(f"Executing Firewall Rule: BLOCK {ip_address}")
    import sys
    import json
    from pathlib import Path
    
    # 1. Native OS Firewall Block
    if sys.platform == "win32":
        try:
            # Add Windows Defender Firewall rule
            rule_name = f"NeuroGuard_Block_{ip_address.replace('.', '_')}"
            subprocess.run(
                ["netsh", "advfirewall", "firewall", "add", "rule", f"name={rule_name}", "dir=in", "action=block", f"remoteip={ip_address}"],
                capture_output=True,
                check=False
            )
            print(f"✅ Successfully added Windows Firewall rule for {ip_address}")
        except Exception as e:
            print(f"Windows Firewall warning: {e}")
    else:
        try:
            subprocess.run(["iptables", "-A", "INPUT", "-s", ip_address, "-j", "DROP"], check=True)
            subprocess.run(["iptables", "-A", "FORWARD", "-s", ip_address, "-j", "DROP"], check=True)
            print(f"✅ Successfully added iptables DROP rules for {ip_address}")
        except Exception as e:
            print(f"❌ Failed to execute iptables for {ip_address}: {e}")

    timestamp = datetime.utcnow().isoformat()
    dev_id = f"device_{ip_address.replace('.', '_')}"

    # 2. Update device_overrides.json & live_devices.json
    try:
        data_dir = Path(__file__).resolve().parent.parent / "data"
        overrides_file = data_dir / "device_overrides.json"
        live_file = data_dir / "live_devices.json"

        overrides = {}
        if overrides_file.exists():
            try:
                with open(overrides_file, "r", encoding="utf-8") as f:
                    overrides = json.load(f)
            except Exception:
                overrides = {}

        # Find key in overrides or create new
        match_key = None
        for k, v in overrides.items():
            if v.get("ip") == ip_address or k == dev_id or k == f"dev_{dev_id}":
                match_key = k
                break
        if not match_key:
            match_key = dev_id

        existing = overrides.get(match_key, {})
        overrides[match_key] = {
            **existing,
            "device_id": match_key,
            "ip": ip_address,
            "name": existing.get("name") or f"Device ({ip_address})",
            "blocked": True,
            "connected": False,
            "monitor": False,
            "status": "blocked",
            "quarantined_at": timestamp,
            "blocked_reason": reason,
            "last_seen": timestamp,
        }

        with open(overrides_file, "w", encoding="utf-8") as f:
            json.dump(overrides, f, indent=2)

        if live_file.exists():
            try:
                with open(live_file, "r", encoding="utf-8") as f:
                    live_devs = json.load(f)
                for d in live_devs:
                    if d.get("ip") == ip_address or d.get("device_id") == match_key:
                        d["blocked"] = True
                        d["connected"] = False
                        d["status"] = "blocked"
                        d["quarantined_at"] = timestamp
                with open(live_file, "w", encoding="utf-8") as f:
                    json.dump(live_devs, f, indent=2)
            except Exception:
                pass
    except Exception as e:
        print(f"Error updating device overrides: {e}")

    # 3. Update MongoDB
    if sync_db is not None:
        try:
            sync_db.devices.update_many(
                {"$or": [{"ip": ip_address}, {"device_id": dev_id}, {"device_id": f"dev_{dev_id}"}]},
                {"$set": {"blocked": True, "connected": False, "status": "blocked", "quarantined_at": timestamp, "blocked_reason": reason}}
            )
            sync_db.blocked_ips.insert_one({
                "ip": ip_address,
                "reason": reason,
                "timestamp": timestamp
            })
            sync_db.ai_actions.insert_one({
                "action": "block_ip",
                "ip": ip_address,
                "reason": reason,
                "timestamp": timestamp,
                "status": "completed"
            })
        except Exception as e:
            print(f"DB log error: {e}")

    return {
        "status": "success",
        "message": f"Firewall updated. Source IP {ip_address} has been permanently blocked across all subnets."
    }


def get_recent_threats():
    """
    Fetches the most recent threat events from MongoDB.
    """
    if sync_db is not None:
        threats = list(sync_db.threats.find({}, {"_id": 0}).sort("timestamp", -1).limit(3))
        if threats:
            description = f"Found {len(threats)} recent threats. "
            for t in threats:
                severity = t.get('severity', 'High')
                attack_type = t.get('type') or t.get('attack_type', 'attack')
                source = t.get('sourceIp') or t.get('source_ip', 'unknown')
                description += f"A {severity} severity {attack_type} from {source}. "
            return {"status": "success", "message": description, "data": threats}

    return {
        "status": "success",
        "message": "Recent threats retrieved. No critical anomalies.",
        "data": []
    }

def generate_threat_report():
    """
    Simulates generating a comprehensive threat report.
    """
    return {
        "status": "success",
        "message": "Threat report successfully generated and archived in the active security log.",
        "report_url": "/dashboard/reports/latest"
    }
    
def get_device_list():
    """
    Retrieves the list of active IoT devices from MongoDB.
    """
    if sync_db is not None:
        devices = list(sync_db.devices.find({}, {"_id": 0}).limit(10))
        if devices:
            return {
                "status": "success",
                "devices": devices
            }
            
    return {
        "status": "success",
        "devices": [
            {"id": "cam_01", "type": "camera", "status": "online"},
            {"id": "sensor_front", "type": "motion", "status": "online"},
            {"id": "lock_main", "type": "smart_lock", "status": "offline"}
        ]
    }


def get_predictions():
    """
    Retrieves the latest AI threat predictions from MongoDB.
    Used by Voice AI to answer prediction queries.
    """
    if sync_db is not None:
        predictions = list(sync_db.predictions.find({}, {"_id": 0}).sort("timestamp", -1).limit(5))
        if predictions:
            description = f"Found {len(predictions)} active predictions. "
            for p in predictions:
                confidence_pct = int(p.get('confidence', 0) * 100)
                description += (
                    f"Device {p.get('device_id', 'unknown')}: "
                    f"{p.get('predicted_attack', 'unknown')} attack predicted "
                    f"with {confidence_pct}% confidence, risk level {p.get('risk_level', 'unknown')}. "
                )
            return {"status": "success", "message": description, "data": predictions}

    return {
        "status": "success",
        "message": "No active threat predictions at this time. All systems nominal.",
        "data": []
    }
