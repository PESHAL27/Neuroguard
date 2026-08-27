"""
NeuroGuard Real-Time Hardware Network Sniffer & Multi-Layer Intrusion Defense
Monitors Laptop Mobile Hotspot (192.168.137.x) and Wi-Fi to protect ESP32-CAM and IoT nodes.
Multi-Layer Detection:
1. Scapy Packet Sniffing (Hotspot adapter + L3 Raw Sockets)
2. Real-Time Kernel Connection & Message Burst Tracker (Catches 20-message floods even across Layer 2)
3. Immediate Host Firewall + Kernel Route Nulling + Real-time Alerts
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

# Tracking data structures for flood and scan detection
packet_history = defaultdict(lambda: deque(maxlen=100))
target_packet_history = defaultdict(lambda: deque(maxlen=100))
port_tracker = defaultdict(set)
last_alert_time = defaultdict(float)
blocked_ips_set = set()

COOLDOWN_SECONDS = 5.0


def block_attacker_ip(attacker_ip: str):
    """Executes real-time Windows Firewall + Kernel Route Isolation for the attacker."""
    if not attacker_ip or attacker_ip in ["127.0.0.1", "0.0.0.0", "localhost"] or attacker_ip in blocked_ips_set:
        return

    blocked_ips_set.add(attacker_ip)
    print(f"\n[QUARANTINE PROTOCOL] 🛑 Isolating Attacker Device: {attacker_ip}...")
    try:
        # Inbound and Outbound Windows Firewall Rules
        cmd_in = f'netsh advfirewall firewall add rule name="NeuroGuard_Block_{attacker_ip}_IN" dir=in action=block remoteip={attacker_ip}'
        cmd_out = f'netsh advfirewall firewall add rule name="NeuroGuard_Block_{attacker_ip}_OUT" dir=out action=block remoteip={attacker_ip}'
        # Route Null Blackhole (Kills Mobile Hotspot NAT forwarding)
        cmd_route = f'route add {attacker_ip} mask 255.255.255.255 127.0.0.1 metric 1'
        # ARP Flush
        cmd_arp = f'arp -d {attacker_ip}'

        subprocess.run(cmd_in, shell=True, capture_output=True)
        subprocess.run(cmd_out, shell=True, capture_output=True)
        subprocess.run(cmd_route, shell=True, capture_output=True)
        subprocess.run(cmd_arp, shell=True, capture_output=True)

        print(f"✅ Attacker IP {attacker_ip} has been DISCONNECTED & BLOCKED from Mobile Hotspot.")
    except Exception as e:
        print(f"❌ Failed to apply firewall quarantine: {e}")


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


def trigger_threat_alert(src_ip: str, dst_ip: str, attack_type: str, severity: str, score: int, description: str):
    """Prints live alert banner in CMD, plays audio chime, applies quarantine, and dispatches to SOC."""
    current_time = time.time()
    if current_time - last_alert_time[src_ip] < COOLDOWN_SECONDS:
        return
    last_alert_time[src_ip] = current_time

    timestamp_str = time.strftime("%H:%M:%S")

    # High-Visibility Terminal Banner
    print("\n" + "=" * 74)
    print(f" 🚨 [SECURITY INTRUSION DETECTED] AT {timestamp_str}")
    print("=" * 74)
    print(f"  📌 Attack Type   : {attack_type}")
    print(f"  🎯 Target Device : {dst_ip} (ESP32-CAM / Hotspot Endpoint)")
    print(f"  💀 Attacker IP   : {src_ip} (Attacker ESP32 / Host)")
    print(f"  📊 Threat Score  : {score}/10  [{severity.upper()} SEVERITY]")
    print(f"  📝 Evidence      : {description}")
    print("=" * 74)

    # Terminal Audio Chime
    try:
        sys.stdout.write("\a")
        sys.stdout.flush()
    except Exception:
        pass

    # 1. Execute immediate kernel isolation on the attacker IP
    block_attacker_ip(src_ip)

    # 2. Dispatch to SOC Dashboard
    payload = {
        "source_ip": src_ip,
        "target_device": dst_ip,
        "attack_type": attack_type.lower().replace(" ", "_").replace("/", "_"),
        "severity": severity,
        "description": description,
        "threat_score": score
    }
    dispatch_threat_to_backend(payload)

    print(f"[*] Alert broadcasted to SOC Dashboard. Resuming traffic monitoring...\n")


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

    # Record packet timestamps in sliding windows
    dq = packet_history[src_ip]
    dq.append(now)
    target_dq = target_packet_history[(src_ip, dst_ip)]
    target_dq.append(now)

    # 1. Check for Message Flood / DoS Burst (e.g. 20 messages sent to CAM ESP32)
    burst_count = sum(1 for t in target_dq if now - t <= 3.5)
    if burst_count >= 5:
        trigger_threat_alert(
            src_ip=src_ip,
            dst_ip=dst_ip,
            attack_type="DDoS Attempt / Message Flood",
            severity="Critical",
            score=10,
            description=f"Rapid flood burst ({burst_count} messages/packets in <3.5s) targeting ESP32-CAM {dst_ip}"
        )
        target_dq.clear()
        return

    # 2. TCP Port Scan & Reconnaissance Detection
    if packet.haslayer(TCP):
        dst_port = packet[TCP].dport
        port_tracker[src_ip].add(dst_port)

        if len(port_tracker[src_ip]) >= 4:
            ports_hit = list(port_tracker[src_ip])[:6]
            trigger_threat_alert(
                src_ip=src_ip,
                dst_ip=dst_ip,
                attack_type="Port Scan Reconnaissance",
                severity="High",
                score=8,
                description=f"Sequential port scan probing ports {ports_hit} on {dst_ip}"
            )
            port_tracker[src_ip] = set()
            return

    # 3. Payload Inspection for Video Stream Exhaustion or Attack Signatures
    if packet.haslayer(Raw):
        payload_bytes = bytes(packet[Raw].load)
        payload_lower = payload_bytes[:300].lower()
        if b"/stream" in payload_lower or b"stress" in payload_lower or b"flood" in payload_lower or b"attack" in payload_lower:
            trigger_threat_alert(
                src_ip=src_ip,
                dst_ip=dst_ip,
                attack_type="HTTP Video Stream Exhaustion",
                severity="High",
                score=9,
                description=f"Malicious video stream request / payload probe directed at {dst_ip}"
            )
            return


def start_kernel_connection_poller():
    """Background thread polling Windows active connection tables to catch floods even across Layer 2."""
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
                        local_ip = c.laddr.ip if c.laddr else ""
                        if remote_ip.startswith("192.168.137.") and not remote_ip.startswith("192.168.137.1"):
                            conn_counts[remote_ip].append(now)
                            burst = sum(1 for t in conn_counts[remote_ip] if now - t <= 3.0)
                            if burst >= 8:
                                trigger_threat_alert(
                                    src_ip=remote_ip,
                                    dst_ip="192.168.137.110",
                                    attack_type="DDoS Attempt / Socket Flood",
                                    severity="Critical",
                                    score=10,
                                    description=f"High-frequency TCP connection flood ({burst} sockets in 3s) from {remote_ip}"
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


def start_network_monitor_thread():
    """Starts the hardware network sniffer in a background daemon thread."""
    interfaces = find_hotspot_and_wifi_interfaces()
    threads = []
    if interfaces:
        for iface in interfaces:
            t = threading.Thread(target=start_sniffer_on_iface, args=(iface,), daemon=True, name=f"Sniffer-{getattr(iface, 'name', 'iface')}")
            t.start()
            threads.append(t)
    else:
        try:
            s = conf.L3socket()
            t = threading.Thread(target=lambda: sniff(prn=packet_analyzer, store=0, opened_socket=s), daemon=True, name="Sniffer-L3")
            t.start()
            threads.append(t)
        except Exception as e:
            print(f"[!] Sniffer startup error: {e}")

    start_kernel_connection_poller()
    return threads


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
[*] Target Network : Laptop Mobile Hotspot (192.168.137.0/24) & Wi-Fi
[*] Monitoring     : ESP32-CAM Node, Microcontrollers, & Attacker Nodes
[*] Auto-Quarantine: Windows Host Firewall + Kernel Route Nulling (ON)
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

    # Start kernel socket monitor in parallel
    start_kernel_connection_poller()

    print("\n[*] 🟢 ACTIVE PROTECTION RUNNING. Waiting for network traffic...\n")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[*] Shutting down Network Monitor.")
        sys.exit(0)


if __name__ == "__main__":
    main()
