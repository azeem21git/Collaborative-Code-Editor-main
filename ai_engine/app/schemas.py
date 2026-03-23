from typing import Any

from pydantic import BaseModel, Field


class VisionRequest(BaseModel):
    imageBase64: str | None = Field(default=None, description="Base64 encoded image frame")
    coordinates: dict[str, Any] | None = Field(default=None, description="Fallback cursor/eye coordinates")


class VisionResponse(BaseModel):
    detected: bool
    source: str
    gazeDirection: str
    leftEye: dict[str, float] | None = None
    rightEye: dict[str, float] | None = None
    meta: dict[str, Any] | None = None
