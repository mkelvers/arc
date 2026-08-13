interface CaptionCandidate {
    url: string;
    preferred: boolean;
}

/** Choose the English track with the most cues. Provider labels are not a
 * completeness contract: an AI-labelled track can contain full dialogue while
 * a plain English track contains only signs. Fetch failures preserve provider
 * order/defaults instead of making captions fail playback resolution. */
export async function fullestCaption(
    candidates: CaptionCandidate[],
    load: (url: string) => Promise<string>
) {
    if (!candidates.length) {
        return null;
    }
    if (candidates.length === 1) {
        return candidates[0].url;
    }

    const measured = await Promise.all(
        candidates.map(async (candidate, index) => {
            try {
                const value = await load(candidate.url);
                return {
                    ...candidate,
                    index,
                    cues: (value.match(/-->/g) ?? []).length,
                };
            } catch {
                return { ...candidate, index, cues: -1 };
            }
        })
    );
    measured.sort(
        (left, right) =>
            right.cues - left.cues ||
            Number(right.preferred) - Number(left.preferred) ||
            left.index - right.index
    );

    return measured[0].url;
}
