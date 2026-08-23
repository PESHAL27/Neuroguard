"""
NeuroGuard Ultra-Stable Real-Time Subnet Monitor
- Ignores multicast/broadcast artifacts (224.x, 239.x, 255.x)
- Strict subnet isolation (192.168.31.1 - 192.168.31.254)
- Stable device counts: only changes when physical devices connect or disconnect.
"""

import os
import sys
import json
import time
import socket
import struct
import ctypes
import subprocess
import re
import threading
import concurrent.futures
from pathlib import Path

# Force UTF-8 on Windows stdout/stderr
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

DATA_DIR = Path("C:/Users/pecul/Desktop/Peshal/college/Hackathon/Neuroguard/backend/data")
DATA_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_FILE = DATA_DIR / "live_devices.json"
OVERRIDES_FILE = DATA_DIR / "device_overrides.json"

# Windows SendARP API
try:
    SendARP = ctypes.windll.iphlpapi.SendARP
except Exception:
    SendARP = None

MAC_VENDORS = {
    "FC:B0:DE": ("Jio / Sercomm Optical Gateway", "router"),
    "5C:7B:5C": ("Skyworth Digital / Jio Set-Top Box", "camera"),
    "4E:4B:40": ("OPPO / Realme Mobile Corporation", "phone"),
    "56:4B:D3": ("Realme Mobile Corporation", "phone"),
    "14:07:08": ("Amazon Technologies Inc.", "sensor"),
    "A4:AE:12": ("Intel / Dell Computer", "laptop"),
    "00:B0:0B": ("Dell / Windows System Workstation", "laptop"),
    "A2:FE:23": ("Windows Laptop Client", "laptop"),
    "B8:27:EB": ("Raspberry Pi Foundation", "raspberry"),
    "DC:A6:32": ("Raspberry Pi Foundation", "raspberry"),
    "E4:5F:01": ("Raspberry Pi Foundation", "raspberry"),
    "24:6F:28": ("Espressif Systems ESP32", "esp32"),
    "30:AE:A4": ("Espressif Systems ESP32", "esp32"),
    "7C:DF:A1": ("Espressif Systems ESP8266", "esp32"),
    "AC:67:B2": ("Espressif Systems ESP32", "esp32"),
}

DEVICE_CACHE = {
    "192.168.31.1": ("JioFiber Home Gateway", "router", "Jio / Sercomm Optical Gateway", "jiofiber.local.html"),
    "192.168.31.91": ("Smart IoT Sensor Node", "sensor", "Amazon Technologies Inc.", "smart-node.lan"),
    "192.168.31.103": ("Friend's Workstation (SYSTEM1)", "laptop", "Dell / Windows Laptop", "SYSTEM1.lan"),
    "192.168.31.144": ("OPPO F27 5G Smartphone", "phone", "OPPO Mobile Corporation", "OPPO-F27-5G.lan"),
    "192.168.31.158": ("Friend's Windows Laptop", "laptop", "Windows Laptop (DESKTOP-057GQQH)", "DESKTOP-057GQQH.lan"),
    "192.168.31.173": ("Admin Host PC (Your Device)", "desktop", "Local Windows Host", "admin.lan"),
    "192.168.31.207": ("Realme NARZO 80 Lite 5G", "phone", "Realme Mobile Corporation", "realme-NARZO-80-Lite-5G.lan"),
}

known_candidates = set([
    "192.168.31.1", "192.168.31.91", "192.168.31.103",
    "192.168.31.144", "192.168.31.158", "192.168.31.173", "192.168.31.207"
])

quarantined_ips = set()
lock = threading.Lock()
miss_count = {}

def get_local_info():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        local_ip = s.getsockname()[0]
    except Exception:
        local_ip = '192.168.31.173'
    finally:
        s.close()
    parts = local_ip.split('.')
    subnet = '.'.join(parts[:3]) + '.'
    gateway_ip = f"{subnet}1"
    return local_ip, subnet, gateway_ip

def load_overrides():
    if OVERRIDES_FILE.exists():
        try:
            return json.loads(OVERRIDES_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}

