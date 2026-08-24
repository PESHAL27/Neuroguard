import asyncio
import json
import os
import subprocess
import re
import socket
import time
from datetime import datetime
from typing import Dict, List, Optional

try:
    from db import sync_db, db
except ImportError:
    sync_db = None
    db = None

from device_registry import (
    build_connected_device,
    build_detected_device,
    build_device_id,
    normalize_device_document,
    normalize_mac_key,
)

class NetworkScanner:
    """
    Real network discovery process using nmap.
    Detects active devices on the local subnet and adds them to MongoDB as unknown.
    """
    def __init__(self):
        self.running = False
        self.local_ip = self._get_local_ip()
        self.subnet = self._get_subnet(self.local_ip)
        self.subnet_prefix = ".".join(self.local_ip.split(".")[:3]) + "." if self.local_ip != "127.0.0.1" else "127.0.0."
        self.vendor_cache: Dict[str, Optional[str]] = {}
        self.oui_db = self._load_oui_db()
        self.presence_interval_seconds = 2
        self.deep_scan_interval_seconds = 10
        self.stale_seconds = 30
        self._fingerprint_cache: Dict[str, Dict[str, Optional[str]]] = {}
        self._last_deep_scan_at = 0.0

    def _load_oui_db(self) -> Dict[str, str]:
        data_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "oui.json")
        try:
            with open(data_path, "r", encoding="utf-8") as handle:
                raw_data = json.load(handle)
        except (FileNotFoundError, json.JSONDecodeError):
            return {}

        return {
            self._normalize_oui_prefix(prefix): vendor
            for prefix, vendor in raw_data.items()
            if self._normalize_oui_prefix(prefix)
        }

    def _normalize_mac(self, mac: Optional[str]) -> Optional[str]:
        if not mac:
            return None
        compact = re.sub(r"[^0-9A-Fa-f]", "", mac).upper()
        if len(compact) != 12:
            return None
        return ":".join(compact[index:index + 2] for index in range(0, 12, 2))

    def _normalize_oui_prefix(self, prefix: Optional[str]) -> Optional[str]:
        if not prefix:
            return None
        compact = re.sub(r"[^0-9A-Fa-f]", "", prefix).upper()
        if len(compact) != 6:
            return None
        return ":".join(compact[index:index + 2] for index in range(0, 6, 2))

    def _get_local_ip(self) -> str:
        try:
            # Connect to a public IP to find the local interface IP
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except Exception:
            return "127.0.0.1"

    def _get_subnet(self, ip: str) -> str:
        if ip == "127.0.0.1":
            return "127.0.0.0/24"
        parts = ip.split('.')
        return f"{parts[0]}.{parts[1]}.{parts[2]}.0/24"

    def _parse_scan_target(self, target: str) -> tuple[str, Optional[str]]:
        match = re.match(r"(.+?) \(([0-9.]+)\)$", target)
        if match:
            return match.group(2), match.group(1)
        return target, None

    def lookup_vendor(self, mac: str) -> Optional[str]:
        normalized_mac = self._normalize_mac(mac)
        if not normalized_mac:
            return None

        cache_key = normalized_mac
        if cache_key in self.vendor_cache:
            return self.vendor_cache[cache_key]

        vendor = self.oui_db.get(cache_key[:8])

        self.vendor_cache[cache_key] = vendor
        return vendor

    def get_mac_from_arp(self, ip: str) -> Optional[str]:
        try:
            output = subprocess.check_output(["arp", "-n", ip], timeout=5).decode()
        except Exception:
            return None

        match = re.search(r" at ([0-9A-Fa-f:]{17}) ", output)
        if not match:
            return None
        return self._normalize_mac(match.group(1))

    def _extract_hostname_markers(self, hostname: Optional[str]) -> List[str]:
        if not hostname:
            return []
        lowered = hostname.lower()
        markers = []

        hostname_patterns = {
            r"\bandroid\b": "android",
            r"\biphone\b": "iphone",
            r"\bgalaxy\b": "galaxy",
            r"\bpixel\b": "pixel",
            r"\bmacbook\b": "macbook",
            r"\b(router|gateway|dsl)\b": "router",
            r"\b(raspberry|raspberrypi|rpi)\b": "raspberry",
            r"\b(esp32|esp8266)\b": "esp32",
            r"\b(camera|cam)\b": "camera",
        }

        for pattern, marker in hostname_patterns.items():
            if re.search(pattern, lowered):
                markers.append(marker)

        return markers

    def guess_type(self, vendor: Optional[str], hostname: Optional[str]) -> str:
        hostname_markers = self._extract_hostname_markers(hostname)
        fingerprint = " ".join(part for part in [vendor, hostname, *hostname_markers] if part).lower()

        phone_markers = [
            "samsung", "apple", "iphone", "android", "pixel", "google", "oneplus",
            "xiaomi", "oppo", "vivo", "huawei", "galaxy", "phone"
        ]
        esp_markers = ["espressif", "esp32", "esp8266"]
        raspberry_markers = ["raspberry", "raspberry pi", "rpi"]
        laptop_markers = ["intel", "dell", "lenovo", "hp", "asus", "acer", "macbook", "surface"]
        camera_markers = ["hikvision", "reolink", "dahua", "camera", "cam", "ring", "nest"]
        router_markers = ["router", "gateway", "tp-link", "netgear", "ubiquiti", "mikrotik", "dsl"]

        if any(marker in fingerprint for marker in phone_markers):
            return "phone"
        if any(marker in fingerprint for marker in esp_markers):
            return "esp32"
        if any(marker in fingerprint for marker in raspberry_markers):
            return "raspberry"
        if any(marker in fingerprint for marker in camera_markers):
            return "camera"
        if any(marker in fingerprint for marker in router_markers):
            return "router"
        if any(marker in fingerprint for marker in laptop_markers):
            return "laptop"
        return "unknown"

    def finalize_device(self, device: Dict[str, Optional[str]]) -> Dict[str, Optional[str]]:
        if device.get("mac") == "unknown":
            device["mac"] = self.get_mac_from_arp(device["ip"]) or "unknown"
        if device.get("mac") != "unknown" and not device.get("vendor"):
            device["vendor"] = self.lookup_vendor(device["mac"])
        if device.get("type_guess") == "unknown":
            device["type_guess"] = self.guess_type(
                device.get("vendor"),
                device.get("hostname"),
            )
        return device

    def scan_presence(self) -> List[Dict[str, Optional[str]]]:
        try:
            output = subprocess.check_output(["arp", "-an"], timeout=5).decode()
        except Exception:
            return []

        devices: List[Dict[str, Optional[str]]] = []
        for raw_line in output.splitlines():
            match = re.search(r"\((?P<ip>[0-9.]+)\) at (?P<mac>[0-9A-Fa-f:]{17}|<incomplete>)", raw_line)
            if not match:
                continue

            ip = match.group("ip")
            
            # macOS might connect to Wi-Fi on a 10.x IP but the VPN defaults default route to 172.x.
            # We skip the prefix check so we can discover IoT devices on the actual local LAN subnet too!
            if ip.endswith(".255"):
                continue

            mac = match.group("mac")
            device = {
                "ip": ip,
                "hostname": None,
                "mac": self._normalize_mac(mac) or "unknown",
                "vendor": None,
                "type_guess": "unknown",
            }

            cached = self._fingerprint_cache.get(ip) or self._fingerprint_cache.get(normalize_mac_key(device.get("mac")) or "")
            if cached:
                device = {**cached, **{key: value for key, value in device.items() if value not in [None, "unknown"]}}
                device["ip"] = ip

            devices.append(self.finalize_device(device))

        return devices

    def _update_fingerprint_cache(self, devices: List[Dict[str, Optional[str]]]):
        for device in devices:
            cached = {
                "ip": device.get("ip"),
                "hostname": device.get("hostname"),
                "mac": device.get("mac"),
                "vendor": device.get("vendor"),
                "type_guess": device.get("type_guess"),
            }
            if device.get("ip"):
                self._fingerprint_cache[device["ip"]] = cached
            normalized_mac = normalize_mac_key(device.get("mac"))
            if normalized_mac:
                self._fingerprint_cache[normalized_mac] = cached

    async def _find_existing_device(self, *, device_id: str, ip: Optional[str], mac: Optional[str]):
        clauses = [{"device_id": device_id}]
        if ip:
            clauses.append({"ip": ip})
        if mac and mac != "unknown":
            clauses.append({"mac": mac})

        query = clauses[0] if len(clauses) == 1 else {"$or": clauses}
        known = await db.devices.find_one(query)
        if known:
            return "devices", known
        unknown = await db.unknown_devices.find_one(query)
        if unknown:
            return "unknown_devices", unknown
        return None, None

    async def _reconcile_active_device(self, device: Dict[str, Optional[str]], timestamp: str):
        ip = device.get("ip")
        mac = device.get("mac")
        device["device_id"] = build_device_id(mac, ip)

        source_collection, existing = await self._find_existing_device(device_id=device["device_id"], ip=ip, mac=mac)
        normalized_existing = normalize_device_document(existing, source_collection) if existing else None
        trusted_record = None
        if normalize_mac_key(mac):
            trusted_record = await db.trusted_devices.find_one({"mac": mac})

        if normalized_existing and normalized_existing.get("blocked"):
            blocked_device = build_detected_device(
                device,
                timestamp,
                existing=normalized_existing,
                trusted=normalized_existing.get("trusted", False),
                auto_connect=False,
                blocked=True,
            )
            blocked_device["blocked_at"] = normalized_existing.get("blocked_at") or timestamp
            blocked_device["blocked_reason"] = normalized_existing.get("blocked_reason")
            target = db.devices if source_collection == "devices" else db.unknown_devices
            await target.update_one({"_id": existing["_id"]}, {"$set": blocked_device})
            return blocked_device["device_id"]

        if trusted_record:
            connected_device = build_connected_device(
                device,
                timestamp,
                name=trusted_record.get("name"),
                device_type=trusted_record.get("type") or device.get("type_guess"),
                trusted=True,
                auto_connect=trusted_record.get("auto_connect", True),
                existing=normalized_existing,
            )
            await db.devices.update_one({"device_id": connected_device["device_id"]}, {"$set": connected_device}, upsert=True)
            cleanup_clauses = [{"device_id": connected_device["device_id"]}]
            if ip:
                cleanup_clauses.append({"ip": ip})
            if mac and mac != "unknown":
                cleanup_clauses.append({"mac": mac})
            await db.unknown_devices.delete_many({"$or": cleanup_clauses})
            return connected_device["device_id"]

        if source_collection == "devices":
            connected_device = build_connected_device(
                device,
                timestamp,
                name=normalized_existing.get("name") if normalized_existing else None,
                device_type=normalized_existing.get("type") if normalized_existing else device.get("type_guess"),
                trusted=normalized_existing.get("trusted", False) if normalized_existing else False,
                auto_connect=normalized_existing.get("auto_connect", False) if normalized_existing else False,
                existing=normalized_existing,
            )
            await db.devices.update_one({"_id": existing["_id"]}, {"$set": connected_device})
            return connected_device["device_id"]

        detected_device = build_detected_device(
            device,
            timestamp,
            existing=normalized_existing,
            trusted=normalized_existing.get("trusted", False) if normalized_existing else False,
            auto_connect=normalized_existing.get("auto_connect", False) if normalized_existing else False,
            blocked=False,
        )

        if source_collection == "unknown_devices":
            await db.unknown_devices.update_one({"_id": existing["_id"]}, {"$set": detected_device})
        else:
            await db.unknown_devices.update_one({"device_id": detected_device["device_id"]}, {"$set": detected_device}, upsert=True)
            print(
                f"Network Scanner: Discovered device at {ip} "
                f"vendor={detected_device.get('vendor') or 'unknown'} guess={detected_device.get('type_guess')}"
            )

        return detected_device["device_id"]

    async def _cleanup_stale_devices(self, active_device_ids: set[str], timestamp: str):
        stale_unknowns = db.unknown_devices.find({})
        async for stale_device in stale_unknowns:
            normalized = normalize_device_document(stale_device, "unknown_devices")
            if normalized.get("device_id") in active_device_ids or normalized.get("blocked"):
                continue

            seen_at = normalized.get("last_seen") or normalized.get("first_seen")
            if not seen_at:
                continue
            try:
                age_seconds = (datetime.utcnow() - datetime.fromisoformat(seen_at)).total_seconds()
            except ValueError:
                continue

            if age_seconds > self.stale_seconds:
                await db.unknown_devices.delete_one({"_id": stale_device["_id"]})

        stale_known = db.devices.find({})
        async for known_device in stale_known:
            normalized = normalize_device_document(known_device, "devices")
            if normalized.get("device_id") in active_device_ids or normalized.get("blocked"):
                continue

            seen_at = normalized.get("last_seen") or normalized.get("first_seen")
            if not seen_at:
                continue
            try:
                age_seconds = (datetime.utcnow() - datetime.fromisoformat(seen_at)).total_seconds()
            except ValueError:
                continue

            if age_seconds > self.stale_seconds and normalized.get("connected"):
                detected_device = build_detected_device(
                    normalized,
                    timestamp,
                    existing=normalized,
                    trusted=normalized.get("trusted", False),
                    auto_connect=normalized.get("auto_connect", False),
                    blocked=False,
                )
                detected_device["name"] = normalized.get("name")
                detected_device["type"] = normalized.get("type")
                await db.devices.update_one({"_id": known_device["_id"]}, {"$set": detected_device})

    def scan(self) -> List[Dict[str, Optional[str]]]:
        """Runs nmap -sn to find active hosts on the subnet."""
        try:
            print(f"Network Scanner: Scanning {self.subnet}...")
            result = subprocess.check_output(["nmap", "-T4", "-sn", self.subnet], timeout=60).decode()
            devices: List[Dict[str, Optional[str]]] = []
            current_device: Optional[Dict[str, Optional[str]]] = None

            for raw_line in result.splitlines():
                line = raw_line.strip()
                if line.startswith("Nmap scan report for "):
                    if current_device:
                        devices.append(self.finalize_device(current_device))

                    ip, hostname = self._parse_scan_target(line.replace("Nmap scan report for ", "", 1))
                    current_device = {
                        "ip": ip,
                        "hostname": hostname,
                        "mac": "unknown",
                        "vendor": None,
                        "type_guess": "unknown",
                    }
                    continue

                if current_device and line.startswith("MAC Address: "):
                    match = re.match(r"MAC Address: ([0-9A-Fa-f:]{17})(?: \((.*?)\))?", line)
                    if match:
                        current_device["mac"] = self._normalize_mac(match.group(1)) or "unknown"
                        current_device["vendor"] = match.group(2) or self.lookup_vendor(current_device["mac"])
                        current_device["type_guess"] = self.guess_type(
                            current_device.get("vendor"),
                            current_device.get("hostname"),
                        )

            if current_device:
                devices.append(self.finalize_device(current_device))

            return devices
        except FileNotFoundError:
            print("Error: 'nmap' command not found. Please install nmap (brew install nmap).")
            return []
        except Exception as e:
            print(f"Network Scanner Error: {e}")
            return []

    async def start(self):
        if db is None:
            print("MongoDB not initialized. Network scanner disabled.")
            return

        print(f"Network Scanner Started. Local IP: {self.local_ip}, Subnet: {self.subnet}")
        self.running = True
        
        while self.running:
            try:
                timestamp = datetime.utcnow().isoformat()
                now = time.monotonic()

                if now - self._last_deep_scan_at >= self.deep_scan_interval_seconds:
                    active_devices = await asyncio.to_thread(self.scan)
                    self._update_fingerprint_cache(active_devices)
                    self._last_deep_scan_at = now
                else:
                    active_devices = await asyncio.to_thread(self.scan_presence)

                active_devices = [
                    device for device in active_devices
                    if device.get("ip") != self.local_ip and not str(device.get("ip", "")).endswith(".1")
                ]

                active_device_ids = set()
                for device in active_devices:
                    device_id = await self._reconcile_active_device(device, timestamp)
                    active_device_ids.add(device_id)

                await self._cleanup_stale_devices(active_device_ids, timestamp)
            except Exception as e:
                pass
            await asyncio.sleep(self.presence_interval_seconds)

    def stop(self):
        self.running = False

# Global instance
scanner = NetworkScanner()
