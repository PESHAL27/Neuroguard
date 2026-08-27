"use client";

import { motion } from "framer-motion";
import { useState, useEffect, useRef } from "react";

const getCards = (stats) => [
    {
        label: "Connected Devices",
        value: stats.connected,
        icon: (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 17v4" />
            </svg>
        ),
        bgClasses: "bg-gradient-to-br from-blue-500 via-cyan-500 to-teal-400",
        shadowHover: "hover:shadow-[0_0_40px_rgba(6,182,212,0.4)]",
    },
    {
        label: "AI Surveillance",
        value: stats.detected,
        icon: (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
        ),
        bgClasses: "bg-gradient-to-br from-amber-500 via-orange-500 to-yellow-500",
        shadowHover: "hover:shadow-[0_0_40px_rgba(245,158,11,0.4)]",
    },
    {
        label: "Quarantined / Blocked",
        value: stats.blocked,
        icon: (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
            </svg>
        ),
        bgClasses: "bg-gradient-to-br from-rose-500 via-pink-600 to-red-500",
        shadowHover: "hover:shadow-[0_0_40px_rgba(244,63,94,0.4)]",
    },
    {
        label: "Trusted Devices",
        value: stats.trusted,
        suffix: "",
        icon: (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 12.75 11.25 15 15 9.75m-3-6.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
            </svg>
        ),
        bgClasses: "bg-gradient-to-br from-violet-500 via-fuchsia-500 to-pink-500",
        shadowHover: "hover:shadow-[0_0_40px_rgba(168,85,247,0.4)]",
    },
];

export default function SecurityStatusCards() {
    const [stats, setStats] = useState({ connected: 0, detected: 0, blocked: 0, trusted: 0 });
    const lastStatsRef = useRef(stats);

    const updateStatsFromDevices = (devices) => {
        if (!Array.isArray(devices)) return;
        const connected = devices.filter(d => d.connected && !d.blocked).length;
        const detected = devices.filter(d => (d.surveillance || d.trusted === false) && !d.blocked).length;
        const blocked = devices.filter(d => d.blocked).length;
        const trusted = devices.filter(d => d.trusted && !d.blocked && !d.surveillance).length;

        const prev = lastStatsRef.current;
        if (prev.connected !== connected || prev.detected !== detected || prev.blocked !== blocked || prev.trusted !== trusted) {
            const next = { connected, detected, blocked, trusted };
            lastStatsRef.current = next;
            setStats(next);
        }
    };

    useEffect(() => {
        let isMounted = true;

        const loadStats = async () => {
            try {
                const res = await fetch("/api/devices");
                if (res.ok && isMounted) {
                    const data = await res.json();
                    updateStatsFromDevices(data);
                }
            } catch (e) {}
        };

        loadStats();
        const pollInterval = setInterval(loadStats, 1500);

        return () => {
            isMounted = false;
            clearInterval(pollInterval);
        };
    }, []);

    const cards = getCards(stats);

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {cards.map((card, i) => (
                <motion.div
                    key={card.label}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.3 }}
                    className={`relative rounded-3xl ${card.bgClasses} p-6 overflow-hidden transition-all duration-300 ${card.shadowHover} text-white shadow-xl shadow-black/20`}
                >
                    {/* Inner highlight */}
                    <div className="absolute inset-0 rounded-3xl border border-white/30 pointer-events-none" style={{ maskImage: 'linear-gradient(to bottom, white 0%, transparent 20%)', WebkitMaskImage: 'linear-gradient(to bottom, white 0%, transparent 20%)' }} />

                    {/* Background decorative blob */}
                    <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-white/10 rounded-full blur-2xl" />

                    <div className="relative z-10 flex flex-col h-full justify-between gap-4">
                        <div className="flex justify-between items-start">
                            <span className="text-sm font-medium opacity-90 tracking-wide">{card.label}</span>
                            <div className="opacity-80">
                                {card.icon}
                            </div>
                        </div>

                        <div className="flex items-end justify-between mt-4">
                            <div className="text-5xl font-bold tracking-tight">
                                {card.value}
                                <span className="text-2xl font-normal opacity-80 ml-1">{card.suffix || ""}</span>
                            </div>
                        </div>
                    </div>
                </motion.div>
            ))}
        </div>
    );
}
