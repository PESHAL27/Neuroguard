"use client";

import { motion } from "framer-motion";

import { useState, useEffect } from "react";
import { fetchApiJson } from "@/lib/api";

const severityColors = {
    Critical: "bg-red-500/20 text-red-400 border border-red-500/30",
    High: "bg-orange-500/20 text-orange-400 border border-orange-500/30",
    Medium: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
    Low: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
};

export default function ThreatMonitorFeed() {
    const [events, setEvents] = useState([]);

    useEffect(() => {
        const fetchThreats = async () => {
            try {
                const data = await fetchApiJson("/api/threats/recent?connected_only=true", { cache: "no-store" });

                // Map the DB schema to UI format
                const mappedData = data.slice(0, 5).map(t => ({
                    _id: t._id,
                    time: new Date(t.timestamp).toLocaleTimeString([], { hour12: false }),
                    device: t.targetDevice || t.device || "Unknown",
                    type: t.type || t.attack_type || "Unknown",
                    severity: t.severity || "Low",
                    sourceIp: t.sourceIp || t.source_ip || "N/A"
                }));

                setEvents(mappedData);
            } catch (err) {
                console.error("Failed to fetch threat feed", err);
            }
        };

        fetchThreats();
        const interval = setInterval(fetchThreats, 1500);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="mt-12">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                // Using the new liquid-glass class here
                className="liquid-glass rounded-3xl p-6 relative overflow-hidden"
            >
                {/* Surface reflection highlight */}
                <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />

                <div className="relative z-10 flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.8)]" />
                        <h2 className="text-xl font-medium tracking-wide text-white">Live Threat Monitor</h2>
                    </div>
                    <span className="text-xs font-semibold text-white/50 tracking-widest uppercase bg-white/5 px-3 py-1 rounded-full border border-white/10">Real-Time</span>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="text-white/50 text-xs uppercase tracking-widest border-b border-white/10">
                                <th className="pb-4 font-medium pl-4">Time</th>
                                <th className="pb-4 font-medium">Device</th>
                                <th className="pb-4 font-medium">Attack Type</th>
                                <th className="pb-4 font-medium">Severity</th>
                                <th className="pb-4 font-medium pr-4">Source IP</th>
                            </tr>
                        </thead>
                        <motion.tbody
                            initial="hidden"
                            animate="visible"
                            variants={{
                                hidden: { opacity: 0 },
                                visible: {
                                    opacity: 1,
                                    transition: { staggerChildren: 0.1 }
                                }
                            }}
                        >
                            {events.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="py-8 text-center text-sm text-white/50">No threat activity detected</td>
                                </tr>
                            ) : (
                                events.map((event, i) => (
                                    <motion.tr
                                        key={event._id || i}
                                        variants={{
                                            hidden: { opacity: 0, x: -20 },
                                            visible: { opacity: 1, x: 0 }
                                        }}
                                        className="border-b border-white/5 hover:bg-white/5 transition-colors group cursor-default"
                                    >
                                        <td className="py-5 text-sm text-white/70 font-mono pl-4 group-hover:text-white transition-colors">{event.time}</td>
                                        <td className="py-5 text-sm text-white/90 font-medium">{event.device}</td>
                                        <td className="py-5 text-sm text-white/80">{event.type}</td>
                                        <td className="py-5">
                                            <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-2 w-max ${severityColors[event.severity] || severityColors.Low}`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${event.severity === 'Critical' ? 'bg-red-400' : event.severity === 'High' ? 'bg-orange-400' : event.severity === 'Medium' ? 'bg-yellow-400' : 'bg-emerald-400'}`} />
                                                {event.severity}
                                            </span>
                                        </td>
                                        <td className="py-5 text-sm text-white/60 font-mono pr-4 group-hover:text-white/90 transition-colors">{event.sourceIp}</td>
                                    </motion.tr>
                                ))
                            )}
                        </motion.tbody>
                    </table>
                </div>
            </motion.div>
        </div>
    );
}
