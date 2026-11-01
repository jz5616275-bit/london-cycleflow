import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

export const Route = createFileRoute('/control')({ component: ControlPage });

// Lightweight same-origin sync between DO's embedded operator/screen iframes.
// A production deployment can move these messages to the starter WebSocket bus.
function ControlPage() {
    const [minutes, setMinutes] = useState(30);
    const [shock, setShock] = useState(0);
    const [mode, setMode] = useState<'baseline' | 'constrained'>('constrained');
    const publish = (next: { minutes: number; shock: number; mode: string }) => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('cycleflow-controls', JSON.stringify(next));
            const channel = new BroadcastChannel('cycleflow-controls');
            channel.postMessage(next);
            channel.close();
        }
    };
    const update = (next: Partial<{ minutes: number; shock: number; mode: 'baseline' | 'constrained' }>) => {
        const state = { minutes, shock, mode, ...next };
        setMinutes(state.minutes);
        setShock(state.shock);
        setMode(state.mode);
        publish(state);
    };
    const style = { background: '#111c2d', color: '#f8fafc', minHeight: '100vh', padding: '20px', fontFamily: 'system-ui' };
    return <main style={style}>
        <h2 style={{ fontSize: 27, fontWeight: 750 }}>CycleFlow Controls</h2>
        <p style={{ color: '#a1aec1' }}>TfL cycle hire · Data Observatory demo</p>
        <p style={{ marginTop: 18, fontWeight: 650 }}>Forecast window</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {[10, 20, 30, 45, 60].map(n => <button key={n} onClick={() => update({ minutes: n })}
                style={{ padding: '9px 15px', borderRadius: 8, cursor: 'pointer', color: '#fff',
                    background: n === minutes ? '#2563eb' : '#334155' }}>{n} min</button>)}
        </div>
        <p style={{ marginTop: 15, fontWeight: 650 }}>Demand scenario: {shock > 0 ? '+' : ''}{shock}%</p>
        <input aria-label="Demand shock" type="range" min="-50" max="100" step="10" value={shock}
            onChange={e => update({ shock: Number(e.target.value) })} style={{ width: '95%' }}/>
        <p style={{ marginTop: 15, fontWeight: 650 }}>Prediction display</p>
        <div style={{ display: 'flex', gap: 8 }}>
            {(['baseline', 'constrained'] as const).map(v => <button key={v} onClick={() => update({ mode: v })}
                style={{ padding: '9px 15px', borderRadius: 8, cursor: 'pointer', color: '#fff',
                    background: mode === v ? '#2563eb' : '#334155' }}>{v}</button>)}
        </div>
        <p style={{ color: '#94a3b8', marginTop: 18, fontSize: 12 }}>
            Windows represent UI scenario controls. Backtest data are historical one-step results;
            multi-horizon model output is not implied by this selection.
        </p>
    </main>;
}
