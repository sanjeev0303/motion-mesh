import { getEnvConfig } from "../configs/index.js"

export const CompleteUpload = async (
    objectId: string,
    uploadId: string,
    key: string,
    parts: string[],
    credential: string,
    videoId: string,
    isBearer?: boolean
) => {
    const { baseUrl } = getEnvConfig()
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${credential}`
    };

    const response = await fetch(`${baseUrl}/upload/complete`, {
        method: "POST",
        headers,
        body: JSON.stringify({
            objectId,
            uploadId,
            key,
            parts,
            videoId,
        }),
    });

    const trackingData = await response.json()

    if (!response.ok) {
        const msg = trackingData?.message;
        const readable = Array.isArray(msg) ? msg.join(", ") : msg || trackingData?.error || "Failed to complete the upload upload";
        throw new Error(readable);

    }

    return trackingData;
}
