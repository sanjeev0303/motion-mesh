<div align="center">
  <!-- 1. Hero Section -->
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://res.cloudinary.com/df0nvtma5/image/upload/v1785687930/y4zanv58doxvubugnjcu.png">
    <img alt="Motionmesh Logo" src="https://res.cloudinary.com/df0nvtma5/image/upload/v1785687930/y4zanv58doxvubugnjcu.png" width="300" height="300">
  </picture>

  <h1 align="center">
    <font size="7" color="#008AFF">Motionmesh</font>
  </h1>

  <p><strong>Open-source video infrastructure for developers.</strong></p>

  <p>Upload, store, transcode, stream, and deliver video at scale. Build video platforms without the complexity.</p>

  <p>
    <a href="https://motionmesh.co.in/docs">Documentation</a> •
    <a href="https://motionmesh.co.in">Website</a> •
    <a href="https://app.motionmesh.co.in">Dashboard</a> •
    <a href="https://motionmesh.co.in/docs/sdk">SDK</a> •
    <a href="https://discord.gg/motionmesh">Discord</a> •
    <a href="https://github.com/sanjeev0303/motionmesh/discussions">Discussions</a> •
    <a href="https://www.npmjs.com/package/@motionmesh/sdk">@motionmesh/sdk</a> •
    <a href="https://www.npmjs.com/package/@motionmesh/player">@motionmesh/player</a> •
    <a href="https://pypi.org/project/motionmesh/">PyPI</a>
  </p>

  <!-- 2. Badges -->
  <p>
    <a href="https://www.npmjs.com/package/@motionmesh/sdk"><img alt="NPM Version" src="https://img.shields.io/npm/v/@motionmesh/sdk?style=flat-square&color=blue"></a>
    <a href="https://pypi.org/project/motionmesh/"><img alt="PyPI Version" src="https://img.shields.io/pypi/v/motionmesh?style=flat-square&color=blue"></a>
    <a href="https://github.com/sanjeev0303/motionmesh/actions"><img alt="Build Status" src="https://img.shields.io/github/actions/workflow/status/sanjeev0303/motionmesh/ci.yml?branch=main&style=flat-square"></a>
    <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square"></a>
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white">
    <img alt="Go" src="https://img.shields.io/badge/Go-00ADD8?style=flat-square&logo=go&logoColor=white">
    <img alt="Python" src="https://img.shields.io/badge/Python-3776AB?style=flat-square&logo=python&logoColor=white">
    <img alt="Docker" src="https://img.shields.io/badge/Docker-2CA5E0?style=flat-square&logo=docker&logoColor=white">
    <img alt="Kubernetes" src="https://img.shields.io/badge/Kubernetes-326CE5?style=flat-square&logo=kubernetes&logoColor=white">
    <img alt="OpenAPI" src="https://img.shields.io/badge/OpenAPI-6BA539?style=flat-square&logo=openapi-initiative&logoColor=white">
    <img alt="Downloads" src="https://img.shields.io/npm/dt/@motionmesh/sdk?style=flat-square">
    <img alt="GitHub Stars" src="https://img.shields.io/github/stars/sanjeev0303/motionmesh?style=flat-square">
    <img alt="Latest Release" src="https://img.shields.io/github/v/release/sanjeev0303/motionmesh?style=flat-square">
  </p>
</div>

---

## 3. Hero Description

Motionmesh is a powerful, self-hosted video infrastructure platform designed specifically for developers. It provides everything you need to build scalable video applications—allowing you to upload, store, transcode, stream, and deliver high-quality video globally.

Built with performance and developer experience in mind, Motionmesh leverages Go for its high-performance backend, FFmpeg for robust media processing, and Cloudflare for edge delivery. Combined with S3-compatible storage and deep integration with Next.js, TypeScript, and Python, Motionmesh delivers an enterprise-grade video stack out of the box.

---

## 4. Architecture

