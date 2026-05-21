"""Alfred CLI entry point.

The whole command tree is defined in this module so every subcommand
discoverable via `alfred --help` is in one place. Each command's
docstring becomes its help text; an AI agent can walk the tree by
running `alfred <cmd> --help` recursively.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any, Optional

import questionary
import typer

from .client import AlfredClient
from .config import Config

# Top-level app. Calling `alfred` with no args prints help so users land
# in a discoverable state.
app = typer.Typer(
    name="alfred",
    no_args_is_help=True,
    help=(
        "Alfred — command-line client for the Alfred task manager.\n\n"
        "Use this tool to list contexts/boards/tasks and add new tasks "
        "from the terminal. Authentication uses a Personal Access Token "
        "minted in the web UI (Perfil → Tokens API). Configuration "
        "lives in cli/config.toml next to this tool's source."
    ),
    rich_markup_mode=None,
)

task_app = typer.Typer(
    no_args_is_help=True,
    help="Create and inspect tasks.",
)
board_app = typer.Typer(
    no_args_is_help=True,
    help="Inspect boards within the current context.",
)
context_app = typer.Typer(
    no_args_is_help=True,
    help="Inspect contexts (top-level workspaces).",
)
set_default_app = typer.Typer(
    no_args_is_help=True,
    help=(
        "Pick the default context / board used when commands omit "
        "--context or --board flags."
    ),
)
config_app = typer.Typer(
    no_args_is_help=True,
    help="Inspect and edit the CLI configuration (cli/config.toml).",
)

app.add_typer(task_app, name="task")
app.add_typer(board_app, name="board")
app.add_typer(context_app, name="context")
app.add_typer(set_default_app, name="set-default")
app.add_typer(config_app, name="config")


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------


def _client(cfg: Config) -> AlfredClient:
    try:
        return AlfredClient(cfg)
    except RuntimeError as exc:
        typer.echo(str(exc), err=True)
        raise typer.Exit(code=1)


def _prompt_pick(rows: list[dict], kind: str) -> dict:
    """Show an arrow-key menu of `rows` (each with id/name) and return
    the picked row. Aborts cleanly on Ctrl-C."""
    if not rows:
        typer.echo(f"No {kind}s available.", err=True)
        raise typer.Exit(code=1)
    if len(rows) == 1:
        # Skip the prompt entirely when there's nothing to choose.
        return rows[0]
    choices = [
        questionary.Choice(title=f"{r['name']}  (#{r['id']})", value=r)
        for r in rows
    ]
    pick = questionary.select(f"Pick a {kind}:", choices=choices).ask()
    if pick is None:
        # Ctrl-C / ESC — bail out with the conventional signal code.
        raise typer.Exit(code=130)
    return pick


def _resolve_context_id(
    client: AlfredClient,
    cfg: Config,
    override: Optional[int],
) -> int:
    """Pick the context to act on. Order: explicit override > config default
    > interactive picker. The picker auto-resolves when only one context
    exists, so single-context users never see it."""
    if override is not None:
        return override
    if cfg.default_context_id is not None:
        return cfg.default_context_id
    return _prompt_pick(client.list_contexts(), "context")["id"]


def _resolve_board_id(
    client: AlfredClient,
    cfg: Config,
    override: Optional[int],
    context_id: Optional[int] = None,
) -> int:
    """Same as _resolve_context_id but for boards. The picker needs to
    know which context to scope by, so it falls back through
    context_id arg > config default > interactive context picker."""
    if override is not None:
        return override
    if cfg.default_board_id is not None:
        return cfg.default_board_id
    if context_id is None:
        context_id = cfg.default_context_id
    if context_id is None:
        context_id = _prompt_pick(client.list_contexts(), "context")["id"]
    return _prompt_pick(client.list_boards(context_id), "board")["id"]


def _read_json_input(
    inline: Optional[str], file: Optional[Path]
) -> dict[str, Any]:
    """Resolve a JSON payload from one of: --json STRING, --json-file PATH,
    --json-file - (stdin), or piped stdin when neither flag is set.

    Returns the parsed object (always a dict — the API endpoints expect
    object bodies). Aborts with a friendly message on parse failure."""
    if inline is not None and file is not None:
        typer.echo(
            "Pass exactly one of --json / --json-file (not both).", err=True
        )
        raise typer.Exit(code=2)
    if inline is not None:
        text = inline
    elif file is not None:
        text = sys.stdin.read() if str(file) == "-" else Path(file).read_text("utf-8")
    elif not sys.stdin.isatty():
        text = sys.stdin.read()
    else:
        typer.echo(
            "No JSON provided. Use --json '{...}', --json-file PATH, or "
            "pipe a payload via stdin.",
            err=True,
        )
        raise typer.Exit(code=2)
    try:
        payload = json.loads(text)
    except json.JSONDecodeError as exc:
        typer.echo(f"Invalid JSON: {exc}", err=True)
        raise typer.Exit(code=2)
    if not isinstance(payload, dict):
        typer.echo(
            f"JSON payload must be an object, got {type(payload).__name__}.",
            err=True,
        )
        raise typer.Exit(code=2)
    return payload


def _match_by_id_or_name(rows: list[dict], needle: str, kind: str) -> dict:
    """Resolve a CLI-style argument that's either a numeric id or a name
    (case-insensitive substring match). Errors out on ambiguity."""
    if needle.isdigit():
        wanted = int(needle)
        for r in rows:
            if r["id"] == wanted:
                return r
        typer.echo(f"No {kind} found with id {wanted}.", err=True)
        raise typer.Exit(code=1)

    lowered = needle.lower()
    matches = [r for r in rows if lowered in r["name"].lower()]
    if not matches:
        typer.echo(
            f"No {kind} found matching '{needle}'. Existing names: "
            f"{', '.join(r['name'] for r in rows)}",
            err=True,
        )
        raise typer.Exit(code=1)
    if len(matches) > 1:
        typer.echo(
            f"Ambiguous {kind} '{needle}'. Matches: "
            f"{', '.join(r['name'] for r in matches)}",
            err=True,
        )
        raise typer.Exit(code=1)
    return matches[0]


# --------------------------------------------------------------------------
# `alfred task ...`
# --------------------------------------------------------------------------


@task_app.command("add")
def task_add(
    title: str = typer.Argument(..., help="Title for the new task."),
    description: Optional[str] = typer.Option(
        None, "--description", "-d", help="Markdown description."
    ),
    priority: Optional[str] = typer.Option(
        None,
        "--priority",
        "-p",
        help="One of: low, medium, high (default: medium).",
    ),
    due: Optional[str] = typer.Option(
        None,
        "--due",
        help="Due date (YYYY-MM-DD or full ISO 8601 timestamp).",
    ),
    board: Optional[int] = typer.Option(
        None,
        "--board",
        help="Board id (falls back to default_board_id in config).",
    ),
    column: Optional[str] = typer.Option(
        None,
        "--column",
        help=(
            "Column name or id. Default: the first column of the board, "
            "which is typically 'Pendiente'."
        ),
    ),
) -> None:
    """Create a new task in the chosen board / column."""
    cfg = Config.load()
    with _client(cfg) as cli:
        board_id = _resolve_board_id(cli, cfg, board)
        detail = cli.get_board(board_id)
        cols = detail.get("columns") or []
        if not cols:
            typer.echo(f"Board {board_id} has no columns.", err=True)
            raise typer.Exit(code=1)
        if column is None:
            target = cols[0]
        elif column.isdigit():
            wanted = int(column)
            target = next((c for c in cols if c["id"] == wanted), None)
            if not target:
                typer.echo(f"No column with id {wanted} in board.", err=True)
                raise typer.Exit(code=1)
        else:
            lowered = column.lower()
            matches = [c for c in cols if lowered in c["name"].lower()]
            if len(matches) != 1:
                names = ", ".join(c["name"] for c in cols)
                typer.echo(
                    f"Column '{column}' not unique or not found. "
                    f"Available: {names}",
                    err=True,
                )
                raise typer.Exit(code=1)
            target = matches[0]
        task = cli.create_task(
            target["id"],
            title=title,
            description=description,
            priority=priority,
            due_date=due,
        )
        typer.echo(
            f"Created task #{task['id']} '{task['title']}' in column "
            f"'{target['name']}'."
        )


@task_app.command(
    "edit",
    help=(
        "Edit an existing task by sending a JSON patch.\n\n"
        "Pass the JSON via --json '{...}', --json-file PATH, or pipe it on "
        "stdin. Every field is optional; omitted fields stay untouched.\n\n"
        "\b\n"
        "Accepted JSON keys (PUT /api/tasks/{id}):\n"
        "  title:          string\n"
        "  description:    string (Markdown rendered in the UI)\n"
        '  priority:       "low" | "medium" | "high"\n'
        "  due_date:       ISO 8601 timestamp, or null to clear\n"
        "  position:       int   (reorder within the column)\n"
        "  column_id:      int   (move to a different column)\n"
        "  completed:      bool\n"
        "  archived:       bool  (true archives, false restores)\n"
        "  parent_task_id: int   (0 detaches from parent)\n"
        "  tag_ids:        [int, ...]      ([] clears all tags)\n"
        "  requester_id:   int   (0 detaches)\n"
        "  assignee_ids:   [int, ...]      ([] clears all assignees)\n\n"
        "\b\n"
        "Examples:\n"
        "  alfred task edit 42 --json '{\"priority\": \"high\"}'\n"
        "  alfred task edit 42 --json '{\"assignee_ids\": [1, 5]}'\n"
        "  echo '{\"completed\": true}' | alfred task edit 42"
    ),
)
def task_edit(
    task_id: int = typer.Argument(..., help="Task id to update."),
    json_str: Optional[str] = typer.Option(
        None, "--json", help="JSON object as an inline string."
    ),
    json_file: Optional[Path] = typer.Option(
        None,
        "--json-file",
        help="Read JSON from a file. Use '-' to read from stdin.",
    ),
) -> None:
    payload = _read_json_input(json_str, json_file)
    cfg = Config.load()
    with _client(cfg) as cli:
        updated = cli.update_task(task_id, payload)
    typer.echo(f"Updated task #{updated['id']} '{updated['title']}'.")


@task_app.command(
    "add-reminder",
    help=(
        "Schedule a Web Push reminder for a task at a given timestamp.\n\n"
        "The timestamp is interpreted as UTC if it carries a 'Z' suffix or "
        "an explicit offset; otherwise it's read as local time and "
        "converted. The backend stores it naive-UTC and the dispatch "
        "loop fires it when the wall clock catches up.\n\n"
        "\b\n"
        "Accepted timestamp formats:\n"
        "  2026-06-01T18:30:00Z          (UTC)\n"
        "  2026-06-01T18:30:00+02:00     (with offset)\n"
        "  2026-06-01T18:30:00           (local time)\n"
        "  2026-06-01 18:30              (local, shorthand)\n"
        "  1780000000                    (Unix epoch seconds)\n"
        "  1780000000000                 (Unix epoch milliseconds)\n\n"
        "\b\n"
        "Examples:\n"
        "  alfred task add-reminder 42 2026-06-01T09:00:00Z\n"
        "  alfred task add-reminder 42 '2026-06-01 09:00'\n"
        "  alfred task add-reminder 42 1780000000"
    ),
)
def task_add_reminder(
    task_id: int = typer.Argument(
        ..., help="Task id to attach the reminder to."
    ),
    when: str = typer.Argument(
        ...,
        metavar="TIMESTAMP",
        help="When to fire the notification (see accepted formats above).",
    ),
) -> None:
    from datetime import datetime, timezone

    raw = when.strip()
    # Unix epoch shortcut: if the argument is purely digits (optionally
    # signed), treat it as seconds, or milliseconds when it's too big to
    # be seconds in any sane range (> ~5138-11-16 in seconds).
    bare = raw.lstrip("-")
    if bare.isdigit():
        n = int(raw)
        if abs(n) > 10**11:
            parsed = datetime.fromtimestamp(n / 1000, tz=timezone.utc)
        else:
            parsed = datetime.fromtimestamp(n, tz=timezone.utc)
    else:
        iso_raw = raw.replace(" ", "T") if "T" not in raw else raw
        # Python's fromisoformat understands 'Z' from 3.11 onward via a
        # small swap to +00:00 — be defensive in case we ever drop back.
        if iso_raw.endswith("Z"):
            iso_raw = iso_raw[:-1] + "+00:00"
        try:
            parsed = datetime.fromisoformat(iso_raw)
        except ValueError as exc:
            typer.echo(f"Could not parse timestamp '{when}': {exc}", err=True)
            raise typer.Exit(code=2)
        if parsed.tzinfo is None:
            # Naive datetime -> assume local zone so the UTC conversion
            # below produces the wall-clock the user typed.
            parsed = parsed.astimezone()
    iso = parsed.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"

    cfg = Config.load()
    with _client(cfg) as cli:
        rem = cli.add_reminder(task_id, iso)
    typer.echo(
        f"Scheduled reminder #{rem['id']} for task #{task_id} at "
        f"{rem['remind_at']}."
    )


@task_app.command("list")
def task_list(
    board: Optional[int] = typer.Option(
        None,
        "--board",
        help="Board id to list (falls back to default_board_id).",
    ),
    column: Optional[str] = typer.Option(
        None,
        "--column",
        help="Restrict the listing to a single column (name or id).",
    ),
    show_done: bool = typer.Option(
        False,
        "--include-done/--no-done",
        help="Include tasks already marked completed (default: no).",
    ),
) -> None:
    """List the tasks on a board, grouped by column."""
    cfg = Config.load()
    with _client(cfg) as cli:
        board_id = _resolve_board_id(cli, cfg, board)
        detail = cli.get_board(board_id)
        cols = detail.get("columns") or []
        typer.echo(f"# Board: {detail['name']} (#{detail['id']})")
        for col in cols:
            if column is not None:
                if column.isdigit():
                    if col["id"] != int(column):
                        continue
                elif column.lower() not in col["name"].lower():
                    continue
            typer.echo(f"\n## {col['name']} (#{col['id']})")
            tasks = col.get("tasks") or []
            visible = tasks if show_done else [t for t in tasks if not t.get("completed")]
            if not visible:
                typer.echo("  (empty)")
                continue
            for t in visible:
                tick = "✓" if t.get("completed") else " "
                prio = (t.get("priority") or "medium")[0].upper()
                due = t.get("due_date") or ""
                line = f"  [{tick}] #{t['id']} [{prio}] {t['title']}"
                if due:
                    line += f"  (due {due[:10]})"
                typer.echo(line)


# --------------------------------------------------------------------------
# `alfred board ...`
# --------------------------------------------------------------------------


@board_app.command("list")
def board_list(
    context: Optional[int] = typer.Option(
        None,
        "--context",
        help="Context id to scope by (falls back to default_context_id).",
    ),
) -> None:
    """List boards inside the chosen context."""
    cfg = Config.load()
    with _client(cfg) as cli:
        ctx_id = _resolve_context_id(cli, cfg, context)
        boards = cli.list_boards(ctx_id)
        if not boards:
            typer.echo("(no boards)")
            return
        for b in boards:
            marker = "*" if b["id"] == cfg.default_board_id else " "
            typer.echo(f"{marker} #{b['id']:<4} {b['name']}")


@board_app.command(
    "edit",
    help=(
        "Edit an existing board by sending a JSON patch.\n\n"
        "Pass the JSON via --json '{...}', --json-file PATH, or pipe it on "
        "stdin. Every field is optional; omitted fields stay untouched.\n\n"
        "\b\n"
        "Accepted JSON keys (PUT /api/boards/{id}):\n"
        "  name:        string\n"
        "  description: string\n"
        "  context_id:  int   (move the board to a different context)\n"
        "  icon:        string emoji (max 16 chars), \"\" clears it back to 📁\n\n"
        "\b\n"
        "Examples:\n"
        "  alfred board edit 3 --json '{\"name\": \"Backlog Q2\"}'\n"
        "  alfred board edit 3 --json '{\"icon\": \"🎯\"}'\n"
        "  alfred board edit 3 --json '{\"icon\": \"\"}'   # restore default"
    ),
)
def board_edit(
    board_id: int = typer.Argument(..., help="Board id to update."),
    json_str: Optional[str] = typer.Option(
        None, "--json", help="JSON object as an inline string."
    ),
    json_file: Optional[Path] = typer.Option(
        None,
        "--json-file",
        help="Read JSON from a file. Use '-' to read from stdin.",
    ),
) -> None:
    payload = _read_json_input(json_str, json_file)
    cfg = Config.load()
    with _client(cfg) as cli:
        updated = cli.update_board(board_id, payload)
    typer.echo(f"Updated board #{updated['id']} '{updated['name']}'.")


# --------------------------------------------------------------------------
# `alfred context ...`
# --------------------------------------------------------------------------


@context_app.command(
    "edit",
    help=(
        "Edit an existing context by sending a JSON patch.\n\n"
        "Pass the JSON via --json '{...}', --json-file PATH, or pipe it on "
        "stdin. Every field is optional; omitted fields stay untouched.\n\n"
        "\b\n"
        "Accepted JSON keys (PUT /api/contexts/{id}):\n"
        "  name:              string (1–80 chars)\n"
        "  color:             string (hex like \"#ef4444\", max 16 chars)\n"
        "  google_account_id: int   (0 detaches the Google account)\n\n"
        "\b\n"
        "Examples:\n"
        "  alfred context edit 2 --json '{\"name\": \"Personal\"}'\n"
        "  alfred context edit 2 --json '{\"color\": \"#10b981\"}'\n"
        "  alfred context edit 2 --json '{\"google_account_id\": 0}'"
    ),
)
def context_edit(
    context_id: int = typer.Argument(..., help="Context id to update."),
    json_str: Optional[str] = typer.Option(
        None, "--json", help="JSON object as an inline string."
    ),
    json_file: Optional[Path] = typer.Option(
        None,
        "--json-file",
        help="Read JSON from a file. Use '-' to read from stdin.",
    ),
) -> None:
    payload = _read_json_input(json_str, json_file)
    cfg = Config.load()
    with _client(cfg) as cli:
        updated = cli.update_context(context_id, payload)
    typer.echo(f"Updated context #{updated['id']} '{updated['name']}'.")


@context_app.command("list")
def context_list() -> None:
    """List all the user's contexts."""
    cfg = Config.load()
    with _client(cfg) as cli:
        rows = cli.list_contexts()
        if not rows:
            typer.echo("(no contexts)")
            return
        for r in rows:
            marker = "*" if r["id"] == cfg.default_context_id else " "
            typer.echo(f"{marker} #{r['id']:<4} {r['name']}")


