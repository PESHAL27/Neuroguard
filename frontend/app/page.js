"use client";

import { WorldMap } from "@/components/ui/world-map";

export default function Home() {
  const mapDots = [
    {
      start: { lat: 64.2008, lng: -152.4937 }, // Alaska
      end: { lat: 34.0522, lng: -118.2437 },   // Los Angeles
    },
    {
      start: { lat: 64.2008, lng: -152.4937 }, // Alaska
      end: { lat: -15.7975, lng: -47.8919 },   // Brazil
    },
    {
      start: { lat: -15.7975, lng: -47.8919 }, // Brazil
      end: { lat: 38.7223, lng: -9.1393 },     // Lisbon
    },
    {
      start: { lat: 51.5074, lng: -0.1278 },   // London
      end: { lat: 28.6139, lng: 77.209 },      // New Delhi
    },
    {
      start: { lat: 28.6139, lng: 77.209 },    // New Delhi
      end: { lat: 43.1332, lng: 131.9113 },    // Vladivostok
    },
    {
      start: { lat: 28.6139, lng: 77.209 },    // New Delhi
      end: { lat: -1.2921, lng: 36.8219 },     // Nairobi
    },
    {
      start: { lat: 35.6762, lng: 139.6503 },  // Tokyo
      end: { lat: -33.8688, lng: 151.2093 },   // Sydney
    },
  ];

  return (
    <div className="min-h-screen w-full bg-[#0a0a0a] text-white relative overflow-hidden">
      {/* World Map Background */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-full mx-auto mt-28">
          <WorldMap dots={mapDots} lineColor="#0ea5e9" />
        </div>
      </div>
    </div>
  );
}
