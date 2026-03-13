"""Browser-based property listing scraper using Playwright.

Provides headless Chromium scraping for public real estate listing sites:
- MLS-based: Zillow, Realtor.com, Redfin
- FSBO: ForSaleByOwner.com, Craigslist Real Estate

Uses stealth techniques to avoid bot detection: random delays, realistic
user-agent rotation, viewport randomization, and human-like scrolling.

Each listing returns a normalized dict with property AND contact fields:
    address, city, state, zip, price, beds, baths, sqft,
    owner_name, agent_name, phone, email, listing_type (agent/fsbo/owner),
    url, photo_url, source, days_on_market, status

Usage:
    from rei.services.browser_scraping_service import scrape_listings

    results = await scrape_listings(
        location="Huntington, NY",
        source="zillow",
        max_price=500000,
        min_beds=3,
        limit=25,
    )
"""

from __future__ import annotations

import asyncio
import json
import logging
import random
import re
from typing import Optional
from urllib.parse import quote_plus

logger = logging.getLogger(__name__)

# ── User-Agent rotation pool ────────────────────────────────────────────

_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
]

# ── Viewport size pool (realistic desktop sizes) ────────────────────────

_VIEWPORTS = [
    {"width": 1920, "height": 1080},
    {"width": 1536, "height": 864},
    {"width": 1440, "height": 900},
    {"width": 1366, "height": 768},
    {"width": 1280, "height": 720},
]


# ═══════════════════════════════════════════════════════════════════
# PUBLIC API
# ═══════════════════════════════════════════════════════════════════


async def scrape_listings(
    location: str,
    source: str = "zillow",
    max_price: Optional[int] = None,
    min_beds: Optional[int] = None,
    min_baths: Optional[int] = None,
    property_type: str = "",
    limit: int = 25,
    sort: str = "newest",
) -> dict:
    """Scrape property listings from a public real estate site.

    Args:
        location: City/state, county, or ZIP code (e.g. "Huntington, NY" or "11743")
        source: "zillow", "realtor", or "redfin"
        max_price: Maximum price filter
        min_beds: Minimum bedrooms
        min_baths: Minimum bathrooms
        property_type: "single_family", "multi_family", "condo", "townhouse", "land"
        limit: Max results to return (default 25)
        sort: "newest", "price_low", "price_high" (default "newest")

    Returns:
        {
            "source": str,
            "location": str,
            "total_found": int,
            "listings": [{address, city, state, zip, price, beds, baths, sqft,
                          owner_name, agent_name, phone, email, listing_type,
                          url, photo_url, days_on_market, status, ...}],
            "scraped_at": str (ISO timestamp),
        }
    """
    source = source.lower().strip()

    scrapers = {
        "zillow": _scrape_zillow,
        "realtor": _scrape_realtor,
        "redfin": _scrape_redfin,
        "fsbo": _scrape_fsbo,
        "craigslist": _scrape_craigslist,
    }

    scraper_fn = scrapers.get(source)
    if not scraper_fn:
        return {
            "error": f"Unknown source '{source}'. Supported: {', '.join(scrapers.keys())}",
            "supported_sources": list(scrapers.keys()),
        }

    try:
        result = await scraper_fn(
            location=location,
            max_price=max_price,
            min_beds=min_beds,
            min_baths=min_baths,
            property_type=property_type,
            limit=limit,
            sort=sort,
        )
        return result
    except Exception as exc:
        logger.error("Scraping %s for %r failed: %s", source, location, exc, exc_info=True)
        return {
            "error": f"Scraping failed: {str(exc)[:300]}",
            "source": source,
            "location": location,
            "listings": [],
            "total_found": 0,
        }


async def check_playwright_available() -> bool:
    """Check if Playwright and its browsers are installed."""
    try:
        from playwright.async_api import async_playwright
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            await browser.close()
        return True
    except Exception as exc:
        logger.warning("Playwright not available: %s", exc)
        return False


# ═══════════════════════════════════════════════════════════════════
# BROWSER CONTEXT — Shared stealth setup
# ═══════════════════════════════════════════════════════════════════


async def _create_stealth_context(playwright):
    """Create a browser context with stealth settings to avoid bot detection.

    Rotates user-agent, viewport, and locale. Blocks images/fonts for speed.
    """
    ua = random.choice(_USER_AGENTS)
    vp = random.choice(_VIEWPORTS)

    browser = await playwright.chromium.launch(
        headless=True,
        args=[
            "--disable-blink-features=AutomationControlled",
            "--disable-dev-shm-usage",
            "--no-sandbox",
        ],
    )

    context = await browser.new_context(
        user_agent=ua,
        viewport=vp,
        locale="en-US",
        timezone_id="America/New_York",
        permissions=[],
        java_script_enabled=True,
    )

    # Remove webdriver flag so navigator.webdriver returns false
    await context.add_init_script("""
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        // Spoof plugins array
        Object.defineProperty(navigator, 'plugins', {
            get: () => [1, 2, 3, 4, 5],
        });
        // Spoof languages
        Object.defineProperty(navigator, 'languages', {
            get: () => ['en-US', 'en'],
        });
    """)

    return browser, context


async def _human_delay(min_ms: int = 500, max_ms: int = 2000):
    """Random delay to mimic human browsing behavior."""
    delay = random.randint(min_ms, max_ms) / 1000.0
    await asyncio.sleep(delay)


async def _scroll_page(page, scrolls: int = 3):
    """Scroll down the page in human-like increments to trigger lazy loading."""
    for _ in range(scrolls):
        scroll_amount = random.randint(300, 800)
        await page.evaluate(f"window.scrollBy(0, {scroll_amount})")
        await _human_delay(300, 1000)


# ═══════════════════════════════════════════════════════════════════
# ZILLOW SCRAPER
# ═══════════════════════════════════════════════════════════════════


