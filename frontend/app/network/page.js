"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef } from "react";
import { fetchApiJson } from "@/lib/api";
import { getWsBaseUrl } from "@/lib/api";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

/* ───────────────────  HELPER FUNCTIONS  ─────────────────── */
function aggregateThreatsByIP(threatLocations) {
    const map = {};
    threatLocations.forEach((threat) => {
        const ip = threat.ip;
        if (!ip) return;
        if (!map[ip]) {
            map[ip] = {
                ip,
                country: threat.country || "Unknown",
                attacks: 0,
                type: threat.type || "Attack",
                severity: threat.severity || "medium",
            };
        }
        map[ip].attacks += 1;
    });
    return Object.values(map).sort((a, b) => b.attacks - a.attacks).slice(0, 5);
}

/* ───────────────  SEVERITY & STATUS CONFIG  ─────────────── */
const sevConfig = {
    critical: { color: "text-rose-300", bg: "bg-rose-500/20", border: "border-rose-500/30", dot: "bg-rose-400" },
    high: { color: "text-orange-300", bg: "bg-orange-500/20", border: "border-orange-500/30", dot: "bg-orange-400" },
    medium: { color: "text-amber-300", bg: "bg-amber-500/20", border: "border-amber-500/30", dot: "bg-amber-400" },
};

const deviceTypeThemes = {
    router: {
        bg: "bg-violet-950/40",
        border: "border-violet-400/50",
        glow: "shadow-[0_0_20px_rgba(139,92,246,0.35)]",
        badgeBg: "bg-violet-500/20 text-violet-300 border-violet-500/40",
        text: "text-violet-300",
        stroke: "#8B5CF6",
        label: "GATEWAY",
    },
    gateway: {
        bg: "bg-cyan-950/40",
        border: "border-cyan-400/50",
        glow: "shadow-[0_0_20px_rgba(6,182,212,0.35)]",
        badgeBg: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40",
        text: "text-cyan-300",
        stroke: "#06B6D4",
        label: "GATEWAY",
    },
    esp32: {
        bg: "bg-orange-950/40",
        border: "border-orange-400/50",
        glow: "shadow-[0_0_18px_rgba(249,115,22,0.4)]",
        badgeBg: "bg-orange-500/20 text-orange-300 border-orange-500/40",
        text: "text-orange-300",
        stroke: "#F97316",
        label: "ESP32",
    },
    raspberry: {
        bg: "bg-emerald-950/40",
        border: "border-emerald-400/50",
        glow: "shadow-[0_0_18px_rgba(16,185,129,0.35)]",
        badgeBg: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
        text: "text-emerald-300",
        stroke: "#10B981",
        label: "R-PI",
    },
    desktop: {
        bg: "bg-cyan-950/40",
        border: "border-cyan-400/50",
        glow: "shadow-[0_0_18px_rgba(6,182,212,0.35)]",
        badgeBg: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40",
        text: "text-cyan-300",
        stroke: "#06B6D4",
        label: "HOST-PC",
    },
    laptop: {
        bg: "bg-blue-950/40",
        border: "border-blue-400/50",
        glow: "shadow-[0_0_18px_rgba(59,130,246,0.35)]",
        badgeBg: "bg-blue-500/20 text-blue-300 border-blue-500/40",
        text: "text-blue-300",
        stroke: "#3B82F6",
        label: "LAPTOP",
    },
    phone: {
        bg: "bg-fuchsia-950/40",
        border: "border-fuchsia-400/50",
        glow: "shadow-[0_0_18px_rgba(217,70,239,0.35)]",
        badgeBg: "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40",
        text: "text-fuchsia-300",
        stroke: "#D946EF",
        label: "PHONE",
    },
    camera: {
        bg: "bg-rose-950/40",
        border: "border-rose-400/50",
        glow: "shadow-[0_0_18px_rgba(244,63,94,0.35)]",
        badgeBg: "bg-rose-500/20 text-rose-300 border-rose-500/40",
        text: "text-rose-300",
        stroke: "#F43F5E",
        label: "CAMERA",
    },
    sensor: {
        bg: "bg-teal-950/40",
        border: "border-teal-400/50",
        glow: "shadow-[0_0_18px_rgba(20,184,166,0.35)]",
        badgeBg: "bg-teal-500/20 text-teal-300 border-teal-500/40",
        text: "text-teal-300",
        stroke: "#14B8A6",
        label: "SENSOR",
    },
    server: {
        bg: "bg-indigo-950/40",
        border: "border-indigo-400/50",
        glow: "shadow-[0_0_18px_rgba(99,102,241,0.35)]",
        badgeBg: "bg-indigo-500/20 text-indigo-300 border-indigo-500/40",
        text: "text-indigo-300",
        stroke: "#6366F1",
        label: "SERVER",
    },
};

function getDeviceTheme(typeStr) {
    const key = (typeStr || "").toLowerCase().trim();
    return deviceTypeThemes[key] || deviceTypeThemes.laptop;
}

