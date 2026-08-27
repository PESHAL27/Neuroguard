"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useState, useEffect } from "react";
import { WorldMap } from "@/components/ui/world-map";

export default function Home() {
  const [metrics, setMetrics] = useState({
    activeDevices: 8,
    threatsBlocked: 0,
    systemHealth: "100%",
    socStatus: "OPERATIONAL"
  });

  useEffect(() => {
    const loadLiveStats = async () => {
      try {
        const [devRes, thrRes] = await Promise.all([
          fetch("/api/devices"),
          fetch("/api/threats")
        ]);
        if (devRes.ok) {
          const devs = await devRes.json();
          if (Array.isArray(devs)) {
            setMetrics(prev => ({ ...prev, activeDevices: devs.length }));
          }
        }
        if (thrRes.ok) {
          const thrs = await thrRes.json();
          if (Array.isArray(thrs)) {
            const blocked = thrs.filter(t => t.resolved || t.status === "mitigated" || t.status === "blocked").length;
            setMetrics(prev => ({ ...prev, threatsBlocked: blocked }));
          }
        }
      } catch (e) {}
    };

    loadLiveStats();
    const interval = setInterval(loadLiveStats, 3000);
    return () => clearInterval(interval);
  }, []);

  const features = [
    {
      title: "Real-Time Hardware Sniffer",
      desc: "Deep packet inspection on Laptop Mobile Hotspot & Wi-Fi interfaces. Detects message floods, stream exhaustion, and port scans with sub-second latency.",
      icon: "📡",
      badge: "Layer 2/3 Engine",
      color: "from-cyan-500/20 to-blue-500/10",
      border: "border-cyan-500/30"
    },
    {
      title: "Autonomous Kernel Quarantine",
      desc: "Instant kernel-level isolation using Windows Firewall rules, routing blackholes, and ARP cache purging to sever rogue attacker ESP32s.",
      icon: "🛑",
      badge: "Zero-Trust Defense",
      color: "from-rose-500/20 to-red-500/10",
      border: "border-rose-500/30"
    },
    {
      title: "IoT Node & CAM Protection",
      desc: "Specialized defense envelope for ESP32 microcontrollers, ESP32-CAM video stream nodes, smart sensors, and mobile devices.",
      icon: "🛡️",
      badge: "Edge Security",
      color: "from-emerald-500/20 to-teal-500/10",
      border: "border-emerald-500/30"
    },
    {
      title: "MITRE ATT&CK Forensics",
      desc: "Automatic MITRE threat classification (T1498, T1046, T1190) with interactive attack path graphs and AI-powered mitigation suggestions.",
      icon: "⚡",
      badge: "AI Threat Engine",
      color: "from-violet-500/20 to-purple-500/10",
      border: "border-violet-500/30"
    }
  ];

  return (
    <div className="min-h-screen w-full bg-[#0a0a0a] text-white relative overflow-hidden flex flex-col justify-between">
      {/* Dynamic Ambient Background Glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10 transform-gpu">
        <div className="absolute -top-[15%] left-[10%] w-[55%] h-[55%] bg-cyan-600/20 rounded-full blur-[140px] mix-blend-screen" />
        <div className="absolute top-[30%] right-[5%] w-[45%] h-[55%] bg-fuchsia-600/20 rounded-full blur-[140px] mix-blend-screen" />
        <div className="absolute bottom-[-10%] left-[20%] w-[50%] h-[50%] bg-emerald-600/15 rounded-full blur-[150px] mix-blend-screen" />
      </div>

      <div className="relative z-10 pt-32 pb-16 px-4 md:px-8 lg:px-12 max-w-[1400px] mx-auto w-full">
        {/* Hero Section */}
        <div className="text-center max-w-4xl mx-auto mb-16">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 mb-6 backdrop-blur-md"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-mono text-emerald-400 font-semibold tracking-wider uppercase">
              NeuroGuard Core v2.4 • SOC Online
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-4xl sm:text-5xl lg:text-7xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-200 to-cyan-400 leading-[1.1]"
          >
            Autonomous Edge Defense for IoT & Embedded Systems
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-6 text-base sm:text-lg text-white/60 max-w-2xl mx-auto leading-relaxed"
          >
            Real-time packet sniffing, automatic hardware intrusion interception, and instant kernel firewall isolation tailored for ESP32s, smart cameras, and local subnets.
          </motion.p>

          {/* Action CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-8 flex flex-wrap items-center justify-center gap-4"
          >
            <Link
              href="/dashboard"
              className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-sm transition-all shadow-[0_0_30px_rgba(6,182,212,0.4)] flex items-center gap-2 hover:scale-[1.02]"
            >
              <span>Launch SOC Dashboard</span>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </Link>

            <Link
              href="/threats"
              className="px-8 py-3.5 rounded-2xl bg-white/5 hover:bg-white/10 text-white font-semibold text-sm transition-all border border-white/10 hover:border-white/20 backdrop-blur-md flex items-center gap-2"
            >
              <span>Live Threat Radar</span>
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            </Link>
          </motion.div>
        </div>

        {/* Live SOC Metrics Ribbon */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.35 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16 p-6 rounded-3xl bg-gradient-to-b from-white/[0.04] to-white/[0.01] border border-white/10 backdrop-blur-xl shadow-2xl"
        >
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
            <p className="text-xs text-white/40 uppercase tracking-widest font-mono">Monitored Nodes</p>
            <p className="text-2xl lg:text-3xl font-bold text-white mt-1 font-mono">{metrics.activeDevices} Active</p>
            <span className="text-[11px] text-emerald-400 font-medium">● 100% Subnet Coverage</span>
          </div>

          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
            <p className="text-xs text-white/40 uppercase tracking-widest font-mono">Packet Sniffer</p>
            <p className="text-2xl lg:text-3xl font-bold text-cyan-400 mt-1 font-mono">192.168.137.x</p>
            <span className="text-[11px] text-cyan-300 font-medium">Hotspot Adapter Linked</span>
          </div>

          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
            <p className="text-xs text-white/40 uppercase tracking-widest font-mono">Response Protocol</p>
            <p className="text-2xl lg:text-3xl font-bold text-emerald-400 mt-1 font-mono">&lt; 1.2s</p>
            <span className="text-[11px] text-emerald-400 font-medium">Autonomous Kernel Block</span>
          </div>

          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
            <p className="text-xs text-white/40 uppercase tracking-widest font-mono">AI Threat Engine</p>
            <p className="text-2xl lg:text-3xl font-bold text-purple-400 mt-1 font-mono">MITRE ATT&CK</p>
            <span className="text-[11px] text-purple-300 font-medium">Enterprise Matrix Active</span>
          </div>
        </motion.div>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16">
          {features.map((feat, i) => (
            <motion.div
              key={feat.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 * i }}
              className={`p-7 rounded-3xl bg-gradient-to-br ${feat.color} border ${feat.border} backdrop-blur-xl relative overflow-hidden group hover:border-white/30 transition-all`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center text-2xl shadow-lg">
                  {feat.icon}
                </div>
                <span className="text-xs font-mono font-bold px-3 py-1 rounded-full bg-white/10 text-white/90 border border-white/10">
                  {feat.badge}
                </span>
              </div>
              <h3 className="text-xl font-bold text-white group-hover:text-cyan-300 transition-colors">
                {feat.title}
              </h3>
              <p className="text-sm text-white/60 mt-2 leading-relaxed">
                {feat.desc}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Global Threat Map Showcase */}
        <div className="rounded-3xl p-6 md:p-8 bg-gradient-to-b from-white/[0.03] to-white/[0.01] border border-white/10 backdrop-blur-xl overflow-hidden relative">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                <h3 className="text-lg font-bold text-white tracking-wide">Live Global Anomaly Matrix</h3>
              </div>
              <p className="text-xs text-white/50 font-mono mt-1">Cross-subnet forensic telemetry correlation</p>
            </div>
            <Link
              href="/threats"
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold border border-white/20 transition-all self-start md:self-auto"
            >
              Full Screen Threat Radar ➔
            </Link>
          </div>
          <div className="h-[320px] md:h-[400px] w-full relative rounded-2xl overflow-hidden border border-white/5 bg-black/40">
            <WorldMap
              dots={[
                { start: { lat: 28.6139, lng: 77.2090, label: "Local SOC Gateway (India)" }, end: { lat: 37.7749, lng: -122.4194, label: "Cloud Intelligence Node" } },
                { start: { lat: 28.6139, lng: 77.2090 }, end: { lat: 51.5074, lng: -0.1278, label: "European Relay Node" } },
                { start: { lat: 28.6139, lng: 77.2090 }, end: { lat: 35.6762, lng: 139.6503, label: "APAC Telemetry Ingest" } },
              ]}
              lineColor="#06b6d4"
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 px-4 text-center text-xs text-white/40 font-mono">
        <p>NeuroGuard Autonomous Edge SOC • Real-Time IoT Threat Neutralization System</p>
      </footer>
    </div>
  );
}