def enforce_quarantine(blocked_ips):
    global quarantined_ips
    for ip in blocked_ips:
        if ip and ip not in quarantined_ips and not ip.startswith("192.168.31.173"):
            quarantined_ips.add(ip)
            try:
                subprocess.run(
                    f'netsh advfirewall firewall add rule name="NeuroGuard_Block_{ip}" dir=in action=block remoteip={ip}',
                    shell=True, capture_output=True
                )
                subprocess.run(
                    f'netsh advfirewall firewall add rule name="NeuroGuard_Block_{ip}" dir=out action=block remoteip={ip}',
                    shell=True, capture_output=True
                )
            except Exception:
                pass

    for ip in list(quarantined_ips):
        if ip not in blocked_ips:
            quarantined_ips.remove(ip)
            try:
                subprocess.run(
                    f'netsh advfirewall firewall delete rule name="NeuroGuard_Block_{ip}"',
                    shell=True, capture_output=True
                )
            except Exception:
                pass

def get_arp_table(subnet):
    try:
        out = subprocess.run(["arp", "-a"], capture_output=True, text=True, timeout=0.25).stdout
        entries = {}
        for line in out.splitlines():
            m = re.search(r'(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F\-]{17})', line)
            if m:
                ip, mac = m.groups()
                # STRICT VALIDATION: only valid subnet IPs (e.g. 192.168.31.1 - 254), ignore 224.x, 255.x
                if ip.startswith(subnet) and not ip.endswith('.255'):
                    entries[ip] = mac.replace('-', ':').upper()
        return entries
    except Exception:
        return {}

def fast_ping(ip):
    try:
        t0 = time.time()
        res = subprocess.run(
            ["ping", "-n", "1", "-w", "150", ip],
            capture_output=True, text=True, timeout=0.25
        )
        if "TTL=" in res.stdout:
            lat = int((time.time() - t0) * 1000)
            return ip, True, lat
    except Exception:
        pass
    return ip, False, None

def background_discovery(subnet):
    """Periodic background subnet discovery sweep (every 3.5s)."""
    while True:
        try:
            ips = [f"{subnet}{i}" for i in range(1, 255)]
            with concurrent.futures.ThreadPoolExecutor(max_workers=25) as ex:
                results = list(ex.map(fast_ping, ips))
                for ip, is_up, _ in results:
                    if is_up and ip.startswith(subnet):
                        with lock:
                            known_candidates.add(ip)
        except Exception:
            pass
        time.sleep(3.5)

def resolve_device_name(ip, mac):
    if ip in DEVICE_CACHE:
        return DEVICE_CACHE[ip]

    mac_prefix = ":".join(mac.split(":")[:3]).upper() if mac and ":" in mac else ""
    vendor, type_guess = MAC_VENDORS.get(mac_prefix, ("Connected Network Node", "laptop"))

    if ip.endswith(".1"):
        res = ("JioFiber Home Gateway", "router", "Jio / Sercomm Optical Gateway", "jiofiber.local.html")
    elif "56:4B:D3" in mac:
        res = ("Realme NARZO 80 Lite 5G", "phone", "Realme Mobile Corporation", "realme-NARZO-80-Lite-5G.lan")
    elif "4E:4B:40" in mac:
        res = ("OPPO F27 5G Smartphone", "phone", "OPPO Mobile Corporation", "OPPO-F27-5G.lan")
    elif "14:07:08" in mac:
        res = ("Smart IoT Sensor Node", "sensor", "Amazon Technologies Inc.", "smart-node.lan")
    elif "A2:FE:23" in mac or ip == "192.168.31.158":
        res = ("Friend's Windows Laptop", "laptop", "Windows Laptop (DESKTOP-057GQQH)", "DESKTOP-057GQQH.lan")
    elif "00:B0:0B" in mac or ip == "192.168.31.103":
        res = ("Friend's Workstation (SYSTEM1)", "laptop", "Dell / Windows Laptop", "SYSTEM1.lan")
    else:
        res = (f"Connected Device ({ip.split('.')[-1]})", type_guess, vendor, f"device-{ip.split('.')[-1]}.lan")

    DEVICE_CACHE[ip] = res
    return res

