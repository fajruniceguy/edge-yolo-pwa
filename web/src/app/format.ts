export const fmtMs = (ms: number) => (ms >= 100 ? `${Math.round(ms)} ms` : `${ms.toFixed(1)} ms`);

export const fmtMB = (bytes: number) => (bytes / 1048576).toFixed(1);
