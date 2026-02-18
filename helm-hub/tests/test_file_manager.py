"""Tests for the unified file manager and storage backends."""

from __future__ import annotations

import pytest

from helm.integrations.file_manager import BackendType, FileInfo, FileManager
from helm.integrations.workspace import VirtualWorkspace


# ── FileManager routing ──────────────────────────────────────────────────────


def test_file_manager_no_backends():
    fm = FileManager()
    with pytest.raises(ValueError, match="No file backend configured"):
        import asyncio
        asyncio.get_event_loop().run_until_complete(fm.list_files("/"))


def test_file_manager_active_backends_empty():
    fm = FileManager()
    assert fm.active_backends == []


@pytest.mark.asyncio
async def test_file_manager_routes_to_workspace(tmp_path):
    ws = VirtualWorkspace.__new__(VirtualWorkspace)
    ws._tenant_id = "test"
    ws._root = tmp_path
    ws.backend_type = BackendType.WORKSPACE

    fm = FileManager()
    fm.register_backend(ws, default=True)

    assert "workspace" in fm.active_backends

    # Write a file through the manager
    result = await fm.write_file("hello.txt", b"Hello world")
    assert result is not None
    assert result.name == "hello.txt"

    # Read it back
    content = await fm.read_file("hello.txt")
    assert content == b"Hello world"

    # List it
    files = await fm.list_files("/")
    assert len(files) == 1
    assert files[0].name == "hello.txt"


@pytest.mark.asyncio
async def test_file_manager_prefix_routing(tmp_path):
    ws = VirtualWorkspace.__new__(VirtualWorkspace)
    ws._tenant_id = "test"
    ws._root = tmp_path
    ws.backend_type = BackendType.WORKSPACE

    fm = FileManager()
    fm.register_backend(ws)

    # Explicit ws:// prefix
    result = await fm.write_file("ws://test.txt", b"prefixed")
    assert result is not None

    content = await fm.read_file("ws://test.txt")
    assert content == b"prefixed"


@pytest.mark.asyncio
async def test_file_manager_rejects_unknown_prefix():
    fm = FileManager()
    with pytest.raises(ValueError, match="not configured"):
        await fm.list_files("drive://something")


# ── Virtual Workspace ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_workspace_write_and_read(tmp_path):
    ws = VirtualWorkspace.__new__(VirtualWorkspace)
    ws._tenant_id = "test"
    ws._root = tmp_path

    result = await ws.write_file("doc.txt", b"Hello workspace")
    assert result is not None
    assert result.name == "doc.txt"
    assert result.size_bytes == len(b"Hello workspace")

    content = await ws.read_file("doc.txt")
    assert content == b"Hello workspace"


@pytest.mark.asyncio
async def test_workspace_create_folder(tmp_path):
    ws = VirtualWorkspace.__new__(VirtualWorkspace)
    ws._tenant_id = "test"
    ws._root = tmp_path

    result = await ws.create_folder("projects/deals")
    assert result is not None
    assert result.is_folder
    assert (tmp_path / "projects" / "deals").exists()


@pytest.mark.asyncio
async def test_workspace_nested_write(tmp_path):
    ws = VirtualWorkspace.__new__(VirtualWorkspace)
    ws._tenant_id = "test"
    ws._root = tmp_path

    result = await ws.write_file("reports/q1/summary.md", b"# Q1 Report")
    assert result is not None
    assert (tmp_path / "reports" / "q1" / "summary.md").exists()


@pytest.mark.asyncio
async def test_workspace_delete_file(tmp_path):
    ws = VirtualWorkspace.__new__(VirtualWorkspace)
    ws._tenant_id = "test"
    ws._root = tmp_path

    await ws.write_file("temp.txt", b"delete me")
    assert (tmp_path / "temp.txt").exists()

    deleted = await ws.delete_file("temp.txt")
    assert deleted is True
    assert not (tmp_path / "temp.txt").exists()


@pytest.mark.asyncio
async def test_workspace_delete_nonexistent(tmp_path):
    ws = VirtualWorkspace.__new__(VirtualWorkspace)
    ws._tenant_id = "test"
    ws._root = tmp_path

    deleted = await ws.delete_file("nope.txt")
    assert deleted is False


@pytest.mark.asyncio
async def test_workspace_move_file(tmp_path):
    ws = VirtualWorkspace.__new__(VirtualWorkspace)
    ws._tenant_id = "test"
    ws._root = tmp_path

    await ws.write_file("old.txt", b"move me")
    result = await ws.move_file("old.txt", "archive/old.txt")
    assert result is not None
    assert not (tmp_path / "old.txt").exists()
    assert (tmp_path / "archive" / "old.txt").exists()


@pytest.mark.asyncio
async def test_workspace_search(tmp_path):
    ws = VirtualWorkspace.__new__(VirtualWorkspace)
    ws._tenant_id = "test"
    ws._root = tmp_path

    await ws.write_file("deal_123.txt", b"deal info")
    await ws.write_file("notes/deal_456.md", b"more deals")
    await ws.write_file("other.txt", b"unrelated")

    results = await ws.search_files("deal")
    names = [r.name for r in results]
    assert "deal_123.txt" in names
    assert "deal_456.md" in names
    assert "other.txt" not in names


@pytest.mark.asyncio
async def test_workspace_path_traversal_blocked(tmp_path):
    ws = VirtualWorkspace.__new__(VirtualWorkspace)
    ws._tenant_id = "test"
    ws._root = tmp_path

    with pytest.raises(ValueError, match="traversal"):
        ws._safe_path("../../etc/passwd")


