from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .schemas import VisionRequest, VisionResponse
from .vision import EyeTrackingEngine

app = FastAPI(title="CollaBrix AI Engine", version="1.0.0")
tracker = EyeTrackingEngine()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "collabrix-ai-engine"}


@app.post("/vision/process", response_model=VisionResponse)
def process_vision(payload: VisionRequest) -> dict:
    try:
        return tracker.process(payload.imageBase64, payload.coordinates)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - runtime safety
        raise HTTPException(status_code=500, detail=f"Vision processing failed: {exc}") from exc


@app.post("/vision/coordinates", response_model=VisionResponse)
def process_coordinates(payload: VisionRequest) -> dict:
    try:
        return tracker.process(None, payload.coordinates)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - runtime safety
        raise HTTPException(status_code=500, detail=f"Coordinate processing failed: {exc}") from exc
