let draining = false;
export const runtimeIsDraining = () => draining;
export function beginRuntimeDrain() { draining = true; }
