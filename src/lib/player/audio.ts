export class AudioDelay {
  private context: AudioContext | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private delay: DelayNode | null = null;

  sync(video: HTMLVideoElement, seconds: number, reset = false) {
    if (!seconds && !this.context) {
      return;
    }

    this.context ??= new AudioContext();

    // A media element may only be wrapped once, so keep this node for the
    // lifetime of the video and only rebuild the downstream delay path.
    this.source ??= this.context.createMediaElementSource(video);

    if (reset) {
      this.source.disconnect();
      this.delay?.disconnect();
      this.delay = null;
    }

    if (!this.delay) {
      this.delay = this.context.createDelay(10);
      this.source.connect(this.delay);
      this.delay.connect(this.context.destination);
    }

    this.delay.delayTime.setValueAtTime(seconds, this.context.currentTime);
  }

  resume(video: HTMLVideoElement, seconds: number) {
    this.sync(video, seconds);

    if (this.context?.state === 'suspended') {
      void this.context.resume();
    }
  }

  close() {
    this.source?.disconnect();
    this.delay?.disconnect();
    void this.context?.close();
  }
}
