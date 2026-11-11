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


class RuleHit(BaseModel):
    rule_id: int
    rule_name: str


class ClaimAssessment(BaseModel):
    kind: Literal["claim_level_indicators"] = "claim_level_indicators"
    claim_id: int
    indicator_set: str
    indicator_set_version: str
    assessment_status: Literal["completed", "insufficient_data"]
    history_cutoff_claim_id: int = Field(description="Only claims with a smaller CLAIM_ID were used as history")
    history_claims_used: int
    rule_hits: list[RuleHit] = Field(description="Existing SQL rule engine results for this claim (unchanged)")
    indicators: list[Indicator]
    triggered_count: int
    review_priority: Literal["Routine", "Elevated", "High"] = Field(description="Queue ordering aid, not a score or a decision")
    priority_reasons: list[str]
    disclaimer: str


class ProviderProfile(BaseModel):
    kind: Literal["provider_level_indicators"] = "provider_level_indicators"
    provider_id: int
    as_of_date: str
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