@pytest.mark.asyncio
async def test_workspace_execute_python(tmp_path):
    ws = VirtualWorkspace.__new__(VirtualWorkspace)
    ws._tenant_id = "test"
    ws._root = tmp_path

    result = await ws.execute_python("print(2 + 2)")
    assert result["exit_code"] == 0
    assert "4" in result["stdout"]
    assert not result["timed_out"]


@pytest.mark.asyncio
async def test_workspace_execute_shell(tmp_path):
    ws = VirtualWorkspace.__new__(VirtualWorkspace)
    ws._tenant_id = "test"
    ws._root = tmp_path

    result = await ws.execute_shell("echo hello")
    assert result["exit_code"] == 0
    assert "hello" in result["stdout"]


@pytest.mark.asyncio
async def test_workspace_execute_timeout(tmp_path):
    ws = VirtualWorkspace.__new__(VirtualWorkspace)
    ws._tenant_id = "test"
    ws._root = tmp_path

    result = await ws.execute_python("import time; time.sleep(10)", timeout=1)
    assert result["timed_out"] is True


@pytest.mark.asyncio
async def test_workspace_usage(tmp_path):
    ws = VirtualWorkspace.__new__(VirtualWorkspace)
    ws._tenant_id = "test"
    ws._root = tmp_path

    await ws.write_file("a.txt", b"aaa")
    await ws.write_file("b.txt", b"bbbbb")

    usage = ws.get_usage()
    assert usage["total_files"] == 2
    assert usage["total_size_bytes"] == 8


# ── Google Drive (unit tests without real API) ───────────────────────────────


def test_google_drive_not_configured_by_default():
    from helm.integrations.google_drive import GoogleDriveClient

    client = GoogleDriveClient()
    # No env vars set → not configured
    assert client.is_configured is False
    assert client.is_connected is False


def test_google_drive_auth_url():
    from helm.integrations.google_drive import GoogleDriveClient

    client = GoogleDriveClient()
    client._client_id = "test-client-id"
    client._client_secret = "test-secret"
    client._redirect_uri = "http://localhost/callback"

    url = client.get_auth_url(state="abc123")
    assert "test-client-id" in url
    assert "abc123" in url
    assert "drive.file" in url


@pytest.mark.asyncio
async def test_google_drive_list_returns_empty_when_disconnected():
    from helm.integrations.google_drive import GoogleDriveClient

    client = GoogleDriveClient()
    files = await client.list_files("/")
    assert files == []


@pytest.mark.asyncio
async def test_google_drive_search_returns_empty_when_disconnected():
    from helm.integrations.google_drive import GoogleDriveClient

    client = GoogleDriveClient()
    results = await client.search_files("anything")
    assert results == []


# ── API Routes ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_files_list_endpoint():
    from httpx import ASGITransport, AsyncClient

    from helm.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", headers={"X-API-Key": "test-api-key-for-tests"}) as client:
        resp = await client.get("/api/files?path=/")
        assert resp.status_code == 200
        data = resp.json()
        assert "files" in data
        # Without lifespan, no backends are registered — graceful empty response
        if not data["files"]:
            assert "note" in data or data["files"] == []


@pytest.mark.asyncio
async def test_files_backends_endpoint():
    from httpx import ASGITransport, AsyncClient

    from helm.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", headers={"X-API-Key": "test-api-key-for-tests"}) as client:
        resp = await client.get("/api/files/backends")
        assert resp.status_code == 200
        data = resp.json()
        assert "backends" in data


@pytest.mark.asyncio
async def test_workspace_usage_endpoint():
    from httpx import ASGITransport, AsyncClient

    from helm.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", headers={"X-API-Key": "test-api-key-for-tests"}) as client:
        resp = await client.get("/api/workspace/usage")
        assert resp.status_code == 200
        data = resp.json()
        assert "total_files" in data


@pytest.mark.asyncio
async def test_workspace_execute_endpoint():
    from httpx import ASGITransport, AsyncClient

    from helm.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", headers={"X-API-Key": "test-api-key-for-tests"}) as client:
        resp = await client.post("/api/workspace/execute", json={
            "language": "python",
            "code": "print('hello from helm')",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["exit_code"] == 0
        assert "hello from helm" in data["stdout"]


@pytest.mark.asyncio
async def test_write_and_read_file_endpoint():
    """Test file write/read via the API. Registers workspace backend on the singleton."""
    from httpx import ASGITransport, AsyncClient

    from helm.integrations.file_manager import file_manager
    from helm.integrations.workspace import default_workspace
    from helm.main import app

    # Ensure workspace backend is registered for this test
    if not file_manager.active_backends:
        file_manager.register_backend(default_workspace, default=True)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", headers={"X-API-Key": "test-api-key-for-tests"}) as client:
        # Write a text file through the default workspace backend
        resp = await client.post("/api/files/write", json={
            "path": "test_endpoint_file.txt",
            "content_text": "endpoint test content",
        })
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

        # Read it back
        resp = await client.get("/api/files/read", params={"path": "test_endpoint_file.txt"})
        assert resp.status_code == 200
        data = resp.json()
        assert "content_base64" in data

        # Decode and verify
        import base64
        content = base64.b64decode(data["content_base64"])
        assert content == b"endpoint test content"
