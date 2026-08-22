"""
NeuroGuard Investigation Engine
Automatically builds forensic investigations from detected threats.
Correlates devices, topology, logs, and AI analysis into comprehensive case files.
"""

from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
import hashlib
import json
import random

try:
    from db import db, sync_db
except ImportError:
    db = None
    sync_db = None

from device_registry import normalize_device_document, is_monitorable_device
from agent.ai_engine import invoke_autonomous_agent
from agent.tools import block_ip


def _generate_investigation_id(threat_id: str) -> str:
    """Generate unique investigation ID from threat."""
    timestamp = datetime.utcnow()
    return f"INV-{timestamp.year}-{abs(hash(threat_id)) % 10000:04d}"


def _classify_attack_vector(threat_type: str) -> str:
    """Classify attack vector for investigation."""
    classification_map = {
        "port_scan": "Network Reconnaissance Campaign",
        "ddos_attempt": "Distributed Denial of Service",
        "data_exfiltration": "Data Breach Campaign",
        "brute_force": "Credential Compromise Attack",
        "malware_detected": "Malware Infection Campaign",
        "suspicious_activity": "Anomalous Behavior Pattern",
        "iot_botnet": "IoT Botnet Compromise",
        "firmware_exploit": "Firmware Exploitation Campaign",
    }
    return classification_map.get(threat_type, "Coordinated Multi-Vector Attack")


