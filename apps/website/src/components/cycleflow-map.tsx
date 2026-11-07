import { Map, Marker } from '@vis.gl/react-maplibre';
import { useState } from 'react';

import type { StationDemand } from '../lib/cycleflow-demo';
import { demandColor, demandRadius } from '../lib/cycleflow-demo';

import 'maplibre-gl/dist/maplibre-gl.css';

const project = (lon: number, lat: number) => [
    ((lon + 0.19) / 0.14) * 1200,
    ((51.541 - lat) / 0.062) * 450
];
const path = (points: number[][]) =>
    points.map(([lon, lat], i) => `${i ? 'L' : 'M'}${project(lon, lat).join(',')}`).join(' ');
const river = [
    [-0.2, 51.485],
    [-0.18, 51.48],
    [-0.16, 51.484],
    [-0.145, 51.486],
    [-0.13, 51.486],
    [-0.124, 51.491],
    [-0.122, 51.498],
    [-0.12, 51.506],
    [-0.113, 51.509],
    [-0.103, 51.51],
    [-0.092, 51.508],
    [-0.078, 51.506],
    [-0.065, 51.505],
    [-0.05, 51.505]
];

// Every tile crops the SAME 5760×2160 virtual wall (normalized to 1200×450); no six independent cameras.
// Geographic SVG fallback is deterministic and keeps the wall usable offline.
export function LondonMap({
    stations,
    selected,
    onSelect,
    panorama
}: {
    stations: Pick<StationDemand, 'id' | 'name' | 'lat' | 'lon' | 'demand'>[];
    selected: string | null;
    onSelect: (id: string) => void;
    panorama?: { c: number; r: number };
}) {
    const [streetReady, setStreetReady] = useState(false);
    const [streetFailed, setStreetFailed] = useState(false);
    const viewBox = panorama ? `${panorama.c * 400} ${panorama.r * 225} 400 225` : '0 0 1200 450';
    return (
        <div
            className={`cf-map ${panorama ? 'cf-map-panorama' : ''}`}
            data-map-view={panorama ? `${panorama.c},${panorama.r}` : 'overview'}
        >
            <svg
                viewBox={viewBox}
                aria-hidden={streetReady && !panorama ? true : undefined}
                preserveAspectRatio="none"
                role="img"
                aria-label="London station demand map; color and radius encode estimated hires"
            >
                <rect width="1200" height="450" fill="#0c1d26" />
                <defs>
                    <pattern id="map-grid" width="50" height="50" patternUnits="userSpaceOnUse">
                        <path d="M50 0H0V50" fill="none" stroke="#28404a" strokeWidth="0.7" />
                    </pattern>
                </defs>
                <rect width="1200" height="450" fill="url(#map-grid)" />
                <path
                    d="M65 252L340 252L340 408L85 408Z M285 35L440 35L440 150L285 150Z"
                    transform="scale(1 0.666667)"
                    fill="#14372f"
                    opacity=".8"
                />
                {[
                    [-0.184, 51.516, -0.08, 51.511],
                    [-0.175, 51.53, -0.15, 51.49],
                    [-0.16, 51.527, -0.07, 51.516],
                    [-0.14, 51.535, -0.14, 51.492],
                    [-0.17, 51.495, -0.08, 51.527],
                    [-0.18, 51.511, -0.1, 51.502]
                ].map((p, i) => (
                    <path
                        key={i}
                        d={path([
                            [p[0], p[1]],
                            [p[2], p[3]]
                        ])}
                        stroke="#39505b"
                        strokeWidth="3"
                    />
                ))}
                <path
                    d={path(river)}
                    stroke="#17475b"
                    strokeWidth="32"
                    strokeLinejoin="round"
                    fill="none"
                />
                <path d={path(river)} stroke="#25627b" strokeWidth="1.5" fill="none" />
                {[
                    [150, 330, 'HYDE PARK'],
                    [300, 95, 'REGENT’S PARK'],
                    [515, 250, 'WEST END'],
                    [900, 230, 'CITY OF LONDON'],
                    [720, 540, 'SOUTHWARK'],
                    [575, 565, 'THAMES']
                ].map(([x, y, label]) => (
                    <text
                        key={label}
                        x={x}
                        y={(Number(y) * 2) / 3}
                        fill="#638591"
                        fontSize="15"
                        letterSpacing="3"
                    >
                        {label}
                    </text>
                ))}
                {stations.map((station) => {
                    const [cx, cy] = project(station.lon, station.lat);
                    const radius = demandRadius(station.demand);
                    return (
                        <g
                            key={station.id}
                            role="button"
                            tabIndex={streetReady && !panorama ? -1 : 0}
                            aria-label={`${station.name}: ${station.demand.toFixed(1)} estimated hires`}
                            onClick={() => onSelect(station.id)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    onSelect(station.id);
                                }
                            }}
                            className="cf-map-point"
                        >
                            <title>{`${station.name} · ${station.demand.toFixed(1)} estimated hires`}</title>
                            <circle
                                cx={cx}
                                cy={cy}
                                r={radius + 5}
                                fill={demandColor(station.demand)}
                                opacity=".09"
                            />
                            <circle
                                data-station={station.id}
                                cx={cx}
                                cy={cy}
                                r={radius}
                                fill={demandColor(station.demand)}
                                fillOpacity=".76"
                                stroke={selected === station.id ? '#fff' : '#0c1d26'}
                                strokeWidth={selected === station.id ? 4 : 2}
                            />
                        </g>
                    );
                })}
                <text x="1120" y="50" fill="#8ca4ae" fontSize="20">
                    N ↑
                </text>
            </svg>
            {!panorama && !streetFailed && (
                <div className="cf-street-map" style={{ opacity: streetReady ? 1 : 0 }}>
                    <Map
                        initialViewState={{
                            bounds: [
                                [-0.19, 51.479],
                                [-0.05, 51.541]
                            ],
                            fitBoundsOptions: { padding: 35 }
                        }}
                        mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
                        onLoad={() => setStreetReady(true)}
                        onError={() => {
                            setStreetFailed(true);
                            setStreetReady(false);
                        }}
                        interactive={false}
                        attributionControl={{ compact: true }}
                    >
                        {stations.map((station) => (
                            <Marker key={station.id} longitude={station.lon} latitude={station.lat}>
                                <button
                                    className="cf-station-marker"
                                    aria-label={`${station.name}: ${station.demand.toFixed(1)} estimated hires`}
                                    title={station.name}
                                    onClick={() => onSelect(station.id)}
                                    style={{
                                        width: demandRadius(station.demand) * 2,
                                        height: demandRadius(station.demand) * 2,
                                        background: demandColor(station.demand),
                                        borderColor: selected === station.id ? 'white' : '#10222b'
                                    }}
                                />
                            </Marker>
                        ))}
                    </Map>
                </div>
            )}
            {!panorama && (
                <span className="cf-map-caption">
                    {streetReady ? 'London · geographic basemap' : 'London · schematic basemap'} ·
                    TfL BikePoint station coordinates
                </span>
            )}
        </div>
    );
}