Motionmesh is designed as a highly scalable modular monolith, ensuring that your video processing pipeline is robust and performant.

```mermaid
graph TD
    Browser[Browser / Client] -->|Upload / Playback| SDK[Motionmesh SDK]
    SDK -->|API Requests| API[Go REST API]
    API -->|Enqueue Job| Queue[NATS Queue]
    Queue -->|Process Job| Workers[Worker Fleet]
    Workers -->|Transcode| FFmpeg[FFmpeg Processing]
    FFmpeg -->|Save Assets| Storage[S3 Compatible Storage]
    Storage -->|Stream HLS/CMAF| Player[Motionmesh Player]
```

---

## 5. Why Motionmesh?

- **Developer Experience (DX):** Intuitive SDKs, comprehensive documentation, and a focus on type safety make integrating video into your app a breeze.
- **Scalability:** Built on Go and NATS, the architecture scales horizontally to handle massive workloads.
- **Cost Effective:** Bring your own S3 storage, avoiding the massive markups of traditional Video-as-a-Service providers.
- **Security by Design:** Motionmesh utilizes a proxy pattern to ensure your API keys are never exposed to the client.
- **Self-Hosting Freedom:** Full control over your infrastructure with production-ready Docker and Kubernetes configurations.
- **Cloud Support:** Seamlessly integrates with AWS, Backblaze, and more.

---

## 6. Features

| Category | Features |
|---|---|
| **Storage** | • S3-compatible Object Storage<br>• Dual-bucket support (upload/output)<br>• Bring-your-own storage |
| **Video** | • FFmpeg Transcoding<br>• Adaptive Bitrate (ABR) Ladder (1080p - 240p)<br>• HLS / CMAF Output<br>• Watermarking<br>• Thumbnail Generation<br>• Preview Clips<br>• Scrub Sprites |
| **AI** | • Automated Captions<br>• Transcript Generation<br>• Chapter Detection |
| **SDK** | • Type-safe JavaScript/TypeScript SDK<br>• Python SDK<br>• React Player Component |
| **Dashboard** | • Asset Management<br>• Analytics<br>• Billing<br>• User Management<br>• API Key Generation<br>• Log Viewing |
| **Auth** | • Strict Server-to-Server Proxy Pattern<br>• Signed URLs<br>• JWT Verification |
| **Infra** | • Go Backend<br>• Worker Fleet<br>• Terraform Configurations<br>• Kubernetes Ready |

---

## 7. Ecosystem

<div align="center">
  <table>
    <tr>
      <td align="center"><strong>JavaScript SDK</strong><br><a href="https://www.npmjs.com/package/@motionmesh/sdk">@motionmesh/sdk</a></td>
      <td align="center"><strong>Player SDK</strong><br><a href="https://www.npmjs.com/package/@motionmesh/player">@motionmesh/player</a></td>
      <td align="center"><strong>Python SDK</strong><br><a href="https://pypi.org/project/motionmesh/">motionmesh</a></td>
    </tr>
    <tr>
      <td align="center"><strong>REST API</strong><br>OpenAPI Spec</td>
      <td align="center"><strong>Dashboard</strong><br>Next.js Interface</td>
      <td align="center"><strong>CLI</strong><br><em>(Planned)</em></td>
    </tr>
    <tr>
      <td align="center"><strong>Terraform</strong><br>Infrastructure as Code</td>
      <td align="center"><strong>Docker</strong><br>Containerized Apps</td>
      <td align="center"><strong>Kubernetes</strong><br>Helm Charts</td>
    </tr>
  </table>
</div>

---

## 8. Installation

Install the Motionmesh SDKs using your preferred package manager:

```bash
# npm
npm install @motionmesh/sdk @motionmesh/player

# pnpm
pnpm add @motionmesh/sdk @motionmesh/player

# yarn
yarn add @motionmesh/sdk @motionmesh/player

# bun
bun add @motionmesh/sdk @motionmesh/player

# Python
pip install motionmesh
```

