import { NextResponse } from "next/server";
import { updateDevice, findDevice } from "@/lib/deviceStore";

export async function POST(req) {
    try {
        const body = await req.json().catch(() => ({}));
        const deviceId = body.device_id || body.id;
        const updated = updateDevice(deviceId, {
            blocked: false,
            connected: true,
            monitor: true,
            status: "connected",
            quarantined_at: null,
            blocked_reason: null,
        });

        return NextResponse.json({
            status: "success",
            message: `Device unblocked and restored to active network`,
            device: updated
        });
    } catch (err) {
        return NextResponse.json({ status: "error", message: err.message }, { status: 500 });
    }
}
