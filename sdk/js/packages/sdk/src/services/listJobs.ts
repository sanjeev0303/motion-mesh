import { getEnvConfig } from "../configs/index.js";

export interface TranscodeJob {
    id: string;
    video_id: string;
    status: "queued" | "processing" | "completed" | "failed";
    progress_percent: number;
    error_msg?: string | null;
    created_at: string;
    updated_at: string;
}

export async function listJobs(
    credential: string,
    isBearer: boolean,
    limit?: number
): Promise<TranscodeJob[]> {
    const { baseUrl } = getEnvConfig();

    const params = new URLSearchParams();
    if (limit && limit > 0) params.set("limit", String(limit));

    const headers: Record<string, string> = {
        Authorization: `Bearer ${credential}`,
    };

    const url = `${baseUrl}/jobs${params.size > 0 ? "?" + params.toString() : ""}`;
    const response = await fetch(url, { method: "GET", headers });

    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const msg = (data as any)?.error || "Failed to list jobs";
        throw new Error(msg);
    }

    return response.json();
}
