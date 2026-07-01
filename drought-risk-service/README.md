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

The Node backend calls:

```text
POST /predict/drought/batch
```
