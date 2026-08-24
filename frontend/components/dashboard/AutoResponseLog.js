"use client";

import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { fetchApiJson } from "@/lib/api";

export default function AutoResponseLog() {
    const [responses, setResponses] = useState([]);

    useEffect(() => {
        const fetchActions = async () => {
            try {
                const data = await fetchApiJson("/api/actions", { cache: "no-store" });
                setResponses(data);
            } catch (err) {
                console.error("Failed to fetch auto response logs", err);
            }
        };
        fetchActions();
        const interval = setInterval(fetchActions, 5000);
        return () => clearInterval(interval);
    }, []);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="p-6 rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 overflow-hidden shadow-xl shadow-black/20 relative"
        >
            {/* Inner highlight (liquid glass top edge effect) */}
            <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />

            {/* Glowing orb */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-400/30 rounded-full blur-[40px]" />

            <div className="relative z-10">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-sm font-medium tracking-wide text-white/90">Auto Response Log</h3>
                </div>

                <div className="space-y-4">
                    {responses.length === 0 ? (
                        <div className="text-center py-6 text-white/50 text-sm">No autonomous actions taken</div>
                    ) : (
                        responses.map((response, i) => (
                            <motion.div
                                key={response._id || i}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.6 + (i * 0.1) }}
                                className="flex items-center justify-between group"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center border border-white/20 backdrop-blur-sm shadow-inner group-hover:bg-white/20 transition-colors">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-emerald-400">
                                            <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                    </div>

                                    <div>
                                        <h4 className="text-sm font-medium text-white/95 group-hover:text-white transition-colors">{response.action}</h4>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-xs text-white/50">
                                                {(() => {
                                                    const d = response.timestamp ? new Date(response.timestamp) : null;
                                                    return d && !isNaN(d.getTime()) 
                                                        ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                                                        : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                                                })()}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        ))
                    )}
                </div>
            </div>
        </motion.div>
    );
}
