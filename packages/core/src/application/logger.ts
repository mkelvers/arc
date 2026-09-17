import { debuglog } from 'node:util';

type LoggerMethod = (message: string, ...values: unknown[]) => void;
type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogValue = Parameters<LoggerMethod>[1];

export interface Logger {
    debug: LoggerMethod;
    info: LoggerMethod;
    warn: LoggerMethod;
    error: LoggerMethod;
}

const debug = debuglog('arc:playback');
const verbose = process.argv.includes('-v') || process.env.ARC_LOG_LEVEL === 'debug';
const sensitiveKey = /authorization|cookie|password|secret|token|api[-_]?key/i;

function formatLog(level: LogLevel, message: string, values: LogValue[]) {
    try {
        return JSON.stringify(
            {
                timestamp: new Date().toISOString(),
                level,
                pid: process.pid,
                message,
                details: values.length
                    ? values.map((value) =>
                          value instanceof Error
                              ? {
                                    name: value.name,
                                    message: value.message,
                                    stack: value.stack,
                                    cause: value.cause,
                                }
                              : value
                      )
                    : undefined,
            },
            (key, value) => (sensitiveKey.test(key) ? '[Redacted]' : value)
        );
    } catch {
        return JSON.stringify({
            timestamp: new Date().toISOString(),
            level,
            pid: process.pid,
            message,
            details: ['Unable to serialize log details'],
        });
    }
}

function write(level: LogLevel, message: string, ...values: unknown[]) {
    const line = formatLog(level, message, values);
    if (level === 'debug' && !verbose) {
        debug(line);
    } else if (level === 'error' || level === 'warn' || level === 'debug') {
        console.error(line);
    } else {
        console.info(line);
    }
}

export const logger: Logger = {
    debug: (message, ...values) => write('debug', message, ...values),
    info: (message, ...values) => write('info', message, ...values),
    warn: (message, ...values) => write('warn', message, ...values),
    error: (message, ...values) => write('error', message, ...values),
};