def main():
    print("[NeuroGuard Scanner] Ultra-Stable Subnet Monitor Started.")
    local_ip, subnet, gateway_ip = get_local_info()

    # Start background discovery thread
    t = threading.Thread(target=background_discovery, args=(subnet,), daemon=True)
    t.start()

    executor = concurrent.futures.ThreadPoolExecutor(max_workers=14)

    while True:
        try:
            overrides = load_overrides()
            blocked_ips = set()
            for key, ov in overrides.items():
                if ov.get("blocked"):
                    if ov.get("ip"):
                        blocked_ips.add(ov["ip"])
                    elif key.count(".") == 3:
                        blocked_ips.add(key)

            enforce_quarantine(blocked_ips)

            # Read clean ARP table (only valid subnet IPs)
            arp_table = get_arp_table(subnet)
            
            with lock:
                for ip in arp_table:
                    if ip.startswith(subnet):
                        known_candidates.add(ip)
                # Strict filter: only valid subnet IPs
                valid_candidates = [ip for ip in known_candidates if ip.startswith(subnet)]

            # Ping candidate devices in parallel
            ping_results = list(executor.map(fast_ping, valid_candidates))
            
            online_ips = {}
            for ip, is_up, latency in ping_results:
                if is_up:
                    miss_count[ip] = 0
                    mac = arp_table.get(ip, "50:BB:B5:79:E7:18" if ip == local_ip else "DYNAMIC-MAC")
                    online_ips[ip] = (mac, latency or 45)
                elif ip in arp_table and ip != local_ip:
                    # Present in active ARP cache
                    miss_count[ip] = 0
                    online_ips[ip] = (arp_table[ip], 50)
                else:
                    miss_count[ip] = miss_count.get(ip, 0) + 1
                    # If missed 2 consecutive cycles, device is officially disconnected
                    if miss_count[ip] < 2 and ip in DEVICE_CACHE:
                        # Grace cycle to prevent single-packet drop blips
                        mac = arp_table.get(ip, "DYNAMIC-MAC")
                        online_ips[ip] = (mac, 60)

            # Always include local machine
            if local_ip not in online_ips:
                online_ips[local_ip] = ("50:BB:B5:79:E7:18", 15)

            devices_list = []
            for ip in sorted(online_ips.keys(), key=lambda x: int(x.split('.')[-1])):
                mac, latency = online_ips[ip]
                dev_id = f"device_{ip.replace('.', '_')}"
                
                ov = overrides.get(dev_id) or overrides.get(ip) or {}
                is_blocked = bool(ov.get("blocked", False) or ip in blocked_ips)
                is_untrusted = bool(ov.get("trusted") is False or ov.get("surveillance") is True)
                
                name, dev_type, vendor, hostname = resolve_device_name(ip, mac)
                if ip == local_ip:
                    name = "Admin Host PC (Your Device)"
                    dev_type = "desktop"
                    vendor = "Local Windows Host"

                if ov.get("name"):
                    name = ov["name"]
                if ov.get("type"):
                    dev_type = ov["type"]

                device_entry = {
                    "_id": f"dev_{dev_id}",
                    "device_id": dev_id,
                    "name": name,
                    "hostname": hostname,
                    "ip": ip,
                    "mac": mac,
                    "type": dev_type,
                    "type_guess": dev_type,
                    "vendor": vendor,
                    "status": "blocked" if is_blocked else ("surveillance" if is_untrusted else "connected"),
                    "connected": not is_blocked,
                    "trusted": False if is_untrusted else True,
                    "surveillance": is_untrusted,
                    "blocked": is_blocked,
                    "threat_count": 0,
                    "latency_ms": latency,
                    "network_usage": 3200 if ip == local_ip else 450,
                    "connections": 12 if ip == local_ip else 4,
                    "cpu": 85 if ip == local_ip else 25,
                    "last_seen": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                }
                devices_list.append(device_entry)

            with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
                json.dump(devices_list, f, indent=2)

        except Exception as e:
            print(f"[Scanner Error] {e}")

        time.sleep(0.5)

if __name__ == "__main__":
    main()
