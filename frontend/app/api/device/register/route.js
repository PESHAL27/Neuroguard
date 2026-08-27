import { NextResponse } from "next/server";
import { upsertLiveDevice, updateDevice } from "@/lib/deviceStore";

export const dynamic = "force-dynamic";

export async function POST(req) {
    try {
        const body = await req.json().catch(() => ({}));
        const deviceId = body.device_id || `device_${(body.ip || "unknown").replace(/\./g, "_")}`;
        const ip = body.ip || "10.136.167.87";
        const mac = body.mac || "DYNAMIC-ESP32";
        const name = body.name || "ESP32 NeuroGuard Node";
        const type = (body.type || "esp32").toLowerCase();

        const registered = upsertLiveDevice({
            device_id: deviceId,
            name: name,
            type: type,
            ip: ip,
            mac: mac,
            vendor: "Espressif Systems",
            status: "connected",
            connected: true,
            trusted: true,
            blocked: false,
            surveillance: false,
        });

        // Also ensure overrides reflect connected state
        updateDevice(deviceId, {
            name: name,
            ip: ip,
            mac: mac,
            blocked: false,
            connected: true,
            status: "connected",
        });

        return NextResponse.json({
            status: "success",
            message: `Device ${name} registered successfully.`,
            device: registered,
        });
    } catch (err) {
        return NextResponse.json({ status: "error", message: err.message }, { status: 500 });
    }
}
