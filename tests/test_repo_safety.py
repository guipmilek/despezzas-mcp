import re
import struct
from pathlib import Path

from tests.test_catalog import EXPECTED_TOOLS

ROOT = Path(__file__).parents[1]


def test_documented_tool_catalog_matches_runtime_contract():
    documented = set(re.findall(r"^- `(despezzas_[a-z_]+)`$", (ROOT / "llms.txt").read_text(encoding="utf-8"), re.M))
    assert documented == EXPECTED_TOOLS


def test_legacy_node_and_cloudflare_runtime_is_removed():
    for relative in ("package.json", "package-lock.json", "wrangler.jsonc", "tsconfig.json"):
        assert not (ROOT / relative).exists()
    assert not list((ROOT / "src").glob("*.ts"))


def test_env_example_contains_no_assigned_secrets():
    for line in (ROOT / ".env.example").read_text(encoding="utf-8").splitlines():
        if not line or line.startswith("#") or line.startswith("DESPEZZAS_API_BASE_URL="):
            continue
        assert line.endswith("="), line


def test_chatgpt_setup_files_and_icon_contract():
    assert (ROOT / "docs/chatgpt-app-setup.md").is_file()
    icon = ROOT / "assets/despezzas-mcp.png"
    data = icon.read_bytes()
    assert data.startswith(b"\x89PNG\r\n\x1a\n")
    assert len(data) <= 100 * 1024
    width, height = struct.unpack(">II", data[16:24])
    assert (width, height) == (512, 512)


def test_public_docs_require_user_owned_deployments():
    public_docs = [
        ROOT / "README.md",
        ROOT / "README.en.md",
        ROOT / "docs/chatgpt-app-setup.md",
        ROOT / "docs/deployment.md",
        ROOT / "SECURITY.md",
    ]
    combined = "\n".join(path.read_text(encoding="utf-8") for path in public_docs)
    assert "Cada usuário deve fazer fork" in combined
    assert "Every deployment is bound to one account" in combined
    assert "https://seu-servidor.fastmcp.app/mcp" in combined
