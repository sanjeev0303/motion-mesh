import { verifyApiKeySignature } from "../utils/apiKeySignature.js";
import { CompleteUpload } from "./completeUpload.js";
import { initiateUpload } from "./initiateUpload.js";
import { thumbnailUpload } from "./uploadThumbnail.js";
import { listVideos } from "./listVideos.js";
import { dashboardUpload } from "./dashboardUpload.js";
import { getPlaybackInfo } from "./getPlaybackInfo.js";
import { createJob } from "./createJob.js";
import { listJobs } from "./listJobs.js";

export async function handleProcessRequest({
  request,
  apiKey,
  resolveCredential,
}: {
  request: Request;
  apiKey?: string;
  resolveCredential?: () => string | Promise<string>;
}) {
  try {
    let credential = apiKey || "";
    let isBearer = false;
    
    if (resolveCredential) {
      credential = await resolveCredential();
      isBearer = true;
    } else {
      // 1. Validate API Key Presence
      if (!credential) {
        return Response.json(
          { error: "Motionmesh apiKey is required" },
          { status: 401 },
        );
      }

      // 2. Verify API Key Signature
      const isValid = await verifyApiKeySignature(credential);

      if (!isValid) {
        return Response.json(
          { error: "Your API key is invalid!" },
          { status: 401 },
        );
      }
    }

    const contentType = request.headers.get("content-type") || "";

    // 3. Handle Multipart Form-Data Requests (e.g., Thumbnail Uploads)
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const type = formData.get("type");

      if (!type || typeof type !== "string") {
        return Response.json({ error: "Type is required" }, { status: 400 });
      }

      switch (type) {
        case "upload-thumbnail": {
          const videoId = formData.get("videoId");
          const thumbnail = formData.get("thumbnail");
          const thumbnailFileName = formData.get("thumbnailFileName");
          const thumbnailContentType = formData.get("thumbnailContentType");
          const thumbnailSize = formData.get("thumbnailSize");

          if (!videoId || typeof videoId !== "string") {
            return Response.json(
              { error: "videoId is required" },
              { status: 400 },
            );
          }

          if (!(thumbnail instanceof File)) {
            return Response.json(
              { error: "Thumbnail file is required" },
              { status: 400 },
            );
          }

          const thumbnailUploadResult = await thumbnailUpload({
            credential,
            isBearer,
            videoId,
            thumbnail,
            thumbnailFileName:
              typeof thumbnailFileName === "string"
                ? thumbnailFileName
                : thumbnail.name,
            thumbnailContentType:
              typeof thumbnailContentType === "string"
                ? thumbnailContentType
                : thumbnail.type,
            thumbnailSize:
              typeof thumbnailSize === "string"
                ? Number(thumbnailSize)
                : thumbnail.size,
          });

          return Response.json({ thumbnailData: thumbnailUploadResult });
        }
        case "dashboardUpload": {
          const video = formData.get("video");
          const filename = formData.get("filename");
          const sizeBytes = formData.get("sizeBytes");
          const bucketId = formData.get("bucketId");

          if (!(video instanceof File)) {
            return Response.json(
              { error: "Video file is required" },
              { status: 400 },
            );
          }

          if (!filename || typeof filename !== "string") {
            return Response.json(
              { error: "filename is required" },
              { status: 400 },
            );
          }

          if (!sizeBytes || typeof sizeBytes !== "string") {
            return Response.json(
              { error: "sizeBytes is required" },
              { status: 400 },
            );
          }

          const uploadResult = await dashboardUpload(
            credential,
            isBearer,
            filename,
            Number(sizeBytes),
            video,
            typeof bucketId === "string" ? bucketId : undefined
          );

          return Response.json({ video: uploadResult });
        }
        default:
          return Response.json({ error: "Invalid type" }, { status: 400 });
      }
    }

    // 4. Handle Standard JSON Body Requests
    const body = await request.json();
    const { type, ...rest } = body;

    if (!type) {
      return Response.json({ error: "Type is required" }, { status: 400 });
    }

    switch (type) {
      case "upload": {
        const result = await initiateUpload(rest, credential, isBearer);
        return Response.json({ uploadData: result });
      }
      case "complete": {
        const uploadResult = await CompleteUpload(
          rest.objectId,
          rest.uploadId,
          rest.key,
          rest.parts,
          credential,
          rest.videoId,
          isBearer,
        );

        return Response.json({ trackingData: uploadResult });
      }
      case "listVideos":
      case "listAllVideos": {
        const result = await listVideos(rest, credential, isBearer);
        return Response.json({ videos: result });
      }
      case "getPlaybackInfo": {
        if (!rest.videoId) {
          return Response.json({ error: "videoId is required" }, { status: 400 });
        }
        const result = await getPlaybackInfo(rest.videoId, credential, isBearer);
        return Response.json({ playbackInfo: result });
      }
      case "createTranscodeJob": {
        if (!rest.videoId) {
          return Response.json({ error: "videoId is required" }, { status: 400 });
        }
        const result = await createJob(rest.videoId, credential, isBearer);
        return Response.json({ job: result });
      }
      case "listJobs": {
        const result = await listJobs(credential, isBearer, rest.limit);
        return Response.json({ jobs: result });
      }
      default:
        return Response.json({ error: "Invalid type" }, { status: 400 });
    }
  } catch (error: any) {
    console.error("SDK CAUGHT ERROR:", error); const message = error?.message || "An unexpected error occurred";
    return Response.json({ error: message }, { status: 500 });
  }
}
