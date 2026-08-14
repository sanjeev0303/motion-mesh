import { getEnvConfig } from "../configs/index.js";
import { handleApiError } from "../utils/handleApiError.js";

export async function createJob(
  videoId: string,
  credential: string,
  isBearer: boolean,
) {
  const apiKey = isBearer ? "" : credential;
  const token = isBearer ? credential : "";

  const response = await fetch(`${getEnvConfig().baseUrl}/videos/${videoId}/transcode`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { "x-api-key": apiKey } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    await handleApiError(response, "createJob");
  }

  const data = await response.json();
  return data;
}