# --------------------------------------------------------------------------
# `alfred set-default ...`
# --------------------------------------------------------------------------


@set_default_app.command("context")
def set_default_context(
    needle: str = typer.Argument(
        ...,
        metavar="ID_OR_NAME",
        help="Context id (e.g. 3) or case-insensitive name substring.",
    ),
) -> None:
    """Pick the default context. Stored in cli/config.toml."""
    cfg = Config.load()
    with _client(cfg) as cli:
        ctx = _match_by_id_or_name(cli.list_contexts(), needle, "context")
    cfg.default_context_id = ctx["id"]
    cfg.save()
    typer.echo(f"Default context set to #{ctx['id']} '{ctx['name']}'.")


@set_default_app.command("board")
def set_default_board(
    needle: str = typer.Argument(
        ...,
        metavar="ID_OR_NAME",
        help="Board id or case-insensitive name substring.",
    ),
    context: Optional[int] = typer.Option(
        None,
        "--context",
        help=(
            "Context to search within. Defaults to the configured "
            "default_context_id."
        ),
    ),
) -> None:
    """Pick the default board. Stored in cli/config.toml."""
    cfg = Config.load()
    with _client(cfg) as cli:
        ctx_id = _resolve_context_id(cli, cfg, context)
        board = _match_by_id_or_name(cli.list_boards(ctx_id), needle, "board")
    cfg.default_board_id = board["id"]
    cfg.save()
    typer.echo(f"Default board set to #{board['id']} '{board['name']}'.")


