import subprocess, time, concurrent.futures

def ping_probe(ip):
    try:
        t0 = time.time()
        res = subprocess.run(
            ["ping", "-n", "1", "-w", "150", ip],
            capture_output=True, text=True, timeout=0.35
        )
        is_up = "TTL=" in res.stdout
        latency = int((time.time() - t0) * 1000)
        return ip, is_up, latency
    except Exception:
        return ip, False, None

ips = ["192.168.31.1", "192.168.31.91", "192.168.31.103", "192.168.31.144", "192.168.31.158", "192.168.31.173", "192.168.31.207", "192.168.31.222"]

t_start = time.time()
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
    results = list(ex.map(ping_probe, ips))

for ip, is_up, lat in results:
    print(f"IP: {ip:15} | Online: {str(is_up):5} | Latency: {lat}ms")

print(f"\n>> Total execution time for all 8 hosts: {time.time() - t_start:.3f}s")
