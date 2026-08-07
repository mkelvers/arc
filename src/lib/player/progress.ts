export const progressIntervalSeconds = 30;
export const nearEndThresholdSeconds = 5;

export type ProgressSaveReason = 'periodic' | 'ending';

interface Sample {
  currentTime: number;
  duration: number;
  playing: boolean;
}

export class ProgressSchedule {
  private nextPeriodicAt: number | null = null;
  private nearEndSaved = false;

  start(currentTime: number) {
    this.nextPeriodicAt = Math.max(0, currentTime) + progressIntervalSeconds;
    this.nearEndSaved = false;
  }

  update({ currentTime, duration, playing }: Sample): ProgressSaveReason | null {
    if (!playing || !Number.isFinite(currentTime) || !Number.isFinite(duration) || duration <= 0) {
      return null;
    }

    const remaining = duration - currentTime;
    if (remaining > nearEndThresholdSeconds) {
      this.nearEndSaved = false;
    } else {
      if (currentTime > 0 && remaining >= 0 && !this.nearEndSaved) {
        this.nearEndSaved = true;
        return 'ending';
      }

      return null;
    }

    if (this.nextPeriodicAt === null) {
      this.start(currentTime);
      return null;
    }

    if (currentTime < this.nextPeriodicAt) {
      return null;
    }

    this.nextPeriodicAt = currentTime + progressIntervalSeconds;
    return 'periodic';
  }
}
