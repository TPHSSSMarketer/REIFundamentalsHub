"""Unified File Manager — one interface for Google Drive, virtual workspace, or local agent.

The AI doesn't care *where* files live.  It calls ``file_manager.list_files(path)``
and the correct backend handles it based on the tenant's configuration.

Backends:
  - google_drive:  OAuth-based cloud storage (Tier 1 — SaaS default)
  - workspace:     Server-side sandboxed directory per tenant (Tier 2 — power users)
  - local_agent:   WebSocket bridge to a daemon on the user's machine (Tier 3 — future)

Each backend implements the ``FileBackend`` protocol.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Protocol, runtime_checkable

logger = logging.getLogger(__name__)


# ── Data Models ──────────────────────────────────────────────────────────────


class BackendType(str, Enum):
    GOOGLE_DRIVE = "google_drive"
    WORKSPACE = "workspace"
    LOCAL_AGENT = "local_agent"


@dataclass
class FileInfo:
    """Normalized file metadata returned by every backend."""

    name: str
    path: str
    mime_type: str = "application/octet-stream"
    size_bytes: int = 0
    is_folder: bool = False
    created_at: datetime | None = None
    modified_at: datetime | None = None
    backend: str = ""
    backend_id: str = ""  # Provider-specific ID (Google Drive file ID, etc.)


# ── Backend Protocol ─────────────────────────────────────────────────────────


@runtime_checkable
class FileBackend(Protocol):
    """Every storage backend must implement these operations."""

    backend_type: BackendType

    async def list_files(self, path: str = "/") -> list[FileInfo]: ...
    async def read_file(self, path: str) -> bytes | None: ...
    async def write_file(self, path: str, content: bytes, mime_type: str = "") -> FileInfo | None: ...
    async def create_folder(self, path: str) -> FileInfo | None: ...
    async def delete_file(self, path: str) -> bool: ...
    async def move_file(self, src: str, dst: str) -> FileInfo | None: ...
    async def search_files(self, query: str) -> list[FileInfo]: ...


# ── File Manager (orchestrates backends) ────────────────────────────────────


class FileManager:
    """Unified file operations across all storage backends.

    A tenant can have multiple backends active simultaneously.  The manager
    routes operations to the correct one based on the path prefix or an
    explicit ``backend`` parameter.

    Path convention:
      ``drive://Documents/deals``  →  Google Drive
      ``ws://scripts/analyzer.py`` →  Virtual Workspace
      ``local://Desktop/files``    →  Local Agent  (future)
      ``Documents/deals``          →  default backend
    """

    def __init__(self) -> None:
        self._backends: dict[BackendType, FileBackend] = {}
        self._default: BackendType | None = None

    def register_backend(self, backend: FileBackend, default: bool = False) -> None:
        self._backends[backend.backend_type] = backend
        if default or self._default is None:
            self._default = backend.backend_type
        logger.info("File backend registered: %s%s", backend.backend_type.value,
                     " (default)" if default else "")

    def _resolve(self, path: str) -> tuple[FileBackend, str]:
        """Parse prefix from path and return (backend, clean_path)."""
        prefixes = {
            "drive://": BackendType.GOOGLE_DRIVE,
            "ws://": BackendType.WORKSPACE,
            "local://": BackendType.LOCAL_AGENT,
        }
        for prefix, btype in prefixes.items():
            if path.startswith(prefix):
                backend = self._backends.get(btype)
                if not backend:
                    raise ValueError(f"Backend {btype.value} not configured")
                return backend, path[len(prefix):]

        # No prefix — use default
        if self._default and self._default in self._backends:
            return self._backends[self._default], path
        raise ValueError("No file backend configured")

    @property
    def active_backends(self) -> list[str]:
        return [b.value for b in self._backends]

    # ── Unified Operations ────────────────────────────────────────────────

    async def list_files(self, path: str = "/") -> list[FileInfo]:
        backend, clean = self._resolve(path)
        return await backend.list_files(clean)

    async def read_file(self, path: str) -> bytes | None:
        backend, clean = self._resolve(path)
        return await backend.read_file(clean)

    async def write_file(self, path: str, content: bytes, mime_type: str = "") -> FileInfo | None:
        backend, clean = self._resolve(path)
        return await backend.write_file(clean, content, mime_type)

    async def create_folder(self, path: str) -> FileInfo | None:
        backend, clean = self._resolve(path)
        return await backend.create_folder(clean)

    async def delete_file(self, path: str) -> bool:
        backend, clean = self._resolve(path)
        return await backend.delete_file(clean)

    async def move_file(self, src: str, dst: str) -> FileInfo | None:
        backend, clean_src = self._resolve(src)
        _, clean_dst = self._resolve(dst)
        return await backend.move_file(clean_src, clean_dst)

    async def search_files(self, query: str, backend: str | None = None) -> list[FileInfo]:
        """Search across one or all backends."""
        if backend:
            btype = BackendType(backend)
            b = self._backends.get(btype)
            return await b.search_files(query) if b else []

        results: list[FileInfo] = []
        for b in self._backends.values():
            results.extend(await b.search_files(query))
        return results


# Singleton
file_manager = FileManager()
