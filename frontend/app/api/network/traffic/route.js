import { NextResponse } from "next/server";

export async function GET() {
    return NextResponse.json({
        bandwidth_tb: 4.82,
        current_throughput_mbps: 84.5,
        total_packets: 482091,
    });
}