def _build_zillow_url(
    location: str,
    max_price: Optional[int] = None,
    min_beds: Optional[int] = None,
    min_baths: Optional[int] = None,
    property_type: str = "",
    sort: str = "newest",
) -> str:
    """Build a Zillow search URL from criteria.

    Zillow URL format: /homes/{location}_rb/
    Filters go in the searchQueryState parameter.
    """
    # Normalize location for Zillow URL slug
    slug = location.strip().replace(",", "").replace(" ", "-").lower()
    # Remove double dashes
    slug = re.sub(r"-+", "-", slug)

    base = f"https://www.zillow.com/homes/{slug}_rb/"

    # Build filter params
    filter_parts = []

    # Sort
    sort_map = {
        "newest": "days",
        "price_low": "pricea",
        "price_high": "priced",
    }
    sort_val = sort_map.get(sort, "days")

    # Price filter
    price_filter = ""
    if max_price:
        price_filter = f'"price":{{"max":{max_price}}}'

    # Beds filter
    beds_filter = ""
    if min_beds:
        beds_filter = f'"beds":{{"min":{min_beds}}}'

    # Baths filter
    baths_filter = ""
    if min_baths:
        baths_filter = f'"baths":{{"min":{min_baths}}}'

    # Property type mapping
    zillow_type_map = {
        "single_family": "SingleFamily",
        "multi_family": "MultiFamily",
        "condo": "Condo",
        "townhouse": "Townhouse",
        "land": "VacantLand",
    }

    type_filter = ""
    if property_type and property_type in zillow_type_map:
        z_type = zillow_type_map[property_type]
        type_filter = f'"homeType":["{z_type}"]'

    # Combine filters into searchQueryState
    filters = [f for f in [price_filter, beds_filter, baths_filter, type_filter] if f]
    if filters:
        filter_state = "{" + ",".join(filters) + "}"
        base += f"?searchQueryState={quote_plus(filter_state)}"

    return base


async def _scrape_zillow(
    location: str,
    max_price: Optional[int] = None,
    min_beds: Optional[int] = None,
    min_baths: Optional[int] = None,
    property_type: str = "",
    limit: int = 25,
    sort: str = "newest",
) -> dict:
    """Scrape Zillow search results page."""
    from playwright.async_api import async_playwright
    from datetime import datetime, timezone

    url = _build_zillow_url(location, max_price, min_beds, min_baths, property_type, sort)
    logger.info("Scraping Zillow: %s", url)

    listings = []

    async with async_playwright() as p:
        browser, context = await _create_stealth_context(p)

        try:
            page = await context.new_page()

            # Block images and fonts for faster loading
            await page.route("**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ttf}", lambda route: route.abort())

            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            await _human_delay(1000, 3000)

            # Scroll to trigger lazy loading
            await _scroll_page(page, scrolls=4)
            await _human_delay(500, 1500)

            # Strategy 1: Try to extract from __NEXT_DATA__ JSON (most reliable)
            next_data = await _extract_zillow_next_data(page)
            if next_data:
                listings = next_data
                logger.info("Zillow: extracted %d listings from __NEXT_DATA__", len(listings))

            # Strategy 2: Fall back to DOM scraping
            if not listings:
                listings = await _extract_zillow_dom(page)
                logger.info("Zillow: extracted %d listings from DOM", len(listings))

            # Strategy 3: Try the search results API response
            if not listings:
                listings = await _extract_zillow_script_data(page)
                logger.info("Zillow: extracted %d listings from script data", len(listings))

        finally:
            await browser.close()

    # Trim to limit
    listings = listings[:limit]

    return {
        "source": "zillow",
        "location": location,
        "url": url,
        "total_found": len(listings),
        "listings": listings,
        "scraped_at": datetime.now(timezone.utc).isoformat(),
    }


async def _extract_zillow_next_data(page) -> list[dict]:
    """Try to extract listing data from Zillow's __NEXT_DATA__ JSON blob."""
    try:
        script_content = await page.evaluate("""
            () => {
                const el = document.getElementById('__NEXT_DATA__');
                return el ? el.textContent : null;
            }
        """)

        if not script_content:
            return []

        data = json.loads(script_content)

        # Navigate the nested structure to find search results
        # Zillow's structure: props > pageProps > searchPageState > cat1 > searchResults > listResults
        try:
            results = (
                data.get("props", {})
                .get("pageProps", {})
                .get("searchPageState", {})
                .get("cat1", {})
                .get("searchResults", {})
                .get("listResults", [])
            )
        except (AttributeError, KeyError):
            return []

        listings = []
        for r in results:
            listing = _parse_zillow_result(r)
            if listing and listing.get("address"):
                listings.append(listing)

        return listings

    except Exception as exc:
        logger.debug("Zillow __NEXT_DATA__ extraction failed: %s", exc)
        return []


def _parse_zillow_result(r: dict) -> Optional[dict]:
    """Parse a single Zillow search result into a normalized listing dict."""
    if not r:
        return None

    # Skip non-listing items (ads, etc.)
    if r.get("isBuilding") or r.get("buildingName"):
        return None

    address_data = r.get("addressStreet") or r.get("address") or ""
    city = r.get("addressCity") or ""
    state = r.get("addressState") or ""
    zipcode = r.get("addressZipcode") or ""

    # Try hdpData for more details
    hdp = r.get("hdpData", {}).get("homeInfo", {}) or {}

    price = r.get("unformattedPrice") or r.get("price") or hdp.get("price")
    if isinstance(price, str):
        price = re.sub(r"[^\d]", "", price)
        price = int(price) if price else None

    beds = r.get("beds") or hdp.get("bedrooms")
    baths = r.get("baths") or hdp.get("bathrooms")
    sqft = r.get("area") or hdp.get("livingArea")

    detail_url = r.get("detailUrl") or ""
    if detail_url and not detail_url.startswith("http"):
        detail_url = f"https://www.zillow.com{detail_url}"

    img_src = r.get("imgSrc") or ""

    listing_type = hdp.get("homeType") or r.get("statusType") or ""
    status = r.get("statusText") or hdp.get("homeStatus") or ""
    days_on = hdp.get("daysOnZillow")

    # Use hdpData for more reliable address if available
    if not address_data and hdp:
        address_data = hdp.get("streetAddress") or ""
        city = city or hdp.get("city") or ""
        state = state or hdp.get("state") or ""
        zipcode = zipcode or hdp.get("zipcode") or ""

    # Contact info — Zillow rarely exposes agent details in search results
    # but hdpData sometimes has broker info
    broker_name = hdp.get("brokerName") or ""
    listing_agent = hdp.get("attributionInfo", {}).get("agentName") or "" if isinstance(hdp.get("attributionInfo"), dict) else ""

    return {
        "address": address_data,
        "city": city,
        "state": state,
        "zip": zipcode,
        "price": price,
        "beds": beds,
        "baths": baths,
        "sqft": sqft,
        "property_type": listing_type,
        "status": status,
        "days_on_market": days_on,
        "url": detail_url,
        "photo_url": img_src,
        "source": "zillow",
        # Contact fields
        "owner_name": None,
        "agent_name": listing_agent or broker_name or None,
        "phone": None,
        "email": None,
        "listing_type": "fsbo" if "fsbo" in status.lower() else "agent",
    }


