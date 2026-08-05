"""`.github/scripts/commit-and-push-data.sh` (design.md D3, load-bearing
gotcha #5; Threat Matrix "Commit state"/"Push state"). Tasks 5.4, 5.5.

These are real, local `git` operations against throwaway repositories in
`tmp_path` -- never the GitHub API and never a real remote -- so they run
under the same network guard as every other test in this suite (the
script itself never opens a socket).
"""

from __future__ import annotations

import subprocess
from pathlib import Path

SCRIPT = (
    Path(__file__).resolve().parents[2] / ".github" / "scripts" / "commit-and-push-data.sh"
)


def _git(*args: str, cwd: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args], cwd=cwd, capture_output=True, text=True, check=True
    )


def _run_script(cwd: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["bash", str(SCRIPT)], cwd=cwd, capture_output=True, text=True, check=False
    )


def _init_bare_origin_and_clone(tmp_path: Path) -> Path:
    """A bare "origin" plus one clone with an initial commit on `main`,
    including a `data/` directory -- the shape job 1's checkout has.
    """
    origin = tmp_path / "origin.git"
    origin.mkdir()
    _git("init", "--bare", "--initial-branch=main", cwd=origin)

    clone = tmp_path / "clone"
    _git("clone", str(origin), str(clone), cwd=tmp_path)
    _git("config", "user.name", "seed", cwd=clone)
    _git("config", "user.email", "seed@example.com", cwd=clone)
    (clone / "data").mkdir()
    (clone / "data" / "manifest.json").write_text('{"documents": []}\n', encoding="utf-8")
    (clone / "README.md").write_text("seed\n", encoding="utf-8")
    _git("add", ".", cwd=clone)
    _git("commit", "-m", "seed", cwd=clone)
    _git("push", "origin", "HEAD:main", cwd=clone)
    return clone


def test_no_change_sync_commits_nothing_and_exits_zero(tmp_path: Path) -> None:
    """Task 5.4: two consecutive no-change syncs -> zero commits, exit 0."""
    clone = _init_bare_origin_and_clone(tmp_path)
    before = _git("rev-parse", "HEAD", cwd=clone).stdout.strip()

    first = _run_script(clone)
    assert first.returncode == 0
    second = _run_script(clone)
    assert second.returncode == 0

    after = _git("rev-parse", "HEAD", cwd=clone).stdout.strip()
    assert after == before


def test_change_under_data_is_committed_and_pushed(tmp_path: Path) -> None:
    """Sanity companion to 5.4: a real change under `data/` IS committed
    and pushed, and a change OUTSIDE `data/` is never staged (`git add
    data/` only -- never `git commit -a`).
    """
    clone = _init_bare_origin_and_clone(tmp_path)
    (clone / "data" / "manifest.json").write_text(
        '{"documents": [{"doc_id": "1"}]}\n', encoding="utf-8"
    )
    (clone / "README.md").write_text("modified outside data/, must stay unstaged\n", encoding="utf-8")

    result = _run_script(clone)
    assert result.returncode == 0

    status = _git("status", "--porcelain", cwd=clone).stdout
    assert "README.md" in status  # untouched working-tree change, never committed
    log = _git("log", "-1", "--name-only", cwd=clone).stdout
    assert "data/manifest.json" in log
    assert "README.md" not in log


def test_non_fast_forward_push_retries_once_via_rebase_then_fails_loudly(
    tmp_path: Path,
) -> None:
    """Task 5.5: a genuine conflicting concurrent push forces the single
    `git pull --rebase` retry into a real rebase conflict, so the script
    fails loudly (non-zero exit) rather than looping or force-pushing.
    """
    origin = tmp_path / "origin.git"
    origin.mkdir()
    _git("init", "--bare", "--initial-branch=main", cwd=origin)

    seed_clone = tmp_path / "seed"
    _git("clone", str(origin), str(seed_clone), cwd=tmp_path)
    _git("config", "user.name", "seed", cwd=seed_clone)
    _git("config", "user.email", "seed@example.com", cwd=seed_clone)
    (seed_clone / "data").mkdir()
    (seed_clone / "data" / "manifest.json").write_text("line-1\n", encoding="utf-8")
    _git("add", ".", cwd=seed_clone)
    _git("commit", "-m", "seed", cwd=seed_clone)
    _git("push", "origin", "HEAD:main", cwd=seed_clone)

    # Our script's working repo: an independent clone of the same seed commit.
    clone = tmp_path / "clone"
    _git("clone", str(origin), str(clone), cwd=tmp_path)

    # A concurrent push advances `origin/main` past what `clone` has, editing
    # the SAME line -- guarantees the rebase itself conflicts rather than
    # applying cleanly.
    (seed_clone / "data" / "manifest.json").write_text("line-1-changed-by-other-run\n", encoding="utf-8")
    _git("add", ".", cwd=seed_clone)
    _git("commit", "-m", "concurrent run", cwd=seed_clone)
    _git("push", "origin", "HEAD:main", cwd=seed_clone)

    # Our clone changes the SAME line differently, unaware of the concurrent push.
    (clone / "data" / "manifest.json").write_text("line-1-changed-by-us\n", encoding="utf-8")

    result = _run_script(clone)

    assert result.returncode != 0
    # The rebase was attempted (this is what "one retry" means) and its
    # conflict is what ultimately fails the run -- not an infinite retry
    # loop and not a force-push.
    assert "rebase" in (result.stdout + result.stderr).lower()
