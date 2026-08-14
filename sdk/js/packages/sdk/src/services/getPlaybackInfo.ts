import { getEnvConfig } from "../configs/index.js";

export async function getPlaybackInfo(
    videoId: string,
    credential: string,
    isBearer?: boolean
) {
    const { baseUrl } = getEnvConfig();

    const headers: Record<string, string> = {
        "Authorization": `Bearer ${credential}`
    };

    const response = await fetch(`${baseUrl}/videos/${videoId}/playback`, {
        method: "GET",
        headers,
    });

    const data = await response.json();
    if (!response.ok) {
        const errorMsg = Array.isArray(data?.message) ? data.message.join(", ") : data?.message || data?.error || "Failed to get playback info";
        throw new Error(errorMsg);
    }

    return data;
}
