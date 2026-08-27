"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { WorldMap } from "@/components/ui/world-map";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Automatically redirect to the full SOC Dashboard
    router.replace("/dashboard");
  }, [router]);

  return (
    <div className="min-h-screen w-full bg-[#0a0a0a] text-white flex items-center justify-center">
      <div className="text-center">
        <h2 className="text-2xl font-bold tracking-wide">
          <span className="text-white">Neuro</span>
          <span className="text-cyan-400">Guard</span> SOC
        </h2>
        <p className="text-gray-400 text-sm mt-2">Loading Autonomous AI Operations Center...</p>
      </div>
    </div>
  );
}

