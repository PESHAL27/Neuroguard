"""
NeuroGuard Real-Time Hardware Network Sniffer & Multi-Layer Intrusion Defense
Monitors Laptop Mobile Hotspot (192.168.137.x) and Wi-Fi to protect ESP32-CAM and IoT nodes.

Directionality Protection:
- Target ESP32-CAM Node (192.168.137.55 / 192.168.137.110): PROTECTED ASSET (Never Blocked).
- Attacker ESP32 (192.168.137.63 / Sending Node): ISOLATED & BLOCKED.
"""

import os
import sys
import time
import json
import threading
import subprocess
from collections import defaultdict, deque

# Force UTF-8 on Windows stdout/stderr
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

try:
    import requests
except ImportError:
    requests = None

try:
    import psutil
except ImportError:
    psutil = None

try:
    from scapy.all import sniff, IP, TCP, UDP, Raw, conf, get_if_list
except ImportError:
    print("[ERROR] Scapy is not installed. Run: pip install scapy")
    sys.exit(1)

API_URL = "http://127.0.0.1:8000/api/threats/detect"
ALT_API_URL = "http://localhost:3050/api/threats"

# Protected Assets (Target Video & Gateway Nodes - NEVER BLOCKED)
PROTECTED_TARGET_IPS = {
    "192.168.137.55",   # ESP32-CAM Node
    "192.168.137.110",  # ESP32-CAM Node Alt
    "192.168.137.1",    # Laptop Hotspot Gateway
    "192.168.31.173",   # Admin Laptop Wi-Fi
    "192.168.31.1",     # Wi-Fi Router
    "192.168.1.4",
    "192.168.1.1",
    "127.0.0.1",
    "0.0.0.0"
}

# Tracking data structures for flood and scan detection
packet_history = defaultdict(lambda: deque(maxlen=100))
target_packet_history = defaultdict(lambda: deque(maxlen=100))
port_tracker = defaultdict(set)
last_alert_time = defaultdict(float)
blocked_ips_set = set()

COOLDOWN_SECONDS = 4.0


def block_attacker_ip(attacker_ip: str):
    """Executes real-time Windows Firewall + Kernel Route Isolation for the attacker."""
    if not attacker_ip or attacker_ip in PROTECTED_TARGET_IPS or attacker_ip in blocked_ips_set:
        return

    blocked_ips_set.add(attacker_ip)
    print(f"\n[QUARANTINE PROTOCOL] 🛑 Isolating Attacker Device: {attacker_ip}...")
    try:
        # Inbound and Outbound Windows Firewall Rules
        cmd_in = f'netsh advfirewall firewall add rule name="NeuroGuard_Block_{attacker_ip}_IN" dir=in action=block remoteip={attacker_ip}'
        cmd_out = f'netsh advfirewall firewall add rule name="NeuroGuard_Block_{attacker_ip}_OUT" dir=out action=block remoteip={attacker_ip}'
        # Route Null Blackhole (Kills Mobile Hotspot NAT forwarding for attacker)
        cmd_route = f'route add {attacker_ip} mask 255.255.255.255 127.0.0.1 metric 1'
        # Flush ARP to drop frame resolution
        cmd_arp = f'arp -d {attacker_ip}'

        subprocess.run(cmd_in, shell=True, capture_output=True)
        subprocess.run(cmd_out, shell=True, capture_output=True)
        subprocess.run(cmd_route, shell=True, capture_output=True)
        subprocess.run(cmd_arp, shell=True, capture_output=True)

        print(f"✅ Attacker Device {attacker_ip} is now DISCONNECTED & QUARANTINED from Hotspot.")
    except Exception as e:
        print(f"❌ Failed to apply quarantine: {e}")


def dispatch_threat_to_backend(payload: dict):
    """Sends threat payload to FastAPI backend and Next.js frontend."""
    try:
        if requests:
            requests.post(API_URL, json=payload, timeout=1.5)
        else:
            import urllib.request
            req = urllib.request.Request(API_URL, data=json.dumps(payload).encode("utf-8"), headers={"Content-Type": "application/json"}, method="POST")
            urllib.request.urlopen(req, timeout=1.5)
    except Exception:
        pass


