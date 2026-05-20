"""Helpers for minting and verifying Personal Access Tokens.

Token layout:  alfred_pat_<random_part>
- random_part is `secrets.token_urlsafe(24)` (~32 chars URL-safe base64)
- the first 8 chars of random_part are the lookup prefix stored in plain
  text on the row so we can index it; the SHA-256 of the FULL token
  (prefix included) is what we verify against.
"""
import hashlib
import secrets

PAT_PREFIX = "alfred_pat_"
_RANDOM_BYTES = 24  # produces ~32 URL-safe chars
_LOOKUP_PREFIX_LEN = 8


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def mint_token() -> tuple[str, str, str]:
    """Generate a new PAT. Returns (full_token, lookup_prefix, token_hash)."""
    random_part = secrets.token_urlsafe(_RANDOM_BYTES)
    full = PAT_PREFIX + random_part
    return full, random_part[:_LOOKUP_PREFIX_LEN], hash_token(full)


def extract_lookup_prefix(token: str) -> str | None:
    """Pull the indexed prefix out of an incoming token, or None if the
    token doesn't look like one of ours."""
    if not token.startswith(PAT_PREFIX):
        return None
    random_part = token[len(PAT_PREFIX):]
    if len(random_part) < _LOOKUP_PREFIX_LEN:
        return None
    return random_part[:_LOOKUP_PREFIX_LEN]