# --------------------------------------------------------------------------
# `alfred config ...`
# --------------------------------------------------------------------------


@config_app.command("show")
def config_show() -> None:
    """Print the current configuration (token masked)."""
    cfg = Config.load()
    masked = (
        cfg.token[:14] + "…" + cfg.token[-4:]
        if cfg.token and len(cfg.token) > 22
        else cfg.token
    )
    typer.echo(f"config_path        = {cfg.path}")
    typer.echo(f"api_url            = {cfg.api_url}")
    typer.echo(f"token              = {masked or '(unset)'}")
    typer.echo(f"default_context_id = {cfg.default_context_id}")
    typer.echo(f"default_board_id   = {cfg.default_board_id}")


@config_app.command("set-token")
def config_set_token(
    token: str = typer.Argument(
        ..., help="Personal Access Token (alfred_pat_...)."
    ),
) -> None:
    """Persist a PAT so subsequent commands can authenticate."""
    cfg = Config.load()
    cfg.token = token
    cfg.save()
    typer.echo(f"Token saved to {cfg.path}.")


@config_app.command("set-api-url")
def config_set_api_url(
    url: str = typer.Argument(
        ...,
        help="Base URL of the Alfred backend, without the /api suffix.",
    ),
) -> None:
    """Override the API base URL (default http://localhost:30000)."""
    cfg = Config.load()
    cfg.api_url = url.rstrip("/")
    cfg.save()
    typer.echo(f"API URL set to {cfg.api_url}.")


