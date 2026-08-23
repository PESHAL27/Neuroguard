import fs from "fs";
import path from "path";

function getPaths() {
    const dataDir = path.join("C:\\Users\\pecul\\Desktop\\Peshal\\college\\Hackathon\\Neuroguard", "backend", "data");
    try {
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
    } catch (e) {}

    return {
        liveScan: path.join(dataDir, "live_devices.json"),
        overrides: path.join(dataDir, "device_overrides.json"),
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
