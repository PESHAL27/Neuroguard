import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
    const now = Date.now();
    const incoming = Array.from({ length: 12 }, (_, i) => ({
        timestamp: new Date(now - (11 - i) * 5000).toISOString(),
        value: Math.floor(Math.random() * 40) + 60,
    }));
    const outgoing = Array.from({ length: 12 }, (_, i) => ({
        timestamp: new Date(now - (11 - i) * 5000).toISOString(),
        value: Math.floor(Math.random() * 30) + 40,
    }));

    return NextResponse.json({
        incoming,
        outgoing,
        avgBandwidth: 450,
        totalPacketsPerSec: 18420,
        avgLatencyMs: 18,
        bandwidth_tb: 4.82,
        current_throughput_mbps: 84.5,
        total_packets: 482091,
    });
}
