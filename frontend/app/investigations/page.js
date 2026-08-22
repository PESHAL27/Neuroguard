"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { fetchApiJson } from "@/lib/api";

/* ───────────────────  ICONS  ─────────────────── */
const icons = {
    doc: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>,
    clock: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>,
    cpu: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>,
    shield: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" /></svg>,
    network: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 0 1-3-3m3 3a3 3 0 1 0 0 6h13.5a3 3 0 1 0 0-6m-16.5-3a3 3 0 0 1 3-3h13.5a3 3 0 0 1 3 3m-19.5 0a4.5 4.5 0 0 1 .9-2.7L5.737 5.1a3.375 3.375 0 0 1 2.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 0 1 .9 2.7m0 0a3 3 0 0 1-3 3m0 3h.008v.008h-.008v-.008Zm0-6h.008v.008h-.008v-.008Zm-3 6h.008v.008h-.008v-.008Zm0-6h.008v.008h-.008v-.008Z" /></svg>
};

const generateHexRow = (i) => {
    const addr = i.toString(16).padStart(4, '0').toUpperCase();
    const hex = Array.from({length: 8}, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase()).join(' ');
    const chars = hex.split(' ').map(h => parseInt(h, 16) > 31 && parseInt(h, 16) < 127 ? String.fromCharCode(parseInt(h, 16)) : '.').join('');
    return { addr, hex, chars };
};

