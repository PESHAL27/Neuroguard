import { NextResponse } from "next/server";
import { updateDevice, findDevice } from "@/lib/deviceStore";
import { exec } from "child_process";

function executeFirewallUnblock(ip) {
    if (!ip || ip === "N/A" || ip === "127.0.0.1" || ip === "unknown") return;
    if (process.platform === "win32") {
        const cmdIn = `netsh advfirewall firewall delete rule name="NeuroGuard_Block_${ip}_IN"`;
        const cmdOut = `netsh advfirewall firewall delete rule name="NeuroGuard_Block_${ip}_OUT"`;
        const cmdRoute = `route delete ${ip}`;
        exec(cmdIn, () => {});
        exec(cmdOut, () => {});
        exec(cmdRoute, () => {});
        console.log(`[NeuroGuard Firewall] ✅ Unblocked and Route Restored: ${ip}`);
    } else {
        exec(`iptables -D FORWARD -s ${ip} -j DROP && iptables -D INPUT -s ${ip} -j DROP`);
    }
}


export async function POST(req) {
    try {
        const body = await req.json().catch(() => ({}));
        const deviceId = body.device_id || body.id;
        const existing = findDevice ? findDevice(deviceId) : null;
        const targetIp = body.ip || existing?.ip || (deviceId?.startsWith("device_") ? deviceId.replace("device_", "").replace(/_/g, ".") : null);

        const updated = updateDevice(deviceId, {
            blocked: false,
            connected: true,
            monitor: true,
            status: "connected",
            quarantined_at: null,
            blocked_reason: null,
        });

        // Remove firewall block rule
        if (targetIp) {
            executeFirewallUnblock(targetIp);
        }

        // Notify FastAPI backend if running
        try {
            fetch("http://127.0.0.1:8000/api/device/unblock", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ device_id: deviceId }),
            }).catch(() => {});
        } catch (e) {}

        return NextResponse.json({
            status: "success",
            message: `Device unblocked and restored to active network`,
            device: updated,
            ip: targetIp,
        });
    } catch (err) {
        return NextResponse.json({ status: "error", message: err.message }, { status: 500 });
    }
}