async def _extract_zillow_dom(page) -> list[dict]:
    """Fall back to DOM scraping if __NEXT_DATA__ isn't available."""
    try:
        # Zillow uses article tags or list-card elements for each listing
        cards = await page.query_selector_all(
            'article[data-test="property-card"], '
            '[class*="ListItem"], '
            '[class*="property-card"], '
            '[data-test="property-card-link"]'
        )

        listings = []
        for card in cards:
            try:
                address_el = await card.query_selector('[data-test="property-card-addr"], address')
                price_el = await card.query_selector('[data-test="property-card-price"], [class*="price"]')
                details_el = await card.query_selector('[data-test="property-card-details"], [class*="details"]')
                link_el = await card.query_selector('a[href*="/homedetails/"]')

                address = await address_el.inner_text() if address_el else ""
                price_text = await price_el.inner_text() if price_el else ""
                details_text = await details_el.inner_text() if details_el else ""
                href = await link_el.get_attribute("href") if link_el else ""

                if not address:
                    continue

                # Parse price
                price = None
                price_match = re.search(r"\$[\d,]+", price_text)
                if price_match:
                    price = int(re.sub(r"[^\d]", "", price_match.group()))

                # Parse beds/baths/sqft from details text like "3 bds | 2 ba | 1,500 sqft"
                beds = None
                baths = None
                sqft = None

                beds_match = re.search(r"(\d+)\s*(?:bd|bed)", details_text, re.I)
                baths_match = re.search(r"(\d+)\s*(?:ba|bath)", details_text, re.I)
                sqft_match = re.search(r"([\d,]+)\s*sqft", details_text, re.I)

                if beds_match:
                    beds = int(beds_match.group(1))
                if baths_match:
                    baths = int(baths_match.group(1))
                if sqft_match:
                    sqft = int(sqft_match.group(1).replace(",", ""))

                # Parse city/state/zip from address
                # Format: "123 Main St, City, ST 12345"
                parts = address.split(",")
                street = parts[0].strip() if len(parts) > 0 else address
                city = parts[1].strip() if len(parts) > 1 else ""
                state_zip = parts[2].strip() if len(parts) > 2 else ""

                state = ""
                zipcode = ""
                if state_zip:
                    sz_match = re.match(r"([A-Z]{2})\s*(\d{5})?", state_zip)
                    if sz_match:
                        state = sz_match.group(1)
                        zipcode = sz_match.group(2) or ""

                url = href
                if url and not url.startswith("http"):
                    url = f"https://www.zillow.com{url}"

                listings.append({
                    "address": street,
                    "city": city,
                    "state": state,
                    "zip": zipcode,
                    "price": price,
                    "beds": beds,
                    "baths": baths,
                    "sqft": sqft,
                    "url": url,
                    "source": "zillow",
                    "owner_name": None,
                    "agent_name": None,
                    "phone": None,
                    "email": None,
                    "listing_type": "agent",
                })

            except Exception as exc:
                logger.debug("Failed to parse Zillow card: %s", exc)
                continue

        return listings

    except Exception as exc:
        logger.debug("Zillow DOM extraction failed: %s", exc)
        return []


async def _extract_zillow_script_data(page) -> list[dict]:
    """Try to find listing data in inline script tags."""
    try:
        scripts = await page.evaluate("""
            () => {
                const scripts = document.querySelectorAll('script[type="application/json"]');
                const results = [];
                for (const s of scripts) {
                    if (s.textContent && s.textContent.includes('listResults')) {
                        results.push(s.textContent.substring(0, 50000));
                    }
                }
                return results;
            }
        """)

        for script_text in (scripts or []):
            try:
                data = json.loads(script_text)
                # Try to navigate to listResults in various structures
                results = _deep_find_key(data, "listResults")
                if results and isinstance(results, list):
                    listings = []
                    for r in results:
                        listing = _parse_zillow_result(r)
                        if listing and listing.get("address"):
                            listings.append(listing)
                    if listings:
                        return listings
            except (json.JSONDecodeError, TypeError):
                continue

        return []

    except Exception as exc:
        logger.debug("Zillow script data extraction failed: %s", exc)
        return []


def _deep_find_key(obj, target_key: str):
    """Recursively search a nested dict/list for a key."""
    if isinstance(obj, dict):
        if target_key in obj:
            return obj[target_key]
        for v in obj.values():
            result = _deep_find_key(v, target_key)
            if result is not None:
                return result
    elif isinstance(obj, list):
        for item in obj:
            result = _deep_find_key(item, target_key)
            if result is not None:
                return result
    return None


# ═══════════════════════════════════════════════════════════════════
# REALTOR.COM SCRAPER
# ═══════════════════════════════════════════════════════════════════


