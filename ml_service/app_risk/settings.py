"""
Runtime settings from environment variables (never hard-coded, never committed).

  ML_API_KEY        shared secret Express must send as X-ML-API-Key (required to start the service)
  APP_DB_HOST/PORT/USER/PASSWORD/NAME   MySQL connection (a READ-ONLY account is recommended; see docs)
  ML_ENV_FILE       optional path to a KEY=VALUE file to read the above from (e.g. a local, git-ignored file).
                    For local development it may point at backend/.env, whose DB_* keys are accepted as
                    fallbacks for APP_DB_*. Values are read, never copied or written anywhere.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _read_env_file(path: str | None) -> dict:
    vals = {}
    if path and Path(path).exists():
        for line in Path(path).read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                vals[k.strip()] = v.strip().strip('"').strip("'")
    return vals


@dataclass(frozen=True)
class Settings:
    api_key: str
    db_host: str
    db_port: int
    db_user: str
    db_password: str
    db_name: str

    @classmethod
    def from_env(cls) -> "Settings":
        file_vals = _read_env_file(os.environ.get("ML_ENV_FILE"))

        def get(name: str, fallback: str | None = None, default: str = "") -> str:
            for src in (os.environ, file_vals):
                if src.get(name):
                    return src[name]
                if fallback and src.get(fallback):
                    return src[fallback]
            return default

        return cls(api_key=get("ML_API_KEY"), db_host=get("APP_DB_HOST", "DB_HOST", "localhost"),
                   db_port=int(get("APP_DB_PORT", "DB_PORT", "3306")), db_user=get("APP_DB_USER", "DB_USER"),
                   db_password=get("APP_DB_PASSWORD", "DB_PASSWORD"), db_name=get("APP_DB_NAME", "DB_NAME", "fraud_detection"))

    def __repr__(self) -> str:  # never print secrets
        return f"Settings(db={self.db_user}@{self.db_host}:{self.db_port}/{self.db_name}, api_key={'set' if self.api_key else 'MISSING'})"
