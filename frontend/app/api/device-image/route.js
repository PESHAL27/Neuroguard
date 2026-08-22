import { NextResponse } from "next/server";

const DEVICE_IMAGE_MAP = {
    camera: "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/video.svg",
    router: "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/router.svg",
    sensor: "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/activity.svg",
    desktop: "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/monitor.svg",
    laptop: "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/laptop.svg",
    phone: "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/smartphone.svg",
    esp32: "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/cpu.svg",
    raspberry: "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/server.svg",
    unknown: "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/help-circle.svg",
};

export async function GET(req) {
    const { searchParams } = new URL(req.url);
    const type = (searchParams.get("type") || "unknown").toLowerCase();
    const image = DEVICE_IMAGE_MAP[type] || DEVICE_IMAGE_MAP.unknown;
    return NextResponse.json({ image });
}