async def _scrape_realtor(
    location: str,
    max_price: Optional[int] = None,
    min_beds: Optional[int] = None,
    min_baths: Optional[int] = None,
    property_type: str = "",
    limit: int = 25,
    sort: str = "newest",
) -> dict:
    """Scrape Realtor.com search results page."""
    from playwright.async_api import async_playwright
    from datetime import datetime, timezone

    # Realtor.com URL format: /realestateandhomes-search/{location}
    slug = location.strip().replace(",", "").replace(" ", "-")
    slug = re.sub(r"-+", "-", slug)

    url = f"https://www.realtor.com/realestateandhomes-search/{slug}"

    # Add filters
    filter_parts = []
    if max_price:
        filter_parts.append(f"price-na-{max_price}")
    if min_beds:
        filter_parts.append(f"beds-{min_beds}")
    if min_baths:
        filter_parts.append(f"baths-{min_baths}")

    type_map = {
        "single_family": "type-single-family-home",
        "multi_family": "type-multi-family-home",
        "condo": "type-condo",
        "townhouse": "type-townhomes",
        "land": "type-land",
    }
    if property_type and property_type in type_map:
        filter_parts.append(type_map[property_type])

    sort_map = {"newest": "sby-6", "price_low": "sby-1", "price_high": "sby-2"}
    if sort in sort_map:
        filter_parts.append(sort_map[sort])

    if filter_parts:
        url += "/" + "/".join(filter_parts)

    logger.info("Scraping Realtor.com: %s", url)

    listings = []

    async with async_playwright() as p:
        browser, context = await _create_stealth_context(p)

        try:
            page = await context.new_page()
            await page.route("**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ttf}", lambda route: route.abort())

            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            await _human_delay(1000, 3000)
            await _scroll_page(page, scrolls=3)

            # Try __NEXT_DATA__ first (Realtor.com also uses Next.js)
            try:
                next_data = await page.evaluate("""
                    () => {
                        const el = document.getElementById('__NEXT_DATA__');
                        return el ? el.textContent : null;
                    }
                """)

                if next_data:
                    data = json.loads(next_data)
                    # Realtor.com structure varies, search for property results
                    results = _deep_find_key(data, "properties") or _deep_find_key(data, "results")
                    if results and isinstance(results, list):
                        for r in results:
                            listing = _parse_realtor_result(r)
                            if listing and listing.get("address"):
                                listings.append(listing)
            except Exception as exc:
                logger.debug("Realtor.com __NEXT_DATA__ failed: %s", exc)

            # Fall back to DOM scraping
            if not listings:
                cards = await page.query_selector_all(
                    '[data-testid="property-card"], '
                    '.property-card, '
                    '[class*="PropertyCard"], '
                    '[class*="card-content"]'
                )

                for card in cards:
                    try:
                        addr_el = await card.query_selector('[data-testid="card-address"], .card-address')
                        price_el = await card.query_selector('[data-testid="card-price"], .card-price')
                        meta_el = await card.query_selector('[data-testid="card-meta"], .card-meta')
                        link_el = await card.query_selector('a[href*="/realestateandhomes-detail/"]')

                        addr = await addr_el.inner_text() if addr_el else ""
                        price_text = await price_el.inner_text() if price_el else ""
                        meta_text = await meta_el.inner_text() if meta_el else ""
                        href = await link_el.get_attribute("href") if link_el else ""

                        if not addr:
                            continue

                        price = None
                        pm = re.search(r"\$[\d,]+", price_text)
                        if pm:
                            price = int(re.sub(r"[^\d]", "", pm.group()))

                        beds = baths = sqft = None
                        bm = re.search(r"(\d+)\s*bed", meta_text, re.I)
                        btm = re.search(r"(\d+)\s*bath", meta_text, re.I)
                        sm = re.search(r"([\d,]+)\s*sqft", meta_text, re.I)
                        if bm:
                            beds = int(bm.group(1))
                        if btm:
                            baths = int(btm.group(1))
                        if sm:
                            sqft = int(sm.group(1).replace(",", ""))

                        detail_url = href
                        if detail_url and not detail_url.startswith("http"):
                            detail_url = f"https://www.realtor.com{detail_url}"

                        listings.append({
                            "address": addr.split(",")[0].strip() if "," in addr else addr,
                            "city": addr.split(",")[1].strip() if len(addr.split(",")) > 1 else "",
                            "state": "",
                            "zip": "",
                            "price": price,
                            "beds": beds,
                            "baths": baths,
                            "sqft": sqft,
                            "url": detail_url,
                            "source": "realtor",
                            "owner_name": None,
                            "agent_name": None,
                            "phone": None,
                            "email": None,
                            "listing_type": "agent",
                        })
                    except Exception:
                        continue

        finally:
            await browser.close()

    listings = listings[:limit]

    return {
        "source": "realtor",
        "location": location,
        "url": url,
        "total_found": len(listings),
        "listings": listings,
        "scraped_at": datetime.now(timezone.utc).isoformat(),
    }


def _parse_realtor_result(r: dict) -> Optional[dict]:
    """Parse a single Realtor.com result from JSON data."""
    if not r:
        return None

    location = r.get("location", {}) or {}
    address = location.get("address", {}) or {}

    street = address.get("line") or ""
    city = address.get("city") or ""
    state = address.get("state_code") or address.get("state") or ""
    zipcode = address.get("postal_code") or ""

    price = r.get("list_price") or r.get("price")
    description = r.get("description", {}) or {}

    beds = description.get("beds") or r.get("beds")
    baths = description.get("baths") or r.get("baths")
    sqft = description.get("sqft") or r.get("sqft")

    detail_url = r.get("href") or r.get("permalink") or ""
    if detail_url and not detail_url.startswith("http"):
        detail_url = f"https://www.realtor.com{detail_url}"

    photos = r.get("photos", []) or []
    photo_url = photos[0].get("href") if photos else ""

    # Contact info — Realtor.com sometimes includes advertiser/agent data
    advertisers = r.get("advertisers", []) or []
    agent_name = ""
    agent_phone = ""
    agent_email = ""
    if advertisers:
        adv = advertisers[0] if isinstance(advertisers[0], dict) else {}
        agent_name = adv.get("name") or adv.get("fulfillment_id") or ""
        phones = adv.get("phones", []) or []
        if phones:
            ph = phones[0]
            agent_phone = ph.get("number") or "" if isinstance(ph, dict) else str(ph)
        agent_email = adv.get("email") or ""

    return {
        "address": street,
        "city": city,
        "state": state,
        "zip": zipcode,
        "price": price,
        "beds": beds,
        "baths": baths,
        "sqft": sqft,
        "url": detail_url,
        "photo_url": photo_url,
        "source": "realtor",
        "owner_name": None,
        "agent_name": agent_name or None,
        "phone": agent_phone or None,
        "email": agent_email or None,
        "listing_type": "agent",
    }


# ═══════════════════════════════════════════════════════════════════
# REDFIN SCRAPER
# ═══════════════════════════════════════════════════════════════════


