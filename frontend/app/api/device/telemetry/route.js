import { NextResponse } from "next/server";
import { upsertLiveDevice } from "@/lib/deviceStore";

export const dynamic = "force-dynamic";

export async function POST(req) {
    try {
        const body = await req.json().catch(() => ({}));
        const deviceId = body.device_id || (body.ip ? `device_${body.ip.replace(/\./g, "_")}` : "esp32_neuroguard_01");
        const ip = body.ip || "10.136.167.87";

        upsertLiveDevice({
            device_id: deviceId,
            ip: ip,
            type: "esp32",
            status: "connected",
            connected: true,
            blocked: false,
            sensors: body.sensors,
            actuators: body.actuators,
            peripherals: body.peripherals,
            connections: body.connections || 1,
            network_usage: body.bytes || 1200,
        });

        return NextResponse.json({
            status: "success",
            message: "Telemetry received and device updated.",
        });
    } catch (err) {
        return NextResponse.json({ status: "error", message: err.message }, { status: 500 });
    }
}