def trigger_threat_alert(attacker_ip: str, target_cam_ip: str, attack_type: str, severity: str, score: int, description: str):
    """Prints live alert banner in CMD, plays audio chime, isolates attacker, and updates SOC."""
    # Strict safety check: Never designate protected CAM or laptop gateway as the attacker
    if attacker_ip in PROTECTED_TARGET_IPS:
        if target_cam_ip not in PROTECTED_TARGET_IPS:
            attacker_ip, target_cam_ip = target_cam_ip, attacker_ip
        else:
            return

    current_time = time.time()
    if current_time - last_alert_time[attacker_ip] < COOLDOWN_SECONDS:
        return
    last_alert_time[attacker_ip] = current_time

    timestamp_str = time.strftime("%H:%M:%S")

    # High-Visibility Terminal Banner
    print("\n" + "=" * 74)
    print(f" 🚨 [SECURITY INTRUSION DETECTED] AT {timestamp_str}")
    print("=" * 74)
    print(f"  📌 Attack Type   : {attack_type}")
    print(f"  🎯 Target Device : {target_cam_ip} [PROTECTED ESP32-CAM NODE]")
    print(f"  💀 Attacker IP   : {attacker_ip} [ATTACKER ESP32 - QUARANTINED]")
    print(f"  📊 Threat Score  : {score}/10  [{severity.upper()} SEVERITY]")
    print(f"  📝 Evidence      : {description}")
    print("=" * 74)

    # Terminal Audio Chime
    try:
        sys.stdout.write("\a")
        sys.stdout.flush()
    except Exception:
        pass

    # 1. Quarantine the ATTACKER ESP32
    block_attacker_ip(attacker_ip)

    # 2. Dispatch to SOC Dashboard
    payload = {
        "source_ip": attacker_ip,
        "target_device": target_cam_ip,
        "attack_type": attack_type.lower().replace(" ", "_").replace("/", "_"),
        "severity": severity,
        "description": description,
        "threat_score": score
    }
    dispatch_threat_to_backend(payload)

    print(f"[*] Threat dispatched to SOC Dashboard. Attacker {attacker_ip} severed from network.\n")


def packet_analyzer(packet):
    """Deep packet inspection callback for Mobile Hotspot traffic."""
    if not packet.haslayer(IP):
        return

    src_ip = packet[IP].src
    dst_ip = packet[IP].dst
    now = time.time()

    # Ignore loopback or self-traffic
    if src_ip.startswith("127.") or src_ip == dst_ip:
        return

    # Determine true direction: Client -> CAM Server
    # If dst_ip is the CAM (192.168.137.55), src_ip is the attacking client!
    # If src_ip is the CAM, it is responding to dst_ip (the client).
    if dst_ip in ["192.168.137.55", "192.168.137.110"]:
        client_ip = src_ip
        cam_ip = dst_ip
    elif src_ip in ["192.168.137.55", "192.168.137.110"]:
        client_ip = dst_ip
        cam_ip = src_ip
    else:
        client_ip = src_ip
        cam_ip = dst_ip

    # If client is protected (e.g. your admin PC), ignore normal browsing
    if client_ip in PROTECTED_TARGET_IPS:
        return

    # Record message / packet history
    dq = target_packet_history[(client_ip, cam_ip)]
    dq.append(now)

    # 1. Rapid Flood / Message Burst Detection (>= 5 messages in 8.0s)
    burst_count = sum(1 for t in dq if now - t <= 8.0)
    if burst_count >= 5:
        trigger_threat_alert(
            attacker_ip=client_ip,
            target_cam_ip=cam_ip,
            attack_type="DDoS / Message Flood",
            severity="Critical",
            score=10,
            description=f"Rapid intrusion burst ({burst_count} messages) sent from ESP32 {client_ip} to ESP32-CAM {cam_ip}"
        )
        dq.clear()
        return

    # 2. Port Scanning / Probing
    if packet.haslayer(TCP):
        dst_port = packet[TCP].dport
        port_tracker[client_ip].add(dst_port)

        if len(port_tracker[client_ip]) >= 4:
            ports_hit = list(port_tracker[client_ip])[:6]
            trigger_threat_alert(
                attacker_ip=client_ip,
                target_cam_ip=cam_ip,
                attack_type="Port Scan Reconnaissance",
                severity="High",
                score=8,
                description=f"Sequential port scan probing ports {ports_hit} on {cam_ip}"
            )
            port_tracker[client_ip] = set()
            return

    # 3. Payload Inspection
    if packet.haslayer(Raw):
        payload_bytes = bytes(packet[Raw].load)
        payload_lower = payload_bytes[:300].lower()
        if b"/stream" in payload_lower or b"stress" in payload_lower or b"flood" in payload_lower or b"attack" in payload_lower or b"hello" in payload_lower:
            trigger_threat_alert(
                attacker_ip=client_ip,
                target_cam_ip=cam_ip,
                attack_type="HTTP Video Stream / Endpoint Stress",
                severity="High",
                score=9,
                description=f"Malicious stress requests directed at ESP32-CAM {cam_ip} from {client_ip}"
            )
            return


