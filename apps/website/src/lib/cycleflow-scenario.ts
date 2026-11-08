import { forecastFeatures, forecastStations } from './cycleflow-live.ts';
import { WINDOWS } from './realtime/cycleflow-state.ts';
import returnModel from './return-model.json' with { type: 'json' };

export type ScenarioSnapshot = {
    stationId: string;
    origin: string;
    fetchedAt: string | null;
    updatedAt: string | null;
    status: string;
    bikes: number | null;
    emptyDocks: number | null;
    capacity: number | null;
};

export type Shocks = { demandPct: number; supplyBikes: number; returnPct: number };
export const zeroShocks: Shocks = { demandPct: 0, supplyBikes: 0, returnPct: 0 };

export function simulateInventory(
    bikes: number,
    capacity: number,
    hires: number[],
    returns: number[],
    shocks: Shocks
) {
    if (!WINDOWS.some((window) => window / 5 === hires.length) || hires.length !== returns.length)
        throw new Error('Expected matched five-minute flows for a supported window');
    if (
        ![bikes, capacity, ...hires, ...returns].every((x) => Number.isFinite(x) && x >= 0) ||
        bikes > capacity ||
        !Object.values(shocks).every(Number.isFinite) ||
        shocks.demandPct < -100 ||
        shocks.returnPct < -100
    )
        throw new Error('Invalid inventory, flows or shocks');

    const initialBikes = Math.min(capacity, Math.max(0, bikes + shocks.supplyBikes));
    let previous = initialBikes;
    const steps = hires.map((hire, i) => {
        const hireRequests = hire * (1 + shocks.demandPct / 100);
        const returnRequests = returns[i] * (1 + shocks.returnPct / 100);
        const acceptedReturns = Math.min(returnRequests, capacity - previous);
        const available = Math.min(capacity, previous + acceptedReturns);
        const acceptedHires = Math.min(hireRequests, available);
        const step = {
            minute: 5 * (i + 1),
            startBikes: previous,
            hireRequests,
            returnRequests,
            acceptedHires,
            unmetHires: hireRequests - acceptedHires,
            acceptedReturns,
            unmetReturns: returnRequests - acceptedReturns,
            bikes: available - acceptedHires
        };
        previous = step.bikes;
        return step;
    });
    return { initialBikes, appliedSupply: initialBikes - bikes, steps };
}

export function scenarioInputs(snapshot: ScenarioSnapshot, minutes: number) {
    if (snapshot.bikes === null || snapshot.emptyDocks === null || snapshot.capacity === null)
        return null;
    const model = returnModel.stations[snapshot.stationId as keyof typeof returnModel.stations];
    if (!model) return null;
    const hires: number[] = [];
    let previousWindow = 0;
    let previousTotal = 0;
    for (const window of WINDOWS) {
        if (window > minutes) break;
        const station = forecastStations(snapshot.origin, window).find(
            (s) => s.id === snapshot.stationId
        );
        if (!station) return null;
        const steps = (window - previousWindow) / 5;
        const increment = (station.demand - previousTotal) / steps;
        for (let i = 0; i < steps; i++) hires.push(increment);
        previousWindow = window;
        previousTotal = station.demand;
    }
    const returns = hires.map((_, i) => {
        const features = forecastFeatures(new Date(Date.parse(snapshot.origin) + i * 300_000));
        return Math.max(
            0,
            model.weights.reduce((sum, weight, j) => sum + weight * features[j], 0)
        );
    });
    return {
        bikes: snapshot.bikes,
        capacity: snapshot.bikes + snapshot.emptyDocks,
        hires,
        returns
    };
}
