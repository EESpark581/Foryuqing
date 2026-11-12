/** Tiny synthesised "meow" - no audio files, no network, no licences. */
let sharedContext: AudioContext | null = null;

/**
 * Play a soft two-formant chirp. Safe to call repeatedly; the AudioContext
 * is reused and only created after a real user gesture.
 */
export function playMeow(volume: number): void {
  if (volume <= 0) return;

  try {
    if (!sharedContext) sharedContext = new AudioContext();
    const ctx = sharedContext;
    if (ctx.state === 'suspended') void ctx.resume();

    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(520, now);
    oscillator.frequency.exponentialRampToValueAtTime(760, now + 0.12);
    oscillator.frequency.exponentialRampToValueAtTime(430, now + 0.36);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2200, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.16 * volume, now + 0.045);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);

    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.42);
  } catch (error) {
    console.warn('[audio] Meow unavailable:', error);
  }
}
