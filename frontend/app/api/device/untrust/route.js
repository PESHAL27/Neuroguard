import { NextResponse } from "next/server";
import { updateDevice, findDevice } from "@/lib/deviceStore";

export async function POST(req) {
    try {
        const body = await req.json().catch(() => ({}));
        const deviceId = body.device_id || body.id;
        const updated = updateDevice(deviceId, {
            trusted: false,
            surveillance: true,
            status: "surveillance",
            surveillance_level: "High",
            surveillance_started: new Date().toISOString(),
        });
        
        return NextResponse.json({
            status: "success",
            message: `Device placed under Strict AI Surveillance`,
            device: updated
        });
    } catch (err) {
        return NextResponse.json({ status: "error", message: err.message }, { status: 500 });
    }
}
