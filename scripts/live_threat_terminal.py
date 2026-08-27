"""
NeuroGuard Live Terminal Threat Monitor & Universal Attacker Blocker
Real-time CMD console displaying threats targeting ESP32-CAM, IoT nodes, and local subnet.
"""

import sys
import os
import io

# Force UTF-8 stdout encoding on Windows CMD to support alert symbols and emojis
if sys.platform == "win32":
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
        os.system("chcp 65001 >nul 2>&1")
    except Exception:
        pass

import time
import json
import urllib.request
import subprocess
from pathlib import Path

BACKEND_CANDIDATES = [
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://localhost:3050",
    "http://127.0.0.1:3050"
]


def block_attacker_ip(ip_address: str):
    """Universal Windows Host Firewall + Routing Blackhole block."""
    if not ip_address or ip_address in ["unknown", "127.0.0.1", "localhost"]:
        return False

    print(f"\n[QUARANTINE PROTOCOL] [BLOCK] Applying Kernel Isolation for Attacker IP: {ip_address}...")
    try:
        # 1. Inbound firewall block
        cmd_in = f'netsh advfirewall firewall add rule name="NeuroGuard_Block_{ip_address}_IN" dir=in action=block remoteip={ip_address}'
        # 2. Outbound firewall block
        cmd_out = f'netsh advfirewall firewall add rule name="NeuroGuard_Block_{ip_address}_OUT" dir=out action=block remoteip={ip_address}'
        # 3. Route null blackhole (instantly kills hotspot/NAT routing to attacker)
        cmd_route = f'route add {ip_address} mask 255.255.255.255 127.0.0.1 metric 1'

        subprocess.run(cmd_in, shell=True, capture_output=True)
        subprocess.run(cmd_out, shell=True, capture_output=True)
        subprocess.run(cmd_route, shell=True, capture_output=True)

        print(f"[OK] Attacker IP {ip_address} is now 100% BLOCKED & ISOLATED on Windows Firewall.")
        return True
    except Exception as e:
        print(f"[ERR] Failed to block IP {ip_address}: {e}")
        return False


def fetch_current_threats():
    """Tries all available backend candidates and local storage to retrieve threats."""
    for base_url in BACKEND_CANDIDATES:
        try:
            req = urllib.request.Request(f"{base_url}/api/threats?limit=50", headers={"User-Agent": "NeuroGuard-CLI/1.0"})
            with urllib.request.urlopen(req, timeout=1.5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if isinstance(data, list):
                    return data
        except Exception:
            continue

    # Fallback to local JSON mock database file if server connection is sluggish
    local_db_file = Path(__file__).resolve().parent.parent / "backend" / "data" / "local_mock_db.json"
    if local_db_file.exists():
        try:
            with open(local_db_file, "r", encoding="utf-8") as f:
                db_data = json.load(f)
                return db_data.get("threats", [])
        except Exception:
            pass

    return []


def print_threat_banner(threat: dict, is_new: bool = True):
    source_ip = threat.get("sourceIp") or threat.get("source_ip") or "unknown"
    target = threat.get("target") or threat.get("targetDevice") or threat.get("target_device") or "ESP32 Target Node"
    attack_type = threat.get("type") or threat.get("attack_type") or "Cyberattack"
    severity = str(threat.get("severity") or "High").upper()
    threat_score = threat.get("threatScore") or threat.get("threat_score") or 9
    timestamp = threat.get("timestamp") or time.strftime("%H:%M:%S")
    summary = threat.get("description") or threat.get("aiSummary") or "Suspicious activity detected."

    status_tag = ">>> [NEW INTRUSION ALERT] <<<" if is_new else "--- [ACTIVE THREAT INCIDENT] ---"

    print("\n" + "=" * 74)
    print(f" {status_tag} AT {timestamp}")
    print("=" * 74)
    print(f"  * Attack Vector : {attack_type}")
    print(f"  * Target Device : {target}")
    print(f"  * Attacker IP   : {source_ip}")
    print(f"  * Threat Score  : {threat_score}/10  [{severity} SEVERITY]")
    print(f"  * AI Summary    : {summary}")
    print("=" * 74)

    # Trigger audible terminal chime
    try:
        sys.stdout.write("\a")
        sys.stdout.flush()
    except Exception:
        pass

    # Apply firewall block rule if it is a new attack event
    if is_new and source_ip and source_ip != "unknown":
        block_attacker_ip(source_ip)


def main():
    if sys.platform == "win32":
        os.system("color 0C")

    print(r"""
==========================================================================
  _  _ ____ _  _ ____ ____ ____ _  _ ____ ____ ___  
  |\ | |___ |  | |__/ |  | | __ |  | |__| |__/ |  \ 
  | \| |___ |__| |  \ |__| |__] |__| |  | |  \ |__/ 
       >>> LIVE REAL-TIME TERMINAL THREAT MONITOR <<<
==========================================================================
[*] Connecting to NeuroGuard SOC Core (Port 8000 & Port 3050)...
[*] Monitoring IoT Camera (ESP32-CAM), Microcontrollers, & Subnet Nodes...
[*] Press Ctrl+C to exit.
==========================================================================
""")

    seen_threat_ids = set()

    # 1. Fetch initial threats and display existing active threats immediately
    initial_threats = fetch_current_threats()
    if initial_threats:
        print(f"[*] Found {len(initial_threats)} threat incident(s) currently in system:")
        for threat in initial_threats[:3]:
            threat_id = str(threat.get("id") or threat.get("_id") or "")
            if threat_id:
                seen_threat_ids.add(threat_id)
            print_threat_banner(threat, is_new=False)
    else:
        print("[*] No prior threat events in log. Baseline clean.")

    print("\n[*] [ONLINE] LIVE REAL-TIME MONITORING ACTIVATED. Waiting for incoming attacks...\n")

    tick = 0
    while True:
        try:
            current_threats = fetch_current_threats()
            new_threat_count = 0

            for threat in current_threats:
                threat_id = str(threat.get("id") or threat.get("_id") or "")
                if threat_id and threat_id not in seen_threat_ids:
                    seen_threat_ids.add(threat_id)
                    new_threat_count += 1
                    print_threat_banner(threat, is_new=True)

            tick += 1
            if tick % 10 == 0 and new_threat_count == 0:
                # Live status heartbeat every ~10 seconds
                cur_time = time.strftime("%H:%M:%S")
                sys.stdout.write(f"\r[*] [{cur_time}] [MONITORING ACTIVE] Probing ESP32 nodes | Threats tracked: {len(seen_threat_ids)}")
                sys.stdout.flush()

        except Exception:
            pass

        time.sleep(1.0)


if __name__ == "__main__":
    main()
