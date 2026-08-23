import ctypes
import socket
import struct
import concurrent.futures
import subprocess

SendARP = ctypes.windll.iphlpapi.SendARP

def get_hostname(ip):
    try:
        name, _, _ = socket.gethostbyaddr(ip)
        return name
    except Exception:
        pass
    try:
        res = subprocess.run(f"nbtstat -A {ip}", capture_output=True, text=True, timeout=1, shell=True)
        for line in res.stdout.splitlines():
            if "<00>" in line and "UNIQUE" in line:
                return line.split()[0].strip()
    except Exception:
        pass
    return ""

def check_ip(ip_str):
    try:
        dest_ip = struct.unpack('<I', socket.inet_aton(ip_str))[0]
        mac_addr = (ctypes.c_ubyte * 6)()
        mac_len = ctypes.c_ulong(6)
        res = SendARP(dest_ip, 0, ctypes.byref(mac_addr), ctypes.byref(mac_len))
        if res == 0:
            mac_str = ':'.join(['{:02X}'.format(b) for b in mac_addr])
            hostname = get_hostname(ip_str)
            return (ip_str, mac_str, hostname)
    except Exception:
        pass
    return None

ips = [f"192.168.31.{i}" for i in range(1, 255)]
with concurrent.futures.ThreadPoolExecutor(max_workers=60) as ex:
    results = list(ex.map(check_ip, ips))

found = [r for r in results if r is not None]
for ip, mac, host in found:
    print(f"{ip} | MAC: {mac} | Host: {host}")
