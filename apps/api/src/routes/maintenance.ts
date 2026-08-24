import { timingSafeEqual } from 'node:crypto';

import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { z } from 'zod';

import {
    enqueueMaintenance,
    getMaintenanceTask,
    MaintenanceRequestSchema,
} from '@arc/backend/internal/anime/scheduler/maintenance';
import { animeSchedulerHealth } from '@arc/backend/internal/anime/scheduler/run';
import { validate } from '../http';

const TaskParamSchema = z.object({ taskId: z.string().uuid() });

const maintenanceToken = createMiddleware(async (context, next) => {
    const configured = process.env.ARC_MAINTENANCE_TOKEN;
    const supplied = context.req.header('authorization');
    if (!configured || !supplied?.startsWith('Bearer ')) {
        return context.json(
            { error: { code: 'AUTHENTICATION_REQUIRED', message: 'Authentication required' } },
            401
        );
    }

    const expected = Buffer.from(`Bearer ${configured}`);
    const actual = Buffer.from(supplied);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
        return context.json(
            { error: { code: 'AUTHENTICATION_REQUIRED', message: 'Authentication required' } },
            401
        );
    }

    await next();
});

export const maintenance = new Hono();

maintenance.use('*', maintenanceToken);
maintenance.use('*', async (context, next) => {
    await next();
    context.header('Cache-Control', 'no-store');
});

maintenance.get('/health', async (context) => {
    try {
        const health = await animeSchedulerHealth();
        return context.json(health, health.healthy ? 200 : 503);
    } catch {
        return context.json(
            {
                healthy: false,
                reason: 'Scheduler state could not be read from PostgreSQL',
            },
            503
        );
    }
});

maintenance.post('/tasks', validate('json', MaintenanceRequestSchema), async (context) => {
    const id = await enqueueMaintenance(context.req.valid('json'));
    return context.json({ id, state: 'pending' as const }, 202);
});

maintenance.get('/tasks/:taskId', validate('param', TaskParamSchema), async (context) => {
    const task = await getMaintenanceTask(context.req.valid('param').taskId);
    return task
        ? context.json(task)
        : context.json(
              { error: { code: 'NOT_FOUND', message: 'Maintenance task not found' } },
              404
          );
});
