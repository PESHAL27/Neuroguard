import { getAllDevices } from "@/lib/deviceStore";

export const dynamic = "force-dynamic";

export async function GET(req) {
    let intervalId;
    const stream = new ReadableStream({
        start(controller) {
            const sendUpdate = () => {
                try {
                    const devices = getAllDevices();
                    const payload = `data: ${JSON.stringify(devices)}\n\n`;
                    controller.enqueue(new TextEncoder().encode(payload));
                } catch (err) {
                    // Stream closed
                }
            };

            // Immediate initial snapshot
            sendUpdate();

            // Push updates every 1000ms for smooth, flicker-free live response
            intervalId = setInterval(sendUpdate, 1000);
        },
        cancel() {
            if (intervalId) clearInterval(intervalId);
        }
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
        }
    });
}
