interface NotificationInventoryState {
    mediaStatus: string | null;
    lastSuccessAt: Date | null;
    nextRefreshAt: Date | null;
}

export function notificationInventoryRefreshDue(
    state: NotificationInventoryState,
    now = Date.now()
) {
    if (!state.lastSuccessAt) {
        return true;
    }

    if (state.mediaStatus === 'RELEASING') {
        return state.lastSuccessAt.getTime() <= now - 60 * 60 * 1_000;
    }

    return state.nextRefreshAt !== null && state.nextRefreshAt.getTime() <= now;
}
