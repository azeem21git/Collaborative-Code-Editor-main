# CollaBrix AI Engine (FastAPI)

## Run

```bash
cd ai_engine
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Endpoints

- `GET /health`
- `POST /vision/process` with `{ "imageBase64": "..." }` or `{ "coordinates": { ... } }`
- `POST /vision/coordinates` with `{ "coordinates": { "leftEye": {"x": 0.4, "y": 0.5}, "rightEye": {"x": 0.6, "y": 0.5} } }`
