import { getEnvConfig } from "../configs/index.js";

export async function dashboardUpload(
    credential: string,
    isBearer: boolean,
    filename: string,
    sizeBytes: number,
    videoFile: File,
    bucketId?: string
) {
    const { baseUrl } = getEnvConfig();
    const headers: Record<string, string> = {
        "Authorization": `Bearer ${credential}`
    };

    // Step 1: Initiate
    const initRes = await fetch(`${baseUrl}/videos`, {
        method: "POST",
        headers: {
            ...headers,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            filename,
            size_bytes: sizeBytes,
            bucket_id: bucketId,
            transcode_bucket_id: undefined
        })
    });

    if (!initRes.ok) {
        const error = await initRes.text();
        throw new Error(`Failed to initiate upload: ${error}`);
    }

    const { video } = await initRes.json();

    // Step 2: Upload file
    const uploadRes = await fetch(`${baseUrl}/videos/${video.id}/upload`, {
        method: "POST",
        headers: {
            ...headers,
            "Content-Type": videoFile.type || "video/mp4",
            "Content-Length": String(videoFile.size),
        },
        body: videoFile,
        // Prevent fetch from chunking — Backblaze B2 requires exact Content-Length
        // @ts-ignore duplex required for streaming body in Node 18+
        duplex: "half",
    });

    if (!uploadRes.ok) {
        const error = await uploadRes.text();
        throw new Error(`Failed to upload file: ${error}`);
    }

    return video;
}