---

## 9. Quick Start

> [!IMPORTANT]
> The browser SDK should **never** hold your API key. Always use a server proxy.

### JavaScript / TypeScript

```typescript
import { MotionmeshClient } from "@motionmesh/sdk";

// Initialize the client on your server
const client = new MotionmeshClient({ apiKey: process.env.MOTIONMESH_API_KEY });

// Create a transcode job
const video = await client.mediaConverter.createJob({
  file: myVideoFile,
  bucketId: process.env.MOTIONMESH_BUCKET_ID,
});

// Retrieve a playback URL
const playbackUrl = await client.videos.getPlaybackUrl(video.id);
```

### Python

```python
from motionmesh import Client

# Initialize the client
client = Client(api_key="mot_live_...")

# Upload a video
video = client.videos.upload("input.mp4", bucket_id="...")

# Get playback URL
playback_url = client.videos.get_playback_url(video.id)
```

### React Player

```tsx
import { MotionmeshPlayer } from "@motionmesh/player";
import "@motionmesh/player/styles.css";

export default function VideoPage() {
  return (
    <div className="video-container">
      <MotionmeshPlayer src="https://api.yourdomain.com/v1/videos/vid_123/hls/master.m3u8" />
    </div>
  );
}
```

---

## 10. Complete Upload Flow

Motionmesh handles the entire video lifecycle, from ingestion to analytics.

`Upload` ➔ `Transcode` ➔ `Playback` ➔ `Player` ➔ `Analytics`

1. **Upload:** Securely upload source media directly to your S3 bucket.
2. **Transcode:** Our worker fleet spins up FFmpeg to generate HLS/CMAF ladders, AI captions, and thumbnails.
3. **Playback:** HLS streams are served directly from storage via secure URLs.
4. **Player:** The `@motionmesh/player` handles seamless Adaptive Bitrate (ABR) streaming.
5. **Analytics:** The player reports telemetry back to the dashboard.

---

## 11. Authentication

Motionmesh enforces a strict server-to-server security model via a proxy pattern.

> [!CAUTION]
> Exposing your `MOTIONMESH_API_KEY` to the client is a severe security vulnerability.

The browser-side SDK communicates with a trusted proxy route on your server, which then forwards the authenticated requests to the Motionmesh API. Playback is secured using short-lived Signed URLs via JWT.

```mermaid
sequenceDiagram
    participant Browser
    participant YourServer
    participant Motionmesh

    Browser->>YourServer: Request Upload URL
    YourServer->>Motionmesh: Authenticated API Key Request
    Motionmesh-->>YourServer: Returns Signed Upload URL
    YourServer-->>Browser: Forwards Signed URL
    Browser->>Motionmesh: Upload Video directly using Signed URL
```

---

## 12. SDK Examples

Our SDK simplifies complex video workflows.

- **Upload:** Direct-to-S3 multipart uploads.
- **Playback:** Generate secure HLS/CMAF streaming URLs.
- **Signed URLs:** Issue time-bound access tokens.
- **Media Conversion:** Trigger FFmpeg transcoding jobs.
- **Buckets:** Manage source and output storage configurations.
- **Authentication:** Proxy request handlers for Next.js/Express.
- **Errors:** Strongly typed error handling.
- **Streaming:** Real-time event webhooks for transcode progress.

---

## 13. Player

The `@motionmesh/player` is a drop-in React component built on top of Vidstack, providing a premium viewing experience out of the box.

- **ABR (Adaptive Bitrate):** Automatic resolution switching based on network conditions.
- **Vidstack Core:** Built on robust, accessible video primitives.
- **Captions & Subtitles:** Native support for VTT and multiple languages.
- **Quality Switching:** Manual override controls for viewers.
- **Picture in Picture (PiP):** Floating video support.
- **Fullscreen:** Native fullscreen API integration.
- **Keyboard Shortcuts:** Standard media controls (Space, Arrow keys, M, F).

