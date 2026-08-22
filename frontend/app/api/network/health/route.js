import { NextResponse } from "next/server";

export async function GET() {
    return NextResponse.json({
        grade: "A+",
        status: "Secure",
        active_threats: 0,
        firewall_active: true,
    });
}
