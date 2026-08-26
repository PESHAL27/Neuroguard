import os
import requests
from scapy.all import sniff, IP, TCP, conf
import time
import sys
from collections import defaultdict

# Force UTF-8 on Windows stdout/stderr
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

print("[*] Starting NeuroGuard Hardware Network Monitor")
print("[*] Listening for suspicious TCP traffic (Port Scans)...\n")

API_URL = "http://localhost:8000/api/threats/detect"

# Track connection attempts: {src_ip: set(dst_ports)}
connection_tracker = defaultdict(set)
last_alert_time = defaultdict(float)

# Responsive cooldown for demo testing (10s)
COOLDOWN_SECONDS = 10 

def detect(packet):
    global connection_tracker, last_alert_time
    
    if packet.haslayer(IP) and packet.haslayer(TCP):
        src_ip = packet[IP].src
        dst_ip = packet[IP].dst
        dst_port = packet[TCP].dport
        
        # Localhost filter
        if src_ip == "127.0.0.1" or src_ip == dst_ip:
            return
            
        connection_tracker[src_ip].add(dst_port)
        
        # If an IP hits more than 8 unique ports, it is flagged as a port scan (fast demo detection)
        if len(connection_tracker[src_ip]) >= 8:
            current_time = time.time()
            if current_time - last_alert_time[src_ip] > COOLDOWN_SECONDS:
                last_alert_time[src_ip] = current_time
                print(f"[ALERT] Port Scan Detected from {src_ip} -> {dst_ip} (Silencing further alerts from this IP for 2 mins)")
                
                payload = {
                    "source_ip": src_ip,
                    "target_device": dst_ip,
                    "attack_type": "port_scan",
                    "severity": "high",
                    "description": f"Aggressive port scan targeting multiple ports from {src_ip}",
                    "threat_score": 85
                }
                
                try:
                    res = requests.post(API_URL, json=payload, timeout=2)
                    print(f"[*] Threat dispatched to NeuroGuard backend: HTTP {res.status_code}")
                except Exception as e:
                    print(f"[!] Could not send threat to backend: {e}")
            
            # ALWAYS reset tracker after reaching threshold so it doesn't instantly count up again inside the cooldown 
            connection_tracker[src_ip] = set()

def start_network_monitor_thread():
    """Starts the hardware network sniffer in a background daemon thread."""
    import threading
    def _run():
        try:
            print("[*] Starting Background NeuroGuard Hardware Network Sniffer...")
            try:
                sniff(prn=detect, store=0)
            except RuntimeError as re:
                if "winpcap" in str(re).lower():
                    s = conf.L3socket()
                    sniff(prn=detect, store=0, opened_socket=s)
                else:
                    raise re
        except Exception as e:
            print(f"[Network Monitor Sniffer Error]: {e}")
            
    t = threading.Thread(target=_run, daemon=True, name="HardwareNetworkMonitor")
    t.start()
    return t

if __name__ == "__main__":
    try:
        try:
            sniff(prn=detect, store=0)
        except RuntimeError as re:
            # Fallback for Windows when WinPcap/Npcap is not installed
            if "winpcap" in str(re).lower():
                print("[*] WinPcap/Npcap not found. Using native Layer 3 raw socket fallback...")
                s = conf.L3socket()
                sniff(prn=detect, store=0, opened_socket=s)
            else:
                raise re
    except PermissionError:
        print("\n[ERROR] Administrator privileges required for raw packet sniffing.")
        print("Please right-click PowerShell/CMD -> 'Run as Administrator', then run:")
        print("python backend/detection/network_monitor.py\n")
        print("Alternatively, install Npcap from https://npcap.com/dist/npcap-1.79.exe")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\nShutting down Network Monitor.")
        sys.exit(0)
    except Exception as e:
        print(f"\n[ERROR] Network Monitor failed: {e}")
        print("Tip: Run PowerShell as Administrator or install Npcap.")
