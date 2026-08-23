import ctypes, socket, struct, time, concurrent.futures

SendARP = ctypes.windll.iphlpapi.SendARP

def fast_probe(ip):
    # 1. SendARP Layer-2
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
    
    # 2. Fast TCP socket probe (port 135, 445, 80, 8080, 5353)
    for port in [135, 445, 80, 8080, 5353]:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(0.08)
        try:
            r = s.connect_ex((ip, port))
            s.close()
            if r == 0:
                return ip, None, True
        except Exception:
            pass

    return ip, None, False

ips = ["192.168.31.1", "192.168.31.91", "192.168.31.103", "192.168.31.144", "192.168.31.158", "192.168.31.207"]
t0 = time.time()
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
    futs = [ex.submit(fast_probe, ip) for ip in ips]
    done, not_done = concurrent.futures.wait(futs, timeout=0.3)
    for f in done:
        ip, mac, online = f.result()
        print(f"IP {ip} -> online: {online}, MAC: {mac}")
print(f"Total probe time: {time.time() - t0:.3f}s")