def _correlate_affected_devices(threat: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Find all devices affected by this threat."""
    if sync_db is None:
        return []
    
    affected = []
    target_device_id = threat.get("targetDevice", "")
    source_ip = threat.get("sourceIp", "")
    
    # Primary target device
    target_device = sync_db.devices.find_one({"device_id": target_device_id})
    if target_device:
        affected.append({
            "name": target_device.get("name", target_device_id),
            "type": target_device.get("type", "Unknown"),
            "ip": target_device.get("ip", ""),
            "mac": target_device.get("mac", ""),
            "status": "compromised" if threat.get("severity") in ["Critical", "High"] else "at-risk",
            "device_id": target_device_id,
        })
    
    # Find related devices on same subnet or with similar attack patterns
    target_ip = target_device.get("ip", "") if target_device else ""
    if target_ip:
        subnet_prefix = ".".join(target_ip.split(".")[:3])
        related_devices = sync_db.devices.find({
            "ip": {"$regex": f"^{subnet_prefix}"},
            "device_id": {"$ne": target_device_id},
            "connected": True,
        }).limit(5)
        
        for device in related_devices:
            if len(affected) >= 5:  # Limit to 5 devices for UI
                break
            affected.append({
                "name": device.get("name", device.get("device_id")),
                "type": device.get("type", "Unknown"),
                "ip": device.get("ip", ""),
                "mac": device.get("mac", ""),
                "status": "at-risk",
                "device_id": device.get("device_id"),
            })
    
    return affected


def _collect_evidence(threat: Dict[str, Any], affected_devices: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Collect forensic evidence from threat and related sources."""
    if sync_db is None:
        return {
            "suspiciousIPs": [],
            "malwareIndicators": [],
            "anomalies": [],
        }
    
    source_ip = threat.get("sourceIp", "unknown")
    
    # Suspicious IPs
    suspicious_ips = []
    if source_ip and source_ip != "unknown":
        # Count attacks from this IP
        threat_count = sync_db.threats.count_documents({"sourceIp": source_ip})
        suspicious_ips.append({
            "ip": source_ip,
            "origin": _geolocate_ip(source_ip),
            "attackCount": threat_count,
        })
    
    # Find other attacking IPs in recent threats
    recent_threats = sync_db.threats.find({
        "timestamp": {"$gte": (datetime.utcnow() - timedelta(hours=1)).isoformat()},
        "sourceIp": {"$ne": source_ip, "$ne": "unknown"},
    }).limit(3)
    
    for t in recent_threats:
        ip = t.get("sourceIp")
        if ip and ip not in [s["ip"] for s in suspicious_ips]:
            suspicious_ips.append({
                "ip": ip,
                "origin": _geolocate_ip(ip),
                "attackCount": sync_db.threats.count_documents({"sourceIp": ip}),
            })
    
    # Malware indicators (simulated for MVP - would integrate with real malware DB)
    malware_indicators = []
    if threat.get("type") in ["malware_detected", "data_exfiltration", "ddos_attempt"]:
        # Generate plausible malware hash
        threat_id = str(threat.get("_id", ""))
        hash_input = f"{source_ip}{threat.get('type')}{threat_id}"
        file_hash = hashlib.sha256(hash_input.encode()).hexdigest()[:10] + "..."
        
        malware_indicators.append({
            "hash": file_hash,
            "type": _infer_malware_family(threat.get("type")),
            "conf": random.randint(75, 95),
        })
    
    # Network anomalies
    anomalies = []
    if threat.get("type") == "port_scan":
        anomalies.append("Rapid port scanning detected on subnet")
    if threat.get("type") == "ddos_attempt":
        anomalies.append(f"SYN flood from {source_ip}")
    if threat.get("type") == "data_exfiltration":
        anomalies.append("Abnormal outbound data volume")
        anomalies.append("Encrypted C2 channel suspected")
    
    # Check for subnet-wide issues
    if len(affected_devices) > 1:
        anomalies.append(f"Lateral movement across {len(affected_devices)} devices")
    
    return {
        "suspiciousIPs": suspicious_ips,
        "malwareIndicators": malware_indicators,
        "anomalies": anomalies,
    }


def _build_timeline(threat: Dict[str, Any], affected_devices: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Build investigation timeline from logs and threat data."""
    if sync_db is None:
        return []
    
    timeline = []
    threat_time = datetime.fromisoformat(threat.get("timestamp", datetime.utcnow().isoformat()).replace("Z", ""))
    
    # Initial detection
    timeline.append({
        "time": threat_time.strftime("%H:%M"),
        "event": f"AI detected {threat.get('type', 'suspicious activity').replace('_', ' ')}",
        "type": "system",
        "icon": "🔍",
    })
    
    # Attack details
    timeline.append({
        "time": (threat_time + timedelta(minutes=3)).strftime("%H:%M"),
        "event": threat.get("description", "Threat event recorded"),
        "type": "alert",
        "icon": "⚡",
    })
    
    # Auto-response action
    if threat.get("severity") in ["Critical", "High"]:
        timeline.append({
            "time": (threat_time + timedelta(minutes=5)).strftime("%H:%M"),
            "event": f"{threat.get('sourceIp', 'Source')} auto-blocked by AI firewall",
            "type": "response",
            "icon": "🛡️",
        })
    
    # Forensic analysis
    timeline.append({
        "time": (threat_time + timedelta(minutes=10)).strftime("%H:%M"),
        "event": f"Investigation {_generate_investigation_id(str(threat.get('_id', '')))} initiated",
        "type": "analysis",
        "icon": "🔬",
    })
    
    # Pull from network_logs if available
    device_id = threat.get("targetDevice")
    if device_id:
        recent_logs = sync_db.network_logs.find({
            "device_id": device_id,
            "timestamp": {"$gte": (threat_time - timedelta(minutes=15)).isoformat()},
        }).sort("timestamp", -1).limit(3)
        
        for log in recent_logs:
            log_time = datetime.fromisoformat(log.get("timestamp", datetime.utcnow().isoformat()).replace("Z", ""))
            timeline.append({
                "time": log_time.strftime("%H:%M"),
                "event": log.get("message", "Network event logged"),
                "type": log.get("level", "info"),
                "icon": "📝",
            })
    
    # Sort chronologically
    timeline.sort(key=lambda x: x["time"])
    return timeline


def _deep_ai_analysis(threat: Dict[str, Any], evidence: Dict[str, Any], affected_devices: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Generate deep AI-powered investigation analysis via Bedrock."""
    import os

    source_ip = threat.get("sourceIp", "unknown")
    threat_type = threat.get("type", "unknown")
    severity = threat.get("severity", "Medium")
    device_count = len(affected_devices)
    ip_count = len(evidence.get("suspiciousIPs", []))
    anomalies = evidence.get("anomalies", [])

    # Build focused investigation prompt for Bedrock
    investigation_context = {
        "event_type": "deep_investigation_analysis",
        "instruction": (
            "You are a senior cybersecurity forensic analyst. Analyze this cyber attack in depth. "
            "Return STRICTLY valid JSON with these exact keys:\n"
            "{\n"
            '  "reasoning": "Detailed narrative of the attack — what happened, how the attacker operated, and the impact on the network",\n'
            '  "mitigations": ["list of 4-6 specific actionable mitigation steps"],\n'
            '  "confidence": <integer 60-95>,\n'
            '  "attackTechnique": {\n'
            '    "name": "Attack technique name (e.g. Network Service Scanning)",\n'
            '    "mitreId": "MITRE ATT&CK technique ID (e.g. T1046)",\n'
            '    "description": "How this technique works and why the attacker used it",\n'
            '    "prevention": ["3-4 specific prevention measures to stop this attack in the future"]\n'
            '  },\n'
            '  "hackerProfile": {\n'
            '    "estimatedLocation": "City, Country based on IP geolocation and behavior patterns",\n'
            '    "attackPattern": "Description of the attack pattern (automated tool, manual, APT, etc.)",\n'
            '    "riskLevel": "Critical/High/Medium/Low"\n'
            '  }\n'
            "}"
        ),
        "threat_type": threat_type,
        "severity": severity,
        "threat_score": threat.get("threatScore", 0),
        "source_ip": source_ip,
        "target_device": threat.get("targetDevice", "unknown"),
        "affected_device_count": device_count,
        "suspicious_ip_count": ip_count,
        "anomalies": anomalies,
        "evidence_summary": {
            "suspicious_ips": [ip.get("ip") for ip in evidence.get("suspiciousIPs", [])],
            "malware_indicators": [m.get("type") for m in evidence.get("malwareIndicators", [])],
            "anomalies": anomalies,
        },
        "affected_devices": [
            {"name": d.get("name"), "type": d.get("type"), "status": d.get("status")}
            for d in affected_devices
        ],
    }

    # Default result using fallback
    result = {
        "reasoning": _generate_fallback_reasoning(threat, evidence, affected_devices),
        "mitigations": _generate_mitigations(threat, affected_devices),
        "confidence": _calculate_confidence(threat, evidence, affected_devices),
        "attackTechnique": _fallback_attack_technique(threat_type),
        "hackerProfile": {
            "estimatedLocation": _geolocate_ip(source_ip),
            "attackPattern": "Automated scanning tool" if threat_type in ("port_scan", "brute_force") else "Targeted attack",
            "riskLevel": severity,
        },
    }

    if not (os.getenv("OPENROUTER_API_KEY") or os.getenv("BEDROCK_API_KEY")):
        return result

    try:
        ai_response = invoke_autonomous_agent(event_data=investigation_context)
        if isinstance(ai_response, dict):
            # Extract fields from AI response, falling back to defaults
            if ai_response.get("reasoning"):
                result["reasoning"] = ai_response["reasoning"]
            elif isinstance(ai_response.get("response"), str) and len(ai_response["response"]) > 40:
                result["reasoning"] = ai_response["response"]

            if isinstance(ai_response.get("mitigations"), list) and ai_response["mitigations"]:
                result["mitigations"] = ai_response["mitigations"][:6]

            if isinstance(ai_response.get("confidence"), (int, float)):
                result["confidence"] = min(95, max(60, int(ai_response["confidence"])))

            if isinstance(ai_response.get("attackTechnique"), dict):
                tech = ai_response["attackTechnique"]
                result["attackTechnique"] = {
                    "name": tech.get("name", result["attackTechnique"]["name"]),
                    "mitreId": tech.get("mitreId", result["attackTechnique"]["mitreId"]),
                    "description": tech.get("description", result["attackTechnique"]["description"]),
                    "prevention": tech.get("prevention", result["attackTechnique"]["prevention"]),
                }

            if isinstance(ai_response.get("hackerProfile"), dict):
                hp = ai_response["hackerProfile"]
                result["hackerProfile"] = {
                    "estimatedLocation": hp.get("estimatedLocation", result["hackerProfile"]["estimatedLocation"]),
                    "attackPattern": hp.get("attackPattern", result["hackerProfile"]["attackPattern"]),
                    "riskLevel": hp.get("riskLevel", result["hackerProfile"]["riskLevel"]),
                }
    except Exception as e:
        print(f"Deep AI analysis error (using fallback): {e}")

    return result


def _fallback_attack_technique(threat_type: str) -> Dict[str, Any]:
    """Fallback MITRE ATT&CK technique mapping when AI is unavailable."""
    techniques = {
        "port_scan": {
            "name": "Network Service Scanning",
            "mitreId": "T1046",
            "description": "Attacker systematically probed open ports to discover running services and potential entry points.",
            "prevention": [
                "Deploy intrusion detection rules for sequential port access patterns",
                "Implement port knocking or single-packet authorization",
                "Restrict unnecessary open ports via network segmentation",
            ],
        },
        "ddos_attempt": {
            "name": "Network Denial of Service",
            "mitreId": "T1498",
            "description": "Volumetric flooding attack designed to exhaust network resources and deny service to legitimate users.",
            "prevention": [
                "Enable rate limiting and SYN flood protection at the firewall",
                "Deploy upstream DDoS mitigation service",
                "Implement traffic filtering with geo-blocking for non-essential regions",
            ],
        },
        "data_exfiltration": {
            "name": "Exfiltration Over C2 Channel",
            "mitreId": "T1041",
            "description": "Sensitive data was extracted from the network via an encrypted command-and-control channel.",
            "prevention": [
                "Monitor and alert on abnormal outbound data volumes",
                "Deploy DLP rules to detect sensitive data in network flows",
                "Enforce TLS inspection on outbound traffic",
            ],
        },
        "brute_force": {
            "name": "Brute Force - Password Spraying",
            "mitreId": "T1110.003",
            "description": "Automated credential guessing attack targeting device management interfaces.",
            "prevention": [
                "Enforce account lockout after 5 failed attempts",
                "Deploy MFA on all management interfaces",
                "Use certificate-based authentication for IoT devices",
            ],
        },
        "malware_detected": {
            "name": "User Execution - Malicious File",
            "mitreId": "T1204.002",
            "description": "Malware payload was delivered and executed on the target device.",
            "prevention": [
                "Deploy endpoint detection and response (EDR) on all devices",
                "Enable application whitelisting to block unauthorized binaries",
                "Keep firmware and software up to date with security patches",
            ],
        },
        "iot_botnet": {
            "name": "Resource Hijacking - IoT Botnet",
            "mitreId": "T1496",
            "description": "IoT devices were compromised and recruited into a botnet for coordinated malicious activity.",
            "prevention": [
                "Change default credentials on all IoT devices",
                "Segment IoT devices onto isolated VLANs",
                "Monitor for unusual outbound connection patterns from IoT devices",
            ],
        },
        "firmware_exploit": {
            "name": "Exploitation of Remote Services",
            "mitreId": "T1210",
            "description": "Attacker exploited a vulnerability in device firmware to gain unauthorized access.",
            "prevention": [
                "Schedule regular firmware vulnerability scanning",
                "Apply firmware patches within 48 hours of release",
                "Disable unused remote management interfaces",
            ],
        },
    }
    return techniques.get(threat_type, {
        "name": "Unknown Technique",
        "mitreId": "N/A",
        "description": "Attack technique requires further analysis to classify.",
        "prevention": ["Conduct full forensic analysis", "Review network logs for indicators of compromise"],
    })


def _generate_fallback_reasoning(threat: Dict[str, Any], evidence: Dict[str, Any], affected_devices: List[Dict[str, Any]]) -> str:
    """Generate reasoning when AI is not available."""
    attack_type = threat.get("type", "unknown attack").replace("_", " ")
    severity = threat.get("severity", "Medium")
    device_count = len(affected_devices)
    ip_count = len(evidence.get("suspiciousIPs", []))
    
    reasoning_parts = [
        f"{severity}-severity {attack_type} detected with {threat.get('threatScore', 0)}/10 risk score.",
    ]
    
    if device_count > 1:
        reasoning_parts.append(f"Attack pattern spans {device_count} devices indicating coordinated campaign.")
    
    if ip_count > 1:
        reasoning_parts.append(f"Multiple attack vectors ({ip_count} source IPs) suggest well-resourced threat actor.")
    
    if evidence.get("malwareIndicators"):
        reasoning_parts.append("Malware signatures extracted for forensic analysis.")
    
    reasoning_parts.append("Recommend immediate containment and full forensic investigation.")
    
    return " ".join(reasoning_parts)


def _generate_mitigations(threat: Dict[str, Any], affected_devices: List[Dict[str, Any]]) -> List[str]:
    """Generate mitigation recommendations."""
    mitigations = []
    
    severity = threat.get("severity", "Medium")
    threat_type = threat.get("type", "")
    target_device = threat.get("targetDevice", "")
    
    # Immediate actions
    if severity in ["Critical", "High"]:
        mitigations.append(f"Isolate affected subnet immediately")
        mitigations.append(f"Block source IP {threat.get('sourceIp', 'unknown')} at firewall")
    
    # Type-specific mitigations
    if threat_type == "port_scan":
        mitigations.append("Enable advanced intrusion detection on perimeter")
    elif threat_type == "ddos_attempt":
        mitigations.append("Activate DDoS mitigation and rate limiting")
    elif threat_type == "data_exfiltration":
        mitigations.append("Inspect outbound traffic for data leakage")
        mitigations.append("Rotate all device credentials immediately")
    elif threat_type == "brute_force":
        mitigations.append("Force password reset on affected accounts")
        mitigations.append("Enable MFA on all management interfaces")
    
    # Device-specific actions
    if len(affected_devices) > 1:
        mitigations.append("Deploy honeypot to capture full attack payload")
    
    mitigations.append("Conduct full forensic imaging of affected devices")
    mitigations.append("Review and patch vulnerable firmware versions")
    
    return mitigations[:6]  # Limit to 6 for UI


def _calculate_confidence(threat: Dict[str, Any], evidence: Dict[str, Any], affected_devices: List[Dict[str, Any]]) -> int:
    """Calculate investigation confidence score."""
    confidence = 60  # Base confidence
    
    # Boost for severity
    if threat.get("severity") == "Critical":
        confidence += 15
    elif threat.get("severity") == "High":
        confidence += 10
    
    # Boost for evidence
    if evidence.get("suspiciousIPs"):
        confidence += 5
    if evidence.get("malwareIndicators"):
        confidence += 10
    if evidence.get("anomalies"):
        confidence += 5
    
    # Boost for multiple affected devices
    if len(affected_devices) > 1:
        confidence += 5
    
    return min(confidence, 95)  # Cap at 95%


def _geolocate_ip(ip: str) -> str:
    """Simulate IP geolocation (would use real GeoIP DB in production)."""
    # Simple hash-based country assignment for demo consistency
    ip_hash = hash(ip)
    countries = [
        "Moscow, RU",
        "Beijing, CN",
        "Bucharest, RO",
        "Amsterdam, NL",
        "Tokyo, JP",
        "London, UK",
        "Unknown",
    ]
    return countries[abs(ip_hash) % len(countries)]


def _infer_malware_family(threat_type: str) -> str:
    """Infer malware family from threat type."""
    families = {
        "port_scan": "Mirai Variant",
        "ddos_attempt": "DDoS Botnet",
        "data_exfiltration": "Custom RAT",
        "brute_force": "Credential Stealer",
        "iot_botnet": "Mirai IoT Variant",
        "firmware_exploit": "Firmware Rootkit",
    }
    return families.get(threat_type, "Unknown Malware")


async def build_investigation(threat: Dict[str, Any]) -> Dict[str, Any]:
    """
    Build complete investigation from threat.
    Async version for API endpoints.
    """
    investigation_id = _generate_investigation_id(str(threat.get("_id", "")))
    classification = _classify_attack_vector(threat.get("type", ""))
    affected_devices = _correlate_affected_devices(threat)
    evidence = _collect_evidence(threat, affected_devices)
    timeline = _build_timeline(threat, affected_devices)
    ai_analysis = _deep_ai_analysis(threat, evidence, affected_devices)

    # Proactive IP blocking for Critical/High severity threats
    blocked_ips_list = []
    source_ip = threat.get("sourceIp", "")
    severity = threat.get("severity", "Medium")
    if source_ip and source_ip != "unknown" and severity in ("Critical", "High"):
        technique_name = ai_analysis.get("attackTechnique", {}).get("name", "Unknown")
        block_ip(source_ip)
        blocked_entry = {
            "ip": source_ip,
            "reason": f"Auto-blocked during investigation {investigation_id}: {technique_name}",
            "technique": technique_name,
            "threat_type": threat.get("type", "unknown"),
            "investigation_id": investigation_id,
            "timestamp": datetime.utcnow().isoformat(),
        }
        if db is not None:
            await db.blocked_ips.update_one(
                {"ip": source_ip, "investigation_id": investigation_id},
                {"$set": blocked_entry},
                upsert=True,
            )
        blocked_ips_list.append(blocked_entry)

    investigation = {
        "id": investigation_id,
        "threat_id": str(threat.get("_id", "")),
        "title": classification,
        "status": "in-progress",
        "severity": severity,
        "created": threat.get("timestamp", datetime.utcnow().isoformat()),
        "analyst": "AI Autonomous Agent",
        "riskScore": ai_analysis["confidence"],
        "classification": classification,
        "summary": threat.get("aiSummary", threat.get("description", "Investigation auto-generated from threat detection")),
        "affectedDevices": affected_devices,
        "evidence": evidence,
        "timeline": timeline,
        "aiAnalysis": ai_analysis,
        "attackTechnique": ai_analysis.get("attackTechnique", {}),
        "hackerProfile": ai_analysis.get("hackerProfile", {}),
        "blockedIPs": blocked_ips_list,
        "threat": {
            "type": threat.get("type"),
            "source_ip": threat.get("sourceIp"),
            "target_device": threat.get("targetDevice"),
            "threat_score": threat.get("threatScore"),
        },
    }

    # Store in MongoDB
    if db is not None:
        await db.investigations.update_one(
            {"id": investigation_id},
            {"$set": investigation},
            upsert=True,
        )

    return investigation


def build_investigation_sync(threat: Dict[str, Any]) -> Dict[str, Any]:
    """
    Build complete investigation from threat.
    Sync version for background tasks.
    """
    investigation_id = _generate_investigation_id(str(threat.get("_id", "")))
    classification = _classify_attack_vector(threat.get("type", ""))
    affected_devices = _correlate_affected_devices(threat)
    evidence = _collect_evidence(threat, affected_devices)
    timeline = _build_timeline(threat, affected_devices)
    ai_analysis = _deep_ai_analysis(threat, evidence, affected_devices)

    # Proactive IP blocking for Critical/High severity threats
    blocked_ips_list = []
    source_ip = threat.get("sourceIp", "")
    severity = threat.get("severity", "Medium")
    if source_ip and source_ip != "unknown" and severity in ("Critical", "High"):
        technique_name = ai_analysis.get("attackTechnique", {}).get("name", "Unknown")
        block_ip(source_ip)
        blocked_entry = {
            "ip": source_ip,
            "reason": f"Auto-blocked during investigation {investigation_id}: {technique_name}",
            "technique": technique_name,
            "threat_type": threat.get("type", "unknown"),
            "investigation_id": investigation_id,
            "timestamp": datetime.utcnow().isoformat(),
        }
        if sync_db is not None:
            sync_db.blocked_ips.update_one(
                {"ip": source_ip, "investigation_id": investigation_id},
                {"$set": blocked_entry},
                upsert=True,
            )
        blocked_ips_list.append(blocked_entry)

    investigation = {
        "id": investigation_id,
        "threat_id": str(threat.get("_id", "")),
        "title": classification,
        "status": "in-progress",
        "severity": severity,
        "created": threat.get("timestamp", datetime.utcnow().isoformat()),
        "analyst": "AI Autonomous Agent",
        "riskScore": ai_analysis["confidence"],
        "classification": classification,
        "summary": threat.get("aiSummary", threat.get("description", "Investigation auto-generated from threat detection")),
        "affectedDevices": affected_devices,
        "evidence": evidence,
        "timeline": timeline,
        "aiAnalysis": ai_analysis,
        "attackTechnique": ai_analysis.get("attackTechnique", {}),
        "hackerProfile": ai_analysis.get("hackerProfile", {}),
        "blockedIPs": blocked_ips_list,
        "threat": {
            "type": threat.get("type"),
            "source_ip": threat.get("sourceIp"),
            "target_device": threat.get("targetDevice"),
            "threat_score": threat.get("threatScore"),
        },
    }

    # Store in MongoDB
    if sync_db is not None:
        sync_db.investigations.update_one(
            {"id": investigation_id},
            {"$set": investigation},
            upsert=True,
        )

        # Back-link: update threat document with investigation_id
        threat_oid = threat.get("_id")
        if threat_oid:
            sync_db.threats.update_one(
                {"_id": threat_oid},
                {"$set": {"investigation_id": investigation_id}},
            )

    return investigation


async def get_investigations(limit: int = 50, status: Optional[str] = None) -> List[Dict[str, Any]]:
    """Get all investigations with optional status filter."""
    if db is None:
        return []
    
    query = {}
    if status:
        query["status"] = status
    
    investigations = await db.investigations.find(query).sort("created", -1).limit(limit).to_list(limit)
    
    # Clean up _id for JSON serialization
    for inv in investigations:
        if "_id" in inv:
            inv["_id"] = str(inv["_id"])
    
    return investigations


async def get_investigation_by_id(investigation_id: str) -> Optional[Dict[str, Any]]:
    """Get single investigation by ID."""
    if db is None:
        return None
    
    investigation = await db.investigations.find_one({"id": investigation_id})
    
    if investigation and "_id" in investigation:
        investigation["_id"] = str(investigation["_id"])
    
    return investigation


def on_threat_created(threat: Dict[str, Any]):
    """
    Callback when threat is created.
    Automatically builds investigation for high-severity threats.
    """
    severity = threat.get("severity", "Low")
    
    # Auto-investigate Critical and High severity threats
    if severity in ["Critical", "High"]:
        try:
            build_investigation_sync(threat)
            print(f"✅ Auto-created investigation for {severity} severity threat")
        except Exception as e:
            print(f"Failed to auto-create investigation: {e}")
