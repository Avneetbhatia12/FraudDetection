"""
Application date policy (one definition, never the host's local time zone).

"Today" for the application is the calendar date in India Standard Time (IST, UTC+05:30) on the MySQL server clock.
IST has no daylight saving time, so a fixed offset is exact and needs no time-zone database.

* The ML service takes the instant from MySQL (UTC_TIMESTAMP(), read inside the data snapshot as
  AppData.snapshot_taken_at), so the result does not depend on the ML host's clock or time zone.
* Express computes the same date in SQL (DATE(UTC_TIMESTAMP() + INTERVAL 330 MINUTE)) and passes it explicitly.
* Only when no MySQL instant is available (offline tests) is the current UTC instant used; local time is never used.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Optional

APP_UTC_OFFSET = timedelta(hours=5, minutes=30)
APP_UTC_OFFSET_MINUTES = 330
APP_TIME_ZONE_LABEL = "IST (UTC+05:30)"


def app_date(utc_instant: Optional[datetime] = None) -> date:
    """IST calendar date of a UTC instant (naive values are UTC, as returned by MySQL UTC_TIMESTAMP())."""
    if utc_instant is None:
        utc_instant = datetime.now(timezone.utc)
    if utc_instant.tzinfo is not None:
        utc_instant = utc_instant.astimezone(timezone.utc).replace(tzinfo=None)
    return (utc_instant + APP_UTC_OFFSET).date()
