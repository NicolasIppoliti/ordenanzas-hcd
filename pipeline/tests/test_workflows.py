"""`.github/workflows/*.yml` (design.md D3/D6, Threat Matrix "Git repository
selection" and "Secret handling"). Task 5.7.

`actionlint` must be installed (`brew install actionlint`) for this test to
run for real -- it is skipped, not faked, if it is unavailable, because a
fake pass here would defeat the point of the check.
"""

from __future__ import annotations

import re
import shutil
import subprocess
from pathlib import Path

import pytest
import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS_DIR = REPO_ROOT / ".github" / "workflows"
SYNC_WORKFLOW = WORKFLOWS_DIR / "sync-and-deploy.yml"

# `${{ ... }}` interpolated directly into a `run:` block is the injection
# surface actionlint's shellcheck integration and this project's own
# Threat Matrix both flag: a value that can contain attacker-controlled
# text (a title, a branch name, pipeline output) must be passed through
# `env:` instead, never interpolated into the shell string itself.
_INTERPOLATION = re.compile(r"\$\{\{.*?\}\}")


def _workflow_files() -> list[Path]:
    if not WORKFLOWS_DIR.exists():
        return []
    return sorted(WORKFLOWS_DIR.glob("*.yml"))


def test_workflow_files_exist() -> None:
    names = {p.name for p in _workflow_files()}
    assert "sync-and-deploy.yml" in names
    assert "ci.yml" in names


@pytest.mark.skipif(shutil.which("actionlint") is None, reason="actionlint not installed")
def test_actionlint_passes() -> None:
    result = subprocess.run(
        ["actionlint"], cwd=REPO_ROOT, capture_output=True, text=True, check=False
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_no_run_block_interpolates_a_template_expression() -> None:
    """No `run:` block anywhere in any workflow contains a raw `${{ }}`
    expression -- every dynamic value (a secret, a step output, pipeline
    output) must cross into the shell via `env:`, never string
    interpolation, per the Threat Matrix's "Git repository selection" and
    "Secret handling" rows.
    """
    offenders: list[str] = []
    for workflow in _workflow_files():
        text = workflow.read_text(encoding="utf-8")
        in_run_block = False
        run_indent = 0
        for line in text.splitlines():
            stripped = line.strip()
            if not in_run_block:
                match = re.match(r"^(\s*)run:\s*\|?\s*$", line)
                if match and stripped.startswith("run:"):
                    in_run_block = True
                    run_indent = len(match.group(1))
                    continue
                inline = re.match(r"^(\s*)run:\s*(.+)$", line)
                if inline:
                    if _INTERPOLATION.search(inline.group(2)):
                        offenders.append(f"{workflow.name}: {line.strip()}")
                    continue
            else:
                current_indent = len(line) - len(line.lstrip(" "))
                if line.strip() and current_indent <= run_indent:
                    in_run_block = False
                    # fall through: this line starts a new key, not more run: body
                elif _INTERPOLATION.search(line):
                    offenders.append(f"{workflow.name}: {line.strip()}")
                    continue
                else:
                    continue
    assert offenders == [], f"'${{ }}' interpolated inside a run: block: {offenders}"


def test_sync_job_checks_out_enough_history_to_rebase() -> None:
    """The retry path needs real history; `actions/checkout` defaults to depth 1.

    `commit-and-push-data.sh` recovers from a non-fast-forward push with one
    `git pull --rebase origin main`. A rebase on a shallow clone is unreliable, and this
    is the path that only runs when something has already gone wrong — the worst place
    to discover the clone was too shallow to recover.
    """
    workflow = yaml.safe_load(SYNC_WORKFLOW.read_text(encoding="utf-8"))
    checkout = next(
        step
        for step in workflow["jobs"]["sync"]["steps"]
        if str(step.get("uses", "")).startswith("actions/checkout")
    )
    assert checkout.get("with", {}).get("fetch-depth") == 0, (
        "job 'sync' must check out full history so the rebase retry can succeed"
    )


def test_deploy_job_checks_out_the_post_sync_commit() -> None:
    """Regression for design.md D3's second load-bearing gotcha.

    `github.sha` is pinned at run creation and does not advance when job 1 pushes, so an
    implicit checkout force-sets origin/main to the PRE-sync commit and the deploy ships
    last week's data forever, silently.
    """
    workflow = yaml.safe_load(SYNC_WORKFLOW.read_text(encoding="utf-8"))
    checkout = next(
        step
        for step in workflow["jobs"]["build-deploy"]["steps"]
        if str(step.get("uses", "")).startswith("actions/checkout")
    )
    assert checkout.get("with", {}).get("ref") == "main"


def test_workflows_pin_their_toolchain() -> None:
    """`version: latest` is not reproducible, and it already broke CI.

    `pnpm/action-setup` with `latest` resolved pnpm 11.20.0, which requires Node >= 22.13,
    while the workflows pinned Node 20 — so CI failed on a dependency nobody changed. A
    build that can break on a Tuesday because an upstream release happened is not a gate.
    Node must also match what the project is actually developed against.
    """
    for path in _workflow_files():
        workflow = yaml.safe_load(path.read_text(encoding="utf-8"))
        for job in workflow["jobs"].values():
            for step in job.get("steps", []):
                uses = str(step.get("uses", ""))
                with_ = step.get("with", {}) or {}
                if uses.startswith("pnpm/action-setup"):
                    assert with_.get("version") not in (None, "latest"), (
                        f"{path.name}: pin the pnpm version, never 'latest'"
                    )
                if uses.startswith("actions/setup-node"):
                    assert int(str(with_.get("node-version"))) >= 22, (
                        f"{path.name}: Node must be >= 22, which current pnpm requires"
                    )
