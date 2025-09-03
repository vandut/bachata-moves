

import { isDev } from '../../config';

const DEV_MODE = isDev();

class AppLogger {
    private prefix: string;

    constructor(prefix: string) {
        this.prefix = `[${prefix}]`;
    }

    info = (...args: any[]) => {
        if (DEV_MODE) {
            console.info(`%c${this.prefix}`, 'color: #007bff; font-weight: bold;', ...args);
        }
    };

    warn = (...args: any[]) => {
        if (DEV_MODE) {
            console.warn(`%c${this.prefix} WARN:`, 'color: #ffc107; font-weight: bold;', ...args);
        }
    };

    error = (...args: any[]) => {
        // Keep error logging for all environments, but style it in dev.
        if (DEV_MODE) {
            console.error(`%c${this.prefix} ERROR:`, 'color: #dc3545; font-weight: bold;', ...args);
        } else {
            console.error(this.prefix, ...args);
        }
    };
}

export const createLogger = (prefix: string): AppLogger => {
    return new AppLogger(prefix);
};