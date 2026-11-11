"""
Download the Kaggle "Healthcare Provider Fraud Detection Analysis" dataset into
datasets/public_kaggle_provider_fraud/raw/ and verify every file against the
SHA-256 checksums in that folder's manifest.json. Standard library only.

    py -3.12 scripts/download_kaggle_provider_fraud.py            # from ml_service/
    py -3.12 scripts/download_kaggle_provider_fraud.py --force    # re-download

The raw folder is git-ignored: the data is never committed and never loaded
into the application database.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DS = ROOT / "datasets" / "public_kaggle_provider_fraud"
RAW = DS / "raw"
REF = "rohitrox/healthcare-provider-fraud-detection-analysis"
API = "https://www.kaggle.com/api/v1/datasets"


def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch(url: str, dest: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "dataset-downloader"})
    with urllib.request.urlopen(req, timeout=300) as r, dest.open("wb") as f:
        while chunk := r.read(1 << 20):
            f.write(chunk)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    expected = json.loads((DS / "manifest.json").read_text(encoding="utf-8"))["raw_files_sha256"]

    if not args.force and all((RAW / f).exists() and sha256(RAW / f) == h for f, h in expected.items()):
        print("All raw files present and verified; nothing to do (use --force to re-download).")
        return

    RAW.mkdir(parents=True, exist_ok=True)
    print("Downloading metadata and archive from Kaggle ...")
    fetch(f"{API}/view/{REF}", RAW / "kaggle_metadata.json")
    archive = RAW / "archive.zip"
    fetch(f"{API}/download/{REF}", archive)

    with zipfile.ZipFile(archive) as z:
        for name in z.namelist():  # refuse anything that could escape raw/
            if name.startswith(("/", "\\")) or ".." in Path(name).parts or ":" in name:
                sys.exit(f"Refusing unsafe path in archive: {name}")
        z.extractall(RAW)

    bad = [f for f, h in expected.items() if not (RAW / f).exists() or sha256(RAW / f) != h]
    if bad:
        sys.exit(f"Checksum mismatch or missing file (the Kaggle upload may have changed): {bad}")
    print(f"Verified {len(expected)} files in {RAW.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
