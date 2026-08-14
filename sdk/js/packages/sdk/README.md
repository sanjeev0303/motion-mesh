# @motionmesh/sdk

The official JavaScript/TypeScript client for Motionmesh, providing programmatic access to storage and video transcoding services.

## Installation

```bash
npm install @motionmesh/sdk
```

## Quickstart

```javascript
import { MotionmeshClient } from "@motionmesh/sdk";

// Initialize the client
// Important: This should run server-side or via a secure proxy.
// Never expose your API key directly in browser code.
const client = new MotionmeshClient({ apiKey: process.env.MOTIONMESH_API_KEY });

// Transcode a video
const video = await client.mediaConverter.createJob({
  file: myVideoFile,
  bucketId: process.env.MOTIONMESH_BUCKET_ID,
});

// Get playback URL
const playbackUrl = await client.videos.getPlaybackUrl(video.id);
```

## Documentation

For full API reference, authentication patterns, and advanced usage, visit the [Motionmesh Documentation](https://motionmesh.co.in/docs) and the [main repository](https://github.com/sanjeev0303/motionmesh).
