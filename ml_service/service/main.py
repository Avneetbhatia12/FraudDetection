"""
Internal FastAPI service (Phase 4.2). Called ONLY by the Express backend, never by browsers.

  Live application (Track 2, read-only, computed on request, nothing stored here):
    GET /v1/claims/{claim_id}/indicators
    GET /v1/providers/{provider_id}/indicators?as_of=YYYY-MM-DD
  Research (Track 1, public US Medicare / Kaggle results, never applied to application data):
    GET /v1/research/models
    GET /v1/research/shap/global
    GET /v1/research/providers/{kaggle_provider_id}/explanation
    GET /v1/research/figures/{name}
  Service:
    GET /health      liveness, no auth, no internals
    GET /v1/status   readiness (database reachable, research available), API key required

All /v1 endpoints require the header X-ML-API-Key. Run locally:
    set ML_API_KEY=... & set ML_ENV_FILE=..\\backend\\.env
    .venv/Scripts/python.exe -m uvicorn service.main:app --host 127.0.0.1 --port 8000
"""
from __future__ import annotations

import hmac
import logging
from datetime import date
from typing import Callable, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Path, Query
from fastapi.responses import FileResponse

from app_risk import config as C
from app_risk.data import AppData, load_from_mysql
from app_risk.indicators import assess_claim, provider_profile
from app_risk.settings import Settings

from .research import SCOPE, ResearchStore
from .schemas import ClaimAssessment, Health, ProviderProfile, ResearchEnvelope, Status

SERVICE = "fraud-ml-service"
VERSION = "0.4.0"
log = logging.getLogger(SERVICE)


def create_app(settings: Settings, loader: Optional[Callable[[], AppData]] = None,
               research: Optional[ResearchStore] = None) -> FastAPI:
    if not settings.api_key:
        raise RuntimeError("ML_API_KEY is not set; refusing to start an unauthenticated service")
    if loader is None:
        def loader() -> AppData:
            return load_from_mysql(settings.db_host, settings.db_port, settings.db_user, settings.db_password, settings.db_name)
    research = research or ResearchStore()
    app = FastAPI(title="Fraud ML service (internal)", version=VERSION,
                  description="Application-native risk indicators (not ML predictions) and research-only model insights.")

    def require_key(x_ml_api_key: Optional[str] = Header(default=None)) -> None:
        if not x_ml_api_key or not hmac.compare_digest(x_ml_api_key.encode(), settings.api_key.encode()):
            raise HTTPException(status_code=401, detail="invalid or missing X-ML-API-Key")

    def load() -> AppData:
        try:
            return loader()
        except Exception as e:  # do not leak connection details to the caller
            log.error("application database unavailable: %s", type(e).__name__)
            raise HTTPException(status_code=503, detail="application database unavailable")

    @app.get("/health", response_model=Health, tags=["service"])
    def health():
        return {"status": "ok", "service": SERVICE, "version": VERSION}

    @app.get("/v1/status", response_model=Status, dependencies=[Depends(require_key)], tags=["service"])
    def status():
        try:
            loader()
            db = "reachable"
        except Exception:
            db = "unreachable"
        return {"service": SERVICE, "version": VERSION, "indicator_set": C.INDICATOR_SET_KEY,
                "indicator_set_version": C.INDICATOR_SET_VERSION, "application_database": db,
                "research_available": research.available(), "research_run_id": research.run_id}

    # ── Track 2: live application indicators (read-only) ─────────
    @app.get("/v1/claims/{claim_id}/indicators", response_model=ClaimAssessment, dependencies=[Depends(require_key)], tags=["application"])
    def claim_indicators(claim_id: int = Path(gt=0)):
        data = load()
        try:
            return assess_claim(data, claim_id)
        except KeyError:
            raise HTTPException(status_code=404, detail=f"claim {claim_id} not found")

    @app.get("/v1/providers/{provider_id}/indicators", response_model=ProviderProfile, dependencies=[Depends(require_key)], tags=["application"])
    def provider_indicators(provider_id: int = Path(gt=0), as_of: Optional[date] = Query(default=None)):
        data = load()
        try:
            return provider_profile(data, provider_id, as_of)
        except KeyError:
            raise HTTPException(status_code=404, detail=f"provider {provider_id} not found")

    # ── Track 1: research (public Kaggle data only) ───────────────
    def envelope(fn):
        try:
            return {"scope": SCOPE, "data": fn()}
        except FileNotFoundError as e:
            raise HTTPException(status_code=503, detail=f"research results not available: {e}")

    @app.get("/v1/research/models", response_model=ResearchEnvelope, dependencies=[Depends(require_key)], tags=["research"])
    def research_models():
        return envelope(research.models)

    @app.get("/v1/research/shap/global", response_model=ResearchEnvelope, dependencies=[Depends(require_key)], tags=["research"])
    def research_shap_global():
        return envelope(research.shap_global)

    @app.get("/v1/research/providers/{kaggle_provider_id}/explanation", response_model=ResearchEnvelope,
             dependencies=[Depends(require_key)], tags=["research"])
    def research_provider(kaggle_provider_id: str):
        try:
            return envelope(lambda: research.provider_explanation(kaggle_provider_id))
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
        except KeyError:
            raise HTTPException(status_code=404, detail=f"research provider {kaggle_provider_id} not found")

    @app.get("/v1/research/figures/{name}", dependencies=[Depends(require_key)], tags=["research"])
    def research_figure(name: str):
        try:
            return FileResponse(research.figure_path(name), media_type="image/png")
        except KeyError:
            raise HTTPException(status_code=404, detail="unknown figure")
        except FileNotFoundError:
            raise HTTPException(status_code=503, detail="figure not generated")

    return app


def _app_from_env() -> FastAPI:
    return create_app(Settings.from_env())


def __getattr__(name):  # `uvicorn service.main:app` builds the app on first access (env read at start-up)
    if name == "app":
        return _app_from_env()
    raise AttributeError(name)