async def _scrape_redfin(
    location: str,
    max_price: Optional[int] = None,
    min_beds: Optional[int] = None,
    min_baths: Optional[int] = None,
    property_type: str = "",
    limit: int = 25,
    sort: str = "newest",
) -> dict:
    """Scrape Redfin search results — uses their stingray API endpoint."""
    from playwright.async_api import async_playwright
    from datetime import datetime, timezone

    # Redfin URL: /city/{state-code}/{city}/filter/...
    slug = location.strip().replace(",", "/").replace(" ", "-").lower()
    slug = re.sub(r"-+", "-", slug)
    slug = re.sub(r"/+", "/", slug)

    url = f"https://www.redfin.com/city/{slug}"

    # Add filters
    filters = []
    if max_price:
        filters.append(f"max-price={max_price}")
    if min_beds:
        filters.append(f"min-beds={min_beds}")
    if min_baths:
        filters.append(f"min-baths={min_baths}")

    type_map = {
        "single_family": "property-type=house",
        "multi_family": "property-type=multifamily",
        "condo": "property-type=condo",
        "townhouse": "property-type=townhouse",
        "land": "property-type=land",
    }
    if property_type and property_type in type_map:
        filters.append(type_map[property_type])

    if filters:
        url += "/filter/" + ",".join(filters)

    logger.info("Scraping Redfin: %s", url)

    listings = []

    async with async_playwright() as p:
        browser, context = await _create_stealth_context(p)

        try:
            page = await context.new_page()
            await page.route("**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ttf}", lambda route: route.abort())

            # Capture XHR responses that contain listing data
            captured_data = []

            async def capture_response(response):
                try:
                    if "stingray" in response.url or "api/gis" in response.url:
                        text = await response.text()
                        if text and ("homes" in text or "listing" in text.lower()):
                            captured_data.append(text)
                except Exception:
                    pass

            page.on("response", capture_response)

            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            await _human_delay(1500, 3000)
            await _scroll_page(page, scrolls=3)

            # Try captured API responses
            for data_text in captured_data:
                try:
                    # Redfin API responses sometimes start with "{}&&"
                    cleaned = re.sub(r"^.*?&&", "", data_text)
                    data = json.loads(cleaned)
                    homes = _deep_find_key(data, "homes") or _deep_find_key(data, "searchResults")
                    if homes and isinstance(homes, list):
                        for h in homes:
                            listing = _parse_redfin_result(h)
                            if listing and listing.get("address"):
                                listings.append(listing)
                except (json.JSONDecodeError, TypeError):
                    continue

            # Fall back to DOM scraping
            if not listings:
                cards = await page.query_selector_all(
                    '.HomeCardContainer, '
                    '[class*="homecard"], '
                    '[data-rf-test-id="mapHomeCard"]'
                )

                for card in cards:
                    try:
                        addr_el = await card.query_selector('.homeAddressV2, [class*="address"]')
                        price_el = await card.query_selector('.homecardV2Price, [class*="price"]')
                        stats_el = await card.query_selector('.HomeStatsV2, [class*="stats"]')
                        link_el = await card.query_selector('a[href*="/home/"]')

                        addr = await addr_el.inner_text() if addr_el else ""
                        price_text = await price_el.inner_text() if price_el else ""
                        stats_text = await stats_el.inner_text() if stats_el else ""
                        href = await link_el.get_attribute("href") if link_el else ""

                        if not addr:
                            continue

                        price = None
                        pm = re.search(r"\$[\d,]+", price_text)
                        if pm:
                            price = int(re.sub(r"[^\d]", "", pm.group()))

                        beds = baths = sqft = None
                        bm = re.search(r"(\d+)\s*(?:bd|bed)", stats_text, re.I)
                        btm = re.search(r"(\d+(?:\.\d+)?)\s*(?:ba|bath)", stats_text, re.I)
                        sm = re.search(r"([\d,]+)\s*(?:sq\s*ft|sqft)", stats_text, re.I)
                        if bm:
                            beds = int(bm.group(1))
                        if btm:
                            baths = float(btm.group(1))
                        if sm:
                            sqft = int(sm.group(1).replace(",", ""))

                        detail_url = href
                        if detail_url and not detail_url.startswith("http"):
                            detail_url = f"https://www.redfin.com{detail_url}"

                        listings.append({
                            "address": addr.split(",")[0].strip() if "," in addr else addr,
                            "city": "",
                            "state": "",
                            "zip": "",
                            "price": price,
                            "beds": beds,
                            "baths": baths,
                            "sqft": sqft,
                            "url": detail_url,
                            "source": "redfin",
                            "owner_name": None,
                            "agent_name": None,
                            "phone": None,
                            "email": None,
                            "listing_type": "agent",
                        })
                    except Exception:
                        continue

        finally:
            await browser.close()

    listings = listings[:limit]

    return {
        "source": "redfin",
        "location": location,
        "url": url,
        "total_found": len(listings),
        "listings": listings,
        "scraped_at": datetime.now(timezone.utc).isoformat(),
    }


def _parse_redfin_result(r: dict) -> Optional[dict]:
    """Parse a single Redfin result from API data."""
    if not r:
        return None

    home_data = r.get("homeData", r) or r

    street = home_data.get("addressInfo", {}).get("formattedStreetLine") or ""
    city = home_data.get("addressInfo", {}).get("city") or ""
    state = home_data.get("addressInfo", {}).get("state") or ""
    zipcode = home_data.get("addressInfo", {}).get("zip") or ""

    price = home_data.get("priceInfo", {}).get("amount") or home_data.get("price", {}).get("value")
    beds = home_data.get("beds")
    baths = home_data.get("baths")
    sqft = home_data.get("sqFt", {}).get("value") if isinstance(home_data.get("sqFt"), dict) else home_data.get("sqFt")

    detail_url = home_data.get("url") or ""
    if detail_url and not detail_url.startswith("http"):
        detail_url = f"https://www.redfin.com{detail_url}"

    # Contact info — Redfin sometimes has listing agent in the data
    listing_agent = home_data.get("listingAgent", {}) or {}
    agent_name = listing_agent.get("name") or ""

    return {
        "address": street,
        "city": city,
        "state": state,
        "zip": zipcode,
        "price": price,
        "beds": beds,
        "baths": baths,
        "sqft": sqft,
        "url": detail_url,
        "source": "redfin",
        "owner_name": None,
        "agent_name": agent_name or None,
        "phone": None,
        "email": None,
        "listing_type": "agent",
    }


# ═══════════════════════════════════════════════════════════════════
# FSBO SCRAPER — ForSaleByOwner.com
# ═══════════════════════════════════════════════════════════════════


