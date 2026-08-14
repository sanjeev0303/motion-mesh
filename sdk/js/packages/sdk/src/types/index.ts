export type UploadVideoResult = {
    key: string;
}

export type UploadVideoFields = {
    title: string;
    thumbnail: File;
    timestamps?: string[];
    description?: string;
    generateSubtitles?: boolean;
    tags?: string[];
    includeWatermark?: boolean;
    externalUserId?: string;
    video: File;
}

export type UploadVideoTypes = {
  title: string;
  thumbnailFileName: string;
  videoDuration: number;
  videoFileName: string;
  videoContentType: string;
  videoSize: number;
  thumbnailContentType: string;
  thumbnailSize: number;
  timestamps?: string[];
  description?: string;
  generateSubtitles?: boolean;
  tags?: string[];
  includeWatermark?: boolean;
  type: string;
};

export type MotionmeshOptions = {
    apiKey: string
}
