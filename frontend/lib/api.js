export const getApiBaseUrl = () => {
    if (typeof window === "undefined") {
        return process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    }

    const { protocol, hostname } = window.location;
    const apiProtocol = protocol === "https:" ? "https:" : "http:";
    return `${apiProtocol}//${hostname}:8000`;
};


export const getApiBaseCandidates = () => {
    if (typeof window === "undefined") {
        return [process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000", "http://localhost:3000"];
    }

    const candidates = [];
    const envUrl = process.env.NEXT_PUBLIC_API_URL;
    const { hostname } = window.location;

    if (envUrl) {
        candidates.push(envUrl);
    }

    // Include relative origin for Next.js internal API routes
    candidates.push("");

    candidates.push(`http://${hostname}:8000`);

    if (hostname !== "localhost") {
        candidates.push("http://localhost:8000");
    }

    if (hostname !== "127.0.0.1") {
        candidates.push("http://127.0.0.1:8000");
    }

    return [...new Set(candidates)];
};


export const fetchApi = async (path, options) => {
    const candidates = getApiBaseCandidates();
    let lastError = null;

    for (const baseUrl of candidates) {
        try {
            return await fetch(`${baseUrl}${path}`, options);
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError || new Error("Backend is unreachable");
};


export const fetchApiJson = async (path, options) => {
    const response = await fetchApi(path, options);
    if (!response.ok) {
        throw new Error(`Request failed with HTTP ${response.status}`);
    }
    return response.json();
};


export const getWsBaseUrl = () => {
    if (typeof window === "undefined") {
        return process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";
    }

    const { protocol, hostname } = window.location;
    const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
    return `${wsProtocol}//${hostname}:8000`;
};