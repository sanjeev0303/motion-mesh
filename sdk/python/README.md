# motionmesh

The official Python SDK for Motionmesh, providing programmatic access to storage and video transcoding services.

## Installation

```bash
pip install motionmesh
```

## Quickstart

```python
from motionmesh import Client

# Initialize the client
client = Client(api_key="mot_live_...")

# Upload and transcode a video
video = client.videos.upload(
    "input.mp4",
    bucket_id="your-bucket-id"
)

# Get playback URL
playback_url = client.videos.get_playback_url(video.id)
print(playback_url)
```

## Documentation

For full API reference, authentication patterns, and advanced usage, visit the [Motionmesh Documentation](https://motionmesh.co.in/docs) and the [main repository](https://github.com/sanjeev0303/motionmesh).
