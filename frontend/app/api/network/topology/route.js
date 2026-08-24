import { NextResponse } from "next/server";
import { getAllDevices, getNetworkInfo } from "@/lib/deviceStore";

export const dynamic = "force-dynamic";

export async function GET() {
    const devices = getAllDevices();
    const netInfo = getNetworkInfo();

    // Identify Gateway Router
    let gateway = devices.find(d => 
        d.type === "router" || 
        d.ip === netInfo.gateway_ip || 
        d.ip.endsWith(".1") || 
        d.name?.toLowerCase().includes("gateway") || 
        d.name?.toLowerCase().includes("router")
    );

    if (!gateway) {
        gateway = {
            device_id: `device_${netInfo.gateway_ip.replace(/\./g, "_")}`,
            name: "Network Gateway Router",
            ip: netInfo.gateway_ip,
            mac: "D4:76:A0:09:4E:68",
            type: "router",
            connected: true,
            status: "connected",
            trusted: true,
            latency_ms: 10,
            connections: devices.length,
        };
    }

    const gatewayId = gateway.device_id || `device_${gateway.ip.replace(/\./g, "_")}`;

    // Center Gateway Router at (50, 50)
    const nodes = [
        {
            id: gatewayId,
            name: gateway.name || "Network Gateway Router",
            type: "Router",
            ip: gateway.ip,
            mac: gateway.mac || "D4:76:A0:09:4E:68",
            status: "online",
            role: "gateway",
            threat_score: 0,
            threatScore: 0,
            latency: gateway.latency_ms || 10,
            connections: devices.length,
            bandwidth_mbps: 1000,
            lastActivity: "Live (Active)",
            x: 50.0,
            y: 48.0,
        }
    ];

    const links = [];
    const otherDevices = devices.filter(d => (d.device_id || d._id) !== gatewayId && d.ip !== gateway.ip);

    // Layout surrounding devices in clean circular orbits
    const total = otherDevices.length;
    const innerRingCount = Math.min(8, total);
    const outerRingCount = Math.max(0, total - innerRingCount);

    otherDevices.forEach((dev, idx) => {
        const nodeId = dev.device_id || dev._id || `node_${idx}`;
        const devTypeCap = dev.type ? (dev.type.charAt(0).toUpperCase() + dev.type.slice(1)) : "Workstation";
        const isBlocked = Boolean(dev.blocked);
        const isSuspicious = Boolean(dev.threat_count > 0 || dev.surveillance || dev.trusted === false);

        let x = 50;
        let y = 50;

        if (idx < innerRingCount) {
            // Inner Orbit (Radius: 28%)
            const angle = (idx / innerRingCount) * (2 * Math.PI) - (Math.PI / 2);
            x = 50 + 30 * Math.cos(angle);
            y = 48 + 24 * Math.sin(angle);
        } else {
            // Outer Orbit (Radius: 40%)
            const outerIdx = idx - innerRingCount;
            const angle = (outerIdx / outerRingCount) * (2 * Math.PI) - (Math.PI / 4);
            x = 50 + 42 * Math.cos(angle);
            y = 48 + 36 * Math.sin(angle);
        }

        // Keep within safe SVG boundaries
        x = Math.max(10, Math.min(90, Math.round(x * 10) / 10));
        y = Math.max(12, Math.min(88, Math.round(y * 10) / 10));

        nodes.push({
            id: nodeId,
            name: dev.name || `Node (${dev.ip.split('.').pop()})`,
            type: devTypeCap,
            ip: dev.ip,
            mac: dev.mac || "N/A",
            status: isBlocked ? "offline" : dev.connected ? "online" : "offline",
            role: dev.trusted ? "trusted_node" : "surveillance_node",
            threat_score: isBlocked ? 100 : isSuspicious ? 45 : 0,
            threatScore: isBlocked ? 100 : isSuspicious ? 45 : 0,
            latency: dev.latency_ms || 25,
            connections: dev.connections || 4,
            bandwidth_mbps: 100,
            lastActivity: dev.last_seen || "Just now",
            x,
            y,
        });

        // Link from Gateway to this device
        links.push({
            id: `link_${gatewayId}_${nodeId}`,
            from: gatewayId,
            to: nodeId,
            source: gatewayId,
            target: nodeId,
            status: isBlocked ? "blocked" : "active",
            protocol: "802.11ax / TCP",
            speed: "1.2 Gbps",
            flows: isBlocked ? 0 : Math.floor(Math.random() * 3) + 1,
            suspicious: isSuspicious,
            quality: isBlocked ? 0 : 95
        });
    });

    const stats = {
        total_nodes: nodes.length,
        active_nodes: nodes.filter(n => n.status === "online").length,
        suspicious_links: links.filter(l => l.suspicious).length,
        avg_flow: 450,
        mesh_status: "Operational",
    };

    return NextResponse.json({
        nodes,
        links,
        stats,
        topology: {
            nodes,
            links,
            stats,
            mesh_status: "Operational",
            active_node_count: nodes.length,
            gateway_ip: gateway.ip,
            protocol: "Zero-Trust IoT Mesh"
        }
    });
}
