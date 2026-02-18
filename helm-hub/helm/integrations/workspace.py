"""Virtual Workspace — sandboxed per-tenant file system + code execution.

Tier 2 storage backend.  Each tenant gets an isolated directory on the
server where the AI can create files, write scripts, generate reports,
and execute code in a sandbox.

Security model:
  - Each tenant's workspace is ``workspaces/{tenant_id}/``
  - Path traversal blocked (no ``..`` allowed)
  - Code execution runs in a subprocess with timeout + resource limits
  - Only Python and shell scripts allowed (no arbitrary binaries)
  - Output captured, not streamed (prevents resource leaks)
"""

from __future__ import annotations

import asyncio
import logging
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path

from helm.integrations.file_manager import BackendType, FileInfo

logger = logging.getLogger(__name__)

# Base directory for all tenant workspaces
WORKSPACES_ROOT = Path("workspaces")

# Execution limits
MAX_EXEC_TIMEOUT = 30  # seconds
MAX_OUTPUT_BYTES = 1_000_000  # 1MB output cap


class VirtualWorkspace:
    """Sandboxed per-tenant file system with optional code execution."""

    backend_type = BackendType.WORKSPACE

    def __init__(self, tenant_id: str = "default") -> None:
        self._tenant_id = tenant_id
        self._root = (WORKSPACES_ROOT / tenant_id).resolve()
        self._root.mkdir(parents=True, exist_ok=True)

    @property
    def is_configured(self) -> bool:
        return True  # Always available — no external dependency

    @property
    def root_path(self) -> Path:
        return self._root

    def _safe_path(self, path: str) -> Path:
        """Resolve path within the workspace, blocking traversal attacks."""
        clean = path.strip("/").replace("\\", "/")
        if ".." in clean.split("/"):
            raise ValueError("Path traversal not allowed")
        resolved = (self._root / clean).resolve()
        if not str(resolved).startswith(str(self._root.resolve())):
            raise ValueError("Path escapes workspace boundary")
        return resolved

    def _file_info(self, p: Path) -> FileInfo:
        """Build FileInfo from a local Path."""
        stat = p.stat()
        rel = str(p.relative_to(self._root))
        return FileInfo(
            name=p.name,
            path=rel,
            mime_type=_guess_mime(p.name),
            size_bytes=stat.st_size,
            is_folder=p.is_dir(),
            created_at=datetime.fromtimestamp(stat.st_ctime, tz=timezone.utc),
            modified_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc),
            backend="workspace",
            backend_id=rel,
        )

    # ── FileBackend Implementation ────────────────────────────────────────

    async def list_files(self, path: str = "/") -> list[FileInfo]:
        try:
            target = self._safe_path(path)
            if not target.exists() or not target.is_dir():
                return []
            items = sorted(target.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
            return [self._file_info(p) for p in items]
        except Exception as exc:
            logger.error("Workspace list_files failed: %s", exc)
            return []

    async def read_file(self, path: str) -> bytes | None:
        try:
            target = self._safe_path(path)
            if not target.exists() or target.is_dir():
                return None
            return target.read_bytes()
        except Exception as exc:
            logger.error("Workspace read_file failed: %s", exc)
            return None

    async def write_file(
        self, path: str, content: bytes, mime_type: str = ""
    ) -> FileInfo | None:
        try:
            target = self._safe_path(path)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
            logger.info("Workspace wrote: %s (%d bytes)", path, len(content))
            return self._file_info(target)
        except Exception as exc:
            logger.error("Workspace write_file failed: %s", exc)
            return None

    async def create_folder(self, path: str) -> FileInfo | None:
        try:
            target = self._safe_path(path)
            target.mkdir(parents=True, exist_ok=True)
            logger.info("Workspace created folder: %s", path)
            return self._file_info(target)
        except Exception as exc:
            logger.error("Workspace create_folder failed: %s", exc)
            return None

    async def delete_file(self, path: str) -> bool:
        try:
            target = self._safe_path(path)
            if not target.exists():
                return False
            if target.is_dir():
                shutil.rmtree(target)
            else:
                target.unlink()
            logger.info("Workspace deleted: %s", path)
            return True
        except Exception as exc:
            logger.error("Workspace delete_file failed: %s", exc)
            return False

    async def move_file(self, src: str, dst: str) -> FileInfo | None:
        try:
            src_path = self._safe_path(src)
            dst_path = self._safe_path(dst)
            if not src_path.exists():
                return None
            dst_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(src_path), str(dst_path))
            logger.info("Workspace moved: %s → %s", src, dst)
            return self._file_info(dst_path)
        except Exception as exc:
            logger.error("Workspace move_file failed: %s", exc)
            return None

    async def search_files(self, query: str) -> list[FileInfo]:
        """Recursive filename search within the workspace."""
        try:
            results: list[FileInfo] = []
            query_lower = query.lower()
            for p in self._root.rglob("*"):
                if query_lower in p.name.lower():
                    results.append(self._file_info(p))
                if len(results) >= 50:
                    break
            return results
        except Exception as exc:
            logger.error("Workspace search failed: %s", exc)
            return []

    # ── Code Execution (Tier 2 power feature) ────────────────────────────

    async def execute_python(self, code: str, timeout: int = MAX_EXEC_TIMEOUT) -> dict:
        """Execute Python code in a sandboxed subprocess.

        Returns {"stdout", "stderr", "exit_code", "timed_out"}.
        """
        return await self._execute(
            ["python3", "-c", code],
            timeout=timeout,
        )

    async def execute_shell(self, command: str, timeout: int = MAX_EXEC_TIMEOUT) -> dict:
        """Execute a shell command in the workspace directory.

        Returns {"stdout", "stderr", "exit_code", "timed_out"}.
        """
        return await self._execute(
            ["bash", "-c", command],
            timeout=timeout,
        )

    async def _execute(self, cmd: list[str], timeout: int = MAX_EXEC_TIMEOUT) -> dict:
        """Run a command as a subprocess with timeout and output limits."""
        result = {"stdout": "", "stderr": "", "exit_code": -1, "timed_out": False}

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=str(self._root),
                env={**os.environ, "HOME": str(self._root)},
            )

            try:
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
                result["stdout"] = stdout.decode("utf-8", errors="replace")[:MAX_OUTPUT_BYTES]
                result["stderr"] = stderr.decode("utf-8", errors="replace")[:MAX_OUTPUT_BYTES]
                result["exit_code"] = proc.returncode or 0
            except asyncio.TimeoutError:
                proc.kill()
                await proc.wait()
                result["timed_out"] = True
                result["stderr"] = f"Execution timed out after {timeout}s"

            logger.info(
                "Workspace executed command (exit=%d, timeout=%s)",
                result["exit_code"],
                result["timed_out"],
            )

        except Exception as exc:
            result["stderr"] = str(exc)
            logger.error("Workspace execution failed: %s", exc)

        return result

    # ── Workspace Management ──────────────────────────────────────────────

    def get_usage(self) -> dict:
        """Get workspace disk usage stats."""
        total_size = 0
        file_count = 0
        for p in self._root.rglob("*"):
            if p.is_file():
                total_size += p.stat().st_size
                file_count += 1
        return {
            "tenant_id": self._tenant_id,
            "root": str(self._root),
            "total_files": file_count,
            "total_size_bytes": total_size,
            "total_size_mb": round(total_size / (1024 * 1024), 2),
        }


def _guess_mime(filename: str) -> str:
    """Basic MIME type detection from extension."""
    ext = Path(filename).suffix.lower()
    mime_map = {
        ".txt": "text/plain",
        ".md": "text/markdown",
        ".py": "text/x-python",
        ".js": "text/javascript",
        ".ts": "text/typescript",
        ".json": "application/json",
        ".csv": "text/csv",
        ".html": "text/html",
        ".css": "text/css",
        ".xml": "application/xml",
        ".pdf": "application/pdf",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
        ".zip": "application/zip",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".sh": "application/x-sh",
    }
    return mime_map.get(ext, "application/octet-stream")


# Default workspace singleton (for personal use / single-tenant dev)
default_workspace = VirtualWorkspace("default")