async def _scrape_fsbo(
    location: str,
    max_price: Optional[int] = None,
    min_beds: Optional[int] = None,
    min_baths: Optional[int] = None,
    property_type: str = "",
    limit: int = 25,
    sort: str = "newest",
) -> dict:
    """Scrape ForSaleByOwner.com — the primary FSBO listing site.

    FSBO listings are high-value for investors because they include
    owner contact info (name, phone, email) directly on the listing.
    """
    from playwright.async_api import async_playwright
    from datetime import datetime, timezone

    # ForSaleByOwner.com URL format: /listings/{state}/{city}/
    # Normalize location
    parts = [p.strip() for p in location.split(",")]
    if len(parts) >= 2:
        city_slug = parts[0].lower().replace(" ", "-")
        state_slug = parts[1].strip().lower().replace(" ", "-")
        # Handle state abbreviations
        if len(state_slug) == 2:
            state_slug = state_slug.upper()
    elif len(parts) == 1 and parts[0].isdigit():
        # ZIP code — use as-is
        city_slug = parts[0]
        state_slug = ""
    else:
        city_slug = parts[0].lower().replace(" ", "-")
        state_slug = ""

    # Build URL
    if state_slug:
        url = f"https://www.forsalebyowner.com/listings/{state_slug}/{city_slug}"
    else:
        url = f"https://www.forsalebyowner.com/search?location={quote_plus(location)}"

    logger.info("Scraping ForSaleByOwner.com: %s", url)

    listings = []

    async with async_playwright() as p:
        browser, context = await _create_stealth_context(p)

        try:
            page = await context.new_page()
            await page.route("**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ttf}", lambda route: route.abort())

            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            await _human_delay(1500, 3000)
            await _scroll_page(page, scrolls=4)

            # FSBO.com uses structured listing cards with contact info visible
            cards = await page.query_selector_all(
                '.listing-card, '
                '[class*="PropertyCard"], '
                '[class*="listing-item"], '
                '[data-testid="listing-card"], '
                'article.listing'
            )

            if not cards:
                # Try broader selectors
                cards = await page.query_selector_all(
                    '.search-result, '
                    '[class*="result-card"], '
                    '[class*="property-listing"]'
                )

            for card in cards:
                try:
                    listing = await _parse_fsbo_card(card, page)
                    if listing and listing.get("address"):
                        listings.append(listing)
                except Exception as exc:
                    logger.debug("Failed to parse FSBO card: %s", exc)
                    continue

            # If no cards found via selectors, try extracting from page JSON/scripts
            if not listings:
                listings = await _extract_fsbo_from_scripts(page)

        finally:
            await browser.close()

    # Apply filters
    if max_price:
        listings = [l for l in listings if not l.get("price") or l["price"] <= max_price]
    if min_beds:
        listings = [l for l in listings if not l.get("beds") or l["beds"] >= min_beds]
    if min_baths:
        listings = [l for l in listings if not l.get("baths") or l["baths"] >= min_baths]

    listings = listings[:limit]

    return {
        "source": "fsbo",
        "location": location,
        "url": url,
        "total_found": len(listings),
        "listings": listings,
        "scraped_at": datetime.now(timezone.utc).isoformat(),
    }


async def _parse_fsbo_card(card, page) -> Optional[dict]:
    """Parse a single FSBO listing card — extracts property + contact info."""
    # Address
    addr_el = await card.query_selector(
        '[class*="address"], .listing-address, h2, h3, [class*="street"]'
    )
    address = await addr_el.inner_text() if addr_el else ""
    if not address:
        return None

    # Price
    price_el = await card.query_selector(
        '[class*="price"], .listing-price, [class*="Price"]'
    )
    price_text = await price_el.inner_text() if price_el else ""
    price = None
    pm = re.search(r"\$[\d,]+", price_text)
    if pm:
        price = int(re.sub(r"[^\d]", "", pm.group()))

    # Details (beds/baths/sqft)
    details_el = await card.query_selector(
        '[class*="details"], [class*="specs"], [class*="bed"], [class*="meta"]'
    )
    details_text = await details_el.inner_text() if details_el else ""

    beds = baths = sqft = None
    bm = re.search(r"(\d+)\s*(?:bd|bed|BR)", details_text, re.I)
    btm = re.search(r"(\d+(?:\.\d+)?)\s*(?:ba|bath|BA)", details_text, re.I)
    sm = re.search(r"([\d,]+)\s*(?:sq\s*ft|sqft|SF)", details_text, re.I)
    if bm:
        beds = int(bm.group(1))
    if btm:
        baths = float(btm.group(1))
    if sm:
        sqft = int(sm.group(1).replace(",", ""))

    # Link
    link_el = await card.query_selector('a[href*="listing"], a[href*="property"]')
    if not link_el:
        link_el = await card.query_selector("a")
    href = await link_el.get_attribute("href") if link_el else ""
    if href and not href.startswith("http"):
        href = f"https://www.forsalebyowner.com{href}"

    # ── Contact info — the key differentiator for FSBO ──
    owner_name = ""
    phone = ""
    email = ""

    # Owner/seller name
    name_el = await card.query_selector(
        '[class*="owner"], [class*="seller"], [class*="contact-name"], '
        '[class*="agent-name"], [class*="lister"]'
    )
    if name_el:
        owner_name = (await name_el.inner_text()).strip()

    # Phone number
    phone_el = await card.query_selector(
        'a[href^="tel:"], [class*="phone"], [class*="Phone"]'
    )
    if phone_el:
        phone_href = await phone_el.get_attribute("href")
        if phone_href and phone_href.startswith("tel:"):
            phone = phone_href.replace("tel:", "").strip()
        else:
            phone_text = await phone_el.inner_text()
            phone_match = re.search(r"[\d\(\)\-\.\s]{10,}", phone_text)
            if phone_match:
                phone = phone_match.group().strip()

    # Email
    email_el = await card.query_selector(
        'a[href^="mailto:"], [class*="email"]'
    )
    if email_el:
        email_href = await email_el.get_attribute("href")
        if email_href and email_href.startswith("mailto:"):
            email = email_href.replace("mailto:", "").split("?")[0].strip()
        else:
            email_text = await email_el.inner_text()
            email_match = re.search(r"[\w.\-+]+@[\w.\-]+\.\w+", email_text)
            if email_match:
                email = email_match.group()

    # Parse city/state/zip from address
    addr_parts = address.split(",")
    street = addr_parts[0].strip()
    city = addr_parts[1].strip() if len(addr_parts) > 1 else ""
    state_zip = addr_parts[2].strip() if len(addr_parts) > 2 else ""
    state = ""
    zipcode = ""
    if state_zip:
        sz = re.match(r"([A-Z]{2})\s*(\d{5})?", state_zip)
        if sz:
            state = sz.group(1)
            zipcode = sz.group(2) or ""

    return {
        "address": street,
        "city": city,
        "state": state,
        "zip": zipcode,
        "price": price,
        "beds": beds,
        "baths": baths,
        "sqft": sqft,
        "url": href,
        "source": "fsbo",
        "owner_name": owner_name or None,
        "agent_name": None,
        "phone": phone or None,
        "email": email or None,
        "listing_type": "fsbo",
    }


