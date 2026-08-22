import { NextResponse } from "next/server";

export async function GET() {
    return NextResponse.json({
        uptime_percent: 99.98,
        status: "Online",
    });
}
