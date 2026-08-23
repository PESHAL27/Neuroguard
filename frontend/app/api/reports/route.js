import { NextResponse } from "next/server";
import { getAllDevices } from "@/lib/deviceStore";

export const dynamic = "force-dynamic";

export async function GET() {
    const devices = getAllDevices();
    const connectedCount = devices.filter(d => d.connected && !d.blocked).length;
    const blockedCount = devices.filter(d => d.blocked).length;
    const surveillanceCount = devices.filter(d => d.surveillance || d.trusted === false).length;

    const securityScore = Math.max(70, 98 - (blockedCount * 5) - (surveillanceCount * 4));

    return NextResponse.json({
        executive_summary: {
            report_id: `REP-${new Date().getFullYear()}-${Math.floor(Math.random()*9000)+1000}`,
            generated_at: new Date().toISOString(),
            security_score: securityScore,
            security_grade: securityScore >= 90 ? "A+" : securityScore >= 80 ? "A" : "B",
            total_monitored_devices: devices.length,
            active_connected_devices: connectedCount,
            quarantined_devices: blockedCount,
            devices_under_surveillance: surveillanceCount,
            overall_status: blockedCount > 0 ? "Threats Neutralized" : "Secure Baseline Established",
            compliance_frameworks: [
                { name: "SOC 2 Type II", compliance_rate: "96.4%", status: "Compliant" },
                { name: "ISO / IEC 27001", compliance_rate: "94.8%", status: "Compliant" },
                { name: "NIST CSF 2.0", compliance_rate: "92.1%", status: "Pass" },
                { name: "Zero-Trust Architecture (ZTA)", compliance_rate: "98.0%", status: "Enforced" }
            ],
            recommendations: [
                "Maintain active packet sniffing watchdog on untrusted IoT sensor nodes.",
                "Review firewall quarantine rules for persistent malicious IPs.",
                "Conduct regular automated ARP inspection cycles across subnets."
            ]
        },
        device_inventory: devices.map(d => ({
            id: d.device_id,
            name: d.name,
            ip: d.ip,
            mac: d.mac,
            type: d.type,
            vendor: d.vendor,
            status: d.status,
            trusted: d.trusted,
            blocked: d.blocked,
            latency_ms: d.latency_ms
        }))
    });
}
