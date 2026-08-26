import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const THREATS_FILE = path.join(process.cwd(), "..", "backend", "data", "threats_data.json");
const OVERRIDES_FILE = path.join(process.cwd(), "..", "backend", "data", "device_overrides.json");

export async function POST() {
    try {
        // 1. Call FastAPI backend clear-history endpoint
        try {
            await fetch("http://127.0.0.1:8000/api/clear-history", { method: "POST" });
        } catch (beErr) {}

        // 2. Direct MongoDB Atlas wipe
        try {
            const clientPromise = (await import("@/lib/mongodb")).default;
            const client = await clientPromise;
            const db = client.db(process.env.MONGODB_DB || "neurogaurd");
            await Promise.all([
                db.collection("threats").deleteMany({}),
                db.collection("events").deleteMany({}),
                db.collection("ai_actions").deleteMany({}),
                db.collection("predictions").deleteMany({}),
            ]);
        } catch (dbErr) {}

        // 3. Clear local JSON files
        fs.writeFileSync(THREATS_FILE, JSON.stringify([], null, 2), "utf-8");
        fs.writeFileSync(OVERRIDES_FILE, JSON.stringify({}, null, 2), "utf-8");
        return NextResponse.json({ success: true, message: "Dashboard history and threats reset to clean baseline." });
    } catch (e) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
