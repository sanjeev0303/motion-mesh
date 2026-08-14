FROM python:3.11-slim AS pip-deps

WORKDIR /app

# Only needed if packages require compilation from source.
# faster-whisper ships prebuilt wheels so we skip build-essential entirely.

# ─── Layer A: heavy deps (ctranslate2, torch via faster-whisper) ──────────────
# This layer is SEPARATE so it stays cached when fastapi/uvicorn versions change.
# faster-whisper pulls in ctranslate2 (~200 MB wheel) + numpy + onnxruntime.
# --only-binary=:all: avoids any source compilation and uses prebuilt wheels only.
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install \
      --only-binary=:all: \
      "faster-whisper>=1.0.0"

# ─── Layer B: light web-framework deps (change more frequently) ───────────────
# Separate layer so updating fastapi/uvicorn doesn't re-download ctranslate2.
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install \
      --only-binary=:all: \
      "fastapi>=0.110.0" \
      "uvicorn[standard]>=0.28.0" \
      "langchain>=0.3.0" \
      "langchain-google-genai>=1.0.0" \
      "python-multipart>=0.0.9" \
      "python-dotenv>=1.0.0"

# ─── Stage 2: minimal runtime image ──────────────────────────────────────────
FROM python:3.11-slim AS runner

WORKDIR /app

# Copy only the installed package tree, not build tools
COPY --from=pip-deps /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=pip-deps /usr/local/bin /usr/local/bin

COPY captions-sidecar/app/ ./app/

RUN adduser --disabled-password --gecos '' --uid 1001 appuser \
    && mkdir -p /tmp/huggingface \
    && chown -R appuser:appuser /tmp/huggingface

ENV HF_HOME=/tmp/huggingface

USER appuser

# Bake the model into the image at build time
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('Systran/faster-whisper-tiny.en', device='cpu', compute_type='int8')"

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
