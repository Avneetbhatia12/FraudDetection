"""
Assessment snapshots: deterministic digest, append-only decision, and the training-snapshot rule.

Digest
------
SHA-256 of a canonical JSON serialisation (sorted keys, no whitespace) of the deterministic CONTENT of an
assessment: claim_id, indicator_set, indicator_set_version, assessment_status, rule_hits, every indicator
(value, reference, threshold, status, triggered, reason and comparison_claim_ids), triggered_count,
review_priority and priority_reasons.

Deliberately NOT in the digest (provenance metadata, recorded alongside it):
  * assessed_at: wall-clock time, never deterministic;
  * snapshot_claim_count / prior_history_claim_count: they change whenever ANY claim is added anywhere,
    even one unrelated to this claim. Including them would create a new snapshot for every claim on every
    insert, burying real changes. Any change that affects this claim's result already changes the indicators'
    values or comparison_claim_ids, and therefore the digest;
  * disclaimer: fixed explanatory text.

Append-only rule (for the future Express integration)
-----------------------------------------------------
A newly computed assessment is stored as a NEW snapshot when its digest differs from the digest of the claim's
latest NON-FAILED snapshot (database view CLAIM_LATEST_VALID_ASSESSMENT), or when no such snapshot exists.
Failed attempts have no digest and are never the comparison baseline (otherwise a timeout would force a duplicate
snapshot). Snapshots are never updated or deleted (enforced in the database).

Training rule (Track 3)
-----------------------
Supervised training must use the snapshot that existed when the investigator recorded the outcome:
the snapshot linked to the outcome (ASSESSMENT_ID), otherwise the latest snapshot with assessed_at <= decided_at.
Features must never be recomputed with information entered later.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime
from typing import Optional

DIGEST_FIELDS = ("claim_id", "indicator_set", "indicator_set_version", "assessment_status", "rule_hits", "indicators",
                 "triggered_count", "review_priority", "priority_reasons")


def canonical_content(assessment: dict) -> str:
    content = {k: assessment[k] for k in DIGEST_FIELDS}
    return json.dumps(content, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False)


def assessment_digest(assessment: dict) -> str:
    return hashlib.sha256(canonical_content(assessment).encode("utf-8")).hexdigest()


def snapshot_decision(latest_stored_digest: Optional[str], new_assessment: dict) -> str:
    """'append' if there is no valid stored snapshot or the content changed; otherwise 'unchanged'.

    `latest_stored_digest` must come from the latest NON-FAILED snapshot (CLAIM_LATEST_VALID_ASSESSMENT)."""
    if latest_stored_digest is None or latest_stored_digest != new_assessment["indicators_digest"]:
        return "append"
    return "unchanged"


def select_training_snapshot(snapshots: list[dict], decided_at: datetime, linked_assessment_id: Optional[int] = None) -> Optional[dict]:
    """The snapshot an investigator saw when recording an outcome (never one computed afterwards).

    `snapshots`: stored rows for ONE claim, each with assessment_id, assessed_at (datetime) and assessment_status.
    """
    usable = [s for s in snapshots if s["assessment_status"] != "failed" and s["assessed_at"] <= decided_at]
    if linked_assessment_id is not None:
        linked = [s for s in usable if s["assessment_id"] == linked_assessment_id]
        if linked:
            return linked[0]
        # A linked snapshot created after the decision (or failed) is not valid training input; fall through.
    if not usable:
        return None
    return max(usable, key=lambda s: (s["assessed_at"], s["assessment_id"]))
