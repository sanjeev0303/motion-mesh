import { getEnvConfig } from "../configs/index.js";

export async function listVideos(
    options: { externalUserId?: string; limit?: number; cursor?: string },
    credential: string,
    isBearer?: boolean
) {
    const { baseUrl } = getEnvConfig();
    const query = new URLSearchParams();
    if (options.externalUserId) {
        query.append("external_user_id", options.externalUserId);
    }
    if (options.limit) query.append("limit", String(options.limit));
    if (options.cursor) query.append("cursor", options.cursor);

    const headers: Record<string, string> = {
        "Authorization": `Bearer ${credential}`
    };

    const response = await fetch(`${baseUrl}/videos?${query.toString()}`, {
        method: "GET",
        headers,
    });

    const data = await response.json();
    if (!response.ok) {
        const errorMsg = Array.isArray(data?.message) ? data.message.join(", ") : data?.message || data?.error || "Failed to list videos";
        throw new Error(errorMsg);
    }

    return data;
}
