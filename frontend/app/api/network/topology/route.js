import { NextResponse } from "next/server";
import { getAllDevices } from "@/lib/deviceStore";

export const dynamic = "force-dynamic";

export async function GET() {
    const devices = getAllDevices();

    const gateway = devices.find(d => d.type === "router" || d.ip.endsWith(".1") || d.ip.endsWith(".116")) || {
        device_id: "dev_gateway",
        name: "Network Gateway Router",
        ip: "10.185.191.116",
        type: "router",
        connected: true
    };

    // Construct Graph Nodes
    const nodes = [
        {
            id: gateway.device_id || "gateway_0",
            name: gateway.name || "Default Gateway",
            ip: gateway.ip || "10.185.191.116",
            type: "Router",
            status: "online",
            role: "gateway",
            latency: 5,
            connections: devices.length,
            bandwidth_mbps: 1000
        }
    ];

    // Construct Graph Links
    const links = [];

    devices.forEach((dev, idx) => {
        if (dev.device_id === gateway.device_id || dev.ip === gateway.ip) return;

        const devTypeCap = dev.type ? (dev.type.charAt(0).toUpperCase() + dev.type.slice(1)) : "Workstation";
        const nodeId = dev.device_id || `node_${idx}`;

        nodes.push({
            id: nodeId,
            name: dev.name || `Device ${dev.ip}`,
            ip: dev.ip,
            type: devTypeCap,
            status: dev.blocked ? "blocked" : dev.connected ? "online" : "offline",
            role: dev.trusted ? "trusted_node" : "surveillance_node",
            latency: dev.latency_ms || 45,
            connections: dev.connections || 4,
            bandwidth_mbps: 100
        });

        links.push({
            source: gateway.device_id || "gateway_0",
            target: nodeId,
            status: dev.blocked ? "blocked" : "active",
            protocol: "802.11ax / Ethernet",
            speed: "1.2 Gbps",
            quality: dev.blocked ? 0 : 95
        });
    });

    return NextResponse.json({
        topology: {
            nodes,
            links,
            mesh_status: "Operational",
            active_node_count: nodes.length,
            gateway_ip: gateway.ip,
            protocol: "Zero-Trust IoT Mesh"
        }
    });
}
