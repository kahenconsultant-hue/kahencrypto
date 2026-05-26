# Dashboard Data Availability Map

| Dashboard section | Source type | Behavior when premium missing |
| --- | --- | --- |
| Core Intelligence Status | direct + derived | active if core free data fresh |
| Premium Coverage Status | unavailable/optional | shows missing premium modules |
| Derived Signals | proxy | active from free data |
| Liquidity | proxy + optional enrichment | does not become unavailable only because ETF/reserves missing |
| Market Regime | proxy | confidence reduced when premium missing |
| Smart Alerts | direct/proxy/notices | no single-source fake alerts |
| Latest Events | direct RSS/API | unavailable only per source failure |

## وضعیت ناموجود

اگر core data واقعاً کافی نباشد، بخش مربوطه باید `unavailable` یا `insufficient_core_data` نمایش دهد.

