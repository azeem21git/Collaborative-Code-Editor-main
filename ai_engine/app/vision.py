from __future__ import annotations

import base64
from dataclasses import dataclass
from typing import Any

import cv2
import numpy as np

try:
    import mediapipe as mp
except Exception:  # pragma: no cover - runtime fallback for environments without mediapipe
    mp = None


LEFT_EYE_INDICES = [33, 133, 159, 145]
RIGHT_EYE_INDICES = [362, 263, 386, 374]


@dataclass
class EyePoint:
    x: float
    y: float


class EyeTrackingEngine:
    def __init__(self) -> None:
        self.face_mesh = None
        if mp is not None:
            solutions = getattr(mp, "solutions", None)
            if solutions is not None and hasattr(solutions, "face_mesh"):
                self.face_mesh = solutions.face_mesh.FaceMesh(
                    static_image_mode=False,
                    max_num_faces=1,
                    refine_landmarks=True,
                    min_detection_confidence=0.5,
                    min_tracking_confidence=0.5,
                )

    @staticmethod
    def _decode_base64_image(image_base64: str) -> np.ndarray:
        raw = image_base64.split(",", 1)[1] if "," in image_base64 else image_base64
        decoded = base64.b64decode(raw)
        array = np.frombuffer(decoded, dtype=np.uint8)
        frame = cv2.imdecode(array, cv2.IMREAD_COLOR)
        if frame is None:
            raise ValueError("Unable to decode image payload")
        return frame

    @staticmethod
    def _average_landmark(landmarks: list[Any], indices: list[int]) -> EyePoint:
        points = [landmarks[index] for index in indices]
        x = float(sum(point.x for point in points) / len(points))
        y = float(sum(point.y for point in points) / len(points))
        return EyePoint(x=x, y=y)

    @staticmethod
    def _resolve_gaze(mid_x: float, mid_y: float) -> str:
        horizontal = "center"
        vertical = "center"

        if mid_x < 0.42:
            horizontal = "left"
        elif mid_x > 0.58:
            horizontal = "right"

        if mid_y < 0.42:
            vertical = "up"
        elif mid_y > 0.58:
            vertical = "down"

        if horizontal == "center" and vertical == "center":
            return "center"
        if vertical == "center":
            return horizontal
        if horizontal == "center":
            return vertical
        return f"{vertical}-{horizontal}"

    def _from_coordinates(self, coordinates: dict[str, Any]) -> dict[str, Any]:
        left = coordinates.get("leftEye") or {}
        right = coordinates.get("rightEye") or {}

        left_point = EyePoint(
            x=float(left.get("x", coordinates.get("x", 0.5))),
            y=float(left.get("y", coordinates.get("y", 0.5))),
        )
        right_point = EyePoint(
            x=float(right.get("x", coordinates.get("x", 0.5))),
            y=float(right.get("y", coordinates.get("y", 0.5))),
        )

        mid_x = (left_point.x + right_point.x) / 2
        mid_y = (left_point.y + right_point.y) / 2

        return {
            "detected": True,
            "source": "coordinates",
            "gazeDirection": self._resolve_gaze(mid_x, mid_y),
            "leftEye": {"x": left_point.x, "y": left_point.y},
            "rightEye": {"x": right_point.x, "y": right_point.y},
            "meta": {"engine": "coordinate-fallback"},
        }

    def _from_image(self, image_base64: str) -> dict[str, Any]:
        frame = self._decode_base64_image(image_base64)

        if self.face_mesh is None:
            return {
                "detected": False,
                "source": "image",
                "gazeDirection": "unknown",
                "leftEye": None,
                "rightEye": None,
                "meta": {"engine": "mediapipe-unavailable"},
            }

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        result = self.face_mesh.process(rgb)

        if not result.multi_face_landmarks:
            return {
                "detected": False,
                "source": "image",
                "gazeDirection": "unknown",
                "leftEye": None,
                "rightEye": None,
                "meta": {"engine": "mediapipe", "reason": "no-face-detected"},
            }

        landmarks = result.multi_face_landmarks[0].landmark
        left_eye = self._average_landmark(landmarks, LEFT_EYE_INDICES)
        right_eye = self._average_landmark(landmarks, RIGHT_EYE_INDICES)

        mid_x = (left_eye.x + right_eye.x) / 2
        mid_y = (left_eye.y + right_eye.y) / 2

        return {
            "detected": True,
            "source": "image",
            "gazeDirection": self._resolve_gaze(mid_x, mid_y),
            "leftEye": {"x": left_eye.x, "y": left_eye.y},
            "rightEye": {"x": right_eye.x, "y": right_eye.y},
            "meta": {"engine": "mediapipe", "frameWidth": int(frame.shape[1]), "frameHeight": int(frame.shape[0])},
        }

    def process(self, image_base64: str | None, coordinates: dict[str, Any] | None) -> dict[str, Any]:
        if image_base64:
            return self._from_image(image_base64)
        if coordinates:
            return self._from_coordinates(coordinates)
        raise ValueError("Either imageBase64 or coordinates must be provided")
