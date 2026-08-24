import { NextResponse } from "next/server";
import { getAllDevices, getNetworkInfo } from "@/lib/deviceStore";
import { exec } from "child_process";
import path from "path";

export const dynamic = "force-dynamic";

function runPythonScanner() {
    return new Promise((resolve) => {
        const scriptPath = path.join(process.cwd(), "..", "backend", "live_scanner.py");
        const fallbackPath = "c:\\Users\\pecul\\Desktop\\Peshal\\college\\Hackathon\\Neuroguard\\backend\\live_scanner.py";
        const target = require("fs").existsSync(scriptPath) ? scriptPath : fallbackPath;
        exec(`python "${target}" --once`, { timeout: 3500 }, (error, stdout, stderr) => {
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
