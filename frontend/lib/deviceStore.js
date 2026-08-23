import fs from "fs";
import path from "path";

// Override map for manual user actions (e.g. manual block, untrust, rename)
if (!global.__neuroguardOverrides) {
    global.__neuroguardOverrides = new Map();
}

function getLiveScanFilePath() {
    // Look for backend/data/live_devices.json in current workspace
    const possiblePaths = [
        path.join(process.cwd(), "..", "backend", "data", "live_devices.json"),
        path.join(process.cwd(), "backend", "data", "live_devices.json"),
        "C:\\Users\\pecul\\Desktop\\Peshal\\college\\Hackathon\\Neuroguard\\backend\\data\\live_devices.json"
    ];
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) return p;
    }
    return possiblePaths[0];
}

export function getAllDevices() {
    const liveFilePath = getLiveScanFilePath();
    let devices = [];

    if (fs.existsSync(liveFilePath)) {
        try {
            const fileContent = fs.readFileSync(liveFilePath, "utf8");
            const parsed = JSON.parse(fileContent);
            if (Array.isArray(parsed)) {
                devices = parsed;
            }
        } catch (e) {
            console.error("Error reading live_devices.json:", e.message);
        }
    }

    // Apply any user overrides (e.g. renamed, blocked, untrusted)
    const processed = devices.map(d => {
        const override = global.__neuroguardOverrides.get(d.device_id) || global.__neuroguardOverrides.get(d._id);
        if (override) {
            return { ...d, ...override };
        }
        return d;
    });

    // Return only active / connected devices (disconnected ones are omitted from the live list)
    return processed.filter(d => d.connected !== false);
}

export function findDevice(deviceId) {
    const all = getAllDevices();
    return all.find(d => d.device_id === deviceId || d._id === deviceId);
}

export function updateDevice(deviceId, updates) {
    const existingOverride = global.__neuroguardOverrides.get(deviceId) || {};
    const updatedOverride = {
        ...existingOverride,
        ...updates,
        last_seen: new Date().toISOString()
    };
    global.__neuroguardOverrides.set(deviceId, updatedOverride);

    // Also update if under alternate key
    const current = findDevice(deviceId);
    if (current && current.device_id !== deviceId) {
        global.__neuroguardOverrides.set(current.device_id, updatedOverride);
    }

    return {
        ...(current || { device_id: deviceId }),
        ...updatedOverride
    };
}
