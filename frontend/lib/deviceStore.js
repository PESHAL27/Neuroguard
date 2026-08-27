import fs from "fs";
import path from "path";

function getPaths() {
    // Dynamically resolve backend/data directory relative to project root or workspace
    const baseDir = process.cwd().includes("frontend") 
        ? path.join(process.cwd(), "..", "backend", "data")
        : path.join(process.cwd(), "backend", "data");

    const fallbackDir = path.join("C:\\Users\\pecul\\Desktop\\Peshal\\college\\Hackathon\\Neuroguard", "backend", "data");
    const dataDir = fs.existsSync(baseDir) ? baseDir : fallbackDir;

    try {
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
    } catch (e) {}

    return {
        liveScan: path.join(dataDir, "live_devices.json"),
        overrides: path.join(dataDir, "device_overrides.json"),
        networkInfo: path.join(dataDir, "network_info.json"),
    };
}

export function getNetworkInfo() {
    const { networkInfo } = getPaths();
    if (fs.existsSync(networkInfo)) {
        try {
            return JSON.parse(fs.readFileSync(networkInfo, "utf8"));
        } catch (e) {
            console.error("Error reading network_info.json:", e.message);
        }
    }
    return {
        local_ip: "127.0.0.1",
        gateway_ip: "127.0.0.1",
        subnet_cidr: "127.0.0.0/24",
        interface: "Wi-Fi / Ethernet",
    };
}

function loadOverrides() {
    const { overrides } = getPaths();
    if (fs.existsSync(overrides)) {
        try {
            return JSON.parse(fs.readFileSync(overrides, "utf8"));
        } catch (e) {
            console.error("Error reading device_overrides.json:", e.message);
        }
    }
    return {};
}

function saveOverrides(data) {
    const { overrides } = getPaths();
    try {
        fs.writeFileSync(overrides, JSON.stringify(data, null, 2), "utf8");
    } catch (e) {
        console.error("Error saving device_overrides.json:", e.message);
    }
}

export function getAllDevices() {
    const { liveScan } = getPaths();
    const overrides = loadOverrides();
    let devices = [];

    if (fs.existsSync(liveScan)) {
        try {
            const parsed = JSON.parse(fs.readFileSync(liveScan, "utf8"));
            if (Array.isArray(parsed)) {
                devices = parsed;
            }
        } catch (e) {
            console.error("Error reading live_devices.json:", e.message);
        }
    }

    // Apply operator overrides
    const processed = devices.map(d => {
        const key = d.device_id || d._id || d.mac || d.ip;
        const override = overrides[key] || overrides[d.device_id] || overrides[d.ip];
        if (override) {
            const merged = { ...d, ...override };
            // If device is blocked, ensure connected is false
            if (merged.blocked) {
                merged.connected = false;
                merged.status = "blocked";
            } else if (merged.trusted === false) {
                merged.surveillance = true;
                merged.status = "surveillance";
            }
            return merged;
        }
        return d;
    });

    // Also include any blocked devices that may have been dropped from scan
    const processedKeys = new Set(processed.map(d => d.device_id || d.ip));
    for (const [key, ov] of Object.entries(overrides)) {
        if (ov.blocked && !processedKeys.has(key) && !processedKeys.has(ov.device_id) && !processedKeys.has(ov.ip)) {
            processed.push({
                _id: ov.device_id || `dev_${key}`,
                device_id: ov.device_id || key,
                name: ov.name || "Blocked Device",
                ip: ov.ip || "N/A",
                mac: ov.mac || "N/A",
                type: ov.type || "unknown",
                status: "blocked",
                connected: false,
                blocked: true,
                trusted: false,
                surveillance: false,
                threat_count: 1,
                last_seen: ov.last_seen || new Date().toISOString(),
            });
        }
    }

    return processed;
}

export function findDevice(deviceId) {
    const all = getAllDevices();
    return all.find(d => d.device_id === deviceId || d._id === deviceId || d.ip === deviceId);
}

