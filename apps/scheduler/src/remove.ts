const marker = '# arc-anime-scheduler';
const current = Bun.spawnSync(['crontab', '-l']);
const existing = current.exitCode === 0 ? current.stdout.toString() : '';
const next =
    existing
        .split('\n')
        .filter((line) => line !== marker && !line.includes('arc-anime-scheduler'))
        .join('\n')
        .trim() + '\n';
const result = Bun.spawnSync(['crontab', '-'], { stdin: new TextEncoder().encode(next) });
if (result.exitCode !== 0) {
    throw new Error(`Could not remove scheduler crontab: ${result.stderr.toString()}`);
}
console.info('Removed arc-anime-scheduler if it was installed');

export {};
