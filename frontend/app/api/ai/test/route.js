import { NextResponse } from "next/server";

export async function GET() {
    const apiKey = process.env.OPENROUTER_API_KEY || process.env.BEDROCK_API_KEY;
    const model = process.env.OPENROUTER_MODEL || "inclusionai/ling-3.0-flash";

    if (!apiKey) {
        return NextResponse.json(
            { success: false, error: "OPENROUTER_API_KEY not configured in .env.local" },
            { status: 500 }
        );
    }

    try {
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
                        content: "You are the NeuroGuard AI Core."
                    },
                    {
                        role: "user",
                        content: "Confirm you are online. Respond in exactly one sentence."
                    }
                ],
                max_tokens: 60,
                temperature: 0.3,
            }),
        });

        if (response.ok) {
            const data = await response.json();
            const message = data.choices?.[0]?.message?.content || "Connected to OpenRouter AI";

            return NextResponse.json({
                success: true,
                message: "✅ Connected to OpenRouter AI!",
                provider: "OpenRouter",
                model: model,
                response: message.trim(),
                usage: data.usage || null,
            });
        }

        const errorBody = await response.text();
        return NextResponse.json({
            success: false,
            model: model,
            status: response.status,
            error: `OpenRouter returned ${response.status}`,
            details: errorBody,
        }, { status: response.status });

    } catch (err) {
        return NextResponse.json({
            success: false,
            error: "Failed to connect to OpenRouter AI: " + (err.message || String(err)),
        }, { status: 500 });
    }
}