async def _extract_fsbo_from_scripts(page) -> list[dict]:
    """Try to extract FSBO listing data from inline JSON scripts."""
    try:
        scripts = await page.evaluate("""
            () => {
                const scripts = document.querySelectorAll(
                    'script[type="application/json"], script[type="application/ld+json"]'
                );
                const results = [];
                for (const s of scripts) {
                    if (s.textContent && (
                        s.textContent.includes('streetAddress') ||
                        s.textContent.includes('listing')
                    )) {
                        results.push(s.textContent.substring(0, 50000));
                    }
                }
                return results;
            }
        """)

        listings = []
        for script_text in (scripts or []):
            try:
                data = json.loads(script_text)
                # Handle single listing (ld+json)
                if isinstance(data, dict) and data.get("@type") in ("Product", "RealEstateListing", "Residence"):
                    listing = _parse_ldjson_listing(data)
                    if listing:
                        listings.append(listing)
                # Handle array of listings
                elif isinstance(data, list):
                    for item in data:
                        if isinstance(item, dict):
                            listing = _parse_ldjson_listing(item)
                            if listing:
                                listings.append(listing)
                # Nested structure
                elif isinstance(data, dict):
                    results = _deep_find_key(data, "listings") or _deep_find_key(data, "results")
                    if results and isinstance(results, list):
                        for r in results:
                            if isinstance(r, dict) and (r.get("address") or r.get("streetAddress")):
                                listings.append({
                                    "address": r.get("address") or r.get("streetAddress") or "",
                                    "city": r.get("city") or "",
                                    "state": r.get("state") or "",
                                    "zip": r.get("zip") or r.get("postalCode") or "",
                                    "price": r.get("price") or r.get("listPrice"),
                                    "beds": r.get("beds") or r.get("bedrooms"),
                                    "baths": r.get("baths") or r.get("bathrooms"),
                                    "sqft": r.get("sqft") or r.get("livingArea"),
                                    "url": r.get("url") or "",
                                    "source": "fsbo",
                                    "owner_name": r.get("ownerName") or r.get("sellerName") or None,
                                    "agent_name": None,
                                    "phone": r.get("phone") or r.get("sellerPhone") or None,
                                    "email": r.get("email") or r.get("sellerEmail") or None,
                                    "listing_type": "fsbo",
                                })
            except (json.JSONDecodeError, TypeError):
                continue

        return listings

    except Exception as exc:
        logger.debug("FSBO script extraction failed: %s", exc)
        return []


def _parse_ldjson_listing(data: dict) -> Optional[dict]:
    """Parse a schema.org ld+json listing into our normalized format."""
    address = data.get("address", {}) or {}
    if isinstance(address, str):
        return {
            "address": address,
            "city": "",
            "state": "",
            "zip": "",
            "price": data.get("price"),
            "source": "fsbo",
            "listing_type": "fsbo",
        }

    street = address.get("streetAddress") or ""
    if not street:
        return None

    price = data.get("price") or data.get("offers", {}).get("price") if isinstance(data.get("offers"), dict) else data.get("price")

    return {
        "address": street,
        "city": address.get("addressLocality") or "",
        "state": address.get("addressRegion") or "",
        "zip": address.get("postalCode") or "",
        "price": price,
        "beds": data.get("numberOfBedrooms") or data.get("numberOfRooms"),
        "baths": data.get("numberOfBathroomsTotal"),
        "sqft": data.get("floorSize", {}).get("value") if isinstance(data.get("floorSize"), dict) else None,
        "url": data.get("url") or "",
        "photo_url": data.get("image") or "",
        "source": "fsbo",
        "owner_name": None,
        "agent_name": None,
        "phone": None,
        "email": None,
        "listing_type": "fsbo",
    }


# ═══════════════════════════════════════════════════════════════════
# CRAIGSLIST REAL ESTATE SCRAPER
# ═══════════════════════════════════════════════════════════════════


async def _scrape_craigslist(
    location: str,
    max_price: Optional[int] = None,
    min_beds: Optional[int] = None,
    min_baths: Optional[int] = None,
    property_type: str = "",
    limit: int = 25,
    sort: str = "newest",
) -> dict:
    """Scrape Craigslist real estate for-sale-by-owner listings.

    Craigslist is one of the best FSBO sources because sellers post
    directly with their phone numbers and email addresses.
    Uses the /search/rea (real estate) section.
    """
    from playwright.async_api import async_playwright
    from datetime import datetime, timezone

    # Craigslist city subdomain mapping
    # For common locations, use the known subdomain; otherwise try to construct it
    cl_city = _get_craigslist_city(location)

    url = f"https://{cl_city}.craigslist.org/search/rea"

    # Add filters as query params
    params = []
    if max_price:
        params.append(f"max_price={max_price}")
    if min_beds:
        params.append(f"min_bedrooms={min_beds}")
    if min_baths:
        params.append(f"min_bathrooms={min_baths}")

    # Sort: date = newest first (default)
    sort_map = {"newest": "date", "price_low": "priceasc", "price_high": "pricedsc"}
    params.append(f"sort={sort_map.get(sort, 'date')}")

    # Owner-only filter (skip dealers/agents)
    params.append("sale_date=all+dates")

    if params:
        url += "?" + "&".join(params)

    logger.info("Scraping Craigslist RE: %s", url)

    listings = []

    async with async_playwright() as p:
        browser, context = await _create_stealth_context(p)

        try:
            page = await context.new_page()
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            await _human_delay(1000, 2500)
            await _scroll_page(page, scrolls=3)

            # Craigslist uses <li class="cl-static-search-result"> or similar
            cards = await page.query_selector_all(
                'li.cl-static-search-result, '
                'li.cl-search-result, '
                '.result-row, '
                '[class*="search-result"]'
            )

            for card in cards:
                try:
                    listing = await _parse_craigslist_card(card, cl_city)
                    if listing and (listing.get("address") or listing.get("title")):
                        listings.append(listing)
                except Exception as exc:
                    logger.debug("Failed to parse CL card: %s", exc)
                    continue

            # If we got listing URLs, scrape individual pages for contact info
            # (Craigslist often hides phone/email until you click into the listing)
            if listings:
                enriched = await _enrich_craigslist_listings(context, listings[:limit])
                listings = enriched

        finally:
            await browser.close()

    # Apply price filter (CL sometimes ignores it)
    if max_price:
        listings = [l for l in listings if not l.get("price") or l["price"] <= max_price]

    listings = listings[:limit]

    return {
        "source": "craigslist",
        "location": location,
        "url": url,
        "total_found": len(listings),
        "listings": listings,
        "scraped_at": datetime.now(timezone.utc).isoformat(),
    }


