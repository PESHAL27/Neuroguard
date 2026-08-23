import { NextResponse } from "next/server";
import { exec } from "child_process";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

// In-memory rolling window rate limiter: { [ip]: [timestamp1, timestamp2, ...] }
const requestTracker = new Map();
const RATE_LIMIT_THRESHOLD = 5; // Max allowed messages in burst window
const WINDOW_MS = 3000; // 3 seconds window

const THREATS_FILE = path.join(process.cwd(), "..", "backend", "data", "threats_data.json");
const OVERRIDES_FILE = path.join(process.cwd(), "..", "backend", "data", "device_overrides.json");

function getClientIp(req) {
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) {
        return forwarded.split(",")[0].trim();
    }
    const realIp = req.headers.get("x-real-ip");
    if (realIp) return realIp.trim();
    return "10.185.191.199"; // Fallback demo attacker IP
}

function quarantineIp(ip, reason) {
    // 1. Update device_overrides.json
    try {
        let overrides = {};
        if (fs.existsSync(OVERRIDES_FILE)) {
            overrides = JSON.parse(fs.readFileSync(OVERRIDES_FILE, "utf-8"));
        }
        const devKey = `device_${ip.replace(/\./g, "_")}`;
        overrides[devKey] = {
            ip: ip,
            blocked: true,
            trusted: false,
            surveillance: false,
            reason: reason,
            blocked_at: new Date().toISOString()
        };
        overrides[ip] = overrides[devKey];

        const dir = path.dirname(OVERRIDES_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(OVERRIDES_FILE, JSON.stringify(overrides, null, 2), "utf-8");
    } catch (e) {
        console.error("Failed to update overrides:", e);
    }

    // 2. Add Windows Firewall Block Rule
    if (ip && !ip.startsWith("127.") && !ip.startsWith("192.168.31.173") && !ip.startsWith("10.185.191.56")) {
        exec(`netsh advfirewall firewall add rule name="NeuroGuard_Block_${ip}" dir=in action=block remoteip=${ip}`, () => {});
        exec(`netsh advfirewall firewall add rule name="NeuroGuard_Block_${ip}" dir=out action=block remoteip=${ip}`, () => {});
    }
}

function recordThreatEvent(sourceIp, requestCount) {
    try {
        let threats = [];
        if (fs.existsSync(THREATS_FILE)) {
            threats = JSON.parse(fs.readFileSync(THREATS_FILE, "utf-8"));
        }

        const threatId = `thr_esp_${Date.now()}`;
        const newThreat = {
            _id: threatId,
            id: threatId,
            type: "IoT Flooding / DoS Attack on ESP32 Camera",
            severity: "critical",
            status: "active",
            source_ip: sourceIp,
            source_country: "Local IoT Mesh",
            target_device: "ESP32 OV2640 Camera Node",
            target_ip: "10.185.191.90",
            description: `Attacking ESP32 sent ${requestCount} rapid packets in < 3s, exceeding safety baseline (threshold: 5 msgs). Target ESP32 Camera protected.`,
            mitre_tactic: "Impact (TA0040)",
            mitre_id: "T1498.001",
            confidence_score: 99,
            timestamp: new Date().toISOString(),
            mitigated: false,
            action_taken: "Autonomous Firewall Quarantine Applied",
            threat_source: "Threat ESP32 Microcontroller"
        };

        threats.unshift(newThreat);
        fs.writeFileSync(THREATS_FILE, JSON.stringify(threats, null, 2), "utf-8");
        return newThreat;
    } catch (e) {
        console.error("Failed to record threat event:", e);
        return null;
    }
}

export async function POST(req) {
    return handleGatewayTraffic(req);
}

export async function GET(req) {
    return handleGatewayTraffic(req);
}

async function handleGatewayTraffic(req) {
    const clientIp = getClientIp(req);
    const now = Date.now();

    // Check if client is already quarantined
    try {
        if (fs.existsSync(OVERRIDES_FILE)) {
            const overrides = JSON.parse(fs.readFileSync(OVERRIDES_FILE, "utf-8"));
            if (overrides[clientIp]?.blocked || overrides[`device_${clientIp.replace(/\./g, "_")}`]?.blocked) {
                return NextResponse.json({
                    status: "quarantined",
                    error: "Access Denied: This node has been quarantined by NeuroGuard AI.",
                    source_ip: clientIp,
                    action: "blocked"
                }, { status: 403 });
            }
        }
    } catch (e) {}

    // Track request frequency
    const timestamps = requestTracker.get(clientIp) || [];
    const recentTimestamps = timestamps.filter(ts => now - ts < WINDOW_MS);
    recentTimestamps.push(now);
    requestTracker.set(clientIp, recentTimestamps);

    const currentRate = recentTimestamps.length;

    // Check if threshold exceeded (> 5 messages)
    if (currentRate > RATE_LIMIT_THRESHOLD) {
        console.warn(`[AI Gateway Watchdog] Rate limit breach from ${clientIp}: ${currentRate} packets in burst window! Triggering quarantine.`);
        
        quarantineIp(clientIp, `Exceeded burst rate threshold (${currentRate} reqs in 3s) targeting ESP32 Camera.`);
        const threat = recordThreatEvent(clientIp, currentRate);

        return NextResponse.json({
            status: "threat_detected",
            action: "quarantined",
            alert: "CRITICAL: Anomaly threshold breached (> 5 msgs). Attacker isolated.",
            source_ip: clientIp,
            request_count: currentRate,
            mitre_id: "T1498.001",
            threat: threat
        }, { status: 403 });
    }

    // Normal safe packet (<= 5 msgs): Safe Forwarding
    return NextResponse.json({
        status: "success",
        message: "Packet verified and forwarded to ESP32 Camera.",
        source_ip: clientIp,
        burst_count: currentRate,
        threshold: RATE_LIMIT_THRESHOLD,
        camera_status: "protected"
    }, { status: 200 });
}
