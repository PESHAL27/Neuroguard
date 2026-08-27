"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import Link from "next/link";
import SecurityStatusCards from "@/components/dashboard/SecurityStatusCards";
import ThreatMonitorFeed from "@/components/dashboard/ThreatMonitorFeed";
import DeviceStatusPanel from "@/components/dashboard/DeviceStatusPanel";
import AttackTimeline from "@/components/dashboard/AttackTimeline";
import AIAnalysisPanel from "@/components/dashboard/AIAnalysisPanel";
import AutoResponseLog from "@/components/dashboard/AutoResponseLog";
import HardwareStatusIndicators from "@/components/dashboard/HardwareStatusIndicators";
import AttackMap from "@/components/dashboard/AttackMap";
import AttackGraph from "@/components/dashboard/AttackGraph";
import AIPredictionsPanel from "@/components/dashboard/AIPredictionsPanel";
import { fetchApi } from "@/lib/api";

export default function Dashboard() {
    const [mounted, setMounted] = useState(false);
    const [activeIncident, setActiveIncident] = useState(null);
    const [isResetting, setIsResetting] = useState(false);

    useEffect(() => {
        setMounted(true);

        const checkIncidents = async () => {
            try {
                const res = await fetch("/api/threats");
                if (res.ok) {
                    const threats = await res.json();
                    if (Array.isArray(threats)) {
                        const active = threats.find(t => {
                            const sev = (t.severity || "").toLowerCase();
                            const stat = (t.status || "").toLowerCase();
                            return (sev === "critical" || sev === "high") && (stat === "active" || !t.resolved);
                        });
                        setActiveIncident(active || null);
                    }
                }
            } catch (e) {}
        };

        checkIncidents();
        const interval = setInterval(checkIncidents, 2000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="min-h-screen w-full bg-[#0a0a0a] text-white relative overflow-hidden">
            {/* Ambient background effects */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10 transform-gpu">
                <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] bg-fuchsia-600/30 rounded-full blur-[120px] mix-blend-screen transform-gpu" />
                <div className="absolute top-[20%] right-[5%] w-[40%] h-[60%] bg-blue-600/20 rounded-full blur-[120px] mix-blend-screen transform-gpu" />
                <div className="absolute bottom-[-10%] left-[10%] w-[60%] h-[50%] bg-teal-500/20 rounded-full blur-[140px] mix-blend-screen transform-gpu" />
                <div className="absolute top-[5%] right-[30%] w-[30%] h-[30%] bg-orange-500/15 rounded-full blur-[100px] mix-blend-screen transform-gpu" />
            </div>

            <div className="relative z-10 pt-28 pb-12 px-4 md:px-8 lg:px-12 max-w-[1440px] mx-auto">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 }}
                    className="mb-6 relative z-20"
                >
                    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
                        <div>
                            <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Welcome to</p>
                            <h2 className="text-2xl md:text-3xl font-semibold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400">
                                Security Dashboard
                            </h2>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                id="btn-fresh-reset"
                                disabled={isResetting}
                                onClick={async () => {
                                    setIsResetting(true);
                                    try {
                                        await fetch("/api/clear-history", { method: "POST" });
                                        setActiveIncident(null);
                                        // Brief delay to allow backend wipe, then reload
                                        setTimeout(() => {
                                            window.location.reload();
                                        }, 400);
                                    } catch (e) {
                                        setIsResetting(false);
                                    }
                                }}
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 border cursor-pointer ${
                                    isResetting 
                                        ? "bg-amber-500/20 border-amber-500/40 text-amber-300" 
                                        : "bg-rose-500/15 hover:bg-rose-500/25 border-rose-500/30 text-rose-300 hover:shadow-[0_0_20px_rgba(244,63,94,0.25)]"
                                }`}
                                title="Click to clear all threats and reset website to fresh clean state"
                            >
                                <svg 
                                    className={`w-4 h-4 ${isResetting ? "animate-spin text-amber-400" : "text-rose-400"}`} 
                                    fill="none" 
                                    viewBox="0 0 24 24" 
                                    stroke="currentColor"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                <span className="text-xs font-semibold tracking-wide uppercase">
                                    {isResetting ? "Resetting..." : "Fresh Start"}
                                </span>
                            </button>
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                <span className="text-[11px] text-emerald-400 font-medium tracking-wide">SOC Online</span>
                            </div>
                            <div className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 min-w-[100px] text-center">
                                <span className="text-[11px] text-gray-400 font-mono">
                                    {mounted ? new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Loading date..."}
                                </span>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* Real-time Threat Siren Banner (Flashes during ESP32 / Network Attacks) */}
                <AnimatePresence>
                    {activeIncident && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: -10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -10 }}
                            className="mb-6 rounded-3xl bg-gradient-to-r from-rose-950/80 via-red-900/60 to-rose-950/80 border-2 border-rose-500/60 p-4 md:p-5 shadow-[0_0_40px_rgba(244,63,94,0.4)] relative overflow-hidden backdrop-blur-xl"
                        >
                            <div className="absolute inset-0 bg-rose-500/10 animate-pulse pointer-events-none" />
                            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center flex-shrink-0 shadow-[0_0_20px_rgba(244,63,94,0.6)]">
                                        <span className="text-2xl animate-bounce">🚨</span>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-rose-500 text-white shadow-[0_0_10px_rgba(244,63,94,0.8)]">
                                                Active Anomaly Intercepted
                                            </span>
                                            <span className="text-xs text-rose-300 font-mono">
                                                MITRE {activeIncident.mitre_id || "T1498"}
                                            </span>
                                        </div>
                                        <h4 className="text-base font-bold text-white mt-1">
                                            {activeIncident.type || activeIncident.attack_type || "Critical IoT Intrusion"} ➔ Target: {activeIncident.target || activeIncident.target_device || activeIncident.targetDevice || "ESP32 Camera Node"}
                                        </h4>
                                        <p className="text-xs text-rose-200/80 mt-0.5">
                                            Attacker: <span className="font-mono text-white font-bold">{activeIncident.sourceIp || activeIncident.source_ip || "192.168.137.X"}</span> • Action: <span className="text-emerald-400 font-bold">{activeIncident.action_taken || activeIncident.suggestedAction || "Autonomous Firewall Isolation Active"}</span>
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2.5 self-end md:self-center">
                                    <Link
                                        href="/threats"
                                        className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-xs font-bold transition-all shadow-[0_0_15px_rgba(244,63,94,0.5)] flex items-center gap-1.5"
                                    >
                                        Inspect Threat Radar ➔
                                    </Link>
                                    <Link
                                        href="/devices"
                                        className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors border border-white/20"
                                    >
                                        View Quarantined Node
                                    </Link>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Security Status Cards - Top Row */}
                <div className="mb-6">
                    <SecurityStatusCards />
                </div>

                {/* Main Dashboard Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column - 2/3 width */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <AttackMap />
                            <AttackGraph />
                        </div>
                        <ThreatMonitorFeed />
                        <AIAnalysisPanel />
                    </div>

                    {/* Right Column - 1/3 width */}
                    <div className="space-y-6">
                        <DeviceStatusPanel />
                        <AttackTimeline />
                        <HardwareStatusIndicators />
                        <AIPredictionsPanel />
                        <AutoResponseLog />
                    </div>
                </div>
            </div>
        </div>
    );
}
