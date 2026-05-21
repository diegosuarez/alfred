from datetime import datetime, UTC, timezone
from typing import Annotated

from pydantic import PlainSerializer


def utcnow() -> datetime:
    return datetime.now(UTC)


def _utc_iso(value: datetime) -> str:
    """Serialize a datetime as UTC ISO 8601 with a `Z` suffix.

    All datetimes in our schema are stored as naive UTC (SQLite drops
    tzinfo on the way in), so a value without tz is treated as UTC.
    Aware values get explicitly converted to UTC first. The Z suffix
    makes the string unambiguous for `new Date()` in the browser, which
    otherwise interprets a tz-less ISO string as local time.
    """
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    else:
        value = value.astimezone(timezone.utc)
    return value.isoformat().replace("+00:00", "Z")


# Drop-in replacement for `datetime` on response/request schemas: parses
# the same shapes Pydantic already accepts but serializes with the Z
# suffix so the SPA can rely on UTC semantics.
UtcDatetime = Annotated[datetime, PlainSerializer(_utc_iso, return_type=str)]