/* ───────────────────  RICH SVG DEVICE ICONS  ─────────────────── */
const DeviceIcon = ({ type, className = "w-6 h-6" }) => {
    const t = (type || "").toLowerCase();

    if (t.includes("router") || t.includes("gateway")) {
        return (
            <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
                <rect x="2" y="14" width="20" height="7" rx="2" fill="currentColor" fillOpacity="0.1" />
                <path strokeLinecap="round" d="M6 14V6m12 8V6M12 14V3" />
                <circle cx="6" cy="5" r="1.5" fill="currentColor" />
                <circle cx="18" cy="5" r="1.5" fill="currentColor" />
                <circle cx="12" cy="3" r="1.5" fill="currentColor" />
                <circle cx="6" cy="17.5" r="1" fill="currentColor" />
                <circle cx="10" cy="17.5" r="1" fill="currentColor" />
                <circle cx="14" cy="17.5" r="1" fill="currentColor" />
                <circle cx="18" cy="17.5" r="1" fill="currentColor" />
            </svg>
        );
    }

    if (t.includes("esp32") || t.includes("esp8266") || t.includes("arduino")) {
        return (
            <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
                <rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor" fillOpacity="0.15" />
                <rect x="8" y="8" width="8" height="8" rx="1" strokeWidth={1.3} fill="currentColor" fillOpacity="0.2" />
                {/* Microcontroller pins */}
                <path strokeLinecap="round" d="M1 9h3m-3 3h3m-3 3h3M20 9h3m-3 3h3m-3 3h3M9 1v3m3-3v3m3-3v3M9 20v3m3-3v3m3-3v3" />
                <circle cx="12" cy="12" r="1.5" fill="currentColor" />
            </svg>
        );
    }

    if (t.includes("raspberry") || t.includes("pi")) {
        return (
            <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
                <rect x="3" y="4" width="18" height="16" rx="2.5" fill="currentColor" fillOpacity="0.15" />
                <rect x="6" y="7" width="5" height="5" rx="1" fill="currentColor" fillOpacity="0.25" />
                <rect x="13" y="7" width="5" height="3" rx="0.5" />
                <rect x="13" y="12" width="5" height="5" rx="0.5" />
                <circle cx="6.5" cy="16" r="1" fill="currentColor" />
                <circle cx="9.5" cy="16" r="1" fill="currentColor" />
            </svg>
        );
    }

    if (t.includes("desktop") || t.includes("host") || t.includes("workstation")) {
        return (
            <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
                <rect x="3" y="3" width="18" height="13" rx="2" fill="currentColor" fillOpacity="0.1" />
                <path strokeLinecap="round" d="M8 21h8M12 16v5" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 8l2 2-2 2m4 0h3" strokeWidth={1.5} />
            </svg>
        );
    }

    if (t.includes("laptop")) {
        return (
            <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
                <rect x="4" y="4" width="16" height="11" rx="1.5" fill="currentColor" fillOpacity="0.1" />
                <path strokeLinecap="round" d="M2 19h20M7 19v-2m10 2v-2" />
                <circle cx="12" cy="9.5" r="1.5" fill="currentColor" />
            </svg>
        );
    }

    if (t.includes("phone") || t.includes("mobile") || t.includes("android") || t.includes("iphone")) {
        return (
            <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
                <rect x="6" y="2" width="12" height="20" rx="3" fill="currentColor" fillOpacity="0.1" />
                <path strokeLinecap="round" d="M11 5h2M12 18.5h.01" />
                <circle cx="12" cy="18.5" r="1" fill="currentColor" />
            </svg>
        );
    }

    if (t.includes("camera")) {
        return (
            <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" fill="currentColor" fillOpacity="0.1" />
            </svg>
        );
    }

    if (t.includes("sensor") || t.includes("servo") || t.includes("humidity")) {
        return (
            <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
                <circle cx="12" cy="12" r="3" fill="currentColor" />
                <path strokeLinecap="round" d="M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0" />
            </svg>
        );
    }

    // Default Server / Device
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
            <rect x="3" y="4" width="18" height="6" rx="1.5" fill="currentColor" fillOpacity="0.1" />
            <rect x="3" y="14" width="18" height="6" rx="1.5" fill="currentColor" fillOpacity="0.1" />
            <circle cx="7" cy="7" r="1" fill="currentColor" />
            <circle cx="7" cy="17" r="1" fill="currentColor" />
            <path strokeLinecap="round" d="M12 7h5M12 17h5" />
        </svg>
    );
};

/* ───────────────────  ICONS  ─────────────────── */
const icons = {
    wifi: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 0 1 1.06 0Z" /></svg>,
    shield: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" /></svg>,
    bolt: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" /></svg>,
    server: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 0 1-3-3m3 3a3 3 0 1 0 0 6h13.5a3 3 0 1 0 0-6m-16.5-3a3 3 0 0 1 3-3h13.5a3 3 0 0 1 3 3m-19.5 0a4.5 4.5 0 0 1 .9-2.7L5.737 5.1a3.375 3.375 0 0 1 2.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 0 1 .9 2.7m0 0a3 3 0 0 1-3 3m0 3h.008v.008h-.008v-.008Zm0-6h.008v.008h-.008v-.008Zm-3 6h.008v.008h-.008v-.008Zm0-6h.008v.008h-.008v-.008Z" /></svg>,
    scan: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg>,
    chart: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>,
    terminal: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m6.75 7.5 3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0 0 21 18V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v12a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>,
    triangle: <svg className="w-4 h-4 relative -top-[1px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5l-9 15h18l-9-15z" /></svg>,
    refresh: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>,
};

