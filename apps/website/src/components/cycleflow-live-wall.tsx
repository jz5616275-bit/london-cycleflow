import { ONLINE_MODEL, STALE_MS, forecastStations, inventoryStatus } from '../lib/cycleflow-live';
import { WINDOWS } from '../lib/realtime/cycleflow-state';
import type { Controls } from '../lib/realtime/cycleflow-state';
import { useLiveFeed } from '../lib/use-live-feed';
import { LondonMap } from './cycleflow-map';

const titles = [
    'Live demand atlas',
    'Forecast horizons',
    'BikePoint inventory',
    'Feed freshness',
    'Predicted station demand',
    'Online model evaluation'
];
const london = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short'
});
const displayTime = (value: string | null | undefined) =>
    value ? london.format(new Date(value)) : '—';

export function LiveWall({
    controls,
    c,
    r,
    select
}: {
    controls: Controls;
    c: number;
    r: number;
    select: (id: string) => void;
}) {
    const { feed, failed, now } = useLiveFeed();
    const panel = r * 3 + c;
    const active = ONLINE_MODEL.stations.find((station) => station.id === controls.stationId);
    const scope = active?.name ?? `${ONLINE_MODEL.stations.length} modelled stations`;
    const stationStatus = (id: string) =>
        inventoryStatus(
            feed?.inventory[id],
            feed && { ...feed, failed: feed.failed || failed },
            now
        );
    const forecast = feed ? forecastStations(feed.origin, controls.minutes) : [];
    const forecastStale = Boolean(feed && (failed || now - Date.parse(feed.origin) >= STALE_MS));
    const inventoryRows = active ? [active] : ONLINE_MODEL.stations.slice(0, 6);
    const currentCount = ONLINE_MODEL.stations.filter(
        (s) => stationStatus(s.id) === 'Current'
    ).length;
    const horizons = active?.horizons ?? ONLINE_MODEL.metrics;

    return (
        <main
            className="cf-screen"
            data-panel={panel}
            data-view="live"
            data-horizon={controls.minutes}
        >
            <header className="cf-panel-header">
                <span className="cf-eyebrow">
                    <b>{String(panel + 1).padStart(2, '0')}</b> LIVE FORECAST
                </span>
                <span role="status" className="cf-sync">
                    {failed || feed?.failed
                        ? 'Feed refresh failed'
                        : feed
                          ? 'Refresh every 60 s'
                          : 'Loading'}
                </span>
            </header>
            <div className="cf-title-row">
                <h1>{titles[panel]}</h1>
                <span className="cf-horizon">
                    {controls.minutes}
                    <small>MIN</small>
                </span>
            </div>
            <div className="cf-panel-context">
                <span>{scope}</span>
                <span className="cf-demo-badge">Calendar model · no trip lag</span>
            </div>
            <section className="cf-panel-body">
                {panel === 0 && (
                    <>
                        <LondonMap
                            stations={forecast}
                            selected={controls.stationId}
                            onSelect={select}
                        />
                        <p className="cf-footnote">
                            Marker size represents predicted hires · {displayTime(feed?.origin)}
                            {forecastStale ? ' · forecast refresh overdue' : ''}
                        </p>
                    </>
                )}
                {panel === 1 && (
                    <>
                        <table className="cf-horizon-table">
                            <thead>
                                <tr>
                                    <th>Window</th>
                                    <th>Predicted hires</th>
                                    <th>Window ends</th>
                                </tr>
                            </thead>
                            <tbody>
                                {WINDOWS.map((minutes) => {
                                    const origin = feed?.origin;
                                    const demand = origin
                                        ? forecastStations(origin, minutes)
                                              .filter((s) => !active || s.id === active.id)
                                              .reduce((sum, s) => sum + s.demand, 0)
                                        : null;
                                    return (
                                        <tr
                                            key={minutes}
                                            className={
                                                minutes === controls.minutes ? 'is-active' : ''
                                            }
                                        >
                                            <td>{minutes} min</td>
                                            <td>{demand?.toFixed(1) ?? '—'}</td>
                                            <td>
                                                {origin
                                                    ? displayTime(
                                                          new Date(
                                                              Date.parse(origin) + minutes * 60_000
                                                          ).toISOString()
                                                      )
                                                    : '—'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        <p className="cf-footnote">
                            Forecast origin {displayTime(feed?.origin)}
                            {forecastStale ? ' · forecast refresh overdue' : ''} · estimated
                            successful hires
                        </p>
                    </>
                )}
                {panel === 2 && (
                    <>
                        <table className="cf-horizon-table">
                            <thead>
                                <tr>
                                    <th>TfL station</th>
                                    <th>Bikes</th>
                                    <th>Empty</th>
                                    <th>Capacity</th>
                                    <th>Feed status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {inventoryRows.map((station) => {
                                    const point = feed?.inventory[station.id];
                                    return (
                                        <tr key={station.id}>
                                            <td>
                                                <button onClick={() => select(station.id)}>
                                                    {station.name}
                                                </button>
                                            </td>
                                            <td>{point?.bikes ?? '—'}</td>
                                            <td>{point?.emptyDocks ?? '—'}</td>
                                            <td>{point?.capacity ?? '—'}</td>
                                            <td>{stationStatus(station.id)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        <p className="cf-footnote">
                            {active
                                ? `BikePoint updated ${displayTime(feed?.inventory[active.id]?.updatedAt)}`
                                : 'First six modelled stations. Select a station for its source timestamp.'}{' '}
                            · inventory snapshot
                        </p>
                    </>
                )}
                {panel === 3 && (
                    <>
                        <table className="cf-horizon-table">
                            <thead>
                                <tr>
                                    <th>Station</th>
                                    <th>TfL field timestamp</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {inventoryRows.map((station) => (
                                    <tr key={station.id}>
                                        <td>{station.name}</td>
                                        <td>
                                            {displayTime(feed?.inventory[station.id]?.updatedAt)}
                                        </td>
                                        <td>{stationStatus(station.id)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <p className="cf-footnote">
                            {currentCount}/{ONLINE_MODEL.stations.length} current · fetched{' '}
                            {displayTime(feed?.fetchedAt)}
                            {' · '}stale after 5 min or a failed refresh · time uses oldest
                            inventory field
                        </p>
                    </>
                )}
                {panel === 4 && (
                    <>
                        <table className="cf-horizon-table">
                            <thead>
                                <tr>
                                    <th>Station</th>
                                    <th>Predicted hires</th>
                                    <th>Inventory status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[...forecast]
                                    .sort((a, b) => b.demand - a.demand)
                                    .slice(0, 6)
                                    .map((s) => (
                                        <tr key={s.id}>
                                            <td>
                                                <button onClick={() => select(s.id)}>
                                                    {s.name}
                                                </button>
                                            </td>
                                            <td>{s.demand.toFixed(1)}</td>
                                            <td>{stationStatus(s.id)}</td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                        <p className="cf-footnote">
                            Forecast only · {displayTime(feed?.origin)}
                            {forecastStale ? ' · forecast refresh overdue' : ''} · no inventory
                            adjustment
                        </p>
                    </>
                )}
                {panel === 5 && (
                    <>
                        <table className="cf-horizon-table">
                            <thead>
                                <tr>
                                    <th>Window</th>
                                    <th>Test origins</th>
                                    <th>MAE</th>
                                    <th>RMSE</th>
                                </tr>
                            </thead>
                            <tbody>
                                {WINDOWS.map((minutes) => {
                                    const row = horizons[String(minutes) as keyof typeof horizons];
                                    return (
                                        <tr
                                            key={minutes}
                                            className={
                                                minutes === controls.minutes ? 'is-active' : ''
                                            }
                                        >
                                            <td>{minutes} min</td>
                                            <td>{row.count.toLocaleString('en-GB')}</td>
                                            <td>{row.constrained.mae.toFixed(2)}</td>
                                            <td>{row.constrained.rmse.toFixed(2)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        <p className="cf-footnote">
                            Feb, Apr and May 2026 chronological holdouts · nonnegative, cumulative
                            calendar forecasts · errors are historical · no live actual hire labels
                        </p>
                    </>
                )}
            </section>
            <footer className="cf-panel-footer">
                <span>Inventory provided by Transport for London</span>
                <span>
                    c{c} / r{r} · IMPERIAL DATA OBSERVATORY
                </span>
            </footer>
        </main>
    );
}
