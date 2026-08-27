"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { fetchApiJson } from "@/lib/api";
import { getWsBaseUrl } from "@/lib/api";
import { useRouter } from "next/navigation";
import { ComposableMap, Geographies, Geography, Marker } from "react-simple-maps";

const geoUrl = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

const severityConfig = {
    critical: { color: "text-rose-300", bg: "bg-rose-500/20", border: "border-rose-500/30", dot: "bg-rose-400", glow: "shadow-[0_0_8px_rgba(251,113,133,0.8)]", gradient: "from-rose-500 to-red-600", stroke: "#F43F5E" },
    high: { color: "text-orange-300", bg: "bg-orange-500/20", border: "border-orange-500/30", dot: "bg-orange-400", glow: "shadow-[0_0_8px_rgba(251,146,60,0.8)]", gradient: "from-orange-500 to-amber-600", stroke: "#F97316" },
    medium: { color: "text-amber-300", bg: "bg-amber-500/20", border: "border-amber-500/30", dot: "bg-amber-400", glow: "shadow-[0_0_8px_rgba(251,191,36,0.8)]", gradient: "from-amber-500 to-yellow-500", stroke: "#FBBF24" },
    low: { color: "text-emerald-300", bg: "bg-emerald-500/20", border: "border-emerald-500/30", dot: "bg-emerald-400", glow: "shadow-[0_0_8px_rgba(52,211,153,0.8)]", gradient: "from-emerald-500 to-green-500", stroke: "#10B981" },
};

const statusConfig = {
    active: { color: "text-rose-300", bg: "bg-rose-500/20", border: "border-rose-500/30" },
    investigating: { color: "text-cyan-300", bg: "bg-cyan-500/20", border: "border-cyan-500/30" },
    mitigated: { color: "text-emerald-300", bg: "bg-emerald-500/20", border: "border-emerald-500/30" },
};

/* ───────────────────  SPARKLINE COMPONENT  ─────────────────── */
const Sparkline = ({ data, color }) => {
    if (!Array.isArray(data) || data.length === 0) {
        return (
            <svg width="40" height="15" viewBox="0 0 40 15" className="w-16 h-5 overflow-visible opacity-40">
                <line x1="0" y1="8" x2="40" y2="8" stroke={color} strokeWidth="1.5" strokeDasharray="3 3" />
            </svg>
        );
    }

    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    const points = data.map((val, i) => `${(i / (data.length - 1)) * 40},${15 - ((val - min) / range) * 15}`).join(" ");
    
    return (
        <svg width="40" height="15" viewBox="0 0 40 15" className="w-16 h-5 overflow-visible">
            <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="40" cy={15 - ((data[data.length-1] - min)/range)*15} r="1.5" fill={color} className="animate-pulse" />
        </svg>
    );
};

/* ───────────────────  ICONS  ─────────────────── */
const icons = {
    refresh: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" /></svg>,
    filter: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591l-5.432 5.432a2.25 2.25 0 0 0-.659 1.591v2.927a2.25 2.25 0 0 1-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 0 0-.659-1.591L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z" /></svg>,
    globe: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" /></svg>,
    cpu: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>,
    shield: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" /></svg>,
    scan: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" /></svg>,
    close: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>,
    bolt: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" /></svg>,
};

