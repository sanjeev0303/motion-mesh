type UploadProgress = {
    loaded: number;
    total: number;
    percent: number;
}

type UploadOptions = {
    onProgress?: (p: UploadProgress) => void;
}


export const uploadFile = async (
  file: File,
  uploadData: any,
  opts?: UploadOptions,
) => {
  const { objectId, key, uploadId, parts } = uploadData;
  const partSize = uploadData.partSize || 5 * 1024 * 1024;
  // OMC API returns partNumber (lowercase); support both casings
  const getPartNumber = (p: any): number => p.partNumber ?? p.PartNumber;

  let uploadedBytes = 0;

  const completedParts: { PartNumber: number; ETag: string }[] = [];

  for (const part of parts) {
    const partNum = getPartNumber(part);
    const start = (partNum - 1) * partSize;
    const end = Math.min(start + partSize, file.size);
    const chunk = file.slice(start, end);

    const res = await fetch(part.url, {
      method: "PUT",
      body: chunk,
    });

    if (!res.ok) {
      throw new Error(`Failed uploading part ${partNum}`);
    }

    const etag = res.headers.get("etag");

    if (!etag) {
      throw new Error(`Missing ETag for part ${partNum}`);
    }

    completedParts.push({
      PartNumber: partNum,
      ETag: etag,
    });

    uploadedBytes += chunk.size;

    opts?.onProgress?.({
      loaded: uploadedBytes,
      total: file.size,
      percent: Math.round((uploadedBytes / file.size) * 100),
    });
  }

  return {
    objectId,
    key,
    uploadId,
    completedParts,
  };
};
