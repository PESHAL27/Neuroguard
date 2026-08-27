import subprocess
import re
import socket
import concurrent.futures

def ping_ip(ip):
    res = subprocess.run(f"ping -n 1 -w 300 {ip}", shell=True, capture_output=True, text=True)
    return ip, res.returncode == 0

def scan_subnet(prefix):
    ips = [f"{prefix}.{i}" for i in range(1, 255)]
    alive = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=50) as executor:
        results = executor.map(ping_ip, ips)
        for ip, is_alive in results:
            if is_alive:
                alive.append(ip)
    return alive

print("[*] Scanning Mobile Hotspot (192.168.137.x)...")
hotspot_alive = scan_subnet("192.168.137")
print(f"Hotspot Alive IPs: {hotspot_alive}")

print("[*] Scanning Wi-Fi Subnet...")
arp_output = subprocess.check_output("arp -a", shell=True, text=True)
print("\n--- Raw Live ARP Table ---")
for line in arp_output.splitlines():
    if "192.168." in line or "Interface:" in line:
        print(line)