def _get_craigslist_city(location: str) -> str:
    """Map a location string to a Craigslist city subdomain.

    Craigslist uses city-specific subdomains like newyork.craigslist.org,
    longisland.craigslist.org, etc. This maps common locations.
    """
    loc = location.lower().strip()

    # Direct subdomain mappings for common areas
    cl_map = {
        "new york": "newyork",
        "nyc": "newyork",
        "manhattan": "newyork",
        "brooklyn": "newyork",
        "long island": "longisland",
        "huntington": "longisland",
        "suffolk": "longisland",
        "nassau": "longisland",
        "los angeles": "losangeles",
        "la": "losangeles",
        "chicago": "chicago",
        "houston": "houston",
        "phoenix": "phoenix",
        "philadelphia": "philadelphia",
        "san antonio": "sanantonio",
        "san diego": "sandiego",
        "dallas": "dallas",
        "austin": "austin",
        "jacksonville": "jacksonville",
        "san francisco": "sfbay",
        "sf": "sfbay",
        "seattle": "seattle",
        "denver": "denver",
        "boston": "boston",
        "miami": "miami",
        "atlanta": "atlanta",
        "tampa": "tampa",
        "orlando": "orlando",
        "detroit": "detroit",
        "portland": "portland",
        "las vegas": "lasvegas",
        "memphis": "memphis",
        "baltimore": "baltimore",
        "charlotte": "charlotte",
        "raleigh": "raleigh",
        "nashville": "nashville",
        "indianapolis": "indianapolis",
        "columbus": "columbus",
        "milwaukee": "milwaukee",
        "sacramento": "sacramento",
        "pittsburgh": "pittsburgh",
        "cincinnati": "cincinnati",
        "kansas city": "kansascity",
        "cleveland": "cleveland",
        "st louis": "stlouis",
        "new orleans": "neworleans",
        "hartford": "hartford",
        "westchester": "hudsonvalley",
    }

    # Try direct match
    for key, subdomain in cl_map.items():
        if key in loc:
            return subdomain

    # Try city,state format
    parts = [p.strip() for p in loc.split(",")]
    if parts:
        city = parts[0].lower().replace(" ", "")
        for key, subdomain in cl_map.items():
            if city == key.replace(" ", ""):
                return subdomain

    # Fall back to cleaned city name as subdomain (works for many cities)
    city_part = parts[0] if parts else loc
    return re.sub(r"[^a-z]", "", city_part.lower())


async def _parse_craigslist_card(card, cl_city: str) -> Optional[dict]:
    """Parse a Craigslist search result card."""
    # Title / address
    title_el = await card.query_selector(
        '.titlestring, .result-title, a.posting-title, [class*="title"]'
    )
    title = await title_el.inner_text() if title_el else ""

    # Link
    link_el = await card.query_selector('a[href*="/rea/"], a[href*="/reo/"], a')
    href = await link_el.get_attribute("href") if link_el else ""
    if href and not href.startswith("http"):
        href = f"https://{cl_city}.craigslist.org{href}"

    # Price
    price_el = await card.query_selector('.priceinfo, .result-price, [class*="price"]')
    price_text = await price_el.inner_text() if price_el else ""
    price = None
    pm = re.search(r"\$[\d,]+", price_text)
    if pm:
        price = int(re.sub(r"[^\d]", "", pm.group()))

    # Location / neighborhood
    hood_el = await card.query_selector('.result-hood, .nearby, [class*="hood"]')
    hood = await hood_el.inner_text() if hood_el else ""
    hood = hood.strip("() ")

    # Try to parse beds/baths from title or housing tag
    housing_el = await card.query_selector('.housing, [class*="housing"]')
    housing = await housing_el.inner_text() if housing_el else ""

    beds = baths = sqft = None
    text_to_parse = f"{title} {housing}"
    bm = re.search(r"(\d+)\s*(?:bd|bed|br|BR)", text_to_parse, re.I)
    btm = re.search(r"(\d+(?:\.\d+)?)\s*(?:ba|bath|BA)", text_to_parse, re.I)
    sm = re.search(r"([\d,]+)\s*(?:sq\s*ft|sqft|ft2|SF)", text_to_parse, re.I)
    if bm:
        beds = int(bm.group(1))
    if btm:
        baths = float(btm.group(1))
    if sm:
        sqft = int(sm.group(1).replace(",", ""))

    # Try to extract address from title (often in format "123 Main St - Nice House")
    address = ""
    addr_match = re.match(r"(\d+\s+[\w\s]+(?:St|Ave|Rd|Dr|Blvd|Ln|Way|Ct|Pl|Ter|Cir)\.?)", title, re.I)
    if addr_match:
        address = addr_match.group(1).strip()

    return {
        "address": address,
        "title": title,  # CL posts often don't have structured addresses
        "city": hood or "",
        "state": "",
        "zip": "",
        "price": price,
        "beds": beds,
        "baths": baths,
        "sqft": sqft,
        "url": href,
        "source": "craigslist",
        "owner_name": None,
        "agent_name": None,
        "phone": None,
        "email": None,
        "listing_type": "owner",  # CL real estate is mostly FSBO
    }


async def _enrich_craigslist_listings(context, listings: list[dict]) -> list[dict]:
    """Visit individual CL listing pages to extract contact info.

    Craigslist hides phone numbers and email until you view the detail page.
    We visit up to 10 listings to get contact details.
    """
    enriched = []
    visit_count = 0
    max_visits = 10  # Don't hammer CL — visit at most 10 detail pages

    for listing in listings:
        url = listing.get("url", "")

        # Only visit detail pages if we have a URL and haven't hit the limit
        if url and visit_count < max_visits:
            try:
                page = await context.new_page()
                await page.route("**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ttf}", lambda route: route.abort())
                await page.goto(url, wait_until="domcontentloaded", timeout=15000)
                await _human_delay(800, 2000)

                # Extract phone number from the listing body
                body_text = await page.evaluate("""
                    () => {
                        const body = document.querySelector('#postingbody, .body, [class*="posting-body"]');
                        return body ? body.innerText : document.body.innerText.substring(0, 5000);
                    }
                """)

                # Phone regex — match common US phone formats
                phone_match = re.search(
                    r"(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}",
                    body_text or "",
                )
                if phone_match:
                    listing["phone"] = phone_match.group().strip()

                # Email — sometimes in the body or as a reply link
                email_match = re.search(r"[\w.\-+]+@[\w.\-]+\.\w{2,}", body_text or "")
                if email_match:
                    listing["email"] = email_match.group()

                # Reply-to email (CL anonymized email)
                reply_el = await page.query_selector('a[href^="mailto:"]')
                if reply_el and not listing.get("email"):
                    mailto = await reply_el.get_attribute("href")
                    if mailto:
                        listing["email"] = mailto.replace("mailto:", "").split("?")[0]

                # Owner name — sometimes in the posting
                name_match = re.search(
                    r"(?:contact|call|text|ask for|owner[:\s]+)([A-Z][a-z]+ ?[A-Z]?[a-z]*)",
                    body_text or "",
                    re.I,
                )
                if name_match:
                    listing["owner_name"] = name_match.group(1).strip()

                await page.close()
                visit_count += 1

            except Exception as exc:
                logger.debug("Failed to enrich CL listing %s: %s", url[:60], exc)
                try:
                    await page.close()
                except Exception:
                    pass

        enriched.append(listing)

    logger.info("Enriched %d of %d CL listings with contact info", visit_count, len(listings))
    return enriched
