import { NextResponse } from "next/server";
import { updateDevice, findDevice } from "@/lib/deviceStore";

export async function POST(req) {
    try {
        const body = await req.json().catch(() => ({}));
        const deviceId = body.device_id || body.id;
        const updated = updateDevice(deviceId, {
            blocked: true,
            connected: false,
            monitor: false,
            status: "blocked",
            quarantined_at: new Date().toISOString(),
            blocked_reason: body.reason || "Manual Access Revocation / Quarantine",
        });

        return NextResponse.json({
            status: "success",
            message: `Device quarantined and removed from active network`,
            device: updated
        });
    } catch (err) {
        return NextResponse.json({ status: "error", message: err.message }, { status: 500 });
    }
}
