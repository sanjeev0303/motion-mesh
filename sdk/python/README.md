# motionmesh

The official Python SDK for Motionmesh, providing programmatic access to storage and video transcoding services.

## Installation

```bash
pip install motionmesh
```

## Quickstart

```python
from motionmesh import MotionMeshClient

# Initialize the client
client = MotionMeshClient(api_key="mot_live_...")

# Create a video record
video = client.create_video(
    filename="input.mp4",
    size_bytes=1024576
)

# List all videos
videos = client.list_videos()
print(videos)
```

## Documentation

For full API reference, authentication patterns, and advanced usage, visit the [Motionmesh Documentation](https://motionmesh.co.in/docs) and the [main repository](https://github.com/sanjeev0303/motionmesh).