export default function Investigations() {
    // Real investigations state from backend
    const [investigations, setInvestigations] = useState([]);
    const [selectedCaseIndex, setSelectedCaseIndex] = useState(0);
    const [hexLines, setHexLines] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    
    // Fetch investigations from backend AI builder
    useEffect(() => {
        const fetchInvestigations = async () => {
            try {
                // Fetch perfectly formatted, AWS Bedrock AI generated Investigation Data based on Threats
                const res = await fetch("/api/ai/investigations");
                if (!res.ok) throw new Error("Failed");
                const aiCases = await res.json();
                if (Array.isArray(aiCases) && aiCases.length > 0) {
                    setInvestigations(aiCases);
                } else if (aiCases && aiCases.error) {
                    console.warn("AI returned error:", aiCases.error);
                }
            } catch (error) {
                console.error("Failed to fetch AI investigations:", error);
            } finally {
                setIsLoading(false);
            }
        };
        
        fetchInvestigations();
        const interval = setInterval(fetchInvestigations, 10000); // Poll every 10s
        return () => clearInterval(interval);
    }, []);
    
    // Hex dump animation (keep for visual effect)
    useEffect(() => {
        let i = 0;
        const interval = setInterval(() => {
            setHexLines(prev => [...prev.slice(-9), generateHexRow(prev.length * 8)]);
            i++;
            if (i > 20) clearInterval(interval);
        }, 150);
        return () => clearInterval(interval);
    }, []);

    const containerV = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
    const itemV = { hidden: { opacity: 0, scale: 0.98 }, show: { opacity: 1, scale: 1, transition: { type: "spring", stiffness: 300, damping: 26 } } };

    // Show loading state
    if (isLoading) {
        return (
            <div className="min-h-screen w-full bg-[#050510] text-white flex items-center justify-center">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-white/50 font-mono text-sm">Loading investigations...</p>
                </div>
            </div>
        );
    }

    if (investigations.length === 0) {
        return (
            <div className="min-h-screen w-full bg-[#050510] text-white flex items-center justify-center">
                <div className="text-center bg-black/40 border border-violet-500/20 p-8 rounded-lg">
                    <h2 className="text-xl font-bold text-violet-400 mb-2">No Active Investigations</h2>
                    <p className="text-white/50 font-mono text-sm">Systems are monitoring normally.</p>
                    <p className="text-white/30 font-mono text-xs mt-2">Any future threats will automatically auto-generate cases here.</p>
                </div>
            </div>
        );
    }
    
    const activeCase = investigations[selectedCaseIndex] || investigations[0];

    return (
        <div className="min-h-screen w-full bg-[#050510] text-white relative overflow-x-hidden pt-28 pb-16 px-4 md:px-8 xl:px-12 flex justify-center font-sans tracking-wide">
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: "linear-gradient(#8B5CF6 1px, transparent 1px), linear-gradient(90deg, #8B5CF6 1px, transparent 1px)", backgroundSize: "30px 30px", transform: "perspective(500px) rotateX(60deg) scale(2)", transformOrigin: "top center" }}></div>

            <motion.div className="w-full max-w-[1400px] z-10 flex flex-col gap-6" variants={containerV} initial="hidden" animate="show">
                <motion.div variants={itemV} className="relative bg-black/40 border border-violet-500/20 p-6 overflow-hidden"
                    style={{ clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0 100%)" }}>
                    <div className="absolute top-0 right-0 w-[500px] h-full bg-gradient-to-l from-violet-600/10 to-transparent pointer-events-none"></div>

                    <div className="flex flex-col lg:flex-row justify-between gap-6 relative z-10">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <span className="text-violet-400/50 font-mono tracking-widest text-[10px] uppercase border border-violet-500/20 px-2 flex items-center gap-2 bg-violet-500/5">
                                    <span className="w-1.5 h-1.5 bg-rose-500 animate-pulse rounded-full"></span> CASE_ID // {activeCase.id}
                                </span>
                                <span className="text-white/30 text-[10px] uppercase font-mono tracking-widest bg-black px-2 border border-white/10">{activeCase.created}</span>
                            </div>
                            <h1 className="text-3xl md:text-5xl font-black bg-gradient-to-r from-violet-400 to-fuchsia-400 text-transparent bg-clip-text leading-tight tracking-tight uppercase">
                                {activeCase.title}
                            </h1>
                            <p className="text-violet-200/60 mt-2 font-mono text-xs max-w-xl leading-relaxed border-l-2 border-violet-500 pl-3">
                                {activeCase.summary}
                            </p>
                        </div>

                        <div className="flex gap-4 items-center">
                            <div className="flex flex-col items-end gap-1 px-4 border-r border-white/10">
                                <span className="text-[10px] font-mono uppercase text-white/30">Threat_Class</span>
                                <span className="text-rose-400 font-mono font-bold text-xs uppercase bg-rose-500/10 px-2 py-0.5 border border-rose-500/20">{activeCase.classification}</span>
                            </div>
                            <div className="flex flex-col items-end gap-1 px-4 border-r border-white/10">
                                <span className="text-[10px] font-mono uppercase text-white/30">Severtity</span>
                                <span className="text-white font-black text-xl">{(activeCase.severity || "unknown").toUpperCase()}</span>
                            </div>
                            <div className="flex flex-col items-end gap-1 pr-4">
                                <span className="text-[10px] font-mono uppercase text-fuchsia-400/80">Risk_Score</span>
                                <span className="text-5xl font-black text-fuchsia-400 tracking-tighter drop-shadow-[0_0_10px_rgba(232,121,249,0.5)]">{activeCase.riskScore}</span>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* Case Selector */}
                {investigations.length > 1 && (
                    <motion.div variants={itemV} className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                        {investigations.map((inv, i) => (
                            <button key={inv.id || i} onClick={() => setSelectedCaseIndex(i)}
                                className={`shrink-0 px-4 py-2 border text-[10px] font-mono uppercase tracking-widest transition-all ${
                                    i === selectedCaseIndex
                                        ? 'border-violet-500 bg-violet-500/20 text-violet-300 shadow-[0_0_10px_rgba(139,92,246,0.3)]'
                                        : 'border-white/10 bg-black/40 text-white/40 hover:text-white/70 hover:border-white/20'
                                }`}>
                                {inv.id} — {(inv.severity || "").toUpperCase()}
                            </button>
                        ))}
                    </motion.div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <motion.div variants={itemV} className="lg:col-span-2 border border-white/10 bg-[#0B0A10] p-5 relative overflow-hidden flex flex-col min-h-[460px]">
                        <div className="flex items-center gap-3 border-b border-white/10 pb-3 mb-6 relative z-20">
                            {icons.network}
                            <span className="text-white font-mono text-xs font-bold tracking-[0.15em] uppercase">Entity_Relationship_Matrix</span>
                            <span className="ml-auto text-white/30 font-mono text-[9px] uppercase border border-white/10 px-2 pb-0.5">Live Mapping</span>
                        </div>

                        <div className="flex-1 relative w-full h-full my-4">
                            {(() => {
                                const srcIPs = activeCase.evidence?.suspiciousIPs || [];
                                const targets = activeCase.affectedDevices || [];
                                const srcCount = Math.max(srcIPs.length, 1);
                                const tgtCount = Math.max(targets.length, 1);
                                return (
                                    <>
                                        <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
                                            <defs>
                                                <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
                                                    <stop offset="0%" stopColor="#F43F5E" stopOpacity="0.8" />
                                                    <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.8" />
                                                </linearGradient>
                                            </defs>
                                            {srcIPs.map((_, idx) => {
                                                const yPct = srcCount === 1 ? 50 : 20 + (idx * 60) / (srcCount - 1);
                                                return (<path key={`sl-${idx}`} d={`M 20% ${yPct}% L 50% 50%`} fill="none" stroke="url(#lineGrad)" strokeWidth="1" strokeDasharray="4 4" className="animate-[dash_20s_linear_infinite]" />);
                                            })}
                                            {targets.map((_, idx) => {
                                                const yPct = tgtCount === 1 ? 50 : 15 + (idx * 70) / (tgtCount - 1);
                                                return (<path key={`tl-${idx}`} d={`M 50% 50% L 80% ${yPct}%`} fill="none" stroke="url(#lineGrad)" strokeWidth="1.5" className="animate-pulse" />);
                                            })}
                                        </svg>

                                        <style dangerouslySetInnerHTML={{__html: `@keyframes dash { to { stroke-dashoffset: -1000; } }`}} />

                                        {srcIPs.map((ip, idx) => {
                                            const yPct = srcCount === 1 ? 50 : 20 + (idx * 60) / (srcCount - 1);
                                            const isFirst = idx === 0;
                                            return (
                                                <div key={`ip-${idx}`} className="absolute left-[20%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group cursor-crosshair" style={{ top: `${yPct}%` }}>
                                                    <div className={`w-10 h-10 border-2 ${isFirst ? 'border-rose-500 bg-rose-500/20' : 'border-orange-500 bg-orange-500/20'} rotate-45 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-[0_0_15px_rgba(244,63,94,0.4)]`}></div>
                                                    <div className={`bg-black/80 px-2 py-0.5 border ${isFirst ? 'border-rose-500/30 text-rose-300' : 'border-orange-500/30 text-orange-300'} text-[9px] font-mono text-center`}>{ip.ip}<br/><span className="text-white/40">{ip.origin || "Unknown"}</span></div>
                                                </div>
                                            );
                                        })}

                                        <div className="absolute top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group cursor-crosshair z-10">
                                            <div className="w-16 h-16 border border-violet-400 bg-violet-600/20 rounded-full flex items-center justify-center mb-2 animate-[spin_10s_linear_infinite] group-hover:bg-violet-600/40 transition-colors shadow-[0_0_30px_rgba(124,58,237,0.3)]">
                                                <div className="w-12 h-12 border-4 border-t-violet-400 border-r-transparent border-b-transparent border-l-transparent rounded-full opacity-50"></div>
                                            </div>
                                            <div className="absolute w-6 h-6 bg-violet-400 rounded-full flex items-center justify-center shadow-[0_0_15px_#A78BFA]">
                                                <span className="text-black text-[10px] font-black">{(activeCase.classification || "T")[0].toUpperCase()}</span>
                                            </div>
                                            <div className="bg-black/90 px-3 py-1 border border-violet-500 flex flex-col items-center mt-6">
                                                <span className="text-[10px] font-bold text-violet-300 uppercase tracking-widest">{activeCase.evidence?.malwareIndicators?.[0]?.type || activeCase.classification || "Unknown Threat"}</span>
                                                <span className="text-[8px] font-mono text-white/50">{(activeCase.evidence?.malwareIndicators?.[0]?.hash || "analyzing").slice(0, 12)}...</span>
                                            </div>
                                        </div>

                                        {targets.map((device, idx) => {
                                            const yPct = tgtCount === 1 ? 50 : 15 + (idx * 70) / (tgtCount - 1);
                                            const isCompromised = device.status === "compromised";
                                            return (
                                                <div key={`dev-${idx}`} className="absolute left-[80%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center" style={{ top: `${yPct}%` }}>
                                                    <div className={`w-12 h-8 border ${isCompromised ? 'border-rose-500/50 bg-rose-500/10' : 'border-amber-500/50 bg-amber-500/10'} mb-2 relative overflow-hidden flex items-center justify-center`}>
                                                        <div className={`absolute left-0 top-0 bottom-0 w-1 ${isCompromised ? 'bg-rose-500' : 'bg-amber-500'}`}></div>
                                                        <span className={`text-[10px] font-mono ${isCompromised ? 'text-rose-400' : 'text-amber-400'} uppercase font-bold`}>NODE</span>
                                                    </div>
                                                    <div className="bg-black/80 px-2 py-0.5 border border-white/10 text-[9px] text-white text-center whitespace-nowrap">
                                                        {device.name}<br/>
                                                        <span className={`${isCompromised ? 'text-rose-400' : 'text-amber-400'} uppercase tracking-widest font-black text-[8px]`}>{device.status}</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </>
                                );
                            })()}
                        </div>
                    </motion.div>

                    <motion.div variants={itemV} className="flex flex-col gap-6">
                        <div className="border border-white/10 bg-black overflow-hidden flex flex-col h-[230px] p-1 font-mono group">
                            <div className="bg-[#1a1a2e] px-3 py-1.5 flex justify-between items-center border border-white/10 m-1 shrink-0">
                                <span className="text-fuchsia-400 text-[9px] uppercase tracking-widest font-bold">Memory_Hex_Dump /// Payload_Extraction</span>
                                <span className="text-white/30 text-[9px]">{icons.doc}</span>
                            </div>
                            <div className="flex-1 overflow-hidden relative">
                                <div className="absolute bottom-0 w-full pl-3 pr-2 pb-2 text-[9px] leading-[14px]">
                                    {hexLines.map((line, i) => (
                                        <div key={i} className="flex opacity-80 group-hover:opacity-100 transition-opacity whitespace-pre">
                                            <span className="text-white/20 mr-4 w-8">0x{line.addr}</span>
                                            <span className="text-cyan-400/70 mr-4 tracking-[0.1em] flex-1">{line.hex}</span>
                                            <span className="text-rose-400/60 hidden sm:block">{line.chars}</span>
                                        </div>
                                    ))}
                                    <div className="flex">
                                        <span className="text-white/20 mr-4 w-8">0x{(hexLines.length * 8).toString(16).padStart(4,'0').toUpperCase()}</span>
                                        <span className="w-1.5 h-3 bg-fuchsia-500 animate-[pulse_0.5s_infinite] inline-block mt-0.5"></span>
                                    </div>
                                </div>
                                <div className="absolute top-0 w-full h-12 bg-gradient-to-b from-black to-transparent pointer-events-none"></div>
                            </div>
                        </div>

                        <div className="border border-white/10 bg-black/40 flex flex-col flex-1 p-5">
                            <div className="flex items-center gap-3 mb-4 opacity-70">
                                {icons.cpu}
                                <span className="text-white font-mono text-xs font-bold tracking-[0.15em] uppercase">Tactical_Timeline</span>
                            </div>
                            <div className="flex flex-col gap-4 relative">
                                <div className="absolute left-[3px] top-6 bottom-4 w-px bg-white/10"></div>
                                {(activeCase.timeline || []).map((evt, i) => (
                                    <div key={i} className="flex gap-4 relative z-10">
                                        <div className="w-2 h-2 rounded-full border-2 border-black bg-white/50 mt-1.5 shrink-0 shadow-[0_0_0_1px_rgba(255,255,255,0.2)]"></div>
                                        <div>
                                            <div className="text-[10px] font-mono text-white/30 mb-0.5">{evt.time}</div>
                                            <div className="text-xs text-white/70 leading-relaxed font-sans">{evt.event}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                </div>

                <motion.div variants={itemV} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* AI DEEP ANALYSIS */}
                    <div className="border border-white/10 bg-black/40 p-5 relative overflow-hidden">
                        <div className="absolute top-0 right-0 text-[80px] text-violet-500/5 rotate-12 -mt-2 mr-2 pointer-events-none font-black">AI</div>
                        <div className="flex items-center gap-2 mb-4">
                            {icons.cpu}
                            <span className="text-white font-mono text-xs font-bold tracking-[0.15em] uppercase">NeuroGuard_AI_Analysis</span>
                            <span className="ml-auto text-[9px] font-mono uppercase text-violet-400 bg-violet-500/10 border border-violet-500/20 px-2 py-0.5">OpenRouter AI</span>
                        </div>
                        <div className="bg-[#111] border border-white/10 p-4 font-mono text-[11px] flex flex-col gap-2 rounded-md max-h-[200px] overflow-y-auto custom-scrollbar">
                            <div className="flex gap-2 text-white/30 mb-1 border-b border-white/10 pb-2">
                                <span className="text-violet-500">▶</span><span>ANALYSIS_OUTPUT</span>
                            </div>
                            <p className="text-white/70 leading-relaxed whitespace-pre-wrap">{activeCase.aiAnalysis?.reasoning || "AI analysis pending..."}</p>
                        </div>
                    </div>

                    {/* HACKER PROFILE */}
                    <div className="border border-white/10 bg-black/40 p-5 relative overflow-hidden">
                        <div className="flex items-center gap-2 mb-4">
                            {icons.shield}
                            <span className="text-white font-mono text-xs font-bold tracking-[0.15em] uppercase">Hacker_Profile</span>
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center gap-3 p-3 bg-white/[0.02] border-l-2 border-rose-500">
                                <span className="text-[10px] font-mono text-white/40 uppercase w-28 shrink-0">Est_Location</span>
                                <span className="text-rose-300 text-sm font-bold">{activeCase.hackerProfile?.estimatedLocation || activeCase.evidence?.suspiciousIPs?.[0]?.origin || "Analyzing..."}</span>
                            </div>
                            <div className="flex items-center gap-3 p-3 bg-white/[0.02] border-l-2 border-orange-500">
                                <span className="text-[10px] font-mono text-white/40 uppercase w-28 shrink-0">Attack_Pattern</span>
                                <span className="text-orange-300 text-sm font-semibold">{activeCase.hackerProfile?.attackPattern || "Unknown"}</span>
                            </div>
                            <div className="flex items-center gap-3 p-3 bg-white/[0.02] border-l-2 border-fuchsia-500">
                                <span className="text-[10px] font-mono text-white/40 uppercase w-28 shrink-0">Risk_Level</span>
                                <span className="text-fuchsia-300 text-sm font-black uppercase">{activeCase.hackerProfile?.riskLevel || activeCase.severity || "Unknown"}</span>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* ATTACK TECHNIQUE + BLOCKED IPS */}
                <motion.div variants={itemV} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* ATTACK TECHNIQUE (MITRE ATT&CK) */}
                    <div className="border border-white/10 bg-black/40 p-5 relative overflow-hidden">
                        <div className="flex items-center gap-2 mb-4">
                            {icons.network}
                            <span className="text-white font-mono text-xs font-bold tracking-[0.15em] uppercase">Attack_Technique</span>
                            {activeCase.attackTechnique?.mitreId && (
                                <span className="ml-auto text-[9px] font-mono uppercase text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5">
                                    MITRE {activeCase.attackTechnique.mitreId}
                                </span>
                            )}
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="border-l-2 border-cyan-500 pl-3">
                                <h4 className="text-cyan-300 text-sm font-bold">{activeCase.attackTechnique?.name || "Analyzing..."}</h4>
                                <p className="text-white/50 text-xs mt-1 leading-relaxed">{activeCase.attackTechnique?.description || "Technique classification in progress."}</p>
                            </div>
                            {activeCase.attackTechnique?.prevention?.length > 0 && (
                                <div className="mt-2">
                                    <span className="text-[9px] font-mono uppercase text-emerald-400/70 tracking-widest">Prevention_Measures</span>
                                    <div className="flex flex-col gap-1.5 mt-2">
                                        {activeCase.attackTechnique.prevention.map((step, i) => (
                                            <div key={i} className="flex items-start gap-2 text-xs text-white/60">
                                                <span className="text-emerald-400 mt-0.5 shrink-0">&#x2713;</span>
                                                <span>{step}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* BLOCKED IPs */}
                    <div className="border border-white/10 bg-black/40 p-5 relative overflow-hidden">
                        <div className="flex items-center gap-2 mb-4">
                            {icons.shield}
                            <span className="text-white font-mono text-xs font-bold tracking-[0.15em] uppercase">Blocked_IPs</span>
                            <span className="ml-auto text-[9px] font-mono uppercase text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5">
                                {(activeCase.blockedIPs || []).length > 0 ? "ENFORCED" : "MONITORING"}
                            </span>
                        </div>
                        {(activeCase.blockedIPs || []).length === 0 ? (
                            <div className="text-white/40 text-sm font-mono py-4">No IPs blocked for this case yet.</div>
                        ) : (
                            <div className="flex flex-col gap-3">
                                {activeCase.blockedIPs.map((entry, i) => (
                                    <div key={i} className="bg-rose-500/5 border border-rose-500/20 p-3 flex flex-col gap-1">
                                        <div className="flex items-center justify-between">
                                            <span className="text-rose-400 font-mono text-sm font-bold">{entry.ip}</span>
                                            <span className="text-[9px] font-mono text-white/30">{entry.timestamp ? new Date(entry.timestamp).toLocaleString() : ""}</span>
                                        </div>
                                        <span className="text-white/50 text-[10px] font-mono">{entry.reason}</span>
                                        {entry.technique && (
                                            <span className="text-amber-400/70 text-[9px] font-mono uppercase">Technique: {entry.technique}</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Evidence Anomalies */}
                        {(activeCase.evidence?.anomalies || []).length > 0 && (
                            <div className="mt-4 pt-3 border-t border-white/10">
                                <span className="text-[9px] font-mono uppercase text-amber-400/70 tracking-widest">Network_Anomalies</span>
                                <div className="flex flex-col gap-1.5 mt-2">
                                    {activeCase.evidence.anomalies.map((anomaly, i) => (
                                        <div key={i} className="flex items-start gap-2 text-xs text-amber-300/70">
                                            <span className="text-amber-500 mt-0.5 shrink-0">!</span>
                                            <span>{anomaly}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </motion.div>

                {/* DATA-DRIVEN MITIGATION ACTIONS */}
                <motion.div variants={itemV} className="pb-8">
                    <div className="flex items-center gap-2 mb-3">
                        <span className="text-white/40 font-mono text-[10px] uppercase tracking-widest">Recommended_Mitigations</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {(activeCase.aiAnalysis?.mitigations && activeCase.aiAnalysis.mitigations.length > 0
                            ? activeCase.aiAnalysis.mitigations
                            : ["Block source IP at firewall", "Isolate affected subnet", "Conduct forensic imaging", "Review firmware patches"]
                        ).map((mitigation, i) => {
                            const colors = [
                                { bg: "bg-rose-500/10", border: "border-rose-500/50", text: "text-rose-400" },
                                { bg: "bg-orange-500/10", border: "border-orange-500/50", text: "text-orange-400" },
                                { bg: "bg-fuchsia-500/10", border: "border-fuchsia-500/50", text: "text-fuchsia-400" },
                                { bg: "bg-cyan-500/10", border: "border-cyan-500/50", text: "text-cyan-400" },
                                { bg: "bg-emerald-500/10", border: "border-emerald-500/50", text: "text-emerald-400" },
                                { bg: "bg-amber-500/10", border: "border-amber-500/50", text: "text-amber-400" },
                            ];
                            const c = colors[i % colors.length];
                            return (
                                <div key={i} className={`${c.bg} border ${c.border} p-4 flex flex-col gap-2 items-start relative overflow-hidden`}>
                                    <span className={`text-[9px] font-mono uppercase tracking-widest ${c.text} font-bold`}>[MITIGATION_{String(i + 1).padStart(2, '0')}]</span>
                                    <span className="text-white/80 text-xs font-semibold leading-relaxed">{mitigation}</span>
                                </div>
                            );
                        })}
                    </div>
                </motion.div>
            </motion.div>
        </div>
    );
}
