import {
    ArrowsClockwiseIcon,
    ArrowSquareOutIcon,
    MoonIcon,
    PlugsConnectedIcon,
    PlugsIcon,
    SunIcon
} from '@phosphor-icons/react';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useTheme } from '../lib/theme-provider';

type WallScreen = {
    // Logical wall coordinates.
    c: number;
    r: number;
    id: string;
};

export const Route = createFileRoute('/')({
    component: HomePage
});

function HomePage() {
    const { theme, setTheme } = useTheme();
    const isDark = theme === 'dark';

    const wallScreens = useMemo<WallScreen[]>(() => {
        // Build a 3x2 wall coordinate system.
        // These coordinates map directly to `/screen?c=<col>&r=<row>`.
        return Array.from({ length: 6 }, (_, index) => {
            const c = index % 3;
            const r = Math.floor(index / 3);
            return { c, r, id: `${r}-${c}` };
        });
    }, []);

    const [disconnectedById, setDisconnectedById] = useState<Record<string, boolean>>({});
    const [refreshNonceById, setRefreshNonceById] = useState<Record<string, number>>({});
    const [disconnectedControlById, setDisconnectedControlById] = useState<Record<string, boolean>>(
        {}
    );
    const [refreshControlNonceById, setRefreshControlNonceById] = useState<Record<string, number>>(
        {}
    );
    const [operatorHeights, setOperatorHeights] = useState<Record<string, number>>({});
    useEffect(() => {
        const resize = (event: MessageEvent) => {
            if (
                event.origin !== window.location.origin ||
                event.data?.type !== 'cycleflow/operator-size'
            )
                return;
            const height = event.data.height;
            if (
                typeof height !== 'number' ||
                !Number.isFinite(height) ||
                height < 100 ||
                height > 2000
            )
                return;
            // Match the actual iframe window; unrelated same-origin messages cannot resize panels.
            const frame = Array.from(
                document.querySelectorAll<HTMLIFrameElement>('iframe[data-operator-id]')
            ).find((node) => node.contentWindow === event.source);
            const id = frame?.dataset.operatorId;
            if (id)
                setOperatorHeights((previous) =>
                    previous[id] === height ? previous : { ...previous, [id]: height }
                );
        };
        window.addEventListener('message', resize);
        return () => window.removeEventListener('message', resize);
    }, []);

    const controlPanels = [
        // Distinct operator identities simulate simultaneous collaboration.
        { id: 'a', label: 'Tablet #1', src: '/control?operator=A' },
        { id: 'b', label: 'Tablet #2', src: '/control?operator=B' }
    ];

    const toggleDisconnect = (id: string) => {
        setDisconnectedById((prev) => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    const refreshFrame = (id: string) => {
        setRefreshNonceById((prev) => ({
            ...prev,
            [id]: (prev[id] ?? 0) + 1
        }));
    };

    const buildScreenSrc = (screen: WallScreen) => {
        const nonce = refreshNonceById[screen.id] ?? 0;
        const disconnected = disconnectedById[screen.id] ?? false;

        return disconnected ? `/noop?v=${nonce}` : `/screen?c=${screen.c}&r=${screen.r}&v=${nonce}`;
    };

    const toggleControlDisconnect = (id: string) => {
        setDisconnectedControlById((prev) => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    const refreshControlFrame = (id: string) => {
        setRefreshControlNonceById((prev) => ({
            ...prev,
            [id]: (prev[id] ?? 0) + 1
        }));
    };

    const buildControlSrc = (panel: (typeof controlPanels)[number]) => {
        const nonce = refreshControlNonceById[panel.id] ?? 0;
        const disconnected = disconnectedControlById[panel.id] ?? false;
        // Nonce query param forces iframe reload when "refresh" is pressed.
        return disconnected ? `/noop?v=${nonce}` : `${panel.src}&v=${nonce}`;
    };

    return (
        <main className="cf-playground">
            <section className="cf-home-header">
                <h1 className="text-lg font-semibold tracking-tight md:text-xl">
                    London CycleFlow
                </h1>
                <button
                    type="button"
                    onClick={() => setTheme(isDark ? 'light' : 'dark')}
                    aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
                    title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
                    className="rounded-md border border-[var(--border)] bg-[var(--card)] p-1.5 text-[var(--card-foreground)]"
                >
                    {isDark ? (
                        <SunIcon size={16} weight="duotone" />
                    ) : (
                        <MoonIcon size={16} weight="duotone" />
                    )}
                </button>
            </section>

            <section className="cf-wall-shell">
                <div className="mb-2 flex items-center justify-between">
                    <h2 className="text-sm font-medium text-[var(--foreground)]">
                        IMPERIAL DATA OBSERVATORY · 2 × 3 WALL · 1920×1080 / NODE
                    </h2>
                    <span className="rounded-full bg-[var(--primary)] px-2 py-1 text-[10px] font-medium text-[var(--primary-foreground)]">
                        TFL HISTORICAL BACKTEST / LIVE FORECAST
                    </span>
                </div>

                <div className="cf-wall-wrapper">
                    <div className="cf-wall-canvas">
                        {/*
                          Simulator wall:
                          - each iframe acts as one physical display node
                          - controls let developers test reconnect/refresh behavior quickly
                          - opening any screen in a new tab simulates standalone deployment
                        */}
                        <div className="grid h-full w-full grid-cols-3 grid-rows-2 gap-0">
                            {wallScreens.map((screen) => (
                                <MiniWallScreen
                                    key={screen.id}
                                    c={screen.c}
                                    r={screen.r}
                                    src={buildScreenSrc(screen)}
                                    disconnected={disconnectedById[screen.id] ?? false}
                                    onToggleDisconnect={() => toggleDisconnect(screen.id)}
                                    onRefresh={() => refreshFrame(screen.id)}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            <section className="cf-operators-shell">
                <div className="mb-2">
                    <h2 className="text-sm font-medium text-[var(--card-foreground)]">
                        Operator Panels
                    </h2>
                    <p className="text-xs text-[var(--muted-foreground)]">
                        One shared session. Change either operator to update every display.
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {controlPanels.map((panel) => (
                        <article
                            key={panel.id}
                            className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--muted)]"
                        >
                            <div className="flex items-center justify-between border-b border-[var(--border)] px-2 py-2 text-[11px] font-medium text-[var(--muted-foreground)]">
                                <span>{panel.label}</span>
                                <div className="flex gap-1">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            window.open(
                                                buildControlSrc(panel),
                                                '_blank',
                                                'noopener,noreferrer'
                                            )
                                        }
                                        className="cursor-pointer rounded-md border border-[var(--border)] bg-[var(--card)] p-1 text-[var(--card-foreground)]"
                                        aria-label="Open control in new tab"
                                        title="Open control in new tab"
                                    >
                                        <ArrowSquareOutIcon size={12} weight="duotone" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => toggleControlDisconnect(panel.id)}
                                        className="cursor-pointer rounded-md border border-[var(--border)] bg-[var(--card)] p-1 text-[var(--card-foreground)]"
                                        aria-label={
                                            disconnectedControlById[panel.id]
                                                ? 'Reconnect control'
                                                : 'Disconnect control'
                                        }
                                        title={
                                            disconnectedControlById[panel.id]
                                                ? 'Reconnect control'
                                                : 'Disconnect control'
                                        }
                                    >
                                        {disconnectedControlById[panel.id] ? (
                                            <PlugsConnectedIcon size={12} weight="duotone" />
                                        ) : (
                                            <PlugsIcon size={12} weight="duotone" />
                                        )}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => refreshControlFrame(panel.id)}
                                        className="cursor-pointer rounded-md border border-[var(--border)] bg-[var(--card)] p-1 text-[var(--card-foreground)]"
                                        aria-label="Refresh control iframe"
                                        title="Refresh control iframe"
                                    >
                                        <ArrowsClockwiseIcon size={12} weight="duotone" />
                                    </button>
                                </div>
                            </div>
                            <div
                                className="cf-operator-frame"
                                style={{ height: operatorHeights[panel.id] ?? 360 }}
                            >
                                <iframe
                                    data-operator-id={panel.id}
                                    src={buildControlSrc(panel)}
                                    title={panel.label}
                                    scrolling="no"
                                    className="h-full w-full border-0"
                                />
                            </div>
                        </article>
                    ))}
                </div>
            </section>
        </main>
    );
}

type MiniWallScreenProps = {
    c: number;
    r: number;
    src: string;
    disconnected: boolean;
    onToggleDisconnect: () => void;
    onRefresh: () => void;
};

function MiniWallScreen({
    c,
    r,
    src,
    disconnected,
    onToggleDisconnect,
    onRefresh
}: MiniWallScreenProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [scale, setScale] = useState(0);

    useEffect(() => {
        const node = containerRef.current;
        if (!node) return;

        const updateScale = () => {
            // Render the screen at native 1920x1080 and scale via CSS transform.
            // This preserves the same viewport math as production displays while still fitting
            // in the simulator grid.
            setScale(node.clientWidth / 1920);
        };

        updateScale();

        const observer = new ResizeObserver(updateScale);
        observer.observe(node);

        return () => observer.disconnect();
    }, []);

    return (
        <div
            ref={containerRef}
            className="group relative h-full w-full overflow-hidden border border-black"
        >
            <iframe
                src={src}
                title={`Wall screen c${c} r${r}`}
                scrolling="no"
                className="h-[1080px] w-[1920px] origin-top-left"
                style={{ transform: `scale(${scale})` }}
            />

            <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                    type="button"
                    onClick={() => window.open(src, '_blank', 'noopener,noreferrer')}
                    className="cursor-pointer rounded-md border border-[var(--border)] bg-[var(--card)] p-1 text-[var(--card-foreground)]"
                    aria-label="Open screen in new tab"
                    title="Open screen in new tab"
                >
                    <ArrowSquareOutIcon size={14} weight="duotone" />
                </button>
                <button
                    type="button"
                    onClick={onToggleDisconnect}
                    className="cursor-pointer rounded-md border border-[var(--border)] bg-[var(--card)] p-1 text-[var(--card-foreground)]"
                    aria-label={disconnected ? 'Reconnect screen' : 'Disconnect screen'}
                    title={disconnected ? 'Reconnect screen' : 'Disconnect screen'}
                >
                    {disconnected ? (
                        <PlugsConnectedIcon size={14} weight="duotone" />
                    ) : (
                        <PlugsIcon size={14} weight="duotone" />
                    )}
                </button>
                <button
                    type="button"
                    onClick={onRefresh}
                    className="cursor-pointer rounded-md border border-[var(--border)] bg-[var(--card)] p-1 text-[var(--card-foreground)]"
                    aria-label="Refresh screen iframe"
                    title="Refresh screen iframe"
                >
                    <ArrowsClockwiseIcon size={14} weight="duotone" />
                </button>
            </div>
        </div>
    );
}
