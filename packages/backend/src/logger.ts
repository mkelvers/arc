import { debuglog } from 'node:util';

type DebugLogger = (message: string, ...values: unknown[]) => void;

export interface Logger {
    debug: DebugLogger;
}

const debug = debuglog('arc:playback');
const verbose = process.argv.some((argument) => argument === '-v' || argument === '--verbose');

export const logger: Logger = {
    debug(message, ...values) {
        if (verbose) {
            console.error(`ARC:PLAYBACK ${process.pid}:`, message, ...values);
        } else {
            debug(message, ...values);
        }
    },
};
