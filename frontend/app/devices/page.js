"use client";

import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

const DEVICE_TYPE_OPTIONS = [
    ["phone", "Phone"],
    ["camera", "Camera"],
    ["sensor", "Sensor"],
    ["router", "Router"],
    ["desktop", "Desktop"],
    ["laptop", "Laptop"],
    ["esp32", "ESP32 Board"],
    ["raspberry", "Raspberry Pi"],
    ["unknown", "Unknown"],
];

const getApiBaseUrl = () => {
    if (typeof window === "undefined") {
        return process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    }

    const { protocol, hostname } = window.location;
    const apiProtocol = protocol === "https:" ? "https:" : "http:";
    return `${apiProtocol}//${hostname}:8000`;
};

const getApiBaseCandidates = () => {
    if (typeof window === "undefined") {
        return [process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000", "http://localhost:3000"];
    }

    const candidates = [];
    const envUrl = process.env.NEXT_PUBLIC_API_URL;
    const { hostname } = window.location;

    if (envUrl) {
        candidates.push(envUrl);
    }

    // Include relative origin for Next.js internal API routes
    candidates.push("");

    candidates.push(`http://${hostname}:8000`);

    if (hostname !== "localhost") {
        candidates.push("http://localhost:8000");
    }

    if (hostname !== "127.0.0.1") {
        candidates.push("http://127.0.0.1:8000");
    }

    return [...new Set(candidates)];
};

const fetchApi = async (path, options) => {
    const candidates = getApiBaseCandidates();
    let lastError = null;

    for (const baseUrl of candidates) {
        try {
            return await fetch(`${baseUrl}${path}`, options);
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError || new Error("Backend is unreachable");
};

const getWsBaseUrl = () => {
    if (typeof window === "undefined") {
        return process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";
    }

    const { protocol, hostname } = window.location;
    const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
    return `${wsProtocol}//${hostname}:8000`;
};

const statusColor = {
    connected: { dot: "bg-emerald-400", text: "text-emerald-300", glow: "shadow-[0_0_8px_rgba(52,211,153,0.8)]", badge: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" },
    detected: { dot: "bg-amber-400", text: "text-amber-300", glow: "shadow-[0_0_8px_rgba(251,191,36,0.8)]", badge: "bg-amber-500/20 text-amber-300 border border-amber-500/30" },
    blocked: { dot: "bg-rose-400", text: "text-rose-300", glow: "shadow-[0_0_8px_rgba(251,113,133,0.8)]", badge: "bg-rose-500/20 text-rose-300 border border-rose-500/30" },
};

const typeIcon = {
    Camera: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
        </svg>
    ),
    Sensor: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.652a3.75 3.75 0 0 1 0-5.304m5.304 0a3.75 3.75 0 0 1 0 5.304m-7.425 2.121a6.75 6.75 0 0 1 0-9.546m9.546 0a6.75 6.75 0 0 1 0 9.546M5.106 18.894c-3.808-3.807-3.808-9.98 0-13.788m13.788 0c3.808 3.807 3.808 9.98 0 13.788M12 12h.008v.008H12V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
        </svg>
    ),
};

export default function Devices() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const filterParam = searchParams.get('filter');
    const [filter, setFilter] = useState("all");
    const [devices, setDevices] = useState([]);
    const [deviceImages, setDeviceImages] = useState({});
    const [connectionMode, setConnectionMode] = useState("polling");
    const [renameError, setRenameError] = useState("");
    const [actionDeviceId, setActionDeviceId] = useState(null);

    // For renaming inline
    const [editingDeviceId, setEditingDeviceId] = useState(null);
    const [editForm, setEditForm] = useState({ name: "", type: "phone" });
    const [networkStats, setNetworkStats] = useState({ grade: "A+", status: "Secure", uptime_percent: 99.9, bandwidth_tb: 12.4 });

    const loadDevices = async () => {
        try {
            const response = await fetchApi("/api/devices", { cache: "no-store" });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const data = await response.json();
            const uniqueData = Array.from(new Map(data.map(item => [item._id || item.device_id || item.mac || item.id, item])).values());
            setDevices(uniqueData);
        } catch (error) {
            console.error("Failed to load devices:", error);
        }
    };

    const loadStats = async () => {
        try {
            const [healthRes, uptimeRes, trafficRes] = await Promise.all([
                fetchApi("/api/network/health", { cache: "no-store" }).catch(() => null),
                fetchApi("/api/system/uptime", { cache: "no-store" }).catch(() => null),
                fetchApi("/api/network/traffic", { cache: "no-store" }).catch(() => null),
            ]);
            
            let newStats = { ...networkStats };
            if (healthRes && healthRes.ok) {
                const health = await healthRes.json();
                newStats.grade = health.grade;
                newStats.status = health.status;
            }
            if (uptimeRes && uptimeRes.ok) {
                const uptime = await uptimeRes.json();
                newStats.uptime_percent = uptime.uptime_percent;
            }
            if (trafficRes && trafficRes.ok) {
                const traffic = await trafficRes.json();
                newStats.bandwidth_tb = traffic.bandwidth_tb;
            }
            setNetworkStats(newStats);
        } catch (e) {
            console.error(e);
        }
    };

    const upsertLocalDevice = (updatedDevice) => {
        if (!updatedDevice) {
            return;
        }
        setDevices((currentDevices) => {
            const nextDevices = [...currentDevices];
            const index = nextDevices.findIndex((device) => (device._id || device.device_id) === (updatedDevice._id || updatedDevice.device_id));
            if (index >= 0) {
                nextDevices[index] = updatedDevice;
            } else {
                nextDevices.unshift(updatedDevice);
            }
            return nextDevices;
        });
    };

    const runDeviceAction = async (path, body) => {
        setActionDeviceId(body.device_id);
        setRenameError("");
        try {
            const response = await fetchApi(path, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const result = await response.json().catch(() => null);
            if (!response.ok || result?.status === "error") {
                throw new Error(result?.message || `Request failed with HTTP ${response.status}`);
            }
            upsertLocalDevice(result?.device);
            return result;
        } catch (error) {
            console.error("Device action failed", error);
            setRenameError(error.message || "Device action failed");
            return null;
        } finally {
            setActionDeviceId(null);
        }
    };

    useEffect(() => {
        let pollTimer;
        let statsTimer;
        let eventSource;

        loadDevices();
        loadStats();
        // Fast polling fallback every 1.5s for instant reactivity
        pollTimer = setInterval(loadDevices, 1500);
        statsTimer = setInterval(loadStats, 5000);

        // SSE Real-time Live Network Stream
        try {
            eventSource = new EventSource("/api/devices/stream");
            eventSource.onopen = () => {
                setConnectionMode("live_stream");
            };
            eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (Array.isArray(data)) {
                        const uniqueData = Array.from(new Map(data.map(item => [item._id || item.device_id || item.mac || item.id, item])).values());
                        setDevices(uniqueData);
                    }
                } catch (e) {}
            };
            eventSource.onerror = () => {
                setConnectionMode("polling");
            };
        } catch (e) {
            setConnectionMode("polling");
        }

        return () => {
            clearInterval(pollTimer);
            clearInterval(statsTimer);
            if (eventSource) eventSource.close();
        };
    }, []);

    // Handle URL parameter filtering (when navigated from other pages)
    useEffect(() => {
        if (filterParam) {
            // Auto-filter devices based on URL parameter
            const matchingDevice = devices.find(d => 
                d.name?.toLowerCase().includes(filterParam.toLowerCase()) ||
                d.hostname?.toLowerCase().includes(filterParam.toLowerCase()) ||
                d.ip === filterParam
            );
            if (matchingDevice) {
                // Temporarily highlight the device by setting a special filter
                setFilter(`highlight:${filterParam}`);
                // Reset to "all" after 3 seconds
                setTimeout(() => setFilter("all"), 3000);
            }
        }
    }, [filterParam, devices]);

    // Fetch images when a new device type is seen
    useEffect(() => {
        const typesToFetch = new Set();
        devices.forEach(device => {
            const devType = (device.type || device.type_guess || "unknown").toLowerCase();
            if (!deviceImages[devType]) {
                typesToFetch.add(devType);
            }
        });

        typesToFetch.forEach(async (devType) => {
            // Optimistically set to prevent refetching while pending
            setDeviceImages(prev => ({ ...prev, [devType]: "pending" }));
            try {
                const res = await fetchApi(`/api/device-image?type=${devType}`);
                const data = await res.json();
                setDeviceImages(prev => ({ ...prev, [devType]: data.image }));
            } catch (e) {
                console.error("Failed to fetch image for", devType);
                setDeviceImages(prev => ({ ...prev, [devType]: null }));
            }
        });
    }, [devices]); // Removed deviceImages dependency to prevent loops

    const handleRenameSubmit = async (deviceId) => {
        if (!editForm.name) return;
        try {
            setRenameError("");
            setActionDeviceId(deviceId);
            const response = await fetchApi("/api/device/rename", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    device_id: deviceId,
                    name: editForm.name,
                    type: editForm.type
                })
            });

            const result = await response.json().catch(() => null);
            if (!response.ok || result?.status === "error") {
                throw new Error(result?.message || `Rename failed with HTTP ${response.status}`);
            }

            upsertLocalDevice(result?.device);
            setEditingDeviceId(null);
        } catch (e) {
            console.error("Error renaming device", e);
            setRenameError(e.message || "Rename failed");
        } finally {
            setActionDeviceId(null);
        }
    };

    const containerVariants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: { staggerChildren: 0.06 }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 20, scale: 0.97 },
        show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 260, damping: 22 } }
    };

    const connectedCount = devices.filter((device) => device.connected && !device.blocked).length;
    const detectedCount = devices.filter((device) => device.status === "detected" && !device.blocked).length;
    const blockedCount = devices.filter((device) => device.blocked).length;
    const surveillanceCount = devices.filter((device) => (device.surveillance || device.trusted === false) && !device.blocked).length;
    const trustedCount = devices.filter((device) => device.trusted && !device.blocked).length;
    const cameraCount = devices.filter(d => d.type?.toLowerCase() === "camera" && !d.blocked).length;
    const sensorCount = devices.filter(d => d.type?.toLowerCase() === "sensor" && !d.blocked).length;

    const filteredDevices = filter === "all" 
        ? devices.filter(d => !d.blocked) 
        : devices.filter(d => {
            if (filter.startsWith("highlight:")) {
                const param = filter.split(":")[1].toLowerCase();
                return d.name?.toLowerCase().includes(param) || d.hostname?.toLowerCase().includes(param) || d.ip === param || (d.device_id || d.mac_address || d.id) === filter.split(":")[1];
            }
            if (filter === "cameras") return d.type?.toLowerCase() === "camera" && !d.blocked;
            if (filter === "sensors") return d.type?.toLowerCase() === "sensor" && !d.blocked;
            if (filter === "connected") return d.connected && !d.blocked;
            if (filter === "surveillance" || filter === "untrusted") return (d.surveillance || d.trusted === false) && !d.blocked;
            if (filter === "trusted") return d.trusted && !d.blocked;
            if (filter === "blocked" || filter === "quarantine") return d.blocked;
            return true;
        });

    return (
        <div className="min-h-screen w-full bg-[#050510] text-white relative overflow-x-hidden pt-28 pb-16 px-4 md:px-8 xl:px-12 flex justify-center selection:bg-cyan-500/30">
            {/* Vivid background glows */}
            <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-[#6C63FF] opacity-[0.07] blur-[120px] rounded-full pointer-events-none"></div>
            <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-[#FF6B9D] opacity-[0.06] blur-[120px] rounded-full pointer-events-none"></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-[#00D4AA] opacity-[0.04] blur-[150px] rounded-full pointer-events-none"></div>

            <motion.div
                className="w-full max-w-[1360px] z-10 flex flex-col gap-6"
                variants={containerVariants}
                initial="hidden"
                animate="show"
            >
                {/* ===== TOP OVERVIEW SECTION ===== */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">

                    {/* Main Hero Card: Total Connected */}
                    <motion.div
                        variants={itemVariants}
                        whileHover={{ scale: 1.008, transition: { duration: 0.2 } }}
                        className="col-span-1 md:col-span-2 lg:col-span-2 lg:row-span-2 relative overflow-hidden rounded-3xl p-7 flex flex-col justify-between min-h-[260px]"
                        style={{
                            background: "linear-gradient(150deg, #7C6AFF 0%, #A78BFA 40%, #C4B5FD 100%)",
                            boxShadow: "inset 0 2px 25px -5px rgba(255,255,255,0.5), 0 20px 50px -15px rgba(124,106,255,0.5)"
                        }}
                    >
                        <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-white/30 blur-[80px] rounded-full -translate-y-1/3 translate-x-1/4 pointer-events-none"></div>
                        <div className="absolute bottom-0 left-0 w-[200px] h-[200px] bg-[#4F46E5]/40 blur-[60px] rounded-full translate-y-1/3 -translate-x-1/4 pointer-events-none"></div>

                        <div className="flex justify-between items-start z-10">
                            <div>
                                <span className="text-white font-medium text-xl tracking-wide">Network Device Lifecycle</span>
                                <p className="text-white/70 text-sm mt-1">Detected, connected, blocked, and trusted devices on this network</p>
                            </div>
                            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-xl flex items-center justify-center border border-white/30 shadow-lg">
                                <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 0 1 1.06 0Z" />
                                </svg>
                            </div>
                        </div>

                        <div className="z-10 mt-auto">
                            <div className="flex items-baseline gap-3">
                                <span className="text-7xl lg:text-8xl font-bold tracking-tighter leading-none text-white drop-shadow-xl">{devices.length}</span>
                                <span className="text-2xl font-light text-white/90">Total</span>
                            </div>
                            <div className="flex gap-4 mt-4">
                                <div className="flex items-center gap-2 bg-white/15 backdrop-blur-md rounded-full px-3 py-1.5 border border-white/20">
                                    <div className="w-2 h-2 rounded-full bg-emerald-300 shadow-[0_0_6px_rgba(52,211,153,0.9)]"></div>
                                    <span className="text-sm text-white/90 font-medium">{connectedCount} Connected</span>
                                </div>
                                <div className="flex items-center gap-2 bg-white/15 backdrop-blur-md rounded-full px-3 py-1.5 border border-white/20">
                                    <div className="w-2 h-2 rounded-full bg-amber-300 shadow-[0_0_6px_rgba(251,191,36,0.9)]"></div>
                                    <span className="text-sm text-white/90 font-medium">{detectedCount} Detected</span>
                                </div>
                                <div className="flex items-center gap-2 bg-white/15 backdrop-blur-md rounded-full px-3 py-1.5 border border-white/20">
                                    <div className={`w-2 h-2 rounded-full ${connectionMode === "live_stream" || connectionMode === "websocket" ? "bg-cyan-300 shadow-[0_0_6px_rgba(103,232,249,0.9)] animate-pulse" : "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"}`}></div>
                                    <span className="text-sm text-white/90 font-medium">{connectionMode === "live_stream" || connectionMode === "websocket" ? "Live Stream" : "Live Scan"}</span>
                                </div>
                                <div className="flex items-center gap-2 bg-white/15 backdrop-blur-md rounded-full px-3 py-1.5 border border-white/20">
                                    <div className="w-2 h-2 rounded-full bg-violet-300 shadow-[0_0_6px_rgba(216,180,254,0.9)]"></div>
                                    <span className="text-sm text-white/90 font-medium">{trustedCount} Trusted</span>
                                </div>
                                <div className="flex items-center gap-2 bg-white/15 backdrop-blur-md rounded-full px-3 py-1.5 border border-white/20">
                                    <div className="w-2 h-2 rounded-full bg-rose-300 shadow-[0_0_6px_rgba(251,113,133,0.9)]"></div>
                                    <span className="text-sm text-white/90 font-medium">{blockedCount} Blocked</span>
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    {/* Cameras Card */}
                    <motion.div
                        variants={itemVariants}
                        whileHover={{ y: -4, transition: { duration: 0.2 } }}
                        className="relative overflow-hidden rounded-3xl p-6 flex flex-col justify-between min-h-[120px] border border-white/15"
                        style={{
                            background: "linear-gradient(145deg, #FF8A65 0%, #FF6B6B 100%)",
                            boxShadow: "inset 0 2px 15px rgba(255,255,255,0.35), 0 12px 30px -8px rgba(255,107,107,0.45)"
                        }}
                    >
                        <div className="absolute top-[-30%] right-[-20%] w-[140px] h-[140px] bg-white/30 blur-[40px] rounded-full pointer-events-none"></div>
                        <div className="flex justify-between items-center z-10">
                            <span className="text-white font-medium text-base tracking-wide">Cameras</span>
                            <div className="text-white/80">{typeIcon.Camera}</div>
                        </div>
                        <div className="z-10 flex items-baseline gap-2 mt-auto">
                            <span className="text-4xl lg:text-5xl font-bold text-white drop-shadow-lg">{cameraCount}</span>
                            <span className="text-lg font-light text-white/85">Active</span>
                        </div>
                    </motion.div>

                    {/* Sensors Card */}
                    <motion.div
                        variants={itemVariants}
                        whileHover={{ y: -4, transition: { duration: 0.2 } }}
                        className="relative overflow-hidden rounded-3xl p-6 flex flex-col justify-between min-h-[120px] border border-white/15"
                        style={{
                            background: "linear-gradient(145deg, #4DD0E1 0%, #26C6DA 100%)",
                            boxShadow: "inset 0 2px 15px rgba(255,255,255,0.35), 0 12px 30px -8px rgba(38,198,218,0.45)"
                        }}
                    >
                        <div className="absolute bottom-[-30%] left-[-20%] w-[140px] h-[140px] bg-white/25 blur-[40px] rounded-full pointer-events-none"></div>
                        <div className="flex justify-between items-center z-10">
                            <span className="text-white font-medium text-base tracking-wide">Sensors</span>
                            <div className="text-white/80">{typeIcon.Sensor}</div>
                        </div>
                        <div className="z-10 flex items-baseline gap-2 mt-auto">
                            <span className="text-4xl lg:text-5xl font-bold text-white drop-shadow-lg">{sensorCount}</span>
                            <span className="text-lg font-light text-white/85">Active</span>
                        </div>
                    </motion.div>

                    {/* Network Integrity */}
                    <motion.div
                        variants={itemVariants}
                        whileHover={{ y: -4, transition: { duration: 0.2 } }}
                        className="relative overflow-hidden rounded-3xl p-6 flex flex-col justify-between min-h-[120px] border border-white/15"
                        style={{
                            background: "linear-gradient(145deg, #66BB6A 0%, #43A047 100%)",
                            boxShadow: "inset 0 2px 15px rgba(255,255,255,0.35), 0 12px 30px -8px rgba(67,160,71,0.45)"
                        }}
                    >
                        <div className="absolute top-[-20%] left-[50%] w-[120px] h-[120px] bg-white/25 blur-[40px] rounded-full pointer-events-none"></div>
                        <div className="flex justify-between items-center z-10">
                            <span className="text-white font-medium text-base tracking-wide">Network</span>
                            <svg className="w-5 h-5 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                            </svg>
                        </div>
                        <div className="z-10 flex items-baseline gap-2 mt-auto">
                            <span className="text-4xl lg:text-5xl font-bold text-white drop-shadow-lg">{networkStats.grade}</span>
                            <span className="text-lg font-light text-white/85">{networkStats.status}</span>
                        </div>
                    </motion.div>

                    {/* Uptime */}
                    <motion.div
                        variants={itemVariants}
                        whileHover={{ y: -4, transition: { duration: 0.2 } }}
                        className="relative overflow-hidden rounded-3xl p-6 flex flex-col justify-between min-h-[120px] border border-white/15"
                        style={{
                            background: "linear-gradient(145deg, #AB47BC 0%, #8E24AA 100%)",
                            boxShadow: "inset 0 2px 15px rgba(255,255,255,0.35), 0 12px 30px -8px rgba(142,36,170,0.45)"
                        }}
                    >
                        <div className="absolute bottom-[-20%] right-[-10%] w-[120px] h-[120px] bg-white/20 blur-[40px] rounded-full pointer-events-none"></div>
                        <div className="flex justify-between items-center z-10">
                            <span className="text-white font-medium text-base tracking-wide">Uptime</span>
                            <svg className="w-5 h-5 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                            </svg>
                        </div>
                        <div className="z-10 flex items-baseline gap-1 mt-auto">
                            <span className="text-4xl lg:text-5xl font-bold text-white drop-shadow-lg">{networkStats.uptime_percent}</span>
                            <span className="text-xl font-light text-white/80">%</span>
                        </div>
                    </motion.div>

                    {/* Bandwidth */}
                    <motion.div
                        variants={itemVariants}
                        whileHover={{ y: -4, transition: { duration: 0.2 } }}
                        className="relative overflow-hidden rounded-3xl p-6 flex flex-col justify-between min-h-[120px] border border-white/15"
                        style={{
                            background: "linear-gradient(145deg, #FFB74D 0%, #FFA726 100%)",
                            boxShadow: "inset 0 2px 15px rgba(255,255,255,0.35), 0 12px 30px -8px rgba(255,167,38,0.45)"
                        }}
                    >
                        <div className="absolute top-[-25%] right-[-15%] w-[130px] h-[130px] bg-white/25 blur-[40px] rounded-full pointer-events-none"></div>
                        <div className="flex justify-between items-center z-10">
                            <span className="text-white font-medium text-base tracking-wide">Bandwidth</span>
                            <svg className="w-5 h-5 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5 7.5 3m0 0L12 7.5M7.5 3v13.5m13.5-4.5L16.5 21m0 0L12 16.5m4.5 4.5V7.5" />
                            </svg>
                        </div>
                        <div className="z-10 flex items-baseline gap-1.5 mt-auto">
                            <span className="text-4xl lg:text-5xl font-bold text-white drop-shadow-lg">{networkStats.bandwidth_tb}</span>
                            <span className="text-xl font-light text-white/80">TB</span>
                        </div>
                    </motion.div>
                </div>

                {/* Quick Filter Navigation Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 bg-white/5 backdrop-blur-md rounded-2xl p-2.5 border border-white/10 mt-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            onClick={() => setFilter("all")}
                            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${filter === "all" ? "bg-white text-black shadow-md" : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"}`}
                        >
                            All Connected ({connectedCount})
                        </button>
                        <button
                            onClick={() => setFilter("surveillance")}
                            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${filter === "surveillance" ? "bg-amber-400 text-black shadow-[0_0_12px_rgba(251,191,36,0.5)]" : "bg-amber-500/10 text-amber-300 border border-amber-500/20 hover:bg-amber-500/20"}`}
                        >
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></div>
                            AI Surveillance ({surveillanceCount})
                        </button>
                        <button
                            onClick={() => setFilter("blocked")}
                            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${filter === "blocked" ? "bg-rose-500 text-white shadow-[0_0_12px_rgba(244,63,94,0.5)]" : "bg-rose-500/10 text-rose-300 border border-rose-500/20 hover:bg-rose-500/20"}`}
                        >
                            <div className="w-1.5 h-1.5 rounded-full bg-rose-400"></div>
                            Quarantined / Blocked ({blockedCount})
                        </button>
                        <button
                            onClick={() => setFilter("cameras")}
                            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${filter === "cameras" ? "bg-cyan-400 text-black" : "bg-white/5 text-white/70 hover:bg-white/10"}`}
                        >
                            Cameras ({cameraCount})
                        </button>
                        <button
                            onClick={() => setFilter("sensors")}
                            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${filter === "sensors" ? "bg-cyan-400 text-black" : "bg-white/5 text-white/70 hover:bg-white/10"}`}
                        >
                            Sensors ({sensorCount})
                        </button>
                    </div>
                    <div className="text-xs text-white/50 font-mono pr-2">
                        {filteredDevices.length} {filter === "blocked" ? "quarantined" : "connected"}
                    </div>
                </div>

                {/* ===== DEVICE LIST GRID OR EMPTY STATE ===== */}
                {renameError ? (
                    <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                        {renameError}
                    </div>
                ) : null}

                {filteredDevices.length === 0 ? (
                    <motion.div variants={itemVariants} className="w-full h-64 flex flex-col items-center justify-center border border-white/10 rounded-3xl bg-white/5 backdrop-blur-sm mt-4">
                        <div className="w-14 h-14 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mb-4 shadow-[0_0_20px_rgba(6,182,212,0.5)]"></div>
                        <h3 className="text-xl font-medium text-white/90 tracking-wide">
                            {filter === "blocked" ? "No Quarantined Devices" : filter === "surveillance" ? "No Devices Under AI Surveillance" : "No devices currently connected"}
                        </h3>
                        <p className="text-white/50 text-sm mt-2 max-w-sm text-center">
                            {filter === "blocked" ? "All active devices are currently permitted on the network." : "Live background scanner is continuously monitoring the subnet for packet traffic..."}
                        </p>
                    </motion.div>
                ) : (
                    <motion.div
                        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-2"
                        variants={containerVariants}
                        initial="hidden"
                        animate="show"
                        key={filter}
                    >
                        {filteredDevices.map((device, index) => {
                            const isBlocked = Boolean(device.blocked);
                            const isUnderSurveillance = Boolean(device.surveillance || device.trusted === false);
                            const isConnected = Boolean(device.connected && !isBlocked);
                            const isDetected = device.status === "detected";
                            const isUnknown = !isConnected && !isBlocked;
                            const guessedType = (device.type_guess || "unknown").toLowerCase();
                            const devType = (device.type || device.type_guess || "unknown").toLowerCase();
                            const imgUrl = (deviceImages[devType] && deviceImages[devType] !== "pending") ? deviceImages[devType] : "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/help-circle.svg";
                            const defaultConnectName = device.name || (device.hostname ? device.hostname.replace(/[-_.]+/g, " ") : `${(device.type || device.type_guess || "device")} device`);

                            return (
                                <motion.div
                                    key={device._id || device.device_id || `dev-${index}`}
                                    variants={itemVariants}
                                    whileHover={{ y: -6, scale: 1.02, transition: { duration: 0.2 } }}
                                    className={`relative overflow-hidden rounded-2xl p-5 flex flex-col gap-4 border ${isBlocked ? 'border-rose-500/50 bg-rose-950/20 shadow-[0_0_25px_rgba(244,63,94,0.15)]' : isUnderSurveillance ? 'border-amber-500/40 bg-amber-950/15' : 'border-white/10'} cursor-pointer group`}
                                    style={{
                                        background: isConnected && !isUnderSurveillance ? "linear-gradient(160deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 100%)" : undefined,
                                        boxShadow: isBlocked ? "inset 0 0 25px rgba(244,63,94,0.18)" : isUnderSurveillance ? "inset 0 0 20px rgba(251,191,36,0.12)" : "inset 0 1px 12px rgba(255,255,255,0.08), 0 8px 24px -6px rgba(0,0,0,0.3)"
                                    }}
                                >
                                    {/* Hover glow effect */}
                                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                                        style={{ background: isBlocked ? "radial-gradient(circle at 50% 0%, rgba(244,63,94,0.2) 0%, transparent 70%)" : isUnderSurveillance ? "radial-gradient(circle at 50% 0%, rgba(251,191,36,0.18) 0%, transparent 70%)" : "radial-gradient(circle at 50% 0%, rgba(124,106,255,0.15) 0%, transparent 70%)" }}
                                    ></div>

                                    {/* Header: Icon + Name + Status */}
                                    <div className="flex items-start justify-between z-10 w-full">
                                        <div className="flex items-center gap-3 max-w-[65%]">
                                            <div className={`w-12 h-12 rounded-xl flex shrink-0 items-center justify-center border shadow-lg ${isBlocked ? "bg-rose-500/20 border-rose-500/40" : isUnderSurveillance ? "bg-amber-500/20 border-amber-500/40" : "bg-white/10 border-white/20 backdrop-blur-md"
                                                }`}>
                                                <img src={imgUrl} className={`w-6 h-6`} alt={device.type || "Device"} style={{ filter: isBlocked ? "invert(55%) sepia(81%) saturate(1734%) hue-rotate(319deg) brightness(101%) contrast(97%)" : isUnderSurveillance ? "invert(80%) sepia(40%) saturate(6000%) hue-rotate(350deg) brightness(100%) contrast(100%)" : "invert(100%)" }} />
                                            </div>
                                            <div className="truncate w-full gap-1 flex flex-col">
                                                {editingDeviceId === device.device_id ? (
                                                    <div className="flex flex-col gap-1 w-full" onClick={e => e.stopPropagation()}>
                                                        <input
                                                            autoFocus
                                                            type="text"
                                                            className="bg-black/40 border border-white/20 rounded px-2 py-1 text-xs text-white outline-none focus:border-cyan-400"
                                                            placeholder="Device Name..."
                                                            value={editForm.name}
                                                            onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                                                        />
                                                        <select
                                                            className="bg-black/40 border border-white/20 rounded px-1 py-1 text-[10px] text-white outline-none appearance-none cursor-pointer"
                                                            value={editForm.type}
                                                            onChange={e => setEditForm(prev => ({ ...prev, type: e.target.value }))}
                                                        >
                                                            {DEVICE_TYPE_OPTIONS.filter(([value]) => value !== "unknown").map(([value, label]) => (
                                                                <option key={value} value={value}>{label}</option>
                                                            ))}
                                                        </select>
                                                        <div className="flex gap-1 mt-1">
                                                            <button disabled={actionDeviceId === device.device_id} onClick={() => handleRenameSubmit(device.device_id)} className="bg-emerald-500/30 text-emerald-300 border border-emerald-500/50 rounded flex-1 py-0.5 text-[10px] hover:bg-emerald-500/50 disabled:opacity-50">Save</button>
                                                            <button onClick={() => setEditingDeviceId(null)} className="bg-white/10 text-white/70 border border-white/20 rounded flex-1 py-0.5 text-[10px] hover:bg-white/20">Cancel</button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <p className="text-white font-medium text-sm truncate w-full group-hover:text-cyan-300 transition-colors">
                                                            <button 
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    router.push(`/network?device_focus=${encodeURIComponent(device.name || device.hostname || device.ip)}`);
                                                                }}
                                                                className="hover:underline underline-offset-2 transition-all text-left truncate w-full"
                                                            >
                                                                {device.name || (isDetected ? "Unknown Device" : "Connected Device")}
                                                            </button>
                                                        </p>
                                                        <div className="flex items-center gap-1.5">
                                                            <p className="text-white/45 text-[11px] uppercase tracking-wider">{isBlocked ? "Quarantined Node" : isUnderSurveillance ? "Under AI Watchdog" : device.type}</p>
                                                            {!isBlocked && (
                                                                <button onClick={(e) => { e.stopPropagation(); setEditingDeviceId(device.device_id); setEditForm({ name: device.name || "", type: devType !== "unknown" ? devType : "phone" }); }} className="text-[9px] bg-white/10 hover:bg-white/20 text-white/80 px-1.5 py-0.2 rounded border border-white/20 transition-colors">
                                                                    Edit
                                                                </button>
                                                            )}
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {!editingDeviceId && (
                                            <div className="flex shrink-0 items-center gap-1.5">
                                                {isBlocked ? (
                                                    <div className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide uppercase bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-[0_0_8px_rgba(244,63,94,0.3)]">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse"></div>
                                                        Quarantined
                                                    </div>
                                                ) : isUnderSurveillance ? (
                                                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-[0_0_8px_rgba(251,191,36,0.3)]">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></div>
                                                        Surveillance
                                                    </div>
                                                ) : device.trusted ? (
                                                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide uppercase bg-violet-500/20 text-violet-200 border border-violet-500/30">
                                                        Trusted
                                                    </div>
                                                ) : null}

                                                <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold tracking-wide uppercase ${isBlocked ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : isUnderSurveillance ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'}`}>
                                                    <div className={`w-1.5 h-1.5 rounded-full ${isBlocked ? 'bg-rose-400' : isUnderSurveillance ? 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]' : 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]'}`}></div>
                                                    {isBlocked ? "Blocked" : isUnderSurveillance ? "Active AI" : "Connected"}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Info Rows */}
                                    <div className={`flex flex-col gap-2 z-10 mt-1 rounded-xl p-3 border ${isBlocked ? 'bg-rose-950/30 border-rose-500/20' : isUnderSurveillance ? 'bg-amber-950/20 border-amber-500/20' : 'bg-black/20 border-white/5'}`}>
                                        <div className="flex justify-between items-center">
                                            <span className="text-white/40 text-[11px] uppercase tracking-wider font-semibold">IP Address</span>
                                            <span className="text-white/80 text-xs font-mono bg-white/5 px-1.5 py-0.5 rounded">{device.ip || "N/A"}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-white/40 text-[11px] uppercase tracking-wider font-semibold">MAC</span>
                                            <span className="text-white/80 text-xs font-mono bg-white/5 px-1.5 py-0.5 rounded">{device.mac || "N/A"}</span>
                                        </div>

                                        {isBlocked ? (
                                            <div className="flex flex-col gap-1 mt-1 p-2 rounded bg-rose-500/10 border border-rose-500/20">
                                                <span className="text-rose-300 text-[11px] font-semibold flex items-center gap-1">
                                                    🚫 Network Access Revoked
                                                </span>
                                                <span className="text-white/60 text-[10px]">
                                                    This device cannot communicate on this network until unblocked.
                                                </span>
                                            </div>
                                        ) : isUnderSurveillance ? (
                                            <div className="flex flex-col gap-1 mt-1 p-2 rounded bg-amber-500/10 border border-amber-500/20">
                                                <span className="text-amber-300 text-[11px] font-semibold flex items-center gap-1">
                                                    👁️ AI Real-time Surveillance Active
                                                </span>
                                                <span className="text-white/60 text-[10px]">
                                                    Watchdog inspecting all inbound/outbound packets for anomalies.
                                                </span>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-white/40 text-[11px] uppercase tracking-wider font-semibold">Vendor</span>
                                                    <span className="text-white/75 text-xs text-right max-w-[60%] truncate">{device.vendor || "Verified Network Node"}</span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-white/40 text-[11px] uppercase tracking-wider font-semibold">Throughput</span>
                                                    <span className="text-white/75 text-xs font-mono">{device.network_usage || 240} KB/s</span>
                                                </div>
                                            </>
                                        )}

                                        <div className="flex justify-between items-center mt-1 pt-1 border-t border-white/10">
                                            <span className="text-white/40 text-[10px] uppercase">Status</span>
                                            <span className={`text-[10px] font-mono ${isBlocked ? "text-rose-400 font-bold" : isUnderSurveillance ? "text-amber-400 font-bold" : "text-emerald-400"}`}>
                                                {isBlocked ? "Quarantined / Access Cut Off" : isUnderSurveillance ? "Surveillance High Alert" : "Live & Nominal"}
                                            </span>
                                        </div>
                                    </div>

                                    {!editingDeviceId && (
                                        <div className="z-10 grid grid-cols-2 gap-2 mt-auto">
                                            {isBlocked ? (
                                                <button
                                                    disabled={actionDeviceId === device.device_id}
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        runDeviceAction("/api/device/unblock", {
                                                            device_id: device.device_id,
                                                        });
                                                    }}
                                                    className="col-span-2 rounded-xl border border-emerald-500/50 bg-emerald-500/20 px-3 py-2.5 text-xs font-bold text-emerald-200 transition-all hover:bg-emerald-500/30 hover:shadow-[0_0_15px_rgba(16,185,129,0.4)] disabled:opacity-50 flex items-center justify-center gap-2"
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                                                    </svg>
                                                    Unblock & Restore to Network
                                                </button>
                                            ) : (
                                                <>
                                                    <button
                                                        disabled={actionDeviceId === device.device_id}
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            runDeviceAction((device.trusted && !device.surveillance) ? "/api/device/untrust" : "/api/device/trust", {
                                                                device_id: device.device_id,
                                                                name: device.name || defaultConnectName,
                                                                type: devType,
                                                                auto_connect: true,
                                                            });
                                                        }}
                                                        className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 ${(device.trusted && !device.surveillance) ? "border-violet-500/40 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20" : "border-amber-500/50 bg-amber-500/20 text-amber-200 hover:bg-amber-500/30"}`}
                                                    >
                                                        {(device.trusted && !device.surveillance) ? "Untrust" : "Trust"}
                                                    </button>

                                                    <button
                                                        disabled={actionDeviceId === device.device_id}
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            runDeviceAction("/api/device/block", {
                                                                device_id: device.device_id,
                                                                reason: "Manual operator quarantine",
                                                            });
                                                        }}
                                                        className="rounded-xl border border-rose-500/50 bg-rose-500/15 px-3 py-2 text-xs font-semibold text-rose-200 transition-all hover:bg-rose-500/25 hover:shadow-[0_0_12px_rgba(244,63,94,0.3)] disabled:opacity-50 flex items-center justify-center gap-1.5"
                                                    >
                                                        Block Device
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    )}

                                    {/* CPU Usage Bar */}
                                    {isConnected && (
                                        <div className="z-10 mt-1">
                                            <div className="flex justify-between items-center mb-1.5">
                                                <span className="text-white/50 text-[10px] uppercase font-bold tracking-widest">CPU Load</span>
                                                <span className="text-white/80 text-xs font-mono">{device.cpu !== undefined ? `${device.cpu}%` : '-'}</span>
                                            </div>
                                            <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden shadow-inner border border-white/5">
                                                <motion.div
                                                    className="h-full rounded-full relative"
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${device.cpu || 0}%` }}
                                                    transition={{ duration: 1, delay: 0.1, ease: "easeOut" }}
                                                    style={{
                                                        background: (device.cpu || 0) < 50
                                                            ? "linear-gradient(90deg, #10B981, #34D399)"
                                                            : (device.cpu || 0) < 80
                                                                ? "linear-gradient(90deg, #F59E0B, #FBBF24)"
                                                                : "linear-gradient(90deg, #EF4444, #F87171)",
                                                    }}
                                                >
                                                    <div className="absolute inset-0 bg-white/20 w-full h-full" style={{ maskImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, white 2px, white 4px)', WebkitMaskImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, white 2px, white 4px)' }}></div>
                                                </motion.div>
                                            </div>
                                        </div>
                                    )}
                                </motion.div>
                            );
                        })}
                    </motion.div>
                )}
            </motion.div>
        </div>
    );
}
