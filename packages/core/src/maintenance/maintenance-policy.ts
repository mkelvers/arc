import type { MaintenanceRequest } from '../contracts/maintenance';

export function maintenancePriority(request: MaintenanceRequest) {
    if (request.kind === 'mapping_override' || request.kind === 'mapping_rediscover') {
        return 100;
    }
    if (request.kind === 'release_refresh' || request.kind === 'episode_backfill') {
        return 80;
    }
    if (request.kind === 'target_reactivate') {
        return 60;
    }
    return 40;
}