---

## 14. Dashboard

Manage your entire video infrastructure from a beautiful, unified interface.

- **Media:** View, organize, and moderate all uploaded assets.
- **Buckets:** Configure your S3 credentials and routing.
- **Analytics:** Real-time metrics on bandwidth, storage, and engagement.
- **Billing:** Usage-based Stripe integration.
- **Users:** Manage your team and access controls.
- **Projects:** Isolate environments (Dev, Staging, Prod).
- **API Keys:** Roll and manage authentication tokens.
- **Logs:** Deep dive into worker and transcoding logs.

---

## 15. REST API

For total control, Motionmesh exposes a fully documented REST API.

- **OpenAPI:** Complete OpenAPI 3.0 specification available.
- **SDKs:** Generated clients for seamless integration.
- **Authentication:** Bearer token authentication.
- **Versioning:** Stable `v1` endpoints with backward compatibility.

---

## 16. Project Structure

```text
motionmesh/
├── server/          # Go API, worker fleet, and AI sidecar
│   ├── api/         # Core REST API (Go)
│   ├── worker/      # Transcoding and FFmpeg task runner (Go)
│   ├── shared/      # Shared types and utilities (Go)
│   └── captions/    # Python sidecar for AI transcription & chapters
├── client/          # Next.js administrative dashboard
├── sdk/             # Client libraries
│   ├── js/          # @motionmesh/sdk and @motionmesh/player
│   └── python/      # motionmesh (PyPI)
├── docs/            # Fumadocs documentation site
└── infra/           # Terraform and Kubernetes manifests
```

---

## 17. Local Development

Get up and running locally in under 5 minutes.

1. **Clone the repository:**
   ```bash
   git clone https://github.com/sanjeev0303/motionmesh.git
   cd motionmesh
   ```
2. **Install dependencies:**
   Ensure you have Docker, Go, and Node.js installed.
3. **Configure Environment:**
   ```bash
   cp server/.env.example server/.env
   ```
4. **Run Infrastructure:**
   ```bash
   docker compose up -d
   ```
5. **Run the Dashboard:**
   ```bash
   cd client && npm install && npm run dev
   ```

---

## 18. Environment Variables

Configure your instance using standard environment variables.

### Database
- `DATABASE_URL` — Postgres connection string (e.g., Neon).

### Storage
- `STORAGE_ENDPOINT` — S3/B2 endpoint URL.
- `STORAGE_ACCESS_KEY` — Access key ID.
- `STORAGE_SECRET_KEY` — Secret access key.
- `STORAGE_BUCKET` — Primary bucket name.
- `STORAGE_REGION` — Bucket region.
- `STORAGE_USE_SSL` — Boolean for SSL.

### Authentication
- `JWT_SECRET` — Key signing secret.
- `CLERK_SECRET_KEY` — Dashboard auth secret.
- `CLERK_JWKS_URL` — JWKS endpoint for local validation.

### Queue
- `QUEUE_URL` — NATS connection string.

### Billing
- `STRIPE_SECRET_KEY` — Stripe API key.
- `STRIPE_WEBHOOK_SECRET` — Stripe webhook signing secret.

### Dashboard
- `NEXT_PUBLIC_API_URL` — Public API URL.

---

## 19. Deployment

Motionmesh is built for the cloud. We provide out-of-the-box support for:

- **Docker & Docker Compose:** Perfect for single-node deployments.
- **Kubernetes:** Helm charts for high availability and auto-scaling.
- **Terraform:** Infrastructure as code for AWS/GCP provisioning.

---

## 20. Production Architecture

Our production topology is designed for resilience:

- **Load Balancer:** Traefik / NGINX ingress routing.
- **API:** Stateless Go services handling HTTP requests.
- **Redis:** Caching and rate-limiting.
- **Queue:** NATS JetStream for durable task processing.
- **Worker Fleet:** Auto-scaling Go workers processing media.
- **FFmpeg:** Hardware-accelerated transcoding.
- **Storage:** S3/B2 object storage for durability.

