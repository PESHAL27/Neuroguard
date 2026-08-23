import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const THREATS_FILE = path.join(process.cwd(), "..", "backend", "data", "threats_data.json");
const OVERRIDES_FILE = path.join(process.cwd(), "..", "backend", "data", "device_overrides.json");

export async function POST() {
    try {
        fs.writeFileSync(THREATS_FILE, JSON.stringify([], null, 2), "utf-8");
        fs.writeFileSync(OVERRIDES_FILE, JSON.stringify({}, null, 2), "utf-8");
        return NextResponse.json({ success: true, message: "Dashboard history and threats reset to clean baseline." });
    } catch (e) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
