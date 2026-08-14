import { getEnvConfig } from "../configs/index.js";
import { UploadVideoTypes } from "../types/index.js";

export const initiateUpload = async (
    body: UploadVideoTypes,
    credential: string,
    isBearer?: boolean
) => {
    const { baseUrl } = getEnvConfig();
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${credential}`
    };

    const response = await fetch(`${baseUrl}/videos`, {
        method: "POST",
        headers,
        body: JSON.stringify({
            ...body,
            bucket_id: typeof process !== "undefined" ? process.env?.MOTIONMESH_BUCKET_ID : undefined,
            transcode_bucket_id: typeof process !== "undefined" ? process.env?.MOTIONMESH_TRANSCODE_BUCKET_ID : undefined
        }),
    });

    const uploadData = await response.json()

    if (!response.ok) {
        const msg = uploadData?.message;
        const readable = Array.isArray(msg) ? msg.join(", ") : msg || uploadData?.error || "Failed to initiate upload";
        throw new Error(readable);

    }

    return uploadData;
}
