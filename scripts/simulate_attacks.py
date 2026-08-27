"""
NeuroGuard Real-Time Attack Simulation Tool for Hackathon Demos
Allows 1-click execution of simulated cyberattacks against ESP32, ESP32-CAM, or SOC edge endpoints.

Attacks supported:
1. Fast Port Scan (Reconnaissance)
2. HTTP Stream Flood / DoS
3. Credential Brute-Force
4. High-Volume Telemetry Anomaly
"""

import sys
import time
import socket
import urllib.request
import json
import random
from typing import List

DEFAULT_TARGET_IP = "192.168.137.50"  # Replace with your ESP32 or ESP32-CAM IP
DEFAULT_BACKEND_URL = "http://localhost:8000"


def banner():
    print(r"""
===================================================================
    _  _ ___ _   _ ____ ____ ____ _  _ ____ ____ ___  
    |\ | |__ |   | |__/ |  | | __ |  | |__| |__/ |  \ 
    | \| |___ \_/  |  \ |__| |__] |__| |  | |  \ |__/ 
        ⚡ Real-Time Cyberattack Simulation Engine ⚡
===================================================================
""")


def simulate_port_scan(target_ip: str, ports: List[int] = None):
    """Simulates multi-port reconnaissance probe."""
    if ports is None:
        ports = [21, 22, 23, 80, 81, 443, 554, 1883, 8000, 8080]

    print(f"\n[ATTACK] Launching TCP Port Scan against target: {target_ip}...")
    open_ports = []
    
    for port in ports:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(0.3)
        try:
            res = s.connect_ex((target_ip, port))
            if res == 0:
                print(f"  [+] Port {port:<5} : OPEN")
                open_ports.append(port)
            else:
                print(f"  [-] Port {port:<5} : CLOSED / FILTERED")
        except Exception as e:
            print(f"  [!] Port {port:<5} : TIMEOUT / DROPPED ({e})")
        finally:
            s.close()
        time.sleep(0.05)

    print(f"\n[COMPLETED] Port scan completed. Found {len(open_ports)} open port(s).")


def simulate_http_stream_flood(target_ip: str, port: int = 80, duration_sec: int = 6):
    """Floods HTTP endpoints on ESP32-CAM or ESP32 to simulate DoS / Stream exhaustion."""
    url = f"http://{target_ip}:{port}/stream"
    print(f"\n[ATTACK] Launching High-Rate HTTP Stream Flood against {url} for {duration_sec}s...")
    
    end_time = time.time() + duration_sec
    req_count = 0

    while time.time() < end_time:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "NeuroGuard-StressTester/1.0"})
            with urllib.request.urlopen(req, timeout=0.8) as resp:
                req_count += 1
        except Exception:
            req_count += 1
        
        if req_count % 10 == 0:
            print(f"  [>>] Sent {req_count} flood requests...")
        time.sleep(0.02)

    print(f"\n[COMPLETED] Flooding burst ended. Total packets/requests sent: {req_count}")


def simulate_backend_threat_event(backend_url: str, target_device: str = "esp32_node_01", attack_type: str = "port_scan"):
    """Directly triggers a verified security incident on the NeuroGuard SOC backend."""
    url = f"{backend_url.rstrip('/')}/api/device/telemetry"
    print(f"\n[TELEMETRY INJECTOR] Simulating {attack_type.upper()} event to {url}...")

    payload = {
        "device_id": target_device,
        "ip": "192.168.137.50",
        "source_ip": "192.168.137.199",  # Attacker IP
        "connections": 140 if "flood" in attack_type or "dos" in attack_type else 85,
        "bytes": 550000 if "flood" in attack_type else 15000,
        "protocol": "TCP",
        "event": attack_type,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    }

    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            print(f"\n[SOC BACKEND RESPONSE]")
            print(f"  Status        : {data.get('status')}")
            print(f"  Threat Active : {data.get('threat_detected')}")
            print(f"  LED State     : {data.get('led', 'N/A').upper()}")
            print(f"  AI Action     : {data.get('action')}")
    except Exception as e:
        print(f"[!] Injection error: {e}")


def main():
    banner()
    print("Select attack simulation mode:")
    print("  1. TCP Port Scan (Reconnaissance on ESP32 / ESP32-CAM)")
    print("  2. HTTP Video Stream Flood (DoS against ESP32-CAM)")
    print("  3. Direct High-Severity Anomaly Injection (Instant Red LED & AI Defense)")
    print("  4. Full Multi-Vector Attack Cycle (Scan -> Flood -> Mitigation)")
    print("  0. Exit\n")

    choice = input("Enter option [1-4]: ").strip()
    target = input(f"Target IP [{DEFAULT_TARGET_IP}]: ").strip() or DEFAULT_TARGET_IP

    if choice == "1":
        simulate_port_scan(target)
    elif choice == "2":
        port = int(input("Port [80]: ").strip() or "80")
        simulate_http_stream_flood(target, port=port)
    elif choice == "3":
        backend = input(f"Backend URL [{DEFAULT_BACKEND_URL}]: ").strip() or DEFAULT_BACKEND_URL
        simulate_backend_threat_event(backend, attack_type="port_scan_and_flood")
    elif choice == "4":
        backend = input(f"Backend URL [{DEFAULT_BACKEND_URL}]: ").strip() or DEFAULT_BACKEND_URL
        print("\n--- PHASE 1: RECONNAISSANCE ---")
        simulate_port_scan(target)
        time.sleep(1)
        print("\n--- PHASE 2: STREAM EXHAUSTION ---")
        simulate_http_stream_flood(target, duration_sec=3)
        time.sleep(1)
        print("\n--- PHASE 3: SOC INCIDENT CREATION ---")
        simulate_backend_threat_event(backend, attack_type="coordinated_iot_attack")
    else:
        print("Exiting.")


if __name__ == "__main__":
    main()
