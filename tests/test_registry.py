"""Tests for the integration plugin registry."""

from __future__ import annotations

from helm.integrations.registry import IntegrationRegistry


class FakePlugin:
    def __init__(self, configured: bool):
        self._configured = configured

    @property
    def is_configured(self) -> bool:
        return self._configured


def test_register_active_plugin():
    reg = IntegrationRegistry()
    plugin = FakePlugin(configured=True)
    reg.register("test", plugin, description="A test plugin", category="test")

    assert reg.is_active("test")
    assert reg.get("test") is plugin
    assert "test" in reg.list_active()


def test_register_inactive_plugin():
    reg = IntegrationRegistry()
    plugin = FakePlugin(configured=False)
    reg.register("test", plugin, description="Unconfigured", category="test")

    assert not reg.is_active("test")
    assert reg.get("test") is None
    assert "test" not in reg.list_active()


def test_list_all_includes_inactive():
    reg = IntegrationRegistry()
    reg.register("active", FakePlugin(True), category="a")
    reg.register("inactive", FakePlugin(False), category="b")

    all_plugins = reg.list_all()
    assert len(all_plugins) == 2


def test_list_by_category():
    reg = IntegrationRegistry()
    reg.register("a", FakePlugin(True), category="crm")
    reg.register("b", FakePlugin(True), category="messaging")
    reg.register("c", FakePlugin(True), category="crm")

    crm_plugins = reg.list_by_category("crm")
    assert len(crm_plugins) == 2


def test_get_status_report():
    reg = IntegrationRegistry()
    reg.register("ghl", FakePlugin(True), description="GHL CRM", category="crm")
    reg.register("voice", FakePlugin(False), description="Voice", category="voice")

    report = reg.get_status_report()
    assert report["total_registered"] == 2
    assert report["total_active"] == 1
    assert report["plugins"]["ghl"]["active"] is True
    assert report["plugins"]["voice"]["active"] is False
