"""Pydantic response contracts. Live application indicators and research outputs use different,
explicitly tagged envelopes (`kind`, `scope`) so they cannot be confused by a client."""
from __future__ import annotations

from typing import Any, Literal, Optional, Union

from pydantic import BaseModel, Field


class Indicator(BaseModel):
    code: str
    level: Literal["claim", "provider"]
    name: str
    value: Optional[Union[int, float]] = Field(None, description="Observed value; null when it cannot be computed")
    reference: str = Field(description="What the value is compared with (earlier claims, policy, peers)")
    threshold: Optional[str] = Field(None, description="Configured threshold (design choice, not learned)")
    status: Literal["ok", "insufficient_history", "not_applicable"]
    triggered: Optional[bool] = Field(None, description="null when the indicator cannot be judged")
    reason: str
    comparison_claim_ids: list[int] = Field(default_factory=list,
                                            description="Snapshot claims this indicator compared against (audit trail)")


class RuleHit(BaseModel):
    rule_id: int
    rule_name: str


class ClaimAssessment(BaseModel):
    kind: Literal["claim_level_indicators"] = "claim_level_indicators"
    claim_id: int
    indicator_set: str
    indicator_set_version: str
    assessment_status: Literal["completed", "insufficient_data"]
    snapshot_claim_count: int = Field(description="Claims visible in the read-only database snapshot used (incl. this claim)")
    prior_history_claim_count: int = Field(description="Other snapshot claims dated on or before this claim (service-date history)")
    rule_hits: list[RuleHit] = Field(description="Existing SQL rule engine results for this claim (unchanged)")
    indicators: list[Indicator]
    triggered_count: int
    review_priority: Literal["Routine", "Elevated", "High"] = Field(description="Queue ordering aid, not a score or a decision")
    priority_reasons: list[str]
    disclaimer: str
    indicators_digest: str = Field(pattern=r"^[0-9a-f]{64}$",
                                   description="SHA-256 of the deterministic assessment content (fields in digest_scope)")
    digest_scope: list[str]
    snapshot_taken_at: Optional[str] = Field(
        None, description="MySQL server time (UTC, ISO 8601 with Z) when the read-only snapshot was taken. Provenance only; "
                          "not part of the digest and NOT the stored ASSESSED_AT, which MySQL sets when the backend stores "
                          "the assessment (the backend must return that stored value, never send its own).")


class ProviderProfile(BaseModel):
    kind: Literal["provider_level_indicators"] = "provider_level_indicators"
    provider_id: int
    as_of_date: str = Field(description="YYYY-MM-DD; only claims dated on or before it are used")
    as_of_source: Literal["requested", "default_today_ist"] = Field(
        "requested", description="'default_today_ist': no as_of given, so today's IST date on the MySQL clock was used")
    indicator_set: str
    indicator_set_version: str
    profile_status: Literal["completed", "insufficient_data"]
    claim_count: int
    comparable_peers: int
    indicators: list[Indicator]
    triggered_count: int
    disclaimer: str


class Health(BaseModel):
    status: Literal["ok"]
    service: str
    version: str


class Status(BaseModel):
    service: str
    version: str
    indicator_set: str
    indicator_set_version: str
    application_database: Literal["reachable", "unreachable"]
    research_available: bool
    research_run_id: Optional[str]


class ResearchScope(BaseModel):
    dataset: str
    applies_to_live_application_data: Literal[False] = False
    label_note: str
    score_note: str


class ResearchEnvelope(BaseModel):
    kind: Literal["research_benchmark"] = "research_benchmark"
    scope: ResearchScope
    data: dict[str, Any]