# --------------------------------------------------------------------------
# `alfred add-completions`
# --------------------------------------------------------------------------


def _detect_shell() -> Optional[str]:
    """Best-effort detection. Looks at $SHELL first, then the process tree."""
    env_shell = os.getenv("SHELL", "")
    if env_shell:
        name = Path(env_shell).name
        if name in {"bash", "fish", "zsh"}:
            return name
    return None


# Per-shell completion snippets. Each one wires Typer's runtime
# completion mode (env vars _TYPER_COMPLETE_ARGS + _ALFRED_COMPLETE) into
# the shell's native completion machinery. Bash / zsh get a function +
# `complete` (or compdef) registration; fish gets a single `complete`.
_COMPLETION_SNIPPETS: dict[str, str] = {
    "bash": (
        "# alfred CLI completions\n"
        "_alfred_completion() {\n"
        "    local IFS=$'\\n'\n"
        "    local response\n"
        '    response=$(env COMP_WORDS="${COMP_WORDS[*]}" '
        "COMP_CWORD=$COMP_CWORD _ALFRED_COMPLETE=complete_bash alfred)\n"
        "    for completion in $response; do\n"
        '        IFS="," read -r type value <<< "$completion"\n'
        '        if [[ "$type" == "dir" ]]; then\n'
        "            COMPREPLY=()\n"
        "            compopt -o dirnames\n"
        '        elif [[ "$type" == "file" ]]; then\n'
        "            COMPREPLY=()\n"
        "            compopt -o default\n"
        '        elif [[ "$type" == "plain" ]]; then\n'
        '            COMPREPLY+=("$value")\n'
        "        fi\n"
        "    done\n"
        "    return 0\n"
        "}\n"
        "complete -o nosort -F _alfred_completion alfred\n"
    ),
    "zsh": (
        "# alfred CLI completions\n"
        "#compdef alfred\n"
        "_alfred_completion() {\n"
        '    eval $(env _TYPER_COMPLETE_ARGS="${words[1,$CURRENT]}" '
        "_ALFRED_COMPLETE=complete_zsh alfred)\n"
        "}\n"
        "compdef _alfred_completion alfred\n"
    ),
    "fish": (
        "# alfred CLI completions\n"
        "complete --command alfred --no-files --arguments "
        '"(env _TYPER_COMPLETE_ARGS=(commandline -cp) '
        '_ALFRED_COMPLETE=complete_fish alfred)"\n'
    ),
}


