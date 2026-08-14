# @motionmesh/player

A drop-in React video player built on Vidstack, natively optimized for Motionmesh's HLS streams and ABR (Adaptive Bitrate) delivery.

## Installation

```bash
npm install @motionmesh/player
```

## Quickstart

```jsx
import { MotionmeshPlayer } from "@motionmesh/player";

export default function VideoPage() {
  // Pass the signed playback URL obtained from the Motionmesh SDK
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <MotionmeshPlayer src="https://api.motionmesh.co.in/v1/videos/vid_123/hls/master.m3u8" />
    </div>
  );
}
```

The player automatically handles resolution switching based on bandwidth, chapter markers, and caption tracks provided by the Motionmesh pipeline.

## Documentation

For full configuration options and styling details, visit the [Motionmesh Documentation](https://motionmesh.co.in/docs) and the [main repository](https://github.com/sanjeev0303/motionmesh).
