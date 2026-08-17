const colors = [
    '#be123c',
    '#a21caf',
    '#6d28d9',
    '#4338ca',
    '#1d4ed8',
    '#0e7490',
    '#0f766e',
    '#047857',
    '#c2410c',
    '#b91c1c',
] as const;

export function accountAvatar(username: string) {
    const value = username.trim();
    let hash = 0;

    for (const character of value) {
        hash = Math.imul(hash, 31) + (character.codePointAt(0) ?? 0);
    }

    return {
        color: colors[Math.abs(hash) % colors.length] ?? colors[0],
        initial: value[0]?.toLocaleUpperCase() ?? '?',
    };
}
