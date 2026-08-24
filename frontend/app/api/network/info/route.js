import { NextResponse } from "next/server";
import { getNetworkInfo } from "@/lib/deviceStore";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const info = getNetworkInfo();
        return NextResponse.json(info);
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
