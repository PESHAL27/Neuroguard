import { NextResponse } from "next/server";
import { getAllDevices } from "@/lib/deviceStore";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const THREATS_FILE = path.join(process.cwd(), "..", "backend", "data", "threats_data.json");

function loadStoredThreats() {
    try {
        if (fs.existsSync(THREATS_FILE)) {
            return JSON.parse(fs.readFileSync(THREATS_FILE, "utf-8"));
        }
    } catch (e) {}
    
    // Default initial simulated threat dataset linked to real network components
    return [
        {
            _id: "thr_001",
            id: "thr_001",
            type: "SYN Flood / DDoS Attack",
            severity: "critical",
            status: "active",
            source_ip: "185.220.101.5",
            source_country: "Netherlands",
            target_device: "Network Gateway Router",
            target_ip: "10.185.191.116",
            description: "Abnormal volume of half-open TCP SYN packets detected targeting port 80/443.",
            mitre_tactic: "Impact (TA0040)",
            mitre_id: "T1498.001",
            confidence_score: 98,
            timestamp: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
            mitigated: false,
            action_taken: "AI Rate Limiting Applied"
        },
        {
            _id: "thr_002",
            id: "thr_002",
            type: "Unauthorized Port Scan",
            severity: "high",
            status: "active",
            source_ip: "45.155.205.233",
            source_country: "Russia",
            target_device: "Admin Host PC (Your Device)",
            target_ip: "10.185.191.56",
            description: "Sequential SYN scan detected probing TCP ports 22, 80, 445, 3389, and 8080.",
            mitre_tactic: "Discovery (TA0007)",
            mitre_id: "T1046",
            confidence_score: 94,
            timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
            mitigated: false,
            action_taken: "Source IP Quarantined in AdvFirewall"
        },
        {
            _id: "thr_003",
            id: "thr_003",
            type: "ARP Spoofing / Poisoning Attempt",
            severity: "medium",
            status: "investigating",
            source_ip: "10.185.191.199",
            source_country: "Local Subnet",
            target_device: "Local Network Mesh",
            target_ip: "10.185.191.0/24",
            description: "Duplicate gratuitous ARP reply packets broadcasting mismatched MAC mapping.",
            mitre_tactic: "Credential Access (TA0006)",
            mitre_id: "T1557.002",
            confidence_score: 87,
            timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
            mitigated: false,
            action_taken: "Static ARP Table Enforced"
        },
        {
            _id: "thr_004",
            id: "thr_004",
            type: "DNS Tunneling / Data Exfiltration",
            severity: "low",
            status: "mitigated",
            source_ip: "194.26.29.112",
            source_country: "Germany",
            target_device: "Smart IoT Sensor Node",
            target_ip: "10.185.191.91",
            description: "Encoded TXT record queries exceeding standard baseline payload length.",
            mitre_tactic: "Exfiltration (TA0010)",
            mitre_id: "T1071.004",
            confidence_score: 82,
            timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
            mitigated: true,
            action_taken: "Sinkholed via CoreDNS"
        }
    ];
}

function saveThreats(threats) {
    try {
        const dir = path.dirname(THREATS_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(THREATS_FILE, JSON.stringify(threats, null, 2), "utf-8");
    } catch (e) {}
}

export async function GET(req) {
    // 1. Try to fetch live threats from FastAPI backend
    try {
        const backendRes = await fetch("http://127.0.0.1:8000/api/threats?limit=100", { cache: "no-store" });
        if (backendRes.ok) {
            const liveThreats = await backendRes.json();
            if (Array.isArray(liveThreats)) {
                return NextResponse.json(liveThreats);
            }
        }
    } catch (e) {
        // Backend offline or unreachable, fallback
    }

    // 2. Try MongoDB Atlas direct connection
    try {
        const clientPromise = (await import("@/lib/mongodb")).default;
        const client = await clientPromise;
        const db = client.db(process.env.MONGODB_DB || "neurogaurd");
        const dbThreats = await db.collection("threats").find({}).sort({ timestamp: -1 }).limit(100).toArray();
        if (dbThreats && dbThreats.length > 0) {
            const mapped = dbThreats.map(t => ({
                id: t.id || String(t._id),
                _id: String(t._id),
                type: t.type || t.attack_type || "Threat Detected",
                severity: (t.severity || "high").toLowerCase(),
                status: t.status || "active",
                source_ip: t.sourceIp || t.source_ip || "Unknown",
                source_country: t.source_country || "Local Subnet",
                target_device: t.targetDevice || t.target_device || t.device || "ESP32",
                target_ip: t.target_ip || "192.168.137.1",
                description: t.description || "Anomalous network activity detected",
                threat_score: t.threatScore || t.threat_score || 85,
                confidence_score: t.threatScore || t.threat_score || 85,
                timestamp: t.timestamp || new Date().toISOString(),
                mitigated: Boolean(t.resolved || t.status === "mitigated"),
                action_taken: t.suggestedAction || "Quarantine Active"
            }));
            return NextResponse.json(mapped);
        }
    } catch (e) {}

    // 3. Fallback to local stored mockup
    const threats = loadStoredThreats();
    return NextResponse.json(threats);
}

export async function POST(req) {
    try {
        const body = await req.json().catch(() => ({}));
        const threats = loadStoredThreats();

        // Handle mitigation action
        if (body.action === "mitigate" && body.id) {
            const updated = threats.map(t => {
                if (t.id === body.id || t._id === body.id) {
                    return { ...t, status: "mitigated", mitigated: true, action_taken: "Mitigated by SOC Admin" };
                }
                return t;
            });
            saveThreats(updated);
            return NextResponse.json({ success: true, message: "Threat mitigated successfully", threats: updated });
        }

        // Handle new threat simulation
        if (body.type || body.simulate) {
            const devices = getAllDevices();
            const targetDev = devices[Math.floor(Math.random() * devices.length)] || { name: "Gateway Router", ip: "10.185.191.116" };

            const newThreat = {
                _id: `thr_${Date.now()}`,
                id: `thr_${Date.now()}`,
                type: body.type || "Brute Force SSH Attack",
                severity: body.severity || "high",
                status: "active",
                source_ip: body.source_ip || `185.${Math.floor(Math.random()*200)}.${Math.floor(Math.random()*200)}.${Math.floor(Math.random()*250)}`,
                source_country: body.source_country || "Unknown",
                target_device: targetDev.name || "Target Host",
                target_ip: targetDev.ip || "10.185.191.56",
                description: body.description || "High frequency authentication attempts exceeding rate threshold.",
                mitre_tactic: "Initial Access (TA0001)",
                mitre_id: "T1110",
                confidence_score: Math.floor(Math.random() * 15) + 85,
                timestamp: new Date().toISOString(),
                mitigated: false,
                action_taken: "AI Quarantine Active"
            };

            const updated = [newThreat, ...threats];
            saveThreats(updated);
            return NextResponse.json({ success: true, threat: newThreat, threats: updated });
        }

        return NextResponse.json(threats);
    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
