import { NextResponse } from "next/server";
import { getAllDevices } from "@/lib/deviceStore";

export const dynamic = "force-dynamic";

export async function POST(req) {
    try {
        const body = await req.json().catch(() => ({}));
        const command = (body.command || "").trim();

        if (!command) {
            return NextResponse.json({
                status: "success",
                message: "Hello! I am NeuroGuard AI Assistant. How can I assist with your network security?",
                actions: []
            });
        }

        const lowerCmd = command.toLowerCase();
        const liveDevices = getAllDevices();
        const connectedCount = liveDevices.filter(d => d.connected && !d.blocked).length;
        const blockedCount = liveDevices.filter(d => d.blocked).length;
        const surveillanceCount = liveDevices.filter(d => (d.surveillance || d.trusted === false) && !d.blocked).length;

        // Instant local navigation detection for zero-latency response
        if (lowerCmd.includes("dashboard") || (lowerCmd.includes("go to") && lowerCmd.includes("dashboard")) || lowerCmd.includes("open dashboard")) {
            return NextResponse.json({
                status: "success",
                message: "Navigating to Security Dashboard.",
                actions: [{ type: "navigate", page: "/dashboard" }]
            });
        }
        if (lowerCmd.includes("device") || lowerCmd.includes("devices") || lowerCmd.includes("connected device")) {
            if (lowerCmd.includes("go to") || lowerCmd.includes("navigate") || lowerCmd.includes("open") || lowerCmd.includes("show")) {
                return NextResponse.json({
                    status: "success",
                    message: `Navigating to Devices portal. You currently have ${connectedCount} active devices connected.`,
                    actions: [{ type: "navigate", page: "/devices" }]
                });
            }
        }
        if (lowerCmd.includes("network") || lowerCmd.includes("topology") || lowerCmd.includes("mesh")) {
            if (lowerCmd.includes("go to") || lowerCmd.includes("navigate") || lowerCmd.includes("open") || lowerCmd.includes("show")) {
                return NextResponse.json({
                    status: "success",
                    message: "Navigating to Network Topology and Mesh Inspector.",
                    actions: [{ type: "navigate", page: "/network" }]
                });
            }
        }
        if (lowerCmd.includes("threat") || lowerCmd.includes("threats") || lowerCmd.includes("attack") || lowerCmd.includes("alert")) {
            if (lowerCmd.includes("go to") || lowerCmd.includes("navigate") || lowerCmd.includes("open") || lowerCmd.includes("show")) {
                return NextResponse.json({
                    status: "success",
                    message: "Opening Threat Radar and Live Attack Detection.",
                    actions: [{ type: "navigate", page: "/threats" }]
                });
            }
        }
        if (lowerCmd.includes("investigat") || lowerCmd.includes("forensic") || lowerCmd.includes("audit")) {
            if (lowerCmd.includes("go to") || lowerCmd.includes("navigate") || lowerCmd.includes("open") || lowerCmd.includes("show")) {
                return NextResponse.json({
                    status: "success",
                    message: "Opening Forensics and AI Investigation Suite.",
                    actions: [{ type: "navigate", page: "/investigations" }]
                });
            }
        }
        if (lowerCmd.includes("report") || lowerCmd.includes("compliance") || lowerCmd.includes("summary")) {
            if (lowerCmd.includes("go to") || lowerCmd.includes("navigate") || lowerCmd.includes("open") || lowerCmd.includes("show")) {
                return NextResponse.json({
                    status: "success",
                    message: "Opening Security Reports and Compliance Center.",
                    actions: [{ type: "navigate", page: "/reports" }]
                });
            }
        }
        if (lowerCmd.includes("home") || lowerCmd.includes("welcome")) {
            if (lowerCmd.includes("go to") || lowerCmd.includes("navigate") || lowerCmd.includes("open") || lowerCmd.includes("show")) {
                return NextResponse.json({
                    status: "success",
                    message: "Navigating to Homepage.",
                    actions: [{ type: "navigate", page: "/" }]
                });
            }
        }

        // Direct device count answer
        if ((lowerCmd.includes("how many") || lowerCmd.includes("what devices") || lowerCmd.includes("list devices")) && lowerCmd.includes("device")) {
            const names = liveDevices.filter(d => d.connected && !d.blocked).map(d => d.name).slice(0, 4).join(", ");
            return NextResponse.json({
                status: "success",
                message: `There are currently ${connectedCount} active devices connected to your network, including ${names}.`,
                actions: []
            });
        }

        // Send general questions and complex queries to OpenRouter AI
        const apiKey = process.env.OPENROUTER_API_KEY || process.env.BEDROCK_API_KEY;
        const model = process.env.OPENROUTER_MODEL || "inclusionai/ling-3.0-flash";

        if (!apiKey) {
            return NextResponse.json({
                status: "success",
                message: `I heard: "${command}". All systems are currently nominal with ${connectedCount} devices connected.`,
                actions: []
            });
        }

        const deviceSummary = liveDevices.map(d => `${d.name} (${d.ip}, Type: ${d.type}, Status: ${d.blocked ? "Blocked" : d.connected ? "Connected" : "Offline"})`).join("; ");

        const systemPrompt = `You are NeuroGuard AI, a friendly, authoritative, and concise voice cybersecurity assistant for an IoT Security Operating System.
Current Network Telemetry:
- Total Connected Devices: ${connectedCount}
- Devices: ${deviceSummary}
- Blocked Nodes: ${blockedCount}
- Surveillance Nodes: ${surveillanceCount}

Navigation Pages Available:
- /dashboard (Security Dashboard)
- /devices (Device Lifecycle & Live Devices)
- /network (Network Topology & Mesh)
- /threats (Threat Radar & Attack Logs)
- /investigations (AI Forensics Suite)
- /reports (Security Reports)

Instructions:
1. Answer the user's question clearly, conversationally, and concisely (1 to 2 sentences max, suitable for voice output).
2. If the user asked to navigate or view a page, also specify which page to go to.
3. Respond in valid JSON format:
{
  "message": "Your spoken answer here",
  "navigate": "/page_route" (or null if no navigation requested)
}`;

        const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "http://localhost:3000",
                "X-Title": "NeuroGuard Voice Assistant",
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: command }
                ],
                max_tokens: 150,
                temperature: 0.3
            })
        });

        if (!aiResponse.ok) {
            throw new Error(`OpenRouter HTTP ${aiResponse.status}`);
        }

        const aiData = await aiResponse.json();
        const content = aiData?.choices?.[0]?.message?.content || "";
        
        let parsed = null;
        try {
            const cleanJson = content.replace(/```json/g, "").replace(/```/g, "").trim();
            parsed = JSON.parse(cleanJson);
        } catch (e) {
            parsed = { message: content.replace(/[\{\}\"\[\]]/g, "").trim() };
        }

        let message = (parsed?.message || content || "").trim();
        message = message.replace(/^[{\"\s]*message[\"\s]*:\s*\"?/i, "")
                         .replace(/\"?\s*,\s*\"?navigate[\"\s]*:.*$/is, "")
                         .replace(/message\s*:\s*.*$/is, "")
                         .replace(/[\{\}\[\]\"]/g, "")
                         .trim();

        if (!message) {
            message = `Understood. Processing: ${command}`;
        }

        const actions = [];
        if (parsed?.navigate && typeof parsed.navigate === "string" && parsed.navigate.startsWith("/")) {
            actions.push({ type: "navigate", page: parsed.navigate });
        }

        return NextResponse.json({
            status: "success",
            message: message,
            actions: actions
        });

    } catch (err) {
        console.error("AI Agent Endpoint Error:", err);
        return NextResponse.json({
            status: "success",
            message: "I am actively monitoring your network. How can I assist you?",
            actions: []
        });
    }
}
