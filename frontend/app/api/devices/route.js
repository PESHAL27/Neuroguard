import { NextResponse } from "next/server";
import { getAllDevices, updateDevice } from "@/lib/deviceStore";

export const dynamic = "force-dynamic";

export async function GET() {
    return NextResponse.json(getAllDevices());
}

export async function POST(req) {
    try {
        const body = await req.json();
        const { device_id, name, type, action } = body;
        let updates = {};
        if (name) updates.name = name;
        if (type) updates.type = type;

        if (action === "block") {
            updates.blocked = true;
            updates.connected = false;
            updates.status = "blocked";
        } else if (action === "unblock" || action === "connect") {
            updates.blocked = false;
            updates.connected = true;
            updates.status = "connected";
        } else if (action === "trust") {
            updates.trusted = true;
        } else if (action === "untrust") {
            updates.trusted = false;
        }

        const updated = updateDevice(device_id, updates);
        if (updated) {
            return NextResponse.json({ status: "success", device: updated });
        }

        return NextResponse.json({ status: "error", message: "Device not found" }, { status: 404 });
    } catch (err) {
        return NextResponse.json({ status: "error", message: err.message }, { status: 500 });
    }
}