export function updateDevice(deviceId, updates) {
    const overrides = loadOverrides();
    const current = findDevice(deviceId) || { device_id: deviceId };
    const key = current.device_id || deviceId;

    const existing = overrides[key] || {};
    const updated = {
        ...existing,
        ...updates,
        device_id: key,
        ip: current.ip || existing.ip,
        name: updates.name || current.name || existing.name,
        mac: current.mac || existing.mac,
        last_seen: new Date().toISOString()
    };

    overrides[key] = updated;
    saveOverrides(overrides);

    return {
        ...current,
        ...updated
    };
}

export function upsertLiveDevice(deviceData) {
    if (!deviceData) return null;
    const { liveScan } = getPaths();
    let devices = [];
    if (fs.existsSync(liveScan)) {
        try {
            const parsed = JSON.parse(fs.readFileSync(liveScan, "utf8"));
            if (Array.isArray(parsed)) devices = parsed;
        } catch (e) {}
    }

    const devId = deviceData.device_id || deviceData._id || (deviceData.ip ? `device_${deviceData.ip.replace(/\./g, "_")}` : `device_${Date.now()}`);
    const ip = deviceData.ip || "N/A";
    const mac = deviceData.mac || "DYNAMIC-ESP32";
    const lastOctet = ip.split('.').pop() || "node";

    const defaultName = (deviceData.type === "esp32" || (deviceData.name && deviceData.name.toLowerCase().includes("esp32")))
        ? (deviceData.name || `ESP32 IoT Node (${lastOctet})`)
        : (deviceData.name || `Connected Device (${lastOctet})`);

    const existingIndex = devices.findIndex(d => 
        (d.device_id && d.device_id === devId) ||
        (d.ip && d.ip !== "N/A" && d.ip === ip) ||
        (d.mac && d.mac !== "DYNAMIC-ESP32" && d.mac === mac)
    );

    const now = new Date().toISOString();
    const updatedEntry = {
        _id: `dev_${devId}`,
        device_id: devId,
        name: deviceData.name || (existingIndex >= 0 ? devices[existingIndex].name : defaultName),
        hostname: deviceData.hostname || (existingIndex >= 0 ? devices[existingIndex].hostname : `esp32-${lastOctet}.lan`),
        ip: ip,
        mac: mac,
        type: deviceData.type || (existingIndex >= 0 ? devices[existingIndex].type : "esp32"),
        type_guess: deviceData.type || "esp32",
        vendor: deviceData.vendor || "Espressif Systems",
        status: deviceData.status || "connected",
        connected: deviceData.connected !== undefined ? deviceData.connected : true,
        trusted: deviceData.trusted !== undefined ? deviceData.trusted : true,
        surveillance: deviceData.surveillance || false,
        blocked: deviceData.blocked || false,
        threat_count: deviceData.threat_count || 0,
        latency_ms: deviceData.latency_ms || 12,
        network_usage: deviceData.network_usage || 450,
        connections: deviceData.connections || 2,
        cpu: deviceData.cpu || 20,
        last_seen: now,
        subnet: deviceData.subnet || "10.136.167.0/24",
        interface: deviceData.interface || "Wi-Fi / Ethernet",
        sensors: deviceData.sensors || (existingIndex >= 0 ? devices[existingIndex].sensors : undefined),
        actuators: deviceData.actuators || (existingIndex >= 0 ? devices[existingIndex].actuators : undefined),
        peripherals: deviceData.peripherals || (existingIndex >= 0 ? devices[existingIndex].peripherals : undefined),
    };

    if (existingIndex >= 0) {
        devices[existingIndex] = { ...devices[existingIndex], ...updatedEntry };
    } else {
        devices.push(updatedEntry);
    }

    try {
        fs.writeFileSync(liveScan, JSON.stringify(devices, null, 2), "utf8");
    } catch (e) {
        console.error("Error writing live_devices.json:", e.message);
    }

    return updatedEntry;
}

