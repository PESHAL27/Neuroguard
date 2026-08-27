import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export async function GET() {
    // 1. Fetch live unified real device list from FastAPI backend
    try {
        const res = await fetch(`${BACKEND_URL}/api/devices`, { cache: "no-store" });
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) {
                return NextResponse.json(data);
            }
        }
    } catch (e) {}

    // 2. Direct fallback to live_devices.json
    try {
        const baseDir = process.cwd().includes("frontend")
            ? path.join(process.cwd(), "..", "backend", "data", "live_devices.json")
            : path.join(process.cwd(), "backend", "data", "live_devices.json");

        if (fs.existsSync(baseDir)) {
            const content = JSON.parse(fs.readFileSync(baseDir, "utf8"));
            if (Array.isArray(content)) {
                return NextResponse.json(content);
            }
        }
    } catch (e) {}

    return NextResponse.json([]);
}

export async function POST(req) {
    try {
        const body = await req.json();
        const { device_id, name, type, action } = body;

        // Forward action to backend API
        if (action === "block") {
            const blockRes = await fetch(`${BACKEND_URL}/api/device/block`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ device_id, reason: "Operator block action" }),
            });
            if (blockRes.ok) {
                const data = await blockRes.json();
                return NextResponse.json(data);
            }
        } else if (action === "unblock" || action === "connect") {
            const unblockRes = await fetch(`${BACKEND_URL}/api/device/unblock`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ device_id }),
            });
            if (unblockRes.ok) {
                const data = await unblockRes.json();
                return NextResponse.json(data);
            }
        } else if (name && type) {
            const renameRes = await fetch(`${BACKEND_URL}/api/device/rename`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ device_id, name, type }),
            });
            if (renameRes.ok) {
                const data = await renameRes.json();
                return NextResponse.json(data);
            }
        }

        return NextResponse.json({ status: "success", message: "Action processed" });
    } catch (err) {
        return NextResponse.json({ status: "error", message: err.message }, { status: 500 });
    }
}
