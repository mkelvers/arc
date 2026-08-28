import { debuglog } from 'node:util';

type DebugLogger = (message: string, ...values: unknown[]) => void;

export interface Logger {
    debug: DebugLogger;
}

const debug = debuglog('arc:playback');
const log: DebugLogger = process.argv.includes('-v') ? console.error : debug;

export const logger: Logger = {
    debug: log,
};