/* ───────────────────  WAVE CHART COMPONENT  ─────────────────── */
const WaveChart = ({ data, color, gradientFrom, gradientTo, label }) => {
    const rawNumbers = Array.isArray(data) 
        ? data.map(d => (typeof d === "number" ? d : Number(d?.value) || 0))
        : [];

    if (!rawNumbers || rawNumbers.length === 0) {
        return (
            <div className="flex flex-col gap-2">
                <div className="flex justify-between text-[10px] items-end px-1">
                    <span className="font-mono text-white/50 tracking-white font-bold">{label}</span>
                    <span className="text-white font-mono leading-none flex items-center gap-1.5"><span className="text-[14px]">0.00</span> GB/s</span>
                </div>
                <div className="relative h-16 w-full pt-2 flex items-center justify-center">
                    <span className="text-white/20 text-xs font-mono">Telemetry initializing...</span>
                </div>
            </div>
        );
    }

    const maxX = Math.max(1, rawNumbers.length - 1);
    const maxVal = Math.max(...rawNumbers, 1);
    const minVal = Math.min(...rawNumbers, 0);
    const range = maxVal - minVal || 1;

    const points = rawNumbers.map((val, i) => {
        const x = (i / maxX) * 100;
        const y = 30 - ((val - minVal) / range) * 30;
        return `${x},${y}`;
    });

    const pathD = `M 0,${30 - ((rawNumbers[0] - minVal) / range) * 30} ` + points.map((p, i) => {
        if (i === 0) return "";
        const prev = points[i - 1].split(",");
        const curr = p.split(",");
        const cp1x = parseFloat(prev[0]) + (parseFloat(curr[0]) - parseFloat(prev[0])) / 2;
        return `C ${cp1x},${prev[1]} ${cp1x},${curr[1]} ${curr[0]},${curr[1]}`;
    }).join(" ");

    const areaD = `${pathD} L 100,30 L 0,30 Z`;

    const lastValue = rawNumbers[rawNumbers.length - 1] || 0;
    const cyValue = 30 - ((lastValue - minVal) / range) * 30;
    const displayValue = (lastValue * 0.02).toFixed(2);

    return (
        <div className="flex flex-col gap-2">
            <div className="flex justify-between text-[10px] items-end px-1">
                <span className="font-mono text-white/50 tracking-white font-bold">{label}</span>
                <span className="text-white font-mono leading-none flex items-center gap-1.5"><span className="text-[14px] font-bold text-cyan-300">{displayValue}</span> GB/s</span>
            </div>
            <div className="relative h-16 w-full pt-2">
                <svg viewBox="0 0 100 30" className="w-full h-full overflow-visible preserve-aspect-ratio-none" preserveAspectRatio="none">
                    <defs>
                        <linearGradient id={`grad-${label}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={gradientFrom} stopOpacity="0.4" />
                            <stop offset="100%" stopColor={gradientTo} stopOpacity="0.0" />
                        </linearGradient>
                    </defs>
                    <path d={areaD} fill={`url(#grad-${label})`} />
                    <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" className="drop-shadow-[0_0_5px_currentColor]" />
                    <circle cx="100" cy={cyValue} r="2" fill={color} className="animate-pulse shadow-[0_0_10px_currentColor]" />
                </svg>
                <div className="absolute top-0 bottom-0 left-0 w-full overflow-hidden pointer-events-none opacity-20">
                    <div className="w-1 h-full bg-white animate-[slideRight_3s_linear_infinite]" style={{boxShadow: "0 0 15px 5px white"}}></div>
                </div>
            </div>
        </div>
    );
};

/* ───────────────────  MAIN COMPONENT  ─────────────────── */
export default function NetworkPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const highlightIp = searchParams.get('highlight_ip');
    
    // Interactive state
    const [hoveredNode, setHoveredNode] = useState(null);
    const [filterCategory, setFilterCategory] = useState("all");
    const [isScanning, setIsScanning] = useState(false);
    
    // Real data state
    const [networkDevices, setNetworkDevices] = useState([]);
    const [topologyLinks, setTopologyLinks] = useState([]);
    const [suspiciousIPs, setSuspiciousIPs] = useState([]);
    const [networkLogs, setNetworkLogs] = useState([]);
    const [trafficData, setTrafficData] = useState({ incoming: [], outgoing: [] });
    const [networkInfo, setNetworkInfo] = useState({ local_ip: "...", gateway_ip: "...", subnet_cidr: "...", interface: "Wi-Fi" });
    const [stats, setStats] = useState({
        activeNodes: 0,
        detectedThreats: 0,
        avgBandwidth: 0,
        systemUptime: "99.9",
        totalPackets: 0,
        avgLatency: 0,
    });

    const lastTopologyHashRef = useRef("");

    const fetchTopologyData = async () => {
        try {
            const data = await fetchApiJson("/api/network/topology");
            const rawNodes = data?.nodes || data?.topology?.nodes;
            const rawLinks = data?.links || data?.topology?.links;
            const rawStats = data?.stats || data?.topology?.stats;

            if (rawNodes && rawLinks) {
                const nodes = rawNodes.map((node, idx) => ({
                    id: node.id || node.device_id || `node_${idx}`,
                    name: node.name || `Node ${idx}`,
                    type: node.type || "Workstation",
                    ip: node.ip || "0.0.0.0",
                    mac: node.mac || "N/A",
                    status: node.status || "online",
                    role: node.role || "node",
                    threatScore: node.threat_score ?? node.threatScore ?? 0,
                    latency: node.latency || 12,
                    bandwidth_mbps: node.bandwidth_mbps || 100,
                    lastActivity: node.last_activity || node.lastActivity || "Just now",
                    x: node.x ?? (50 + 25 * Math.cos((idx / rawNodes.length) * 2 * Math.PI)),
                    y: node.y ?? (48 + 25 * Math.sin((idx / rawNodes.length) * 2 * Math.PI)),
                }));

                const links = rawLinks.map((link, idx) => ({
                    id: link.id || `link_${idx}`,
                    from: link.from || link.source,
                    to: link.to || link.target,
                    flows: link.flows || 1,
                    suspicious: Boolean(link.suspicious),
                }));

                const hash = JSON.stringify(nodes.map(n => [n.id, n.status, n.threatScore, n.ip])) + JSON.stringify(links.map(l => [l.id, l.suspicious, l.flows]));
                if (hash !== lastTopologyHashRef.current) {
                    lastTopologyHashRef.current = hash;
                    setNetworkDevices(nodes);
                    setTopologyLinks(links);
                }

                if (rawStats) {
                    setStats((prev) => ({
                        ...prev,
                        activeNodes: rawStats.total_nodes || rawStats.active_node_count || rawNodes.length,
                        detectedThreats: rawStats.suspicious_links || 0,
                        avgBandwidth: rawStats.avg_flow || 450,
                    }));
                }
            }
        } catch (error) {
            console.error("Failed to fetch topology:", error);
        }
    };

    const fetchNetworkInfo = async () => {
        try {
            const data = await fetchApiJson("/api/network/info");
            if (data && data.local_ip) {
                setNetworkInfo(data);
            }
        } catch (e) {}
    };

    const handleRescan = async () => {
        setIsScanning(true);
        try {
            await fetch("/api/devices/rescan", { method: "POST" });
            await fetchTopologyData();
            await fetchNetworkInfo();
        } catch (e) {
            console.error("Rescan failed", e);
        } finally {
            setTimeout(() => setIsScanning(false), 900);
        }
    };

    // Clean stable interval for topology sync (4s)
    useEffect(() => {
        fetchTopologyData();
        fetchNetworkInfo();
        const interval = setInterval(() => {
            fetchTopologyData();
            fetchNetworkInfo();
        }, 4000);

        return () => {
            clearInterval(interval);
        };
    }, []);

    // Fetch traffic data
    useEffect(() => {
        const fetch = async () => {
            try {
                const data = await fetchApiJson("/api/network/traffic");
                if (data && data.incoming && data.outgoing) {
                    setTrafficData({
                        incoming: data.incoming,
                        outgoing: data.outgoing,
                    });
                    if (data.avgBandwidth !== undefined) {
                        setStats((prev) => ({ ...prev, avgBandwidth: data.avgBandwidth }));
                    }
                    if (data.totalPacketsPerSec !== undefined) {
                        setStats((prev) => ({
                            ...prev,
                            totalPackets: data.totalPacketsPerSec,
                            avgLatency: data.avgLatencyMs || 0,
                        }));
                    }
                }
            } catch (error) {
                console.error("Failed to fetch traffic:", error);
            }
        };
        fetch();
        const interval = setInterval(fetch, 5000);
        return () => clearInterval(interval);
    }, []);

    // Fetch network logs
    useEffect(() => {
        const fetch = async () => {
            try {
                const data = await fetchApiJson("/api/network/logs?limit=10");
                if (Array.isArray(data) && data.length > 0) {
                    setNetworkLogs(data);
                }
            } catch (error) {
                console.error("Failed to fetch logs:", error);
            }
        };
        fetch();
        const interval = setInterval(fetch, 3000);
        return () => clearInterval(interval);
    }, []);

    // Fetch threat locations for suspicious IPs
    useEffect(() => {
        const fetch = async () => {
            try {
                const data = await fetchApiJson("/api/threat-locations");
                if (Array.isArray(data)) {
                    const aggregated = aggregateThreatsByIP(data);
                    setSuspiciousIPs(aggregated);
                }
            } catch (error) {
                console.error("Failed to fetch threat locations:", error);
            }
        };
        fetch();
        const interval = setInterval(fetch, 10000);
        return () => clearInterval(interval);
    }, []);

    // Filtered Devices for Display
    const displayedDevices = networkDevices.filter(d => {
        if (filterCategory === "threats") return d.threatScore > 30 || d.status === "blocked";
        if (filterCategory === "iot") return ["esp32", "raspberry", "sensor", "camera"].includes((d.type || '').toLowerCase());
        if (filterCategory === "hosts") return ["desktop", "laptop", "phone", "router", "gateway", "server"].includes((d.type || '').toLowerCase());
        return true;
    });

    const cV = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.1 } } };
    const iV = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 200, damping: 20 } } };

    return (
        <div className="min-h-screen w-full bg-[#030308] text-white relative overflow-x-hidden pt-28 pb-16 px-4 md:px-8 xl:px-12 flex justify-center font-sans tracking-wide">
            {/* Background Grid & Cyber Glow */}
            <div className="absolute inset-0 z-0 opacity-[0.03]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='69.282' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M40 17.32l-20 11.547L0 17.32V0h40v17.32zm0 34.64l-20 11.548L0 51.96V34.64l20 11.548 20-11.548v17.32z' fill='%23ffffff' fill-opacity='1' fill-rule='evenodd'/%3E%3C/svg%3E")` }}></div>
            <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-violet-600 opacity-[0.04] blur-[150px] rounded-full pointer-events-none"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] bg-cyan-600 opacity-[0.05] blur-[150px] rounded-full pointer-events-none"></div>

            <motion.div className="w-full max-w-[1400px] z-10 flex flex-col gap-6" variants={cV} initial="hidden" animate="show">
                {/* Header Bar */}
                <motion.div variants={iV} className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/10 pb-4">
                    <div>
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-400/30 text-cyan-400">
                                {icons.server}
                            </div>
                            <h1 className="text-3xl lg:text-4xl font-black bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-400 text-transparent bg-clip-text">NETWORK_TOPOLOGY</h1>
                        </div>
                        <p className="text-white/40 text-xs font-mono uppercase tracking-[0.2em] mt-2 border-l-2 border-cyan-500 pl-3 ml-1 block">
                            Real-Time Zero-Trust Mesh & Device Inspector
                        </p>
                    </div>

                    {/* Subnet HUD & Rescan */}
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="bg-white/5 border border-white/10 px-3.5 py-1.5 rounded-xl flex items-center gap-2.5 font-mono text-xs">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#10B981]"></span>
                            <span className="text-white/50">SUBNET:</span>
                            <span className="text-cyan-300 font-bold">{networkInfo.subnet_cidr || "Scanning..."}</span>
                        </div>

                        <button
                            onClick={handleRescan}
                            disabled={isScanning}
                            className={`flex items-center gap-2 px-4 py-1.5 rounded-xl border font-mono text-xs uppercase tracking-wider font-bold transition-all shadow-lg cursor-pointer ${
                                isScanning
                                    ? "bg-cyan-500/20 border-cyan-400/50 text-cyan-300 animate-pulse cursor-wait"
                                    : "bg-cyan-500/10 hover:bg-cyan-500/20 border-cyan-500/30 hover:border-cyan-400 text-cyan-400 hover:text-white"
                            }`}
                        >
                            <span className={`${isScanning ? "animate-spin" : ""}`}>{icons.refresh}</span>
                            <span>{isScanning ? "Probing..." : "Scan Subnet"}</span>
                        </button>
                    </div>
                </motion.div>

                {/* Metric Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                        { label: "Active Nodes", val: stats.activeNodes, sub: "Online in Mesh", icon: icons.server, color: "text-cyan-400", hex: "#06B6D4" },
                        { label: "Threat Index", val: stats.detectedThreats, sub: "Suspicious Links", icon: icons.shield, color: "text-rose-400", hex: "#F43F5E" },
                        { label: "Avg Bandwidth", val: `${stats.avgBandwidth}`, sub: "MB/s Total Flow", icon: icons.bolt, color: "text-violet-400", hex: "#8B5CF6" },
                        { label: "Subnet Health", val: `${stats.systemUptime}%`, sub: "Zero-Trust Active", icon: icons.wifi, color: "text-emerald-400", hex: "#10B981" },
                    ].map((card, i) => (
                        <motion.div key={i} variants={iV} className="relative group overflow-hidden border border-white/10 rounded-2xl bg-black/40 backdrop-blur-md p-4 flex flex-col justify-between">
                            <div className="absolute inset-0 bg-gradient-to-br opacity-20 group-hover:opacity-40 transition-opacity duration-500" style={{ backgroundImage: `linear-gradient(to bottom right, ${card.hex}44, transparent)` }}></div>
                            <div className="flex justify-between items-start mb-2 relative z-10">
                                <span className={`text-[10px] font-mono tracking-[0.15em] uppercase font-bold ${card.color}`}>{card.label}</span>
                                <div className="opacity-60">{card.icon}</div>
                            </div>
                            <div className="flex items-baseline gap-2 relative z-10">
                                <span className="text-3xl font-black text-white">{card.val}</span>
                                <span className="text-[10px] text-white/40 font-mono uppercase">{card.sub}</span>
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* Main Visualizer & Flow Analytics */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* TOPOLOGY CANVAS */}
                    <motion.div variants={iV} className="lg:col-span-2 border border-white/15 bg-black/60 rounded-3xl relative overflow-hidden flex flex-col min-h-[540px] shadow-2xl backdrop-blur-xl">
                        {/* Corner Cyber Accents */}
                        <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-cyan-400/60 rounded-tl-3xl pointer-events-none"></div>
                        <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-cyan-400/60 rounded-tr-3xl pointer-events-none"></div>
                        <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-cyan-400/60 rounded-bl-3xl pointer-events-none"></div>
                        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-cyan-400/60 rounded-br-3xl pointer-events-none"></div>

                        {/* Topology Toolbar */}
                        <div className="px-6 py-4 border-b border-white/10 flex flex-wrap justify-between items-center bg-white/[0.02] gap-3 relative z-30">
                            <div className="flex items-center gap-3">
                                <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                                    {icons.scan}
                                </div>
                                <span className="text-white font-mono text-sm tracking-[0.18em] font-bold">TOPOLOGY_RADAR</span>
                                <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-mono font-bold">
                                    {displayedDevices.length} NODES
                                </span>
                            </div>

                            {/* Filter Chips */}
                            <div className="flex items-center gap-2 text-xs font-mono">
                                {[
                                    { id: "all", label: "ALL" },
                                    { id: "iot", label: "IOT & EMBEDDED" },
                                    { id: "hosts", label: "HOSTS & PHONES" },
                                    { id: "threats", label: "THREATS" },
                                ].map((f) => (
                                    <button
                                        key={f.id}
                                        onClick={() => setFilterCategory(f.id)}
                                        className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold uppercase transition-all cursor-pointer ${
                                            filterCategory === f.id
                                                ? "bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.3)]"
                                                : "bg-white/5 border-white/10 text-white/50 hover:text-white hover:border-white/20"
                                        }`}
                                    >
                                        {f.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Interactive Canvas */}
                        <div className="flex-1 relative w-full h-full bg-[#050512] overflow-hidden min-h-[460px]">
                            {/* Cyber Background Grid */}
                            <svg className="absolute inset-0 w-full h-full opacity-15 pointer-events-none" xmlns="http://www.w3.org/2000/svg">
                                <defs>
                                    <pattern id="tgrid" width="40" height="40" patternUnits="userSpaceOnUse">
                                        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#00E5FF" strokeWidth="0.5" strokeDasharray="1 3"/>
                                    </pattern>
                                </defs>
                                <rect width="100%" height="100%" fill="url(#tgrid)" />
                            </svg>

                            {/* Concentric Radar Orbits */}
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="w-[32%] h-[32%] rounded-full border border-cyan-500/15 animate-pulse-ring"></div>
                                <div className="w-[60%] h-[60%] rounded-full border border-cyan-500/10 border-dashed"></div>
                                <div className="w-[84%] h-[84%] rounded-full border border-cyan-500/5"></div>
                                {/* 360 Radar Sweep Beam */}
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="w-[84%] h-[84%] rounded-full animate-radar-sweep pointer-events-none overflow-hidden opacity-30">
                                        <div className="w-1/2 h-1/2 bg-gradient-to-br from-cyan-400/20 via-transparent to-transparent origin-bottom-right transform rotate-45"></div>
                                    </div>
                                </div>
                            </div>

                            {/* Dynamic SVG Links with Live Particle Pulses */}
                            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                                {topologyLinks.map((link) => {
                                    const from = networkDevices.find(d => d.id === link.from);
                                    const to = networkDevices.find(d => d.id === link.to);
                                    if (!from || !to) return null;

                                    const strokeColor = link.suspicious ? "#F43F5E" : "#06B6D4";
                                    const pathD = `M ${from.x} ${from.y} C ${from.x} ${(from.y + to.y) / 2}, ${to.x} ${(from.y + to.y) / 2}, ${to.x} ${to.y}`;

                                    return (
                                        <g key={link.id}>
                                            {/* Link Path */}
                                            <path
                                                id={`path-${link.id}`}
                                                d={pathD}
                                                fill="none"
                                                stroke={strokeColor}
                                                strokeWidth="1.2"
                                                strokeDasharray={link.suspicious ? "3 3" : "none"}
                                                opacity={link.suspicious ? 0.85 : 0.35}
                                            />
                                            {/* Animated Data Pulses */}
                                            {Array.from({ length: Math.max(1, link.flows) }).map((_, i) => (
                                                <circle
                                                    key={i}
                                                    r="1.2"
                                                    fill={strokeColor}
                                                    className={link.suspicious ? "drop-shadow-[0_0_6px_#F43F5E]" : "drop-shadow-[0_0_6px_#06B6D4]"}
                                                >
                                                    <animateMotion dur={`${2.2 + (i * 0.4)}s`} repeatCount="indefinite" begin={`${i * 0.6}s`}>
                                                        <mpath href={`#path-${link.id}`} />
                                                    </animateMotion>
                                                </circle>
                                            ))}
                                        </g>
                                    );
                                })}
                            </svg>

                            {/* REDESIGNED TOPOGRAPHY DEVICE NODES */}
                            {displayedDevices.map((device) => {
                                const theme = getDeviceTheme(device.type);
                                const isThreat = device.threatScore > 30 || device.status === "blocked";
                                const isGateway = (device.type || "").toLowerCase().includes("router") || (device.type || "").toLowerCase().includes("gateway");
                                const isEsp32 = (device.type || "").toLowerCase().includes("esp32");
                                const isRaspberry = (device.type || "").toLowerCase().includes("raspberry");
                                const isHovered = hoveredNode === device.id;

                                return (
                                    <motion.div
                                        key={device.id}
                                        className="absolute cursor-pointer flex flex-col items-center group/node z-20"
                                        style={{ left: `${device.x}%`, top: `${device.y}%` }}
                                        initial={{ x: "-50%", y: "-50%", scale: 1 }}
                                        animate={{ x: "-50%", y: "-50%", scale: isHovered ? 1.15 : 1 }}
                                        transition={{ type: "spring", stiffness: 300, damping: 25 }}
                                        onMouseEnter={() => setHoveredNode(device.id)}
                                        onMouseLeave={() => setHoveredNode(null)}
                                        onClick={() => router.push(`/devices?filter=${encodeURIComponent(device.name)}`)}
                                    >
                                        {/* Cyber Outer Ring / Aura */}
                                        <div className="relative flex items-center justify-center">
                                            {/* Threat / Active Pulsing Outer Halos */}
                                            {isThreat && (
                                                <div className="absolute -inset-2 rounded-2xl border-2 border-rose-500/80 animate-ping pointer-events-none"></div>
                                            )}
                                            {isGateway && (
                                                <div className="absolute -inset-2 rounded-3xl border border-cyan-400/40 animate-pulse pointer-events-none"></div>
                                            )}

                                            {/* Redesigned Futuristic Node Card */}
                                            <div
                                                className={`relative flex items-center justify-center ${
                                                    isGateway ? "w-20 h-20" : "w-16 h-16"
                                                } rounded-2xl border-2 ${
                                                    isThreat
                                                        ? "bg-rose-950/60 border-rose-500 shadow-[0_0_25px_rgba(244,63,94,0.5)]"
                                                        : `${theme.bg} ${theme.border} ${theme.glow}`
                                                } backdrop-blur-xl transition-all duration-300 group-hover/node:border-cyan-300 group-hover/node:shadow-[0_0_25px_rgba(6,182,212,0.6)]`}
                                            >
                                                {/* Cyber Corner Bevels */}
                                                <div className="absolute top-1 left-1 w-1.5 h-1.5 border-t border-l border-white/40"></div>
                                                <div className="absolute bottom-1 right-1 w-1.5 h-1.5 border-b border-r border-white/40"></div>

                                                {/* Status Indicator Dot */}
                                                <div className="absolute -top-1 -right-1 flex items-center justify-center">
                                                    <span
                                                        className={`w-3 h-3 rounded-full ${
                                                            isThreat
                                                                ? "bg-rose-500 animate-ping shadow-[0_0_8px_#F43F5E]"
                                                                : device.status === "offline"
                                                                ? "bg-gray-500"
                                                                : "bg-emerald-400 animate-pulse shadow-[0_0_8px_#10B981]"
                                                        }`}
                                                    ></span>
                                                </div>

                                                {/* Rich Dedicated Device Icon */}
                                                <div
                                                    className={`transition-transform duration-300 group-hover/node:scale-110 ${
                                                        isThreat ? "text-rose-400" : theme.text
                                                    }`}
                                                >
                                                    <DeviceIcon type={device.type} className={isGateway ? "w-9 h-9" : "w-7 h-7"} />
                                                </div>

                                                {/* Offline Overlay */}
                                                {device.status === "offline" && (
                                                    <div className="absolute inset-0 bg-black/85 rounded-2xl flex items-center justify-center">
                                                        <span className="text-[10px] font-mono text-white/60 font-bold">OFF</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Bottom Monospace Name & IP Badge */}
                                        <div className="mt-1.5 flex flex-col items-center bg-black/90 backdrop-blur-md px-3 py-1 rounded-xl border border-white/15 shadow-xl group-hover/node:border-cyan-400/60 group-hover/node:bg-black transition-all max-w-[140px]">
                                            <div className="flex items-center gap-1.5 w-full justify-center">
                                                <span className={`text-[9px] font-mono font-black px-1 rounded uppercase tracking-wider ${theme.badgeBg}`}>
                                                    {theme.label}
                                                </span>
                                            </div>
                                            <span className="text-xs font-mono text-white font-bold truncate w-full text-center group-hover/node:text-cyan-300">
                                                {device.name}
                                            </span>
                                            <span className="text-[10px] font-mono text-emerald-400/80 font-bold tracking-tight">
                                                {device.ip}
                                            </span>
                                        </div>

                                        {/* EXPANDED HOLOGRAPHIC INSPECTOR TOOLTIP ON HOVER */}
                                        <AnimatePresence>
                                            {isHovered && (
                                                <motion.div
                                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                                    exit={{ opacity: 0, y: 5, scale: 0.95 }}
                                                    transition={{ duration: 0.15 }}
                                                    className="absolute bottom-[calc(100%+12px)] w-56 bg-black/95 border border-cyan-400/50 rounded-2xl p-3.5 shadow-[0_0_30px_rgba(6,182,212,0.3)] backdrop-blur-2xl pointer-events-none z-50 flex flex-col gap-2"
                                                >
                                                    <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                                                        <span className="text-[11px] font-mono font-bold text-white truncate max-w-[140px]">
                                                            {device.name}
                                                        </span>
                                                        <span className={`text-[9px] font-mono font-black px-1.5 py-0.5 rounded uppercase ${
                                                            isThreat ? "bg-rose-500/20 text-rose-300 border border-rose-500/40" : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                                                        }`}>
                                                            {device.status}
                                                        </span>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono text-white/70">
                                                        <div>
                                                            <span className="text-white/40 block text-[8px] uppercase">IP Address</span>
                                                            <span className="text-cyan-300 font-bold">{device.ip}</span>
                                                        </div>
                                                        <div>
                                                            <span className="text-white/40 block text-[8px] uppercase">Latency</span>
                                                            <span className="text-emerald-400 font-bold">⚡ {device.latency || 12}ms</span>
                                                        </div>
                                                        <div className="col-span-2">
                                                            <span className="text-white/40 block text-[8px] uppercase">MAC Address</span>
                                                            <span className="text-white/80 font-bold">{device.mac || "N/A"}</span>
                                                        </div>
                                                    </div>

                                                    <div className="pt-1.5 border-t border-white/10 flex items-center justify-between text-[9px] font-mono text-cyan-400">
                                                        <span>Click to inspect</span>
                                                        <span>→</span>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </motion.div>
                                );
                            })}
                        </div>

                        {/* Canvas Legend */}
                        <div className="px-6 py-3 border-t border-white/10 bg-white/[0.01] flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-white/60">
                            <div className="flex flex-wrap items-center gap-4 text-[11px]">
                                <span className="flex items-center gap-1.5">
                                    <div className="w-2.5 h-2.5 rounded-full bg-violet-400 shadow-[0_0_6px_#8B5CF6]"></div> Gateway
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <div className="w-2.5 h-2.5 rounded-full bg-orange-400 shadow-[0_0_6px_#F97316]"></div> ESP32
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#10B981]"></div> RPi
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#06B6D4]"></div> Host PC
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <div className="w-2.5 h-2.5 rounded-full bg-fuchsia-400 shadow-[0_0_6px_#D946EF]"></div> Mobile
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <div className="w-2.5 h-2.5 rounded-full bg-rose-400 animate-ping shadow-[0_0_6px_#F43F5E]"></div> Threat / Isolated
                                </span>
                            </div>
                            <span className="text-[10px] text-white/40">Real-Time Subnet Telemetry</span>
                        </div>
                    </motion.div>

                    {/* FLOW ANALYTICS */}
                    <motion.div variants={iV} className="border border-white/15 bg-black/40 rounded-3xl p-5 flex flex-col justify-between backdrop-blur-xl shadow-xl">
                        <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                            <div className="p-1.5 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/30">
                                {icons.chart}
                            </div>
                            <span className="text-white font-mono text-sm tracking-[0.18em] font-bold">FLOW_ANALYTICS</span>
                        </div>

                        <div className="flex flex-col gap-6 my-4">
                            <WaveChart data={trafficData.incoming} color="#06B6D4" gradientFrom="#06B6D4" gradientTo="#0891B2" label="[IN_BOUND_FLOW]" />
                            <WaveChart data={trafficData.outgoing} color="#8B5CF6" gradientFrom="#8B5CF6" gradientTo="#6D28D9" label="[OUT_BOUND_FLOW]" />
                        </div>

                        <div className="grid grid-cols-2 gap-3 pt-2">
                            <div className="bg-white/5 border border-white/10 p-3.5 rounded-2xl flex flex-col items-end">
                                <span className="text-[9px] font-mono uppercase text-white/40 mb-1">Total Packets</span>
                                <span className="font-mono text-xl font-black text-cyan-300">
                                    {stats.totalPackets.toFixed ? stats.totalPackets.toFixed(1) : stats.totalPackets}
                                    <span className="text-xs text-white/50 font-normal ml-1">K/s</span>
                                </span>
                            </div>
                            <div className="bg-white/5 border border-white/10 p-3.5 rounded-2xl flex flex-col items-end">
                                <span className="text-[9px] font-mono uppercase text-white/40 mb-1">Mesh Latency</span>
                                <span className="font-mono text-xl font-black text-emerald-400">
                                    {stats.avgLatency.toFixed ? stats.avgLatency.toFixed(1) : stats.avgLatency}
                                    <span className="text-xs text-white/50 font-normal ml-1">ms</span>
                                </span>
                            </div>
                        </div>
                    </motion.div>
                </div>

                {/* BOTTOM LOGS & TARGETED IPS */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-8">
                    {/* TARGETED IPS */}
                    <motion.div variants={iV} className="border border-rose-500/20 bg-[#110505]/70 rounded-3xl p-5 relative overflow-hidden backdrop-blur-xl">
                        <div className="absolute top-0 right-0 w-full h-[1px] bg-gradient-to-l from-rose-500 to-transparent"></div>
                        <div className="flex justify-between items-center border-b border-rose-500/20 pb-3 mb-3">
                            <span className="text-rose-400 font-mono text-xs font-bold tracking-[0.18em] flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></div> TARGETED_IPS
                            </span>
                        </div>
                        <div className="flex flex-col gap-2.5">
                            {suspiciousIPs.length === 0 ? (
                                <div className="p-4 text-center text-white/40 font-mono text-xs">No external threats active on mesh.</div>
                            ) : (
                                suspiciousIPs.map((ip, i) => (
                                    <div
                                        key={i}
                                        className={`flex flex-col sm:flex-row justify-between sm:items-center p-3 rounded-xl border transition-all group cursor-pointer ${
                                            highlightIp === ip.ip 
                                                ? "border-rose-400/50 bg-rose-500/[0.15] shadow-[0_0_15px_rgba(244,63,94,0.3)]" 
                                                : "border-rose-500/10 bg-rose-500/[0.02] hover:bg-rose-500/[0.08]"
                                        }`}
                                        onClick={() => router.push(`/threats?source_ip=${encodeURIComponent(ip.ip)}`)}
                                    >
                                        <div className="flex gap-3 items-center">
                                            <div className="text-2xl text-rose-400 opacity-40 group-hover:opacity-80 transition-opacity">
                                                {icons.triangle}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono text-sm text-rose-300 font-bold group-hover:text-rose-200">{ip.ip}</span>
                                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-950 border border-rose-500/50 text-rose-300 uppercase font-bold">{ip.type}</span>
                                                </div>
                                                <span className="text-[10px] text-white/40 font-mono uppercase tracking-wider">{ip.country}</span>
                                            </div>
                                        </div>
                                        <div className="flex flex-col sm:items-end mt-2 sm:mt-0">
                                            <span className="font-mono text-rose-300 font-bold text-sm">{ip.attacks}</span>
                                            <span className="text-[9px] text-rose-500/60 uppercase">Intercepted Hits</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </motion.div>

                    {/* SYS CONSOLE LOGS */}
                    <motion.div variants={iV} className="border border-white/10 bg-black/70 rounded-3xl p-5 relative flex flex-col backdrop-blur-xl">
                        <div className="flex items-center gap-2 mb-4 border-b border-white/10 pb-3">
                            <span className="text-cyan-400">{icons.terminal}</span>
                            <span className="text-white font-mono text-xs font-bold tracking-[0.18em]">SYS_CONSOLE</span>
                            <div className="ml-auto flex gap-1.5">
                                <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80"></div>
                                <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80"></div>
                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80"></div>
                            </div>
                        </div>
                        <div className="flex-1 max-h-[220px] overflow-auto pr-2 custom-scrollbar font-mono text-[11px] leading-relaxed flex flex-col gap-2">
                            {networkLogs.map((log, i) => (
                                <div key={i} className="flex items-start gap-2.5">
                                    <span className="text-white/30 shrink-0 select-none">[{log.time}]</span>
                                    <span className={`shrink-0 lowercase select-none font-bold ${log.type === "security" ? "text-rose-400" : log.type === "ai" ? "text-violet-400" : "text-cyan-400"}`}>
                                        ~/{log.type} $
                                    </span>
                                    <span className={log.type === "security" ? "text-rose-200" : "text-white/80"}>{log.msg}</span>
                                </div>
                            ))}
                            <div className="flex items-start gap-2.5 mt-2">
                                <span className="text-white/30 font-mono" suppressHydrationWarning>[{liveTimeText()}]</span>
                                <span className="text-emerald-400 lowercase font-bold">~/mesh-live $</span>
                                <span className="w-2 h-3 bg-emerald-400 animate-pulse inline-block"></span>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </motion.div>
        </div>
    );
}

function liveTimeText() {
    const d = new Date();
    return d.toLocaleTimeString("en-GB", { hour12: false });
}
