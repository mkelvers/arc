export const parseVttTime = (raw: string): number => {
  const parts = raw.trim().split(':');
  if (parts.length < 2) return 0;
  const secPart = parts.pop()!;
  const minPart = parts.pop()!;
  const hourPart = parts.pop() ?? '0';
  return Number(hourPart) * 3600 + Number(minPart) * 60 + Number(secPart.replace(',', '.'));
};

export const parseVttCue = (line: string, lines: string[], i: number) => {
  if (!line.includes('-->')) return null;
  const [startRaw, endRaw] = line.split('-->');
  const payload: string[] = [];
  let j = i + 1;
  while (j < lines.length && lines[j].trim() !== '') {
    payload.push(lines[j]);
    j++;
  }
  const text = payload
    .join('\n')
    .replace(/<[^>]+>/g, '')
    .trim();
  if (!text) return null;
  return { start: parseVttTime(startRaw), end: parseVttTime(endRaw), text };
};

export const parseVtt = (text: string) => {
  const lines = text.replace(/\r/g, '').split('\n');
  const cues = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (i + 1 < lines.length && !line.includes('-->') && lines[i + 1].includes('-->')) {
      const cue = parseVttCue(lines[i + 1].trim(), lines, i + 1);
      if (cue) cues.push(cue);
      i++;
    } else if (line.includes('-->')) {
      const cue = parseVttCue(line, lines, i);
      if (cue) cues.push(cue);
    }
  }
  return cues;
};
