
export const msToSecondsString = (ms: number): string => {
    if (isNaN(ms) || ms < 0) return '0.00';
    return (ms / 1000).toFixed(2);
};

export const secondsStringToMs = (s: string): number => {
    const parsed = parseFloat(s);
    if (isNaN(parsed)) return 0;
    return Math.round(parsed * 1000);
};
