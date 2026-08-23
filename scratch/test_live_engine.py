import subprocess, re, time, concurrent.futures, json
from pathlib import Path

def get_arp_table():
    try:
        out = subprocess.run(["arp", "-a"], capture_output=True, text=True, timeout=0.2).stdout
        entries = {}
        for line in out.splitlines():
            m = re.search(r'(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F\-]{17})', line)
            if m:
                ip, mac = m.groups()
                if not ip.startswith('224.') and not ip.startswith('239.') and not ip.endswith('.255'):
                    entries[ip] = mac.replace('-', ':').upper()
        return entries
    except Exception:
        return {}

def ping_host(ip):
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

def test_iteration():
    t0 = time.time()
    arp_entries = get_arp_table()
    candidates = list(set(["192.168.31.1", "192.168.31.91", "192.168.31.144", "192.168.31.173", "192.168.31.207", "192.168.31.158", "192.168.31.103"] + list(arp_entries.keys())))
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as ex:
        ping_results = list(ex.map(ping_host, candidates))
        
    online_devices = []
    for ip, is_up, lat in ping_results:
        if is_up or ip in arp_entries:
            mac = arp_entries.get(ip, "DYNAMIC-MAC")
            online_devices.append((ip, mac, is_up, lat))
            
    print(f"Cycle completed in {time.time() - t0:.3f}s. Active devices ({len(online_devices)}):")
    for ip, mac, is_up, lat in online_devices:
        print(f" -> {ip:15} | MAC: {mac} | Ping: {'UP (' + str(lat) + 'ms)' if is_up else 'ARP-Only'}")

test_iteration()
