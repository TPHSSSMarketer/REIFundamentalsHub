"""Shared test configuration — sets up auth for API tests."""

from __future__ import annotations

import os

# Set a test API key before any Helm modules are imported
os.environ.setdefault("API_KEYS", "test-api-key-for-tests")
os.environ.setdefault("JWT_SECRET_KEY", "test-jwt-secret")
