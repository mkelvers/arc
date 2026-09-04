import { timingSafeEqual } from 'node:crypto';

import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { z } from 'zod';

import {
    MaintenanceHealthSchema,
    MaintenanceRequestSchema,
    MaintenanceTaskSchema,
    enqueueMaintenance,
    getMaintenanceTask,
    animeSchedulerHealth,
} from '@arc/core/server';
import { validate } from '../http';

const TaskParamSchema = z.object({ taskId: z.uuid() });

function healthResponse(health: Awaited<ReturnType<typeof animeSchedulerHealth>>) {
    return MaintenanceHealthSchema.parse({
        ...health,
        startedAt: health.startedAt?.toISOString() ?? null,
        completedAt: health.completedAt?.toISOString() ?? null,
        lastSuccessAt: health.lastSuccessAt?.toISOString() ?? null,
        lastFailureAt: health.lastFailureAt?.toISOString() ?? null,
        lastFullReconciliationAt: health.lastFullReconciliationAt?.toISOString() ?? null,
        nextFullReconciliationAt: health.nextFullReconciliationAt?.toISOString() ?? null,
        lastCatalogRefreshAt: health.lastCatalogRefreshAt?.toISOString() ?? null,
        nextCatalogRefreshAt: health.nextCatalogRefreshAt?.toISOString() ?? null,
        anilist: health.anilist
            ? {
                  ...health.anilist,
                  blockedUntil: health.anilist.blockedUntil?.toISOString() ?? null,
                  lastRequestAt: health.anilist.lastRequestAt?.toISOString() ?? null,
              }
            : null,
    });
}

function taskResponse(task: NonNullable<Awaited<ReturnType<typeof getMaintenanceTask>>>) {
    return MaintenanceTaskSchema.parse({
        ...task,
        nextAttemptAt: task.nextAttemptAt.toISOString(),
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString(),
        completedAt: task.completedAt?.toISOString() ?? null,
    });
}

const maintenanceToken = createMiddleware(async (context, next) => {
    const configured = process.env.ARC_MAINTENANCE_TOKEN;
    const supplied = context.req.header('authorization');
    if (!configured || !supplied?.startsWith('Bearer ')) {
        return context.json(
            {
                error: {
                    code: 'AUTHENTICATION_REQUIRED',
                    message: 'Authentication required',
                },
            },
            401
        );
    }

    const expected = Buffer.from(`Bearer ${configured}`);
    const actual = Buffer.from(supplied);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
        return context.json(
            {
                error: {
                    code: 'AUTHENTICATION_REQUIRED',
                    message: 'Authentication required',
                },
            },
            401
        );
    }

    await next();
});

export const maintenance = new Hono();

maintenance.use('*', maintenanceToken);

maintenance.get('/health', async (context) => {
    try {
        const health = await animeSchedulerHealth();
        return context.json(healthResponse(health), health.healthy ? 200 : 503);
    } catch {
        return context.json(
            MaintenanceHealthSchema.parse({
                healthy: false,
                reason: 'Scheduler state could not be read from PostgreSQL',
                active: false,
                startedAt: null,
                completedAt: null,
                lastSuccessAt: null,
                lastFailureAt: null,
                lastFullReconciliationAt: null,
                nextFullReconciliationAt: null,
                lastCatalogRefreshAt: null,
                nextCatalogRefreshAt: null,
                durationMs: null,
                stats: null,
                targets: {
                    pending: 0,
                    due: 0,
                    leased: 0,
                    confirmed: 0,
                    failed: 0,
                    retired: 0,
                },
                maintenanceTasks: {},
                maintenanceOldestDueAgeMs: null,
                anilist: null,
                oldestDueAgeMs: null,
            }),
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
        ? context.json(taskResponse(task))
        : context.json(
              {
                  error: {
                      code: 'NOT_FOUND',
                      message: 'Maintenance task not found',
                  },
              },
              404
          );
});
