from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np
import pandas as pd


RegimeState = Literal["stable", "shifting", "decoupling", "breakdown", "insufficient_data"]


@dataclass(frozen=True)
class CorrelationResult:
    pair: str
    rolling_7d: float | None
    rolling_30d: float | None
    rolling_90d: float | None
    change_7d: float | None
    sample_size: int
    regime_state: RegimeState
    interpretation_fa: str


def rolling_corr(left: pd.Series, right: pd.Series, window: int) -> float | None:
    joined = pd.concat([left, right], axis=1).dropna()
    if len(joined) < window:
        return None
    return float(joined.iloc[-window:, 0].corr(joined.iloc[-window:, 1]))


def detect_state(rolling_7d: float | None, rolling_30d: float | None, previous_7d: float | None) -> RegimeState:
    if rolling_7d is None or rolling_30d is None or previous_7d is None:
        return "insufficient_data"
    change = rolling_7d - previous_7d
    gap = abs(rolling_7d - rolling_30d)
    if abs(change) >= 0.28:
        return "breakdown"
    if gap >= 0.22 and abs(rolling_7d) < abs(rolling_30d):
        return "decoupling"
    if gap >= 0.18:
        return "shifting"
    return "stable"


def analyze_pair(pair: str, left: pd.Series, right: pd.Series) -> CorrelationResult:
    joined = pd.concat([left, right], axis=1).dropna()
    sample_size = len(joined)
    r7_raw = rolling_corr(left, right, 7)
    r30_raw = rolling_corr(left, right, 30)
    r90_raw = rolling_corr(left, right, 90)
    r7 = round(r7_raw, 2) if r7_raw is not None else None
    r30 = round(r30_raw, 2) if r30_raw is not None else None
    r90 = round(r90_raw, 2) if r90_raw is not None else None
    previous_7d = round(float(np.corrcoef(left.iloc[-14:-7], right.iloc[-14:-7])[0, 1]), 2) if sample_size >= 14 else None
    change = round(r7 - previous_7d, 2) if r7 is not None and previous_7d is not None else None
    state = detect_state(r7, r30, previous_7d)
    if state == "insufficient_data":
        interpretation = f"برای محاسبه همبستگی {pair} نمونه کافی وجود ندارد؛ مقدار همبستگی نمایش داده نمی شود."
    else:
        interpretation = (
            f"همبستگی {pair} در پنجره ۷ روزه {r7} و در پنجره ۳۰ روزه {r30} است؛ "
            f"وضعیت موتور: {state}. این خروجی فقط برای تفسیر رابطه بین بازارهاست و سیگنال معامله نیست."
        )
    return CorrelationResult(pair, r7, r30, r90, change, sample_size, state, interpretation)
