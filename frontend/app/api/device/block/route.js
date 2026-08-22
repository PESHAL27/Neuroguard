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
        });

        if (updated) {
            return NextResponse.json({
                status: "success",
                message: `Device ${deviceId} blocked`,
                device: updated
            });
        }

        const existing = findDevice(deviceId);
        return NextResponse.json({
            status: "success",
            device: {
                ...(existing || body),
                blocked: true,
                connected: false,
                status: "blocked",
            }
        });
    } catch (err) {
        return NextResponse.json({ status: "error", message: err.message }, { status: 500 });
    }
}
