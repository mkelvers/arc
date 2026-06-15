// parses VTT timestamp (mm:ss.ms or hh:mm:ss.ms) to seconds
export const parseVttTime = (raw: string): number => {
  const parts = raw.trim().split(":");
  if (parts.length < 2) return 0;
  const secPart = parts[parts.length - 1];
  const minPart = parts[parts.length - 2];
  const hourPart = parts.length > 2 ? parts[parts.length - 3] : "0";
  if (!secPart || !minPart) return 0;
  return Number(hourPart) * 3600 + Number(minPart) * 60 + Number(secPart.replace(",", "."));
};

// parses a single VTT cue: timestamp line + text lines
export const parseVttCue = (line: string, lines: string[], i: number) => {
  if (!line.includes("-->")) return null;
  const [startRaw, endRaw] = line.split("-->");
  const payload: string[] = [];
  let j = i + 1;
  // collect text until blank line
  while (j < lines.length && lines[j].trim() !== "") {
    payload.push(lines[j]);
    j++;
  }
  // strip tags, join lines
  const text = payload
    .join("\n")
    .replace(/<[^>]+>/g, "")
    .trim();
  if (!text) return null;
  return { start: parseVttTime(startRaw), end: parseVttTime(endRaw), text };
};

/**
 * Parses full VTT file into cue array.
 * Handles both compact (timestamp on separate line) and standard formats.
 */
export const parseVtt = (text: string) => {
  const lines = text.replace(/\r/g, "").split("\n");
  const cues = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // compact: cue id on line i, timestamp on i+1
    if (i + 1 < lines.length && !line.includes("-->") && lines[i + 1].includes("-->")) {
      const cue = parseVttCue(lines[i + 1].trim(), lines, i + 1);
      if (cue) cues.push(cue);
      i++;
    } else if (line.includes("-->")) {
      // standard: timestamp on same line
      const cue = parseVttCue(line, lines, i);
      if (cue) cues.push(cue);
    }
  }
  return cues;
};
