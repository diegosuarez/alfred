# Alfred CLI

Terminal client for the Alfred API. Lists contexts / boards / tasks and
adds new tasks without leaving the shell.

## Quick start

```bash
cd cli
uv sync
uv run alfred --help
```

For day-to-day use, install as a tool so `alfred` is on your PATH:

```bash
cd cli
uv tool install .
alfred --help
```

## Setup

1. Mint a Personal Access Token in the web UI (`Perfil → Tokens API`).
2. Configure the client:

```bash
alfred config set-api-url https://your-alfred-host
alfred config set-token alfred_pat_...
alfred set-default context Trabajo
alfred set-default board "Mi tablero"
```

Configuration is stored in `cli/config.toml` next to the source (override
with `ALFRED_CLI_CONFIG=/path/to/config.toml`).

## Common commands

```bash
alfred context list                       # list contexts
alfred board list                         # boards inside the default context
alfred task list                          # tasks on the default board
alfred task add "Comprar pan"             # quick add
alfred task add "Tarea con detalles" \
  --description "**Markdown** soportado" \
  --priority high --due 2026-06-01 --column "En Proceso"
```

## Shell completions

```bash
alfred add-completions          # autodetects $SHELL
alfred add-completions --shell fish
```

Bash / zsh: appends an `eval` snippet to `~/.bashrc` / `~/.zshrc`.
Fish: writes `~/.config/fish/completions/alfred.fish`.

## Discoverability

Every command and subcommand carries `--help`, so an AI agent can map
the whole surface by recursively running `alfred <path> --help`:

```bash
alfred --help
alfred task --help
alfred task add --help
alfred set-default --help
```
