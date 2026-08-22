import { NextResponse } from "next/server";

export async function POST(req) {
    try {
        const body = await req.json();
        const { device_id, name, type } = body;
        return NextResponse.json({
            status: "success",
            device: {
                device_id,
                name,
                type: (type || "phone").toLowerCase(),
                status: "connected",
                connected: true,
                trusted: true,
            }
        });
    } catch (err) {
        return NextResponse.json({ status: "error", message: err.message }, { status: 500 });
    }
}
