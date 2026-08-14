export interface Bucket {
  id: string;
  name: string;
  region: string;
  storageUsedBytes: number;
  storageLimitBytes: number;
  egressUsedBytes: number;
  egressLimitBytes: number;
  createdAt: string;
  objectCount: number;
}

export interface Video {
  id: string;
  account_id: string;
  bucket_id: string;
  transcode_bucket_id?: string;
  object_key: string;
  thumbnail_key?: string;
  sprite_key?: string;
  preview_key?: string;
  title: string;
  status: "ready" | "processing" | "queued" | "failed";
  captions_status: "pending" | "processing" | "ready" | "failed";
  duration: number;
  external_user_id?: string;
  created_at: string;
  updated_at: string;
  size_bytes?: number;
  error_message?: string;
  renditions?: { res: string; bitrate: string; size_bytes: number; format: string }[];
  captions?: { lang: string; size_bytes: number; status: string }[];
}

export interface BucketObject {
  id: string;
  bucketId: string;
  key: string;
  sizeBytes: number;
  contentType: string;
  uploadedAt: string;
}
