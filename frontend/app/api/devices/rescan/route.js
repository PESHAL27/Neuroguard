import { NextResponse } from "next/server";
import { getAllDevices, getNetworkInfo } from "@/lib/deviceStore";
import { exec } from "child_process";
import path from "path";

export const dynamic = "force-dynamic";

function runPythonScanner() {
    return new Promise((resolve) => {
        const fs = require("fs");
        const candidates = [
            path.join(process.cwd(), "..", "backend", "live_scanner.py"),
            path.join(process.cwd(), "backend", "live_scanner.py"),
            path.resolve("c:\\internalsih\\backend\\live_scanner.py"),
        ];
        const target = candidates.find(p => fs.existsSync(p)) || candidates[0];
        exec(`python "${target}" --once`, { timeout: 8000 }, (error, stdout, stderr) => {
            resolve({ error, stdout, stderr });
        });
    });
}

export async function POST() {
    try {
        let rescannedViaFastApi = false;
        // 1. Try FastAPI backend first
        try {
            const res = await fetch("http://localhost:8000/api/scan/rescan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                signal: AbortSignal.timeout(1500),
            });
            if (res.ok) {
                rescannedViaFastApi = true;
            }
        } catch (e) {
            rescannedViaFastApi = false;
        }

        // 2. If FastAPI is offline, invoke local Python live scanner directly
        if (!rescannedViaFastApi) {
            await runPythonScanner();
        }

        const devices = getAllDevices();
        const network = getNetworkInfo();
        return NextResponse.json({ status: "success", count: devices.length, devices, network });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
