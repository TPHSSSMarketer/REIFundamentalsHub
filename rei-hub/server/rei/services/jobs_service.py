"""Adzuna Jobs API Service — Employment and salary data by location.

Free tier with generous limits. Sign up at developer.adzuna.com.

Docs: https://developer.adzuna.com/docs
"""

from __future__ import annotations

import logging
import time
from typing import Optional

import httpx

from rei.config import get_settings
from rei.services.credentials_service import get_provider_credentials

logger = logging.getLogger(__name__)

ADZUNA_BASE = "https://api.adzuna.com/v1/api"

# ── In-memory cache (1 hour TTL) ─────────────────────────────────────
_jobs_cache: dict[str, tuple[dict, float]] = {}
_CACHE_TTL_SECONDS = 3600


async def _get_credentials(db=None) -> tuple[str, str]:
    """Resolve Adzuna API credentials from config or credentials DB."""
    settings = get_settings()
    app_id = settings.adzuna_app_id
    api_key = settings.adzuna_api_key
    if app_id and api_key:
        return app_id, api_key
    if db:
        creds = await get_provider_credentials(db, "adzuna")
        if creds:
            return creds.get("adzuna_app_id", ""), creds.get("adzuna_api_key", "")
    return "", ""


async def get_job_market(
    city: str,
    state: str,
    db=None,
) -> Optional[dict]:
    """Get job market data for a city/state from Adzuna.

    Returns:
        {
            "total_jobs": int,
            "average_salary": float,
            "salary_min": float,
            "salary_max": float,
            "top_categories": list[str],
            "sample_jobs": list[dict],
            "source": str,
        }
        or None if the API call fails.
    """
    location = f"{city}, {state}".strip(", ")
    if not location:
        return None

    # Check cache
    cache_key = f"jobs_{location.lower()}"
    if cache_key in _jobs_cache:
        data, timestamp = _jobs_cache[cache_key]
        if time.time() - timestamp < _CACHE_TTL_SECONDS:
            return data

    app_id, api_key = await _get_credentials(db)
    if not app_id or not api_key:
        logger.warning("Adzuna API credentials not configured")
        return None

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            # Search for jobs in the location
            resp = await client.get(
                f"{ADZUNA_BASE}/jobs/us/search/1",
                params={
                    "app_id": app_id,
                    "app_key": api_key,
                    "where": location,
                    "results_per_page": 10,
                    "content-type": "application/json",
                },
            )
            if resp.status_code == 200:
                raw = resp.json()
                total_jobs = raw.get("count", 0)

                # Extract salary and job info from results
                results = raw.get("results", [])
                salaries = []
                categories = []
                sample_jobs = []

                for job in results:
                    sal_min = job.get("salary_min")
                    sal_max = job.get("salary_max")
                    if sal_min and sal_max:
                        salaries.append((sal_min + sal_max) / 2)
                    elif sal_min:
                        salaries.append(sal_min)
                    elif sal_max:
                        salaries.append(sal_max)

                    cat = job.get("category", {}).get("label", "")
                    if cat and cat not in categories:
                        categories.append(cat)

                    sample_jobs.append({
                        "title": job.get("title", ""),
                        "company": job.get("company", {}).get("display_name", ""),
                        "salary_min": sal_min,
                        "salary_max": sal_max,
                        "location": job.get("location", {}).get("display_name", ""),
                    })

                avg_salary = sum(salaries) / len(salaries) if salaries else 0

                result = {
                    "total_jobs": total_jobs,
                    "average_salary": round(avg_salary, 0),
                    "salary_min": min(salaries) if salaries else 0,
                    "salary_max": max(salaries) if salaries else 0,
                    "top_categories": categories[:5],
                    "sample_jobs": sample_jobs[:5],
                    "source": "Adzuna Jobs API",
                }
                _jobs_cache[cache_key] = (result, time.time())
                return result
            else:
                logger.warning("Adzuna API error %s: %s", resp.status_code, resp.text[:200])
    except Exception as e:
        logger.warning("Adzuna API request failed: %s", e)

    return None
