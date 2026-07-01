# Drought Risk Service

Small FastAPI service that scores compact village features and returns drought-risk predictions.

## Run locally

```sh
cd drought-risk-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 -m uvicorn app.main:app --reload --port 8000
```

Optional internal auth:

```sh
export RISK_SERVICE_TOKEN=your-shared-secret
```

Groq-backed source reports:

```sh
export GROQ_API_KEY=your-groq-api-key
export GROQ_MODEL=llama-3.1-8b-instant
```

The service also loads `.env` from the backend root automatically when it starts.

The Node backend calls:

```text
POST /predict/drought/batch
POST /analyze/water-source
```