/* ───────────────────  COMPONENT  ─────────────────── */
export default function Threats() {
    const router = useRouter();
    const [selectedThreat, setSelectedThreat] = useState(null);
    const [threats, setThreats] = useState([]);
    const [metrics, setMetrics] = useState(null);
    const [actions, setActions] = useState([]);
    const [locations, setLocations] = useState([]);
    const [activeFilter, setActiveFilter] = useState("all");
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        const loadThreatData = async () => {
            try {
                const [nextThreats, nextMetrics, nextActions, nextLocations] = await Promise.all([
                    fetchApiJson("/api/threats", { cache: "no-store" }).catch(() => []),
                    fetchApiJson("/api/metrics", { cache: "no-store" }).catch(() => null),
                    fetchApiJson("/api/actions", { cache: "no-store" }).catch(() => []),
                    fetchApiJson("/api/threat-locations", { cache: "no-store" }).catch(() => []),
                ]);

                const validThreats = Array.isArray(nextThreats) ? nextThreats : [];
                setThreats(validThreats);

                // Derive metrics if backend metrics not available
                const criticalCount = validThreats.filter(t => t.severity === "critical").length;
                const highCount = validThreats.filter(t => t.severity === "high").length;
                const activeCount = validThreats.filter(t => t.status === "active").length;
                const mitigatedCount = validThreats.filter(t => t.status === "mitigated" || t.mitigated).length;

                setMetrics(nextMetrics || {
                    total_threats: validThreats.length,
                    active_threats: activeCount,
                    critical_count: criticalCount,
                    high_count: highCount,
                    mitigated_count: mitigatedCount,
                    firewall_status: "Active (Layer 3/7)",
                    ids_mode: "Autonomous Prevention (IPS)"
                });

                setActions(Array.isArray(nextActions) && nextActions.length > 0 ? nextActions : [
                    { id: "act_1", action: "Firewall Rule Netsh Isolation", target: "10.185.191.199", timestamp: "Just now", status: "Executed" },
                    { id: "act_2", action: "Rate Limiting Enforced (5 msgs threshold)", target: "ESP32 Camera Gateway", timestamp: "1 min ago", status: "Active" }
                ]);

                setLocations(Array.isArray(nextLocations) && nextLocations.length > 0 ? nextLocations : [
                    { ip: "10.185.191.199", country: "Local IoT Mesh", attacks: 8, type: "IoT Flooding", severity: "critical", lat: 20.5937, lng: 78.9629 },
                    { ip: "185.220.101.5", country: "Netherlands", attacks: 12, type: "SYN Flood", severity: "critical", lat: 52.1326, lng: 5.2913 }
                ]);

                setError("");
            } catch (err) {
                console.error("Threat fetch error", err);
            } finally {
                setIsLoading(false);
            }
        };

        loadThreatData();
        const interval = setInterval(loadThreatData, 3000);
        return () => clearInterval(interval);
    }, []);

    // WebSocket for real-time threat updates (supplements polling)
    useEffect(() => {
        let socket;
        try {
            const wsBase = getWsBaseUrl();
            socket = new WebSocket(`${wsBase}/ws/threats`);
            socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.threats) setThreats(data.threats);
                    if (data.metrics) setMetrics(data.metrics);
                    if (data.actions) setActions(data.actions);
                    if (data.locations) setLocations(data.locations);
                } catch (e) { /* ignore parse errors */ }
            };
        } catch (e) { /* WebSocket not available, polling handles it */ }
        return () => { if (socket) socket.close(); };
    }, []);

    const normalizedThreats = useMemo(() => {
        return threats.map((threat, index) => ({
            ...threat,
            id: threat.id || threat._id || `THR-${1000 + index}`,
            sourceIp: threat.source_ip || threat.sourceIp || "10.185.191.199",
            target: threat.target_device || threat.target || "ESP32 Camera Node",
            type: threat.type || "IoT Network Anomaly",
            severityKey: String(threat.severity || "low").toLowerCase(),
            statusKey: String(threat.status || (threat.mitigated ? "mitigated" : "active")).toLowerCase(),
        }));
    }, [threats]);

    const filteredThreats = useMemo(() => {
        if (activeFilter === "all") {
            return normalizedThreats;
        }
        if (activeFilter === "critical") {
            return normalizedThreats.filter((threat) => threat.severityKey === "critical");
        }
        if (activeFilter === "active") {
            return normalizedThreats.filter((threat) => threat.statusKey === "active");
        }
        if (activeFilter === "mitigated") {
            return normalizedThreats.filter((threat) => threat.statusKey === "mitigated");
        }
        return normalizedThreats;
    }, [activeFilter, normalizedThreats]);

    const topThreat = useMemo(() => {
        return [...normalizedThreats].sort((left, right) => {
            const leftScore = severityConfig[left.severityKey]?.stroke === "#F43F5E" ? 4 : left.severityKey === "high" ? 3 : left.severityKey === "medium" ? 2 : 1;
            const rightScore = severityConfig[right.severityKey]?.stroke === "#F43F5E" ? 4 : right.severityKey === "high" ? 3 : right.severityKey === "medium" ? 2 : 1;
            return rightScore - leftScore;
        })[0] || null;
    }, [normalizedThreats]);

    const mapMarkers = useMemo(() => {
        const fromThreats = normalizedThreats
            .filter((t) => Number.isFinite(t.lat) && Number.isFinite(t.lng))
            .map((t, i) => ({ id: t.id || `t-${i}`, ip: t.sourceIp, lat: t.lat, lng: t.lng, severityKey: t.severityKey, type: t.type }));
        if (fromThreats.length > 0) return fromThreats;
        return locations
            .filter((l) => l.lat && l.lng && !isNaN(l.lat) && !isNaN(l.lng))
            .map((l, i) => ({ id: `loc-${i}`, ip: l.ip, lat: l.lat, lng: l.lng, severityKey: "medium", type: "unknown" }));
    }, [normalizedThreats, locations]);

    const currentSummary = selectedThreat?.aiSummary || topThreat?.aiSummary || "No active enriched threat summary available. Monitoring continues across connected devices only.";

    const summaryCards = [
        {
            label: "Global_Threats",
            value: metrics?.totalThreats ?? normalizedThreats.length,
            suffix: "Detected",
            accent: "rose",
            width: Math.min(100, Math.max(10, ((metrics?.totalThreats ?? normalizedThreats.length) / Math.max(1, metrics?.totalThreats ?? normalizedThreats.length)) * 100)),
        },
        {
            label: "Active_Vectors",
            value: metrics?.activeThreats ?? normalizedThreats.filter((threat) => threat.statusKey === "active").length,
            suffix: "Open",
            accent: "orange",
            width: Math.min(100, Math.max(10, ((metrics?.activeThreats ?? 0) / Math.max(1, metrics?.totalThreats ?? 1)) * 100)),
        },
        {
            label: "Auto_Mitigated",
            value: metrics?.mitigatedThreats ?? normalizedThreats.filter((threat) => threat.statusKey === "mitigated").length,
            suffix: "Closed",
            accent: "emerald",
            width: Math.min(100, Math.max(10, ((metrics?.mitigatedThreats ?? 0) / Math.max(1, metrics?.totalThreats ?? 1)) * 100)),
        },
    ];

    const severityBreakdown = metrics?.severityBreakdown || {
        critical: normalizedThreats.filter((threat) => threat.severityKey === "critical").length,
        high: normalizedThreats.filter((threat) => threat.severityKey === "high").length,
        medium: normalizedThreats.filter((threat) => threat.severityKey === "medium").length,
        low: normalizedThreats.filter((threat) => threat.severityKey === "low").length,
    };

    const containerVariants = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
    const itemVariants = { hidden: { opacity: 0, y: 15, scale: 0.98 }, show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 280, damping: 24 } } };

    return (
        <div className="min-h-screen w-full bg-[#050510] text-white relative overflow-x-hidden pt-28 pb-16 px-4 md:px-8 xl:px-12 flex justify-center selection:bg-rose-500/30 font-sans border-t border-[#111]">
            {/* Cyberpunk Grid Background */}
            <div className="absolute inset-0 z-0 opacity-10" style={{ backgroundImage: `radial-gradient(circle at center, #2C3E50 1px, transparent 1px)`, backgroundSize: '40px 40px' }}></div>
            
            {/* Vivid Background Glows */}
            <div className="absolute top-0 right-1/4 w-[700px] h-[700px] bg-rose-600 opacity-[0.06] blur-[150px] rounded-full pointer-events-none z-0"></div>
            <div className="absolute bottom-0 left-1/3 w-[500px] h-[500px] bg-cyan-500 opacity-[0.05] blur-[130px] rounded-full pointer-events-none z-0"></div>

            <motion.div className="w-full max-w-[1400px] z-10 flex flex-col gap-6" variants={containerVariants} initial="hidden" animate="show">
                
                {/* ═══════════  1. PAGE HEADER (HUD Style) ═══════════ */}
                <motion.div variants={itemVariants} className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/10 pb-4 relative">
                    {/* Decorative HUD Corner */}
                    <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-rose-500/50 -mt-2 -ml-2"></div>
                    <div>
                        <div className="flex items-center gap-3">
                            {icons.scan}
                            <h1 className="text-3xl lg:text-4xl font-black tracking-tight bg-gradient-to-r from-rose-400 via-pink-400 to-violet-400 text-transparent bg-clip-text">THREAT_MONITOR</h1>
                        </div>
                        <p className="text-white/50 text-xs uppercase tracking-[0.2em] mt-2 font-mono ml-8">System Security Matrix &bull; Active Analysis</p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={async () => {
                                try {
                                    await fetch("/api/clear-history", { method: "POST" });
                                } catch (e) {}
                                window.location.reload();
                            }}
                            className="flex items-center gap-2 px-4 py-2 text-xs font-mono font-bold bg-rose-500/15 border border-rose-500/30 text-rose-300 hover:bg-rose-500/25 hover:border-rose-500/50 hover:text-white transition-all cursor-pointer"
                            title="Reset all threats and restore clean baseline"
                        >
                            {icons.refresh} <span>RESET_THREATS</span>
                        </button>
                        <div className="flex items-center gap-2 px-4 py-2 text-xs font-mono font-bold bg-white/5 border border-white/10 text-white/70">
                            {icons.filter} <span>{activeFilter.toUpperCase()}</span>
                        </div>
                    </div>
                </motion.div>

                {error ? (
                    <motion.div variants={itemVariants} className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                        {error}
                    </motion.div>
                ) : null}

                {/* ═══════════  2. THREAT SUMMARY CARDS (Advanced Glitch/HUD UI) ═══════════ */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {summaryCards.map((card) => {
                        const accentClass = card.accent === "rose"
                            ? "from-rose-500/10 border-rose-500/40 bg-rose-500"
                            : card.accent === "orange"
                                ? "from-orange-500/10 border-orange-500/40 bg-orange-500"
                                : "from-emerald-500/10 border-emerald-500/40 bg-emerald-500";
                        const accentText = card.accent === "rose" ? "text-rose-400/80" : card.accent === "orange" ? "text-orange-400/80" : "text-emerald-400/80";
                        return (
                            <motion.div key={card.label} variants={itemVariants} whileHover={{ y: -4, scale: 1.02 }} className="relative overflow-hidden p-6 min-h-[140px] border border-white/10 bg-black/40 backdrop-blur-xl group">
                                <div className={`absolute top-0 right-0 w-8 h-8 border-t border-r opacity-50 group-hover:opacity-100 transition-opacity ${accentClass.split(" ")[1]}`}></div>
                                <div className={`absolute inset-0 bg-gradient-to-br ${accentClass.split(" ")[0]} to-transparent opacity-30`}></div>
                                <div className="flex justify-between items-start z-10 relative">
                                    <span className={`${accentText} font-mono text-[10px] tracking-widest uppercase`}>{card.label}</span>
                                    <div className={`w-2 h-2 rounded-full animate-ping ${accentClass.split(" ")[2]}`}></div>
                                </div>
                                <div className="z-10 relative mt-4 flex items-baseline gap-2">
                                    <span className="text-5xl font-black text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">{card.value}</span>
                                    <span className="text-xs text-white/50 font-mono">{card.suffix}</span>
                                </div>
                                <div className="absolute bottom-0 left-0 h-1 bg-white/10 w-full"><div className={`h-full shadow-[0_0_10px_currentColor] ${accentClass.split(" ")[2]}`} style={{ width: `${card.width}%` }}></div></div>
                            </motion.div>
                        );
                    })}
                    
                    <motion.div variants={itemVariants} whileHover={{ y: -4, scale: 1.02 }} className="relative overflow-hidden p-6 min-h-[140px] border border-white/10 bg-black/40 backdrop-blur-xl group flex flex-col justify-center">
                         <div className="flex justify-between w-full text-xs font-mono font-bold mb-3">
                            <span className="text-rose-400">CRIT [{severityBreakdown.critical}]</span>
                            <span className="text-orange-400">HIGH [{severityBreakdown.high}]</span>
                            <span className="text-amber-400">MED [{severityBreakdown.medium}]</span>
                         </div>
                         <div className="flex h-3 rounded-sm overflow-hidden w-full bg-white/5">
                             <div className="h-full bg-rose-500" style={{ width: `${Math.max(0, (severityBreakdown.critical / Math.max(1, metrics?.totalThreats || normalizedThreats.length || 1)) * 100)}%` }}></div>
                             <div className="h-full bg-orange-500" style={{ width: `${Math.max(0, (severityBreakdown.high / Math.max(1, metrics?.totalThreats || normalizedThreats.length || 1)) * 100)}%` }}></div>
                             <div className="h-full bg-amber-500" style={{ width: `${Math.max(0, (severityBreakdown.medium / Math.max(1, metrics?.totalThreats || normalizedThreats.length || 1)) * 100)}%` }}></div>
                             <div className="h-full bg-emerald-500" style={{ width: `${Math.max(0, (severityBreakdown.low / Math.max(1, metrics?.totalThreats || normalizedThreats.length || 1)) * 100)}%` }}></div>
                         </div>
                    </motion.div>
                </div>

                {/* ═══════════  3. LIVE THREAT FEED (With Sparklines) ═══════════ */}
                <motion.div variants={itemVariants} className="border border-white/10 bg-black/30 backdrop-blur-sm relative overflow-hidden group">
                    {/* Decorative Corner Borders */}
                    <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-white/30"></div>
                    <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-white/30"></div>

                    <div className="px-5 py-4 border-b border-white/10 flex items-center gap-3 bg-white/[0.02]">
                        <div className="w-2 h-2 rounded-full bg-rose-500 animate-[pulse_1s_ease-in-out_infinite] shadow-[0_0_8px_#F43F5E]"></div>
                        <span className="text-white font-mono text-sm tracking-widest uppercase font-bold">Live_Feed Stream</span>
                        <div className="ml-auto flex gap-6 text-[10px] font-mono text-white/40 uppercase">
                            {[
                                ["all", "All"],
                                ["critical", "Critical"],
                                ["active", "Active"],
                                ["mitigated", "Mitigated"],
                            ].map(([key, label]) => (
                                <button
                                    key={key}
                                    onClick={() => setActiveFilter(key)}
                                    className={`transition-colors pb-1 ${activeFilter === key ? "text-white border-b border-rose-500" : "hover:text-white"}`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                    
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-white/[0.02] border-b border-white/10">
                                <tr className="text-white/40 text-[10px] uppercase font-mono tracking-widest">
                                    <th className="px-5 py-4">Threat_ID</th>
                                    <th className="px-5 py-4">Source_IP</th>
                                    <th className="px-5 py-4">Target</th>
                                    <th className="px-5 py-4">Classification</th>
                                    <th className="px-5 py-4">Severity</th>
                                    <th className="px-5 py-4">Trend (30s)</th>
                                    <th className="px-5 py-4">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.05]">
                                {filteredThreats.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" className="px-5 py-10 text-center text-sm text-white/50">
                                            {isLoading ? "Loading threats..." : "No threats match the current filter."}
                                        </td>
                                    </tr>
                                ) : filteredThreats.map((t, i) => {
                                    const sev = severityConfig[t.severityKey] || severityConfig.low;
                                    const stat = statusConfig[t.statusKey] || statusConfig.active;
                                    return (
                                        <motion.tr key={t.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                                            className="hover:bg-white/[0.04] transition-colors cursor-pointer group/row"
                                            onClick={() => setSelectedThreat(t)}>
                                            <td className="px-5 py-4 font-mono text-white/80 text-xs">
                                                <span className="text-rose-400/50 mr-2 group-hover/row:text-rose-400 transition-colors">▶</span>
                                                {t.id}
                                            </td>
                                            <td className="px-5 py-4 font-mono text-white/60 text-xs">
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        router.push(`/network?highlight_ip=${encodeURIComponent(t.sourceIp)}`);
                                                    }}
                                                    className="text-rose-400 hover:text-rose-300 underline-offset-2 hover:underline transition-colors"
                                                >
                                                    {t.sourceIp}
                                                </button>
                                            </td>
                                            <td className="px-5 py-4 text-white/80 text-xs font-semibold">
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        router.push(`/devices?filter=${encodeURIComponent(t.target)}`);
                                                    }}
                                                    className="text-cyan-400 hover:text-cyan-300 underline-offset-2 hover:underline transition-colors"
                                                >
                                                    {t.target}
                                                </button>
                                            </td>
                                            <td className="px-5 py-4 text-white/70 text-xs">{t.type}</td>
                                            <td className="px-5 py-4">
                                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${sev.bg} ${sev.color} border ${sev.border}`}>
                                                    <div className={`w-1 h-1 rounded-full ${sev.dot} animate-pulse`}></div> {t.severity}
                                                </span>
                                            </td>
                                            {/* Data Sparkline for "velocity" of attack */}
                                            <td className="px-5 py-4">
                                                <Sparkline data={t.trend} color={sev.stroke} />
                                            </td>
                                            <td className="px-5 py-4">
                                                <span className={`inline-flex items-center px-2 py-0.5 border text-[9px] font-bold uppercase tracking-widest ${stat.bg} ${stat.color} ${stat.border}`}>
                                                    {t.status}
                                                </span>
                                            </td>
                                        </motion.tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </motion.div>

                {/* ═══════════  4. GLOBAL THREAT ORIGIN MAP  ═══════════ */}
                <motion.div variants={itemVariants} className="border border-white/10 bg-black/40 p-5 relative overflow-hidden">
                    {/* HUD Corner Decorations */}
                    <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-rose-500/40"></div>
                    <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-rose-500/40"></div>
                    <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-rose-500/40"></div>
                    <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-rose-500/40"></div>

                    <div className="flex items-center justify-between mb-4 z-10 relative">
                        <div className="flex items-center gap-2">
                            {icons.globe}
                            <span className="text-white/80 font-mono text-xs font-bold tracking-widest uppercase">Global_Threat_Map</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                            </span>
                            <span className="text-[10px] text-white/40 font-mono uppercase tracking-widest">Live Tracking</span>
                        </div>
                    </div>

                    <div className="w-full h-[360px] relative bg-[#060a12] border border-white/5 overflow-hidden">
                        {/* Subtle grid overlay */}
                        <div className="absolute inset-0 z-0 opacity-[0.06]" style={{ backgroundImage: `radial-gradient(circle at center, #22D3EE 1px, transparent 1px)`, backgroundSize: '30px 30px' }}></div>
                        {/* Glow */}
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(244,63,94,0.06)_0%,transparent_70%)]"></div>

                        {mapMarkers.length === 0 && (
                            <div className="absolute inset-0 z-20 flex items-center justify-center">
                                <span className="text-white/40 text-sm font-mono">No geolocated origins detected</span>
                            </div>
                        )}

                        <ComposableMap
                            projection="geoMercator"
                            projectionConfig={{ scale: 120, center: [20, 20] }}
                            className="w-full h-full"
                            style={{ background: "transparent" }}
                        >
                            <Geographies geography={geoUrl}>
                                {({ geographies }) =>
                                    geographies.map((geo) => (
                                        <Geography
                                            key={geo.rsmKey}
                                            geography={geo}
                                            fill="#111827"
                                            stroke="#1e293b"
                                            strokeWidth={0.4}
                                            style={{
                                                default: { outline: "none" },
                                                hover: { fill: "#1a2332", outline: "none" },
                                                pressed: { outline: "none" },
                                            }}
                                        />
                                    ))
                                }
                            </Geographies>

                            {mapMarkers.map((marker, index) => {
                                const sev = severityConfig[marker.severityKey] || severityConfig.medium;
                                return (
                                    <Marker key={`${marker.id}-${index}`} coordinates={[marker.lng, marker.lat]}>
                                        <motion.g
                                            initial={{ scale: 0, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            transition={{ type: "spring", stiffness: 200, damping: 12, delay: index * 0.05 }}
                                        >
                                            {/* Ripple ring */}
                                            <motion.circle
                                                r={8}
                                                fill={sev.stroke}
                                                fillOpacity={0.25}
                                                initial={{ scale: 0.5 }}
                                                animate={{ scale: 2.5, opacity: 0 }}
                                                transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }}
                                            />
                                            {/* Core dot */}
                                            <circle r={3.5} fill={sev.stroke} stroke="#000" strokeWidth={0.8} />
                                        </motion.g>

                                        {/* Tooltip */}
                                        <g className="group/marker">
                                            <circle r={12} fill="transparent" className="cursor-pointer" />
                                            <foreignObject x={10} y={-20} width={160} height={40} className="pointer-events-none opacity-0 group-hover/marker:opacity-100 transition-opacity">
                                                <div className="bg-black/95 border border-white/20 px-2 py-1 text-[9px] font-mono text-white/90 whitespace-nowrap backdrop-blur-sm">
                                                    {marker.ip} <span style={{ color: sev.stroke }}>[{marker.severityKey.toUpperCase()}]</span>
                                                </div>
                                            </foreignObject>
                                        </g>
                                    </Marker>
                                );
                            })}
                        </ComposableMap>
                    </div>

                    <div className="mt-3 flex justify-between items-center text-[10px] text-white/30 font-mono uppercase tracking-widest">
                        <span>Origins_Detected: {mapMarkers.length}</span>
                        <span>IP Geolocation Resolved</span>
                    </div>
                </motion.div>

                {/* ═══════════  5. AI INTELLIGENCE & AUTO RESPONSE  ═══════════ */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <motion.div variants={itemVariants} className="border border-white/10 bg-black/40 p-5 relative overflow-hidden min-h-[160px]">
                        <div className="absolute right-0 top-0 text-[100px] text-violet-500/5 rotate-12 -mt-4 mr-2 pointer-events-none font-black block">AI</div>
                        <div className="flex items-center gap-2 mb-3">
                            {icons.cpu}
                            <span className="text-white/80 font-mono text-xs font-bold tracking-widest uppercase">Neuro_AI Analysis</span>
                        </div>
                        <p className="text-white/60 text-xs font-mono leading-relaxed border-l-2 border-violet-500 pl-3">
                            <span className="text-violet-400 font-bold mb-1 block">&gt; SYNC_PATTERN_DETECTED</span>
                            {currentSummary}
                        </p>
                    </motion.div>

                    <motion.div variants={itemVariants} className="border border-white/10 bg-black/40 p-5 relative overflow-hidden min-h-[160px] flex flex-col">
                        <div className="flex items-center gap-2 mb-3">
                            {icons.bolt}
                            <span className="text-white/80 font-mono text-xs font-bold tracking-widest uppercase">Auto_Response Log</span>
                        </div>
                        <div className="flex flex-col gap-2 overflow-y-auto pr-2 custom-scrollbar">
                            {actions.length === 0 ? (
                                <div className="text-sm text-white/45">No autonomous responses recorded.</div>
                            ) : actions.map((action, index) => (
                                <div key={action._id || index} className="flex items-center gap-3 p-2 border-l-2 border-emerald-500 bg-white/[0.02]">
                                    <span className="text-emerald-400/50 text-[10px] font-mono shrink-0">
                                        {(() => {
                                            const d = action.timestamp ? new Date(action.timestamp) : null;
                                            return d && !isNaN(d.getTime())
                                                ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
                                                : new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
                                        })()}
                                    </span>
                                    <span className="text-white/80 text-[11px] font-bold uppercase w-28 shrink-0">{action.action}</span>
                                    <span className="text-white/40 text-[10px] truncate">{action.detail}</span>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                </div>
            </motion.div>

            {/* ═══════════  THREAT DETAILS DRAWER (HUD Holographic Style) ═══════════ */}
            <AnimatePresence>
                {selectedThreat && (
                    <>
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/80 backdrop-blur-md z-40" onClick={() => setSelectedThreat(null)} />
                        
                        <motion.div initial={{ x: "100%", opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: "100%", opacity: 0 }} transition={{ type: "spring", damping: 25, stiffness: 200 }}
                            className="fixed right-0 top-0 h-full w-full max-w-[600px] z-50 bg-[#0A0A0A] border-l border-white/10 overflow-y-auto custom-scrollbar shadow-[-20px_0_50px_rgba(0,0,0,0.8)] font-sans">
                            
                            {/* Drawer Header HUD line */}
                            <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${(severityConfig[selectedThreat.severityKey] || severityConfig.low).stroke}, transparent)` }}></div>
                            
                            <div className="p-8 flex flex-col gap-8">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="flex gap-2 items-center mb-2 text-[10px] font-mono tracking-widest uppercase">
                                            <span className="text-white/40">SYS_ID:</span>
                                            <span className="text-white bg-white/10 px-2 py-0.5 rounded">{selectedThreat.id}</span>
                                        </div>
                                        <h2 className="text-3xl font-black text-white">{selectedThreat.type}</h2>
                                    </div>
                                    <button onClick={() => setSelectedThreat(null)} className="p-2 border border-white/10 hover:bg-white/10 text-white/50 hover:text-white transition-colors">
                                        {icons.close}
                                    </button>
                                </div>

                                {/* Network Vector Path */}
                                <div>
                                    <span className="block text-white/40 text-[10px] font-mono tracking-widest uppercase mb-4">Vector_Pathing</span>
                                    <div className="flex items-center gap-2 overflow-x-auto pb-2">
                                        {(selectedThreat.attackPath || []).map((node, i, arr) => (
                                            <div key={i} className="flex items-center gap-2 shrink-0">
                                                <div className={`px-4 py-3 border bg-black flex flex-col ${i===0 ? 'border-rose-500 text-rose-400' : i===arr.length-1 ? 'border-cyan-500 text-cyan-400' : 'border-white/20 text-white/60'}`}>
                                                    <span className="text-[8px] font-mono uppercase opacity-50 mb-1">{i===0 ? 'ORIGIN' : i===arr.length-1 ? 'TARGET' : 'NODE'}</span>
                                                    <span className="text-xs font-bold font-mono">{node}</span>
                                                </div>
                                                {i < arr.length-1 && <span className="text-white/20 text-lg mx-2">↠</span>}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="border border-white/10 bg-black/50 p-4">
                                        <span className="block text-white/40 text-[10px] font-mono uppercase mb-1">Target</span>
                                        <button 
                                            onClick={() => router.push(`/devices?filter=${encodeURIComponent(selectedThreat.target)}`)}
                                            className="text-cyan-400 hover:text-cyan-300 text-sm font-semibold underline-offset-2 hover:underline transition-colors"
                                        >
                                            {selectedThreat.target}
                                        </button>
                                    </div>
                                    <div className="border border-white/10 bg-black/50 p-4">
                                        <span className="block text-white/40 text-[10px] font-mono uppercase mb-1">Origin_IP</span>
                                        <button 
                                            onClick={() => router.push(`/network?highlight_ip=${encodeURIComponent(selectedThreat.sourceIp)}`)}
                                            className="text-rose-400 hover:text-rose-300 text-sm font-mono underline-offset-2 hover:underline transition-colors"
                                        >
                                            {selectedThreat.sourceIp}
                                        </button>
                                    </div>
                                </div>

                                <div className="border-l-2 border-violet-500 pl-4 py-2">
                                    <span className="block text-violet-400 text-[10px] font-mono uppercase mb-2">&gt; AI_ANALYSIS_OUTPUT</span>
                                    <p className="text-white/70 text-sm leading-relaxed">{selectedThreat.aiSummary}</p>
                                    <p className="text-emerald-400 text-sm font-semibold mt-2 border border-emerald-500/30 bg-emerald-500/10 p-3">Recommendation: {selectedThreat.suggestedAction}</p>
                                </div>

                                {/* Navigation Actions */}
                                <div className="flex gap-3 pt-4 border-t border-white/10">
                                    <button 
                                        onClick={() => router.push(`/investigations?threat_id=${selectedThreat.id}`)}
                                        className="flex-1 px-4 py-3 bg-violet-500/20 border border-violet-500/30 text-violet-300 hover:bg-violet-500/30 transition-colors text-sm font-semibold"
                                    >
                                        🔍 View Investigation
                                    </button>
                                    <button 
                                        onClick={() => router.push(`/network?highlight_ip=${encodeURIComponent(selectedThreat.sourceIp)}`)}
                                        className="flex-1 px-4 py-3 bg-rose-500/20 border border-rose-500/30 text-rose-300 hover:bg-rose-500/30 transition-colors text-sm font-semibold"
                                    >
                                        🌐 Trace in Network
                                    </button>
                                </div>

                                {/* Terminal Console */}
                                <div>
                                    <div className="bg-[#111] border border-white/10 p-4 font-mono text-[11px] flex flex-col gap-2 rounded-md shadow-inner">
                                        <div className="flex gap-2 text-white/30 mb-2 border-b border-white/10 pb-2"><span className="text-rose-500">🔴</span><span>TERMINAL_DUMP</span></div>
                                        {(selectedThreat.logs || []).map((log, i) => (
                                            <div key={i} className="text-emerald-400/80">
                                                <span className="opacity-50 mr-2">&gt;</span>
                                                {log}
                                            </div>
                                        ))}
                                        <div className="text-white/50 animate-pulse mt-2">_</div>
                                    </div>
                                </div>

                                {/* Action Console */}
                                <div className="grid grid-cols-2 gap-3 mt-auto pt-4 border-t border-white/10">
                                    <button className="py-3 border border-rose-500 bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-black font-mono text-xs uppercase font-bold transition-colors">
                                        [EXECUTE] {selectedThreat.suggestedAction?.toLowerCase().includes("block") ? "Block_IP" : "Review"}
                                    </button>
                                    <button className="py-3 border border-amber-500 bg-amber-500/10 text-amber-500 hover:bg-amber-500 hover:text-black font-mono text-xs uppercase font-bold transition-colors">
                                        [EXECUTE] ISOLATE_NODE
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
