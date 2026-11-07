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
    frame = pd.read_csv(path, dtype="string")
    sc, si = _column(frame, START_TIME), _column(frame, START_ID)
    ec, ei = _column(frame, END_TIME), _column(frame, END_ID)
    journey = _column(frame, ["Number", "Rental Id", "Journey Id"])
    if not sc or not si:
        raise ValueError(f"Missing start timestamp/station columns: {list(frame.columns)}")

    def dates(column):
        values = frame[column].str.strip()
        iso = values.str.match(r"^\d{4}-", na=False)
        result = pd.to_datetime(values.where(iso), format="ISO8601", errors="coerce")
        result.loc[~iso] = pd.to_datetime(
            values.loc[~iso], format="mixed", errors="coerce", dayfirst=True
        )
        return result

    out = pd.DataFrame({"started_at": dates(sc), "start_id": station_keys(frame[si])})
    out["ended_at"] = dates(ec) if ec else pd.NaT
    out["end_id"] = station_keys(frame[ei]) if ei else pd.NA
    out["journey_id"] = frame[journey].str.strip().replace("", pd.NA) if journey else pd.NA
    out.loc[out.ended_at < out.started_at, ["ended_at", "end_id"]] = pd.NA
    return out.dropna(subset=["started_at", "start_id"]).reset_index(drop=True)


def station_keys(values: pd.Series) -> pd.Series:
    """Normalise numeric terminal codes without changing alphanumeric identifiers."""
    return (values.astype("string").str.strip()
            .str.replace(r"^([0-9]+)\.0+$", r"\1", regex=True)
            .str.replace(r"^0+(?=[0-9]+$)", "", regex=True)
            .replace("", pd.NA))


def station_counts(journeys: pd.DataFrame, station_id: str,
                   interval: str = "5min", *, start=None, end=None) -> pd.DataFrame:
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
    if start is None and end is None:
        index = pd.date_range(starts.min().floor(interval), starts.max().ceil(interval),
                              freq=interval)
    else:
        index = pd.date_range(start, end, freq=interval, inclusive="left")
    frame = pd.DataFrame(index=index)
    frame["hires"] = hires.reindex(index, fill_value=0).astype(int)
    frame["returns"] = returns.reindex(index, fill_value=0).astype(int)
    frame.index.name = "timestamp"
    return frame.reset_index()


def fetch_bikepoints(timeout: float = 15.0) -> list[dict]:
    """Fetch live TfL dock metadata; never represented as historical inventory."""
    response = requests.get("https://api.tfl.gov.uk/BikePoint", timeout=timeout)
    response.raise_for_status()
    return bikepoint_metadata(response.json())


def bikepoint_metadata(points: list[dict]) -> list[dict]:
    stations = []
    for p in points:
        props = {str(v.get("key")): v.get("value")
                 for v in p.get("additionalProperties", [])}
        ident = str(p.get("id", "")).split("_")[-1]

        def num(key: str):
            try:
                return int(props.get(key))
            except (ValueError, TypeError):
                return None
        stations.append({"id": ident, "terminal": props.get("TerminalName"),
                         "name": p.get("commonName", ident),
                         "lat": p.get("lat"), "lon": p.get("lon"),
                         "capacity": num("NbDocks"), "bikes": num("NbBikes"),
                         "empty_docks": num("NbEmptyDocks")})
    return stations
