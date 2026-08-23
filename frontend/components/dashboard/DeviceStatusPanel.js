"use client";

import { motion } from "framer-motion";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";

const getStatusColor = (status, isBlocked, isSurveillance) => {
    if (isBlocked) {
        return { color: "bg-rose-500", glow: "shadow-[0_0_15px_rgba(244,63,94,0.8)]", displayStatus: "Quarantined" };
    }
    if (isSurveillance) {
        return { color: "bg-amber-400", glow: "shadow-[0_0_15px_rgba(251,191,36,0.8)]", displayStatus: "Surveillance" };
    }
    return { color: "bg-emerald-400", glow: "shadow-[0_0_15px_rgba(52,211,153,0.8)]", displayStatus: "Connected" };
};

export default function DeviceStatusPanel() {
    const [devices, setDevices] = useState([]);
    const lastListRef = useRef("");

    const updateDevicesIfChanged = (newDevices) => {
        if (!Array.isArray(newDevices)) return;
        const serialized = JSON.stringify(newDevices.map(d => [d.device_id, d.name, d.connected, d.blocked, d.trusted, d.surveillance, d.status]));
        if (serialized !== lastListRef.current) {
            lastListRef.current = serialized;
            setDevices(newDevices);
        }
    };

    useEffect(() => {
        let isMounted = true;

        const fetchDevices = async () => {
            try {
                const res = await fetch("/api/devices");
                if (res.ok && isMounted) {
                    const data = await res.json();
                    updateDevicesIfChanged(data);
                }
            } catch (err) {}
        };

        fetchDevices();
        const interval = setInterval(fetchDevices, 2000);

        let eventSource;
        try {
            eventSource = new EventSource("/api/devices/stream");
            eventSource.onmessage = (event) => {
                if (!isMounted) return;
                try {
                    const data = JSON.parse(event.data);
                    updateDevicesIfChanged(data);
                } catch (e) {}
            };
        } catch (e) {}

        return () => {
            isMounted = false;
            clearInterval(interval);
            if (eventSource) eventSource.close();
        };
    }, []);

    const activeConnected = devices.filter(d => !d.blocked && d.connected);

    return (
        <div className="p-6 rounded-3xl bg-gradient-to-b from-[#111827] to-[#0A0F1A] border border-white/5 shadow-2xl relative overflow-hidden">
            {/* Top liquid reflection */}
            <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/[0.03] to-transparent pointer-events-none" />

            <div className="flex justify-between items-center mb-6 relative z-10">
                <h3 className="text-sm font-medium tracking-wide text-white/80 uppercase">Live Network Nodes</h3>
                <div className="flex items-center gap-3">
                    <span className="text-xs bg-white/5 text-white/80 px-2.5 py-1 rounded-full border border-white/10 font-mono font-medium">
                        {activeConnected.length} active
                    </span>
                    <Link href="/devices" className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1 bg-cyan-500/10 px-2.5 py-1 rounded-full border border-cyan-500/20 hover:bg-cyan-500/20">
                        Manage Devices
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                        </svg>
                    </Link>
                </div>
            </div>

            <div className="space-y-3 relative z-10">
                {devices.length === 0 ? (
                    <div className="text-center py-6 text-white/50 text-sm">Scanning for active devices...</div>
                ) : (
                    devices.slice(0, 7).map((device, i) => {
                        const isBlocked = Boolean(device.blocked);
                        const isSurveillance = Boolean(device.surveillance || device.trusted === false);
                        const { color, glow, displayStatus } = getStatusColor(device.status, isBlocked, isSurveillance);
                        
                        return (
                            <div
                                key={device.device_id || device._id || i}
                                className="group flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] transition-all cursor-pointer relative overflow-hidden"
                            >
                                <div className="flex items-center gap-3.5 relative z-10">
                                    <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                                        <div className={`w-2.5 h-2.5 rounded-full ${color} ${glow} animate-pulse`} />
                                    </div>

                                    <div>
                                        <h4 className="text-sm font-medium text-white/90 group-hover:text-cyan-300 transition-colors">{device.name || "Unknown Device"}</h4>
                                        <p className="text-xs text-white/40 mt-0.5 font-mono">{device.ip} • {device.type || "node"}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 relative z-10">
                                    {isBlocked ? (
                                        <span className="text-[11px] font-semibold text-rose-300 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
                                            Quarantined
                                        </span>
                                    ) : isSurveillance ? (
                                        <span className="text-[11px] font-semibold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                                            Surveillance
                                        </span>
                                    ) : device.trusted ? (
                                        <span className="text-[11px] font-semibold text-violet-300 bg-violet-500/10 px-2 py-0.5 rounded-full border border-violet-500/20">
                                            Trusted
                                        </span>
                                    ) : (
                                        <span className="text-[11px] font-medium text-emerald-400">
                                            Online
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