---

## 21. Documentation

Dive deeper into the platform:

- [Getting Started](https://motionmesh.co.in/docs)
- [SDK Reference](https://motionmesh.co.in/docs/sdk)
- [REST API](https://motionmesh.co.in/docs/api)
- [Authentication](https://motionmesh.co.in/docs/auth)
- [Deployment](https://motionmesh.co.in/docs/deployment)
- [Workers](https://motionmesh.co.in/docs/workers)
- [Dashboard](https://motionmesh.co.in/docs/dashboard)
- [Player](https://motionmesh.co.in/docs/player)

---

## 22. Benchmarks

> [!NOTE]
> *The following metrics are example placeholders representing target performance. Official benchmarks will be published soon.*

| Metric | Target Performance |
|---|---|
| **Upload Throughput** | ~500 Mbps per node |
| **Transcode Speed** | 3x Real-time (1080p -> HLS Ladder) |
| **Playback Latency** | < 2 seconds |
| **Startup Time** | < 50ms API overhead |
| **Worker Scaling** | 0 to 100 instances in < 15 seconds |

---

## 23. Roadmap

- [x] S3-Compatible Storage Integration
- [x] Node.js / TypeScript SDK
- [x] React Player (@motionmesh/player)
- [x] Next.js Dashboard
- [ ] Python SDK
- [ ] AI Search & Transcripts
- [ ] Webhooks & Events
- [ ] Live Streaming Support
- [ ] DRM (Digital Rights Management)
- [ ] CLI Tool

---

## 24. Contributing

We welcome contributions! Please see our [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to set up your development environment, run tests, and submit Pull Requests.

---

## 25. Community

Join the Motionmesh community:

- **GitHub Discussions:** [Ask questions and share ideas](https://github.com/sanjeev0303/motionmesh/discussions)
- **Issues:** [Report bugs](https://github.com/sanjeev0303/motionmesh/issues)
- **Discord:** [Join the chat](https://discord.gg/motionmesh)
- **Email:** support@motionmesh.co.in

---

## 26. Security

Security is a first-class citizen. We enforce strict Server-to-Server Proxy Patterns, utilize Signed URLs for all media access, and ensure secrets are never leaked to the client.

### Internal Infrastructure Security (Benchmark Phase)
> [!WARNING]
> **Redis:** Currently operates within a private VPC without transit encryption (TLS) or explicit authentication for the benchmark phase. It is strictly isolated from public access and only reachable by internal worker and API nodes. This configuration is documented here for future security audits and will be hardened in future production releases.

For responsible disclosure, please email `security@motionmesh.co.in` directly. Do not open public issues for security vulnerabilities.

---

## 27. License

Motionmesh is licensed under the [MIT License](LICENSE).

---

## 28. Built With

<div align="center">
  <img src="https://img.shields.io/badge/Go-00ADD8?style=for-the-badge&logo=go&logoColor=white" alt="Go" />
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
  <img src="https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=next.js&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python" />
  <img src="https://img.shields.io/badge/FFmpeg-007808?style=for-the-badge&logo=ffmpeg&logoColor=white" alt="FFmpeg" />
  <br>
  <img src="https://img.shields.io/badge/Cloudflare-F38020?style=for-the-badge&logo=cloudflare&logoColor=white" alt="Cloudflare" />
  <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/Kubernetes-326CE5?style=for-the-badge&logo=kubernetes&logoColor=white" alt="Kubernetes" />
  <img src="https://img.shields.io/badge/Backblaze-E21C21?style=for-the-badge&logo=backblaze&logoColor=white" alt="Backblaze" />
  <img src="https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white" alt="Redis" />
  <img src="https://img.shields.io/badge/NATS-27AAE1?style=for-the-badge&logo=nats&logoColor=white" alt="NATS" />
</div>
