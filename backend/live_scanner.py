"""
NeuroGuard High-Performance Real-Time Network Monitor
- Tier 1: Instant Liveness Probe (Every 1s on known devices) -> Detects Wi-Fi Disconnects in < 1s.
- Tier 2: Background Discovery Sweep (Continuous asynchronous sweep of 1..254) -> Discovers new devices in 2-3s.
- Active Quarantine: Windows Firewall rule management for blocked nodes.
"""

import os
import sys
import json
import time
import socket
import struct
import ctypes
import subprocess
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

# MAC vendor heuristics
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

# Known initial devices cache
DEVICE_CACHE = {
    "192.168.31.1": ("JioFiber Home Gateway", "router", "Jio / Sercomm Optical Gateway", "jiofiber.local.html"),
    "192.168.31.91": ("Smart IoT Sensor Node", "sensor", "Amazon Technologies Inc.", "smart-node.lan"),
    "192.168.31.103": ("Friend's Workstation (SYSTEM1)", "laptop", "Dell / Windows Laptop", "SYSTEM1.lan"),
    "192.168.31.144": ("OPPO F27 5G Smartphone", "phone", "OPPO Mobile Corporation", "OPPO-F27-5G.lan"),
    "192.168.31.158": ("Friend's Windows Laptop", "laptop", "Windows Laptop (DESKTOP-057GQQH)", "DESKTOP-057GQQH.lan"),
    "192.168.31.173": ("Admin Host PC (Your Device)", "desktop", "Local Windows Host", "admin.lan"),
    "192.168.31.207": ("Realme NARZO 80 Lite 5G", "phone", "Realme Mobile Corporation", "realme-NARZO-80-Lite-5G.lan"),
}

# State store
active_devices = {
    "192.168.31.1": "FC:B0:DE:23:D9:EC",
    "192.168.31.91": "14:07:08:35:82:C9",
    "192.168.31.103": "00:B0:0B:F3:41:75",
    "192.168.31.144": "4E:4B:40:E2:E8:D0",
    "192.168.31.158": "A2:FE:23:B9:38:BD",
    "192.168.31.173": "50:BB:B5:79:E7:18",
    "192.168.31.207": "56:4B:D3:92:7A:39",
}

state_lock = threading.Lock()
quarantined_ips = set()

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

def probe_single_liveness(ip, timeout_ms=180):
    """Instant check if an already known IP is online (Layer 2 SendARP + ICMP fallback)."""
    # 1. SendARP check
    if SendARP:
        try:
            dest_ip = struct.unpack('<I', socket.inet_aton(ip))[0]
            mac_addr = (ctypes.c_ubyte * 6)()
            mac_len = ctypes.c_ulong(6)
            res = SendARP(dest_ip, 0, ctypes.byref(mac_addr), ctypes.byref(mac_len))
            if res == 0:
                mac_str = ':'.join(['{:02X}'.format(b) for b in mac_addr])
                return ip, mac_str, True
        except Exception:
            pass

    # 2. Fast ping check
    try:
        res = subprocess.run(
            ['ping', '-n', '1', '-w', str(timeout_ms), ip],
            capture_output=True, text=True, timeout=0.3
        )
        if 'TTL=' in res.stdout:
            return ip, None, True
    except Exception:
        pass

    return ip, None, False

def query_new_ip(ip_str):
    """Check an unknown IP during subnet sweep."""
    if not SendARP:
        return None
    try:
        dest_ip = struct.unpack('<I', socket.inet_aton(ip_str))[0]
        mac_addr = (ctypes.c_ubyte * 6)()
        mac_len = ctypes.c_ulong(6)
        res = SendARP(dest_ip, 0, ctypes.byref(mac_addr), ctypes.byref(mac_len))
        if res == 0:
            mac_str = ':'.join(['{:02X}'.format(b) for b in mac_addr])
            return ip_str, mac_str
    except Exception:
        pass
    return None

def background_discovery_thread(subnet, local_ip):
    """Runs continuous background sweeps of the whole subnet to find new devices."""
    print("[NeuroGuard Scanner] Background subnet discovery thread started.")
    while True:
        try:
            ips = [f"{subnet}{i}" for i in range(1, 255)]
            with concurrent.futures.ThreadPoolExecutor(max_workers=25) as ex:
                results = list(ex.map(query_new_ip, ips))
                for res in results:
                    if res:
                        ip, mac = res
                        with state_lock:
                            active_devices[ip] = mac
        except Exception as e:
            print(f"[Discovery Error] {e}")
        time.sleep(2.0)

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
    print("[NeuroGuard Scanner] Fast Dual-Tier Live Monitor started.")
    local_ip, subnet, gateway_ip = get_local_info()

    # Start background discovery thread
    discovery_t = threading.Thread(target=background_discovery_thread, args=(subnet, local_ip), daemon=True)
    discovery_t.start()

    # Instant liveness thread pool (reused across cycles, size 10)
    liveness_executor = concurrent.futures.ThreadPoolExecutor(max_workers=12)

    # Failure counter for clean debouncing (requires 2 consecutive failures to drop)
    miss_counts = {}

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

            with state_lock:
                current_ips = list(active_devices.keys())

            # Probe known active devices in parallel (< 180ms)
            future_to_ip = {liveness_executor.submit(probe_single_liveness, ip): ip for ip in current_ips if ip != local_ip}
            
            still_online = {local_ip: active_devices.get(local_ip, "CURRENT-HOST-MAC")}
            for future in concurrent.futures.as_completed(future_to_ip, timeout=1.0):
                ip, new_mac, is_online = future.result()
                if is_online:
                    miss_counts[ip] = 0
                    with state_lock:
                        mac = new_mac or active_devices.get(ip, "UNKNOWN")
                        still_online[ip] = mac
                else:
                    miss_counts[ip] = miss_counts.get(ip, 0) + 1
                    # If missed 2 consecutive checks, remove from active devices
                    if miss_counts[ip] >= 2:
                        with state_lock:
                            active_devices.pop(ip, None)
                    else:
                        # Keep for 1 grace cycle
                        with state_lock:
                            if ip in active_devices:
                                still_online[ip] = active_devices[ip]

            # Build final device output list
            devices_list = []
            for ip, mac in still_online.items():
                dev_id = f"device_{mac.replace(':', '').lower()}" if mac != "CURRENT-HOST-MAC" else "device_current_host"
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
                    "network_usage": 3200 if ip == local_ip else 450,
                    "connections": 12 if ip == local_ip else 4,
                    "cpu": 85 if ip == local_ip else 25,
                    "last_seen": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                }
                devices_list.append(device_entry)

            with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
                json.dump(devices_list, f, indent=2)

        except Exception as e:
            print(f"[Loop Error] {e}")

        # Cycle pause
        time.sleep(0.5)

if __name__ == "__main__":
    main()
