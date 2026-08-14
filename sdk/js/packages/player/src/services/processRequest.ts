import { getEnvConfig } from "../configs/index.js";
import { isProbablyJwt, verifyApiKeySignature } from "../utils/index.js";


type AnalyticsEventPayload = {
    event: "play" | "pause" | "heartbeat" | "seek" | "ended";
    currentTime: number;
    token: string;
    geo?: string;
    isUnique?: boolean;
};

export async function handleProcessRequest({
    request,
    apiKey,
}: {
    request: Request;
    apiKey: string;
}) {
    try {
        if (!apiKey) {
            return Response.json(
                {
                    error: "Motionmesh apiKey is required",
                },
                {
                    status: 401,
                },
            );
        }

        const looksJwt = isProbablyJwt(apiKey);

        const isValid =
            looksJwt || verifyApiKeySignature(apiKey);

        if (!isValid) {
            return Response.json(
                {
                    error: "Invalid API Key",
                },
                {
                    status: 401,
                },
            );
        }

        const authHeaders: Record<string, string> = {
            Authorization: `Bearer ${apiKey}`,
        };

        const { baseUrl } = getEnvConfig();

        const { searchParams } = new URL(request.url);

        const kind = searchParams.get("kind");

        if (kind === "settings") {
            const action = searchParams.get("action") ?? "get";
            if (action === "update") {
                const payload = await request.json().catch(() => null);
                if (!payload || typeof payload !== "object") {
                    return Response.json({ error: "Invalid settings payload"}, {status: 400})
                }

                const res = await fetch(`${baseUrl}/player/settings`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Accept: "application/json",
                        ...authHeaders,
                    },
                    body: JSON.stringify(payload),
                });

                const data = await res.json().catch(() => null);
                return Response.json(data?? { error: "Upstream error"}, {
                    status: res.status,
                });
            };

            const res = await fetch(`${baseUrl}/player/settings`, {
                headers: {
                    Accept: "application/json",
                    ...authHeaders,
                }
            });

            const data = await res.json().catch(() => null);
            return Response.json(data ?? { error: "Upstream error"}, {
                status: res.status,
            });
        }

        if (kind === "event") {
            const payload = (await request
                .json()
                .catch(() => null)) as AnalyticsEventPayload | null;

            if (
                !payload?.token ||
                !payload?.event ||
                typeof payload?.currentTime !== "number"
            ) {
                return Response.json(
                    { error: "token, event and currentTime are required" },
                    { status: 400 },
                );
            }

            let accountId = "";
            let videoId = "";
            try {
                const decodedToken = atob(payload.token);
                [accountId, videoId] = decodedToken.split(":");
            } catch (e) {
                return Response.json({ error: "invalid token" }, { status: 400 });
            }

            const backendPayload = {
                account_id: accountId,
                video_id: videoId,
                event_type: payload.event,
                timestamp: new Date().toISOString(),
                country: payload.geo || "",
            };

            const userAgent = request.headers.get("user-agent") ?? "";
            const xForwardedFor = request.headers.get("x-forwarded-for") ?? "";

            console.log("FETCHING:", `${baseUrl}/analytics/collect`); const res = await fetch(`${baseUrl}/analytics/collect`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    ...authHeaders,
                    "user-agent": userAgent,
                    "x-forwarded-for": xForwardedFor,
                },
                body: JSON.stringify(backendPayload),
            });

            const data = await res.json().catch(() => null);
            return Response.json(
                data ?? { success: res.ok },
                { status: res.status },
            );
        }

        const videoTrackingId =
            searchParams.get("videoTrackingId");

        if (!videoTrackingId) {
            return Response.json(
                {
                    error: "videoTrackingId is required",
                },
                {
                    status: 400,
                },
            );
        }

        const res = await fetch(
            `${baseUrl}/videos/${videoTrackingId}/playback`,
            {
                headers: authHeaders,
            },
        );

        const data = await res.json().catch(() => null);

        return Response.json(
            data ?? {
                error: "Upstream error",
            },
            {
                status: res.status,
            },
        );
    } catch (error: any) {
        const message =
            error?.message || "An unexpected error occurred";

        return Response.json(
            {
                error: message,
            },
            {
                status: 500,
            },
        );
    }
}
