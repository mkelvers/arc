export function shouldUseQuerySnapshot(
    snapshot: { refreshAfter: Date; fetchedAt: Date },
    now: Date,
    forceRefresh: boolean,
    requestedAt: Date
) {
    return forceRefresh ? snapshot.fetchedAt >= requestedAt : snapshot.refreshAfter > now;
}
