"""TfL historical hire CSV adapter and BikePoint live station adapter."""
from __future__ import annotations

import pandas as pd
import requests

# TfL historical CSV schemas have changed across releases; detect names.
START_TIME = ["Start Date", "StartDate", "Start date", "Start time",
              "Start Time", "start_date", "start_time"]
START_ID = ["StartStation Id", "StartStation ID", "Start station number",
            "StartStation Number", "Start Station Id", "start_station_id"]
END_TIME = ["End Date", "EndDate", "End date", "End time",
            "End Time", "end_date", "end_time"]
END_ID = ["EndStation Id", "EndStation ID", "End station number",
          "EndStation Number", "End Station Id", "end_station_id"]


def _column(frame: pd.DataFrame, possibilities: list[str]) -> str | None:
    normal = {str(c).strip().lower().replace("_", "").replace(" ", ""): c
              for c in frame.columns}
    for p in possibilities:
        key = p.strip().lower().replace("_", "").replace(" ", "")
        if key in normal:
            return str(normal[key])
    return None


def load_journeys(path: str) -> pd.DataFrame:
    """Read original TfL cycle-hire CSV and normalise journey event fields.

    Returned start/end events count *observed successful hires/returns*;
    they do not represent latent unmet demand.
    """
    frame = pd.read_csv(path, low_memory=False)
    sc, si = _column(frame, START_TIME), _column(frame, START_ID)
    ec, ei = _column(frame, END_TIME), _column(frame, END_ID)
    if not sc or not si:
        raise ValueError(f"Missing start timestamp/station columns: {list(frame.columns)}")
    out = pd.DataFrame({
        "started_at": pd.to_datetime(frame[sc], errors="coerce", dayfirst=True),
        "start_id": frame[si].astype("string").str.strip(),
    })
    if ec and ei:
        out["ended_at"] = pd.to_datetime(frame[ec], errors="coerce", dayfirst=True)
        out["end_id"] = frame[ei].astype("string").str.strip()
    else:
        out["ended_at"] = pd.NaT
        out["end_id"] = pd.Series(pd.NA, index=out.index, dtype="string")
    return out.dropna(subset=["started_at", "start_id"]).reset_index(drop=True)


def station_counts(journeys: pd.DataFrame, station_id: str,
                   interval: str = "5min") -> pd.DataFrame:
    """Time-bucket observed hires and returns for one station."""
    if interval not in ("5min", "10min", "15min", "30min", "1h"):
        raise ValueError("Unsupported interval")
    starts = journeys.loc[journeys.start_id == str(station_id), "started_at"]
    ends = journeys.loc[journeys.end_id == str(station_id), "ended_at"].dropna()
    if starts.empty:
        raise ValueError(f"No observed hires for station {station_id}")
    hires = starts.dt.floor(interval).value_counts().sort_index()
    returns = ends.dt.floor(interval).value_counts().sort_index()
    # Add zero-observation buckets so models use equal time steps.
    index = pd.date_range(starts.min().floor(interval), starts.max().ceil(interval),
                          freq=interval)
    frame = pd.DataFrame(index=index)
    frame["hires"] = hires.reindex(index, fill_value=0).astype(int)
    frame["returns"] = returns.reindex(index, fill_value=0).astype(int)
    frame.index.name = "timestamp"
    return frame.reset_index()


def fetch_bikepoints(timeout: float = 15.0) -> list[dict]:
    """Fetch live TfL dock metadata; never represented as historical inventory."""
    response = requests.get("https://api.tfl.gov.uk/BikePoint", timeout=timeout)
    response.raise_for_status()
    stations = []
    for p in response.json():
        props = {str(v.get("key")): v.get("value")
                 for v in p.get("additionalProperties", [])}
        ident = str(p.get("id", "")).split("_")[-1]
        def num(key: str):
            try:
                return int(props.get(key))
            except (ValueError, TypeError):
                return None
        stations.append({"id": ident, "name": p.get("commonName", ident),
                         "lat": p.get("lat"), "lon": p.get("lon"),
                         "capacity": num("NbDocks"), "bikes": num("NbBikes"),
                         "empty_docks": num("NbEmptyDocks")})
    return stations
