import { getEnvConfig } from "../configs/index.js";

type ThumbnailUploadParams = {
  credential: string;
  videoId: string;
  thumbnail: File;
  thumbnailFileName: string;
  thumbnailContentType: string;
  thumbnailSize: number;
  isBearer?: boolean;
};

export const thumbnailUpload = async ({
  credential,
  videoId,
  thumbnail,
  thumbnailFileName,
  thumbnailContentType,
  thumbnailSize,
  isBearer,
}: ThumbnailUploadParams): Promise<{ thumbnailKey: string }> => {
  const { baseUrl } = getEnvConfig();

  const formData = new FormData();

  formData.append("videoId", videoId);
  formData.append("thumbnail", thumbnail);
  formData.append("thumbnailFileName", thumbnailFileName);
  formData.append("thumbnailContentType", thumbnailContentType);
  formData.append("thumbnailSize", String(thumbnailSize));

  const headers: Record<string, string> = {
    "Authorization": `Bearer ${credential}`
  };

  const response = await fetch(`${baseUrl}/upload/thumbnail`, {
    method: "POST",
    headers,
    body: formData,
  });

  const data = await response.json();

  if (!response.ok) {
    const msg = Array.isArray(data.message)
      ? data.message.join(", ")
      : data?.message || data.error || "Failed to upload thumbnail";

    throw new Error(msg);
  }

  return data;
};
