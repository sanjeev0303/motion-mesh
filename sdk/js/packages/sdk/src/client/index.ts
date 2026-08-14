import { UploadVideoFields, UploadVideoResult } from "../types/index.js";
import { handleApiError } from "../utils/handleApiError.js";
import { uploadFile } from "../services/uploadFile.js";
import { Agent } from "undici";

type onProgressType = {
    onProgress?: (progress: {
        loaded: number;
        total: number;
        percent: number;
    }) => void;
};

export interface FileMeta {
    filename: string;
    contentType: string;
    size: number;
}

/**
 * Public MotionMesh SDK client.
 *
 * The API endpoint is intentionally NOT configurable through the public
 * constructor. A MotionMesh API key is the only credential/configuration
 * required by consumers. This prevents applications from accidentally
 * pointing the production SDK at an arbitrary endpoint and gives us one
 * canonical production API surface.
 */
const MOTIONMESH_API_BASE_URL = "https://api.motionmesh.co.in/v1";

function extractFileMeta(file: File | Buffer | Uint8Array): FileMeta {
    if (typeof File !== "undefined" && file instanceof File) {
        return {
            filename: file.name,
            contentType: file.type || "application/octet-stream",
            size: file.size,
        };
    }

    return {
        filename: "upload",
        contentType: "application/octet-stream",
        size: (file as Buffer | Uint8Array).byteLength,
    };
}

/**
 * Shared production-grade connection pool.
 * Hidden from the public API, ensuring 100K clients share 1 Agent.
 */
const sharedDispatcher = new Agent({
    connections: 100,
    keepAliveTimeout: 10000,
    keepAliveMaxTimeout: 30000,
});

export class MotionMeshClient {
    private readonly apiKey: string;

    /**
     * Create a MotionMesh client using only an API key.
     *
     * @example
     * const client = new MotionMeshClient("mot_live_...");
     */
    constructor(apiKey: string) {
        if (!apiKey || typeof apiKey !== "string") {
            throw new Error("MotionMesh API key is required");
        }

        const normalized = apiKey.trim();
        if (
            !normalized.startsWith("mot_live_") &&
            !normalized.startsWith("mot_test_")
        ) {
            throw new Error(
                "Invalid MotionMesh API key. Expected mot_live_... or mot_test_..."
            );
        }

        this.apiKey = normalized;
    }

    private async request(path: string, options: RequestInit = {}) {
        const url = `${MOTIONMESH_API_BASE_URL}${path}`;
        const headers = new Headers(options.headers);

        headers.set("Authorization", `Bearer ${this.apiKey}`);

        if (options.body && !(options.body instanceof FormData)) {
            headers.set("Content-Type", "application/json");
        }

        const response = await fetch(url, {
            ...options,
            headers,
            dispatcher: sharedDispatcher,
        } as RequestInit & { dispatcher: any });

        if (!response.ok) {
            await handleApiError(response, "api_request");
        }

        if (response.status === 204) {
            return null;
        }

        return response.json();
    }

    videos = {
        list: async (options?: {
            limit?: number;
            cursor?: string;
            external_user_id?: string;
        }) => {
            const queryParams = new URLSearchParams();

            if (options?.limit) {
                queryParams.append("limit", String(options.limit));
            }
            if (options?.cursor) {
                queryParams.append("cursor", options.cursor);
            }
            if (options?.external_user_id) {
                queryParams.append(
                    "external_user_id",
                    options.external_user_id
                );
            }

            const queryStr = queryParams.toString();
            const path = queryStr ? `/videos?${queryStr}` : "/videos";
            const data = await this.request(path);

            return data.videos;
        },

        get: async (videoId: string) => {
            return this.request(`/videos/${videoId}`);
        },

        playback: async (videoId: string) => {
            return this.request(`/videos/${videoId}/playback`);
        },
    };

    mediaConverter = {
        createJob: async (videoId: string) => {
            return this.request(`/videos/${videoId}/transcode`, {
                method: "POST",
            });
        },

        listJobs: async (options?: { limit?: number }) => {
            const queryParams = new URLSearchParams();

            if (options?.limit) {
                queryParams.append("limit", String(options.limit));
            }

            const queryStr = queryParams.toString();
            const path = queryStr ? `/jobs?${queryStr}` : "/jobs";

            return this.request(path);
        },
    };

    buckets = {
        list: async () => {
            return this.request("/buckets");
        },
    };

    async uploadVideo(
        options: UploadVideoFields,
        onProgress?: onProgressType
    ): Promise<UploadVideoResult> {
        if (!options.video) {
            throw new Error("Video file is required");
        }

        const { filename, size } = extractFileMeta(options.video);

        const initialResponse = await this.request("/videos/multipart", {
            method: "POST",
            body: JSON.stringify({
                filename,
                size_bytes: size,
                bucket_id: (options as any).bucketId,
                transcode_bucket_id: (options as any).transcodeBucketId,
                external_user_id: (options as any).externalUserId,
            }),
        });

        const partSize = 5 * 1024 * 1024;
        const totalParts = Math.ceil(size / partSize);

        const partsResponse = await this.request(
            `/videos/multipart/${initialResponse.video.id}/parts?upload_id=${initialResponse.upload_id}&count=${totalParts}`
        );

        const uploadData = {
            objectId: initialResponse.video.id,
            key: initialResponse.object_key,
            uploadId: initialResponse.upload_id,
            parts: partsResponse.parts,
            partSize,
        };

        const { objectId, key, uploadId, completedParts } = await uploadFile(
            options.video as any,
            uploadData,
            onProgress
        );

        await this.request(`/videos/multipart/${objectId}/complete`, {
            method: "POST",
            body: JSON.stringify({
                upload_id: uploadId,
                parts: completedParts,
            }),
        });

        return { key };
    }
}

/**
 * Backwards-compatible alias.
 *
 * New integrations should prefer MotionMeshClient.
 */
export const motionmesh = MotionMeshClient;
