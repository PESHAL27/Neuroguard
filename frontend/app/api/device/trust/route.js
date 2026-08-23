import { NextResponse } from "next/server";
import { updateDevice, findDevice } from "@/lib/deviceStore";

export async function POST(req) {
    try {
        const body = await req.json().catch(() => ({}));
        const deviceId = body.device_id || body.id;
        const updated = updateDevice(deviceId, {
            trusted: true,
            surveillance: false,
            status: "connected",
        });

        return NextResponse.json({
            status: "success",
            message: `Device cleared from surveillance and marked as Trusted`,
            device: updated
        });
    } catch (err) {
        return NextResponse.json({ status: "error", message: err.message }, { status: 500 });
    }
}
