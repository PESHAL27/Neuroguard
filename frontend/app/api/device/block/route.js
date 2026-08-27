import { NextResponse } from "next/server";
import { updateDevice, findDevice } from "@/lib/deviceStore";
import { exec } from "child_process";

function executeFirewallBlock(ip) {
    if (!ip || ip === "N/A" || ip === "127.0.0.1" || ip === "unknown") return;
    if (process.platform === "win32") {
        const cmdIn = `netsh advfirewall firewall add rule name="NeuroGuard_Block_${ip}_IN" dir=in action=block remoteip=${ip}`;
        const cmdOut = `netsh advfirewall firewall add rule name="NeuroGuard_Block_${ip}_OUT" dir=out action=block remoteip=${ip}`;
        const cmdRoute = `route add ${ip} mask 255.255.255.255 127.0.0.1 metric 1`;
        exec(cmdIn, () => {});
        exec(cmdOut, () => {});
        exec(cmdRoute, (err) => {
            if (err) console.error(`[Route Block Error] ${err.message}`);
            else console.log(`[NeuroGuard Firewall] 🛑 Route Blackholed: ${ip}`);
        });
    } else {
        exec(`iptables -I FORWARD -s ${ip} -j DROP && iptables -I INPUT -s ${ip} -j DROP`);
    }
}


export async function POST(req) {
    try {
        const body = await req.json().catch(() => ({}));
        const deviceId = body.device_id || body.id;
        const existing = findDevice ? findDevice(deviceId) : null;
        const targetIp = body.ip || existing?.ip || (deviceId?.startsWith("device_") ? deviceId.replace("device_", "").replace(/_/g, ".") : null);

        const updated = updateDevice(deviceId, {
            blocked: true,
            connected: false,
            monitor: false,
            status: "blocked",
            quarantined_at: new Date().toISOString(),
            blocked_reason: body.reason || "Manual Access Revocation / Quarantine",
        });

        // Enforce physical network firewall block
        if (targetIp) {
            executeFirewallBlock(targetIp);
        }

        // Notify FastAPI backend if running
        try {
            fetch("http://127.0.0.1:8000/api/device/block", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ device_id: deviceId, reason: body.reason || "Manual quarantine" }),
            }).catch(() => {});
        } catch (e) {}

        return NextResponse.json({
            status: "success",
            message: `Device quarantined and dropped at kernel level`,
            device: updated,
            ip: targetIp,
        });
    } catch (err) {
        return NextResponse.json({ status: "error", message: err.message }, { status: 500 });
    }
}

