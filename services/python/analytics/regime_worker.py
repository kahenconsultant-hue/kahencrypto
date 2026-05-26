from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


Regime = Literal[
    "Risk-On",
    "Risk-Off",
    "Liquidity Expansion",
    "Liquidity Contraction",
    "Macro Uncertainty",
    "Panic",
    "Euphoria",
    "ETF Accumulation",
    "ETF Distribution",
    "Stablecoin Expansion",
    "Stablecoin Stress",
    "Geopolitical Stress",
    "Leverage Overheating",
]


class RegimeInput(BaseModel):
    source_ids: list[str] = Field(default_factory=list)
    normalized_event_ids: list[str] = Field(default_factory=list)


class RegimeOutput(BaseModel):
    status: Literal["unavailable"]
    regime: Regime | None
    score: int | None
    confidence: int | None
    missing_inputs: list[str]
    explanation_fa: str
    invalidation_fa: str


def score_regime(vector: RegimeInput) -> RegimeOutput:
    return RegimeOutput(
        status="unavailable",
        regime=None,
        score=None,
        confidence=None,
        missing_inputs=[
            "normalized macro metrics",
            "liquidity metrics",
            "market prices",
            "correlation snapshots",
            "validated source coverage",
        ],
        explanation_fa="موتور regime در Phase 2 عمدا غیرفعال است؛ تا زمانی که داده های نرمال شده و قابل اعتبارسنجی وارد نشوند، رژیم بازار محاسبه نمی شود.",
        invalidation_fa="پس از فعال شدن ingestion، normalization و پوشش کافی منابع، این endpoint باید با موتور واقعی regime جایگزین شود.",
    )