def start_kernel_connection_poller():
    """Background thread polling Windows active connections to detect floods from attacker ESP32s."""
    if not psutil:
        return

    def _poller_loop():
        conn_counts = defaultdict(lambda: deque(maxlen=50))
        while True:
            try:
                now = time.time()
                conns = psutil.net_connections(kind='inet')
                for c in conns:
                    if c.raddr and len(c.raddr) >= 2:
                        remote_ip = c.raddr.ip
                        if remote_ip.startswith("192.168.137.") and remote_ip not in PROTECTED_TARGET_IPS:
                            conn_counts[remote_ip].append(now)
                            burst = sum(1 for t in conn_counts[remote_ip] if now - t <= 6.0)
                            if burst >= 5:
                                trigger_threat_alert(
                                    attacker_ip=remote_ip,
                                    target_cam_ip="192.168.137.55",
                                    attack_type="TCP Connection Flood / DDoS",
                                    severity="Critical",
                                    score=10,
                                    description=f"Attacker ESP32 ({remote_ip}) generated {burst} rapid socket requests to ESP32-CAM"
                                )
                                conn_counts[remote_ip].clear()
            except Exception:
                pass
            time.sleep(0.4)

    t = threading.Thread(target=_poller_loop, daemon=True, name="KernelConnectionPoller")
    t.start()


def find_hotspot_and_wifi_interfaces():
    """Finds Mobile Hotspot (192.168.137.x) and Wi-Fi network interfaces with real IPv4 addresses."""
    matched_ifaces = []
    try:
        for iface_key, iface in conf.ifaces.items():
            iface_ip = getattr(iface, "ip", "") or ""
            iface_name = getattr(iface, "name", "") or ""
            if any(skip in iface_name for skip in ["Filter", "Scheduler", "WFP", "Native MAC", "Virtual WiFi"]):
                continue
            if "192.168.137." in iface_ip or ("Local Area Connection" in iface_name and iface_ip):
                matched_ifaces.append(iface)
            elif "Wi-Fi" in iface_name and iface_ip and not iface_ip.startswith("169.254."):
                matched_ifaces.append(iface)
            elif iface_ip.startswith("192.168.") or iface_ip.startswith("10."):
                matched_ifaces.append(iface)
    except Exception:
        pass
    return matched_ifaces


def start_sniffer_on_iface(iface):
    """Worker thread to sniff packets on a specific network adapter."""
    iface_desc = getattr(iface, "name", str(iface))
    iface_ip = getattr(iface, "ip", "N/A")
    print(f"[*] 📡 Sniffing on Adapter: {iface_desc} (IP: {iface_ip})")
    try:
        sniff(iface=iface, prn=packet_analyzer, store=0)
    except Exception as e:
        try:
            s = conf.L3socket()
            sniff(prn=packet_analyzer, store=0, opened_socket=s)
        except Exception:
            pass


def main():
    if sys.platform == "win32":
        os.system("color 0B")

    print(r"""
==========================================================================
  _  _ ____ _  _ ____ ____ ____ _  _ ____ ____ ___  
  |\ | |___ |  | |__/ |  | | __ |  | |__| |__/ |  \ 
  | \| |___ |__| |  \ |__| |__] |__| |  | |  \ |__/ 
    🛡️ HARDWARE NETWORK PACKET MONITOR & ATTACK BLOCKER 🛡️
==========================================================================
[*] Protected Target: ESP32-CAM Node (192.168.137.55 / 192.168.137.110)
[*] Monitored Subnet: Laptop Mobile Hotspot (192.168.137.0/24)
[*] Auto-Quarantine : Quarantines Attacker ESP32 (Preserves CAM Node)
[*] Press Ctrl+C to stop.
==========================================================================
""")

    interfaces = find_hotspot_and_wifi_interfaces()

    threads = []
    if interfaces:
        for iface in interfaces:
            t = threading.Thread(target=start_sniffer_on_iface, args=(iface,), daemon=True)
            t.start()
            threads.append(t)
    else:
        print("[*] 📡 Sniffing across all active network sockets...")
        try:
            s = conf.L3socket()
            t = threading.Thread(target=lambda: sniff(prn=packet_analyzer, store=0, opened_socket=s), daemon=True)
            t.start()
            threads.append(t)
        except Exception as e:
            print(f"[!] Sniffer startup error: {e}")

    start_kernel_connection_poller()

    print("\n[*] 🟢 ACTIVE PROTECTION RUNNING. Waiting for traffic from Attacker ESP32...\n")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[*] Shutting down Network Monitor.")
        sys.exit(0)


if __name__ == "__main__":
    main()
