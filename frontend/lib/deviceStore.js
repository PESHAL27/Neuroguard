// Centralized device store for Next.js API routes

const defaultDevices = [
    {
        _id: "dev_jio_router_01",
        device_id: "device_fcb0de23d9ec",
        name: "JioFiber Home Gateway",
        hostname: "jiofiber.local.html",
        ip: "192.168.31.1",
        mac: "FC:B0:DE:23:D9:EC",
        type: "router",
        type_guess: "router",
        vendor: "Jio / Sercomm Optical Gateway",
        status: "connected",
        connected: true,
        trusted: true,
        auto_connect: true,
        monitor: true,
        blocked: false,
        threat_count: 0,
        network_usage: 1420,
        connections: 6,
        cpu: 24,
        last_seen: new Date().toISOString(),
    },
    {
        _id: "dev_settopbox_76",
        device_id: "device_5c7b5c12ae8d",
        name: "Jio Set-Top Box",
        hostname: "SetTopBox-4837.lan",
        ip: "192.168.31.76",
        mac: "5C:7B:5C:12:AE:8D",
        type: "camera",
        type_guess: "camera",
        vendor: "Skyworth / Jio Media Streamer",
        status: "connected",
        connected: true,
        trusted: true,
        auto_connect: true,
        monitor: true,
        blocked: false,
        threat_count: 0,
        network_usage: 520,
        connections: 4,
        cpu: 45,
        last_seen: new Date().toISOString(),
    },
    {
        _id: "dev_iot_node_91",
        device_id: "device_1407083582c9",
        name: "Smart IoT Sensor Node",
        hostname: "smart-node-91.lan",
        ip: "192.168.31.91",
        mac: "14:07:08:35:82:C9",
        type: "sensor",
        type_guess: "sensor",
        vendor: "Amazon Technologies Smart Device",
        status: "connected",
        connected: true,
        trusted: true,
        auto_connect: true,
        monitor: true,
        blocked: false,
        threat_count: 0,
        network_usage: 34,
        connections: 2,
        cpu: 12,
        last_seen: new Date().toISOString(),
    },
    {
        _id: "dev_laptop_168",
        device_id: "device_a4ae1247cfe0",
        name: "Network Workstation",
        hostname: "workstation-168.lan",
        ip: "192.168.31.168",
        mac: "A4:AE:12:47:CF:E0",
        type: "laptop",
        type_guess: "laptop",
        vendor: "Intel / Dell Computer",
        status: "connected",
        connected: true,
        trusted: true,
        auto_connect: true,
        monitor: true,
        blocked: false,
        threat_count: 0,
        network_usage: 890,
        connections: 12,
        cpu: 38,
        last_seen: new Date().toISOString(),
    },
    {
        _id: "dev_host_admin_173",
        device_id: "device_admin_host_173",
        name: "Admin Host PC (Your Device)",
        hostname: "admin.lan",
        ip: "192.168.31.173",
        mac: "HOST-PC-LOCAL",
        type: "desktop",
        type_guess: "desktop",
        vendor: "Local Controller / Windows Host",
        status: "connected",
        connected: true,
        trusted: true,
        auto_connect: true,
        monitor: true,
        blocked: false,
        threat_count: 0,
        network_usage: 2300,
        connections: 28,
        cpu: 18,
        last_seen: new Date().toISOString(),
    },
    {
        _id: "dev_realme_narzo_207",
        device_id: "device_564bd3927a39",
        name: "Realme NARZO 80 Lite 5G",
        hostname: "realme-NARZO-80-Lite-5G.lan",
        ip: "192.168.31.207",
        mac: "56:4B:D3:92:7A:39",
        type: "phone",
        type_guess: "phone",
        vendor: "Realme Mobile Corp",
        status: "connected",
        connected: true,
        trusted: true,
        auto_connect: true,
        monitor: true,
        blocked: false,
        threat_count: 0,
        network_usage: 310,
        connections: 5,
        cpu: 29,
        last_seen: new Date().toISOString(),
    }
];

// Attach to global for Hot Module Replacement persistence across route files
if (!global.__neuroguardDevices) {
    global.__neuroguardDevices = defaultDevices;
}

export function getAllDevices() {
    return global.__neuroguardDevices;
}

export function findDevice(deviceId) {
    return global.__neuroguardDevices.find(d => d.device_id === deviceId || d._id === deviceId);
}

export function updateDevice(deviceId, updates) {
    const index = global.__neuroguardDevices.findIndex(d => d.device_id === deviceId || d._id === deviceId);
    if (index >= 0) {
        global.__neuroguardDevices[index] = {
            ...global.__neuroguardDevices[index],
            ...updates,
            last_seen: new Date().toISOString()
        };
        return global.__neuroguardDevices[index];
    }
    return null;
}