@app.command("add-completions")
def add_completions(
    shell: Optional[str] = typer.Option(
        None,
        "--shell",
        help="bash, fish or zsh. Autodetected from $SHELL when omitted.",
    ),
) -> None:
    """Install shell completions for the current shell.

    Bash / zsh: appends a completion function + registration to the
    user's rc file (idempotent — re-running is a no-op).
    Fish:       writes ~/.config/fish/completions/alfred.fish.
    """
    target_shell = shell or _detect_shell()
    if target_shell not in _COMPLETION_SNIPPETS:
        typer.echo(
            "Could not detect a supported shell. Use --shell bash|fish|zsh.",
            err=True,
        )
        raise typer.Exit(code=1)

    snippet = _COMPLETION_SNIPPETS[target_shell]

    if target_shell == "fish":
        out_dir = Path.home() / ".config" / "fish" / "completions"
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / "alfred.fish"
        out_path.write_text(snippet, encoding="utf-8")
        typer.echo(f"Wrote fish completions to {out_path}.")
        typer.echo("Start a new fish session to activate them.")
        return

    rc = Path.home() / (".bashrc" if target_shell == "bash" else ".zshrc")
    rc.touch(exist_ok=True)
    current = rc.read_text(encoding="utf-8")
    if "_alfred_completion" in current:
        typer.echo(f"Completions already installed in {rc}; nothing to do.")
        return
    with rc.open("a", encoding="utf-8") as fh:
        fh.write("\n" + snippet)
    typer.echo(f"Appended completions to {rc}.")
    typer.echo(f"Run `source {rc}` or open a new shell to activate.")


if __name__ == "__main__":
    app()
