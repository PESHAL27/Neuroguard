"use client";

import { motion } from "framer-motion";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";

const getStatusColor = (status, isBlocked, isSurveillance) => {
    if (isBlocked) {
        return { color: "bg-rose-500", glow: "shadow-[0_0_12px_rgba(244,63,94,0.8)]", displayStatus: "Quarantined" };
    }
    if (isSurveillance) {
        return { color: "bg-amber-400", glow: "shadow-[0_0_12px_rgba(251,191,36,0.8)]", displayStatus: "Surveillance" };
    }
    return { color: "bg-emerald-400", glow: "shadow-[0_0_12px_rgba(52,211,153,0.8)]", displayStatus: "Connected" };
};

export default function DeviceStatusPanel() {
    const [devices, setDevices] = useState([]);
    const lastListRef = useRef("");

    useEffect(() => {
        let isMounted = true;

        const fetchDevices = async () => {
            try {
                const res = await fetch("/api/devices", { cache: "no-store" });
                if (res.ok && isMounted) {
                    const data = await res.json();
                    if (Array.isArray(data)) {
                        const serialized = JSON.stringify(data.map(d => [d.device_id || d._id, d.name, d.ip, d.blocked, d.status]));
                        if (serialized !== lastListRef.current) {
                            lastListRef.current = serialized;
                            setDevices(data);
                        }
                    }
                }
            } catch (err) {}
        };

        fetchDevices();
        const interval = setInterval(fetchDevices, 1500);

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, []);

    const activeConnected = devices.filter(d => !d.blocked && d.status !== "blocked");

    return (
        <div className="p-6 rounded-3xl bg-gradient-to-b from-[#111827] to-[#0A0F1A] border border-white/5 shadow-2xl relative overflow-hidden flex flex-col justify-between">
            {/* Top liquid reflection */}
            <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/[0.03] to-transparent pointer-events-none" />

            <div className="flex justify-between items-center mb-6 relative z-10">
                <div className="flex items-center gap-2.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
                    <h3 className="text-sm font-medium tracking-wide text-white/80 uppercase">Live Network Nodes</h3>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs bg-emerald-500/10 text-emerald-300 px-2.5 py-1 rounded-full border border-emerald-500/20 font-mono font-medium">
                        {activeConnected.length} Active
                    </span>
                    <Link href="/devices" className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1 bg-cyan-500/10 px-2.5 py-1 rounded-full border border-cyan-500/20 hover:bg-cyan-500/20 font-medium">
                        Manage
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                        </svg>
                    </Link>
                </div>
            </div>

            <div className="space-y-2.5 relative z-10 max-h-[380px] overflow-y-auto pr-1 custom-scrollbar">
                {devices.length === 0 ? (
                    <div className="text-center py-8 text-white/40 text-sm font-mono flex items-center justify-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                        Scanning for active network nodes...
                    </div>
                ) : (
                    devices.map((device, i) => {
                        const isBlocked = Boolean(device.blocked || device.status === "blocked");
                        const isSurveillance = Boolean(device.surveillance || device.trusted === false);
                        const { color, glow, displayStatus } = getStatusColor(device.status, isBlocked, isSurveillance);
                        
                        return (
                            <motion.div
                                key={device.device_id || device._id || device.ip || i}
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.2 }}
                                className={`group flex items-center justify-between p-3 rounded-2xl border transition-all relative overflow-hidden ${
                                    isBlocked 
                                        ? "bg-rose-500/10 border-rose-500/30" 
                                        : "bg-white/[0.02] border-white/5 hover:bg-white/[0.05] hover:border-white/15"
                                }`}
                            >
                                <div className="flex items-center gap-3 relative z-10 min-w-0">
                                    <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center border border-white/10 flex-shrink-0">
                                        <div className={`w-2 h-2 rounded-full ${color} ${glow} ${isBlocked ? "" : "animate-pulse"}`} />
                                    </div>

                                    <div className="min-w-0">
                                        <h4 className="text-xs font-semibold text-white/90 group-hover:text-cyan-300 transition-colors truncate max-w-[170px] md:max-w-[200px]">
                                            {device.name || "Network Node"}
                                        </h4>
                                        <p className="text-[11px] text-white/40 font-mono truncate">
                                            {device.ip || "N/A"} • <span className="uppercase text-[10px] text-cyan-400/80">{device.type || "Node"}</span>
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1.5 relative z-10 flex-shrink-0">
                                    {isBlocked ? (
                                        <span className="text-[10px] font-bold text-rose-300 bg-rose-500/20 px-2 py-0.5 rounded-full border border-rose-500/30 uppercase tracking-wider">
                                            Quarantined
                                        </span>
                                    ) : isSurveillance ? (
                                        <span className="text-[10px] font-bold text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-500/30 uppercase tracking-wider">
                                            Surveillance
                                        </span>
                                    ) : device.trusted ? (
                                        <span className="text-[10px] font-bold text-violet-300 bg-violet-500/15 px-2 py-0.5 rounded-full border border-violet-500/25 uppercase tracking-wider">
                                            Trusted
                                        </span>
                                    ) : (
                                        <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                            Online
                                        </span>
                                    )}
                                </div>
                            </motion.div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
