import { useEffect, useRef, useState } from 'react';

import { controlPatch, initialControls } from './cycleflow-state';
import type { Controls } from './cycleflow-state';

export function useCycleflow() {
    const [controls, setControls] = useState<Controls>(initialControls);
    const [connection, setConnection] = useState('connecting');
    const socketRef = useRef<WebSocket | null>(null);
    const ready = useRef(false);
    useEffect(() => {
        let stopped = false;
        let retry: ReturnType<typeof setTimeout>;
        let socket: WebSocket;
        const connect = () => {
            setConnection('connecting');
            socket = new WebSocket(
                `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/bus`
            );
            socketRef.current = socket;
            socket.binaryType = 'arraybuffer';
            socket.onmessage = (event) => {
                if (stopped) return;
                try {
                    const message = JSON.parse(
                        typeof event.data === 'string'
                            ? event.data
                            : new TextDecoder().decode(event.data)
                    );
                    if (message?.type === 'hello' && message.state?.controls) {
                        setControls({
                            ...initialControls,
                            ...controlPatch(message.state.controls)
                        });
                        ready.current = true;
                        setConnection('synced');
                    } else if (message?.type === 'cycleflow/state') {
                        setControls((previous) => ({
                            ...previous,
                            ...controlPatch(message.controls)
                        }));
                    }
                } catch {
                    /* Invalid frames cannot change shared controls. */
                }
            };
            socket.onerror = () => socket.close();
            socket.onclose = () => {
                ready.current = false;
                if (stopped) return;
                setConnection('offline');
                retry = setTimeout(connect, 1500);
            };
        };
        connect();
        return () => {
            stopped = true;
            ready.current = false;
            clearTimeout(retry);
            socket.close();
            socketRef.current = null;
        };
    }, []);
    const update = (patch: Partial<Controls>) => {
        const socket = socketRef.current;
        if (!ready.current || socket?.readyState !== WebSocket.OPEN) return;
        // Apply only server-acknowledged state, including the sender, in bus order.
        socket.send(JSON.stringify({ type: 'cycleflow/update', controls: controlPatch(patch) }));
    };
    return { controls, connection, update };
}
