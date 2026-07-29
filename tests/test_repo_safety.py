import re
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
