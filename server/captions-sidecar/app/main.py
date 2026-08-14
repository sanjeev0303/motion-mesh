import os
import logging
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from faster_whisper import WhisperModel
from .transcribe import process_audio, TranscribeResponse

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Captions Sidecar")

# Load whisper model globally
MODEL_SIZE = os.getenv("WHISPER_MODEL", "tiny.en")
DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")

logger.info(f"Loading WhisperModel: {MODEL_SIZE} on {DEVICE} with {COMPUTE_TYPE}")
model = WhisperModel(MODEL_SIZE, device=DEVICE, compute_type=COMPUTE_TYPE, cpu_threads=2)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/transcribe", response_model=TranscribeResponse)
def transcribe_endpoint(
    audio: UploadFile = File(...),
    include_chapters: str = Form("false")
):
    wants_chapters = include_chapters.lower() == "true"
    
    # Save uploaded file
    import tempfile
    
    # Create a local temp file
    fd, temp_path = tempfile.mkstemp(suffix=".flac")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(audio.file.read())
            
        return process_audio(model, temp_path, wants_chapters)
            
    except Exception as e:
        logger.error(f"Transcription failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)
