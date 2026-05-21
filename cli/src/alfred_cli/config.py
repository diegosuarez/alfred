"""TOML-backed configuration for the CLI.

The config file lives next to the tool's package so a checkout of the
repo carries its own profile. Override the path via ALFRED_CLI_CONFIG.

Fields:
  api_url             Base URL of the Alfred backend (no trailing /api).
  token               Personal Access Token (mint it in the web UI).
  default_context_id  Context used when --context is omitted on a command.
  default_board_id    Board used when --board is omitted on a command.
"""
from __future__ import annotations

import os
import tomllib
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional

import tomli_w


# The tool ships next to its own config file — `cli/config.toml` lives
# at the root of the CLI directory, which is `src/alfred_cli/..` from
# the module's perspective.
def _default_config_path() -> Path:
    env = os.getenv("ALFRED_CLI_CONFIG")
    if env:
        return Path(env).expanduser()
    return Path(__file__).resolve().parent.parent.parent / "config.toml"


@dataclass
class Config:
    api_url: str = "http://localhost:30000"
    token: Optional[str] = None
    default_context_id: Optional[int] = None
    default_board_id: Optional[int] = None
    # Default off: the typical deployment is a private Tailscale host
    # with a self-signed cert that the CLI legitimately can't validate.
    # Flip to true in config.toml if you ever point the CLI at a
    # publicly-trusted endpoint.
    verify_ssl: bool = False

    @property
    def path(self) -> Path:
        return _default_config_path()

    @classmethod
    def load(cls) -> "Config":
        path = _default_config_path()
        if not path.exists():
            return cls()
        try:
            with path.open("rb") as fh:
                data = tomllib.load(fh)
        except tomllib.TOMLDecodeError as exc:
            raise RuntimeError(
                f"Config file at {path} is not valid TOML: {exc}"
            ) from exc
        return cls(
            api_url=data.get("api_url", cls.api_url),
            token=data.get("token"),
            default_context_id=data.get("default_context_id"),
            default_board_id=data.get("default_board_id"),
            verify_ssl=data.get("verify_ssl", cls.verify_ssl),
        )

    def save(self) -> None:
        path = _default_config_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {k: v for k, v in asdict(self).items() if v is not None}
        # Always preserve api_url even if it matches the default — makes
        # the file self-describing for future readers (incl. AI agents).
        payload.setdefault("api_url", self.api_url)
        with path.open("wb") as fh:
            tomli_w.dump(payload, fh)
