import { state } from '../state';
import { formatTime, showControls } from '../controls';
import { resolveActiveSegments, renderSegments } from './segments';

type SkipType = 'op' | 'ed';

const qs = <T extends Element>(root: ParentNode, sel: string): T | null =>
  root.querySelector(sel) as T | null;

export const setupSegmentEditor = (): void => {
  const root = document.querySelector('[data-segment-editor-root]') as HTMLElement | null;
  if (!root) return;

  const toggleBtn = qs<HTMLButtonElement>(root, '[data-segment-editor-toggle]');
  const panel = qs<HTMLElement>(root, '[data-segment-editor]');
  if (!toggleBtn || !panel) return;

  const closeBtn = qs<HTMLButtonElement>(panel, '[data-segment-editor-close]');
  const typeValue = qs<HTMLInputElement>(panel, '[data-segment-type-value]');
  const typeLabel = qs<HTMLElement>(panel, '[data-segment-type-label]');
  const markStartBtn = qs<HTMLButtonElement>(panel, '[data-segment-mark-start]');
  const markEndBtn = qs<HTMLButtonElement>(panel, '[data-segment-mark-end]');
  const startLabel = qs<HTMLElement>(panel, '[data-segment-start]');
  const endLabel = qs<HTMLElement>(panel, '[data-segment-end]');
  const resetBtn = qs<HTMLButtonElement>(panel, '[data-segment-reset]');
  const saveBtn = qs<HTMLButtonElement>(panel, '[data-segment-save]');
  const errorBox = qs<HTMLElement>(panel, '[data-segment-error]');
  const typeOptions = Array.from(
    panel.querySelectorAll('[data-segment-type-option]')
  ) as HTMLButtonElement[];

  let startTime: number | null = null;
  let endTime: number | null = null;

  const setError = (msg: string | null): void => {
    if (!errorBox) return;
    if (!msg) {
      errorBox.classList.add('hidden');
      errorBox.textContent = '';
      return;
    }
    errorBox.textContent = msg;
    errorBox.classList.remove('hidden');
  };

  const updateLabels = (): void => {
    if (startLabel) startLabel.textContent = startTime == null ? '—' : formatTime(startTime);
    if (endLabel) endLabel.textContent = endTime == null ? '—' : formatTime(endTime);
  };

  const open = (): void => {
    panel.classList.remove('hidden');
    setError(null);
    showControls();
  };
  const close = (): void => {
    panel.classList.add('hidden');
    setError(null);
  };

  toggleBtn.addEventListener('click', () => {
    if (panel.classList.contains('hidden')) open();
    else close();
  });
  closeBtn?.addEventListener('click', close);

  // close when clicking outside the segment capture UI
  document.addEventListener('pointerdown', e => {
    if (panel.classList.contains('hidden')) return;
    const target = e.target as Node | null;
    if (!target) return;
    if (root.contains(target)) return;
    close();
  });

  // dropdown type selector (uses ui-dropdown for visuals; we manage the value)
  typeOptions.forEach(btn => {
    btn.addEventListener('click', () => {
      const v = (btn.getAttribute('data-value') || 'ed') as SkipType;
      if (typeValue) typeValue.value = v;
      if (typeLabel) typeLabel.textContent = v === 'op' ? 'Opening (OP)' : 'Ending (ED)';
      // close dropdown popover if it exists
      const dropdown = btn.closest('ui-dropdown');
      const content = dropdown?.querySelector('[data-content]') as HTMLElement | null;
      content?.classList.add('hidden');
      showControls();
    });
  });

  const reset = (): void => {
    startTime = null;
    endTime = null;
    setError(null);
    updateLabels();
  };
  resetBtn?.addEventListener('click', reset);

  markStartBtn?.addEventListener('click', () => {
    startTime = Math.max(0, state.video.currentTime);
    if (endTime != null && startTime >= endTime) endTime = null;
    setError(null);
    updateLabels();
    showControls();
  });
  markEndBtn?.addEventListener('click', () => {
    endTime = Math.max(0, state.video.currentTime);
    if (startTime != null && endTime <= startTime) {
      setError('End must be after start.');
      return;
    }
    setError(null);
    updateLabels();
    showControls();
  });

  saveBtn?.addEventListener('click', async () => {
    const skipType = ((typeValue?.value || 'ed') as SkipType) ?? 'ed';
    if (startTime == null || endTime == null) {
      setError('Mark start and end first.');
      return;
    }
    if (endTime <= startTime) {
      setError('End must be after start.');
      return;
    }

    saveBtn.disabled = true;
    saveBtn.classList.add('opacity-70');
    setError(null);
    try {
      const res = await fetch('/api/watch/segments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mal_id: state.malID,
          episode: Number.parseInt(state.currentEpisode, 10),
          skip_type: skipType,
          start_time: startTime,
          end_time: endTime,
        }),
      });
      if (!res.ok) {
        setError(res.status === 401 ? 'Login required.' : 'Failed to save segment.');
        return;
      }

      // Update local segments immediately so UI reflects the saved data.
      const normalizedType = skipType === 'ed' ? 'ending' : 'opening';
      state.parsedSegments = (state.parsedSegments || []).filter(s => {
        const t = (s.type || '').toLowerCase();
        if (normalizedType === 'ending') return t !== 'ed' && t !== 'ending' && t !== 'outro';
        return t !== 'op' && t !== 'opening' && t !== 'intro';
      });
      state.parsedSegments.push({ type: normalizedType, start: startTime, end: endTime });
      resolveActiveSegments();
      renderSegments();

      close();
    } catch {
      setError('Failed to save segment.');
    } finally {
      saveBtn.disabled = false;
      saveBtn.classList.remove('opacity-70');
    }
  });

  updateLabels();
};
