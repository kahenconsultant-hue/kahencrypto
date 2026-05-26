from fastapi import FastAPI

from regime_worker import RegimeInput, score_regime

app = FastAPI(title="Crypto Macro Analytics Microservice", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/regime")
def regime(vector: RegimeInput):
    return score_regime(vector)
