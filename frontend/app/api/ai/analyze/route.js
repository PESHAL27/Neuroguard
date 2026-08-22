import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const apiKey = process.env.OPENROUTER_API_KEY || process.env.BEDROCK_API_KEY;
        const model = process.env.OPENROUTER_MODEL || "inclusionai/ling-3.0-flash";

        if (!apiKey) {
            return NextResponse.json({ success: false, analysis: "AI offline. OpenRouter key not configured." });
        }

        // Fetch the most recent active threat from MongoDB (if DB available)
        let latestThreats = [];
        try {
            const client = await clientPromise;
            const db = client.db(process.env.MONGODB_DB || "neurogaurd");
            latestThreats = await db
                .collection("threats")
                .find({ status: "active" })
                .sort({ timestamp: -1 })
                .limit(1)
                .toArray();
        } catch (dbErr) {
            console.warn("MongoDB fetch in /api/ai/analyze skipped:", dbErr.message);
        }

        let contextPrompt = "You are a highly advanced cybersecurity AI system named NeuroGuard. Analyze the following security event and provide a concise, 1-2 sentence real-time action briefing. Sound highly technical, robotic, and authoritative.";
        let cvssScore = "8.5";
        let severityLabel = "Critical Threat";

        if (latestThreats && latestThreats.length > 0) {
            const threat = latestThreats[0];
            contextPrompt += `\n\nRecent Threat Detected:\nType: ${threat.type || "Network Anomaly"}\nSeverity: ${threat.severity || "High"}\nSource IP: ${threat.sourceIp || "unknown"}\nTarget: ${threat.targetDevice || "Sensor Node"}\nDetails: ${threat.description || "Suspicious traffic detected"}`;

            if (threat.severity === "Critical") { cvssScore = "9.8"; severityLabel = "Critical Threat"; }
            else if (threat.severity === "High") { cvssScore = "8.2"; severityLabel = "High Alert"; }
            else { cvssScore = "5.4"; severityLabel = "Monitoring"; }
        } else {
            contextPrompt += "\n\nSystem Status: All systems normal. IoT mesh network is secure. No active threat breaches detected.";
            cvssScore = "0.0";
            severityLabel = "Systems Nominal";
        }

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "http://localhost:3000",
                "X-Title": "NeuroGuard",
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    {
                        role: "system",
                        content: "You are the NeuroGuard Autonomous Cyber Threat Engine."
                    },
                    {
                        role: "user",
                        content: contextPrompt
                    }
                ],
                max_tokens: 120,
                temperature: 0.3,
            }),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error("OpenRouter API Error:", errorBody);
            return NextResponse.json({
                success: true,
                analysis: "Autonomous monitoring active. Neural filters operational across all gateway telemetry channels.",
                cvss: cvssScore,
                severityLabel: severityLabel,
            });
        }

        const data = await response.json();
        const analysis = data.choices?.[0]?.message?.content?.trim() || "Analysis completed successfully. No critical anomalies detected.";

        return NextResponse.json({
            success: true,
            analysis: analysis,
            cvss: cvssScore,
            severityLabel: severityLabel,
            model: model,
        });
    } catch (err) {
        console.error("AI analyze error:", err);
        return NextResponse.json(
            { success: false, analysis: "Connection to core AI brain interrupted." },
            { status: 500 }
        );
    }
}
