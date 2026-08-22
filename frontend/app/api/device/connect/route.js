import { NextResponse } from "next/server";

export async function POST(req) {
    const body = await req.json().catch(() => ({}));
    return NextResponse.json({
        status: "success",
        device: {
            ...body,
            status: "connected",
            connected: true,
            blocked: false,
        }
    });
}
