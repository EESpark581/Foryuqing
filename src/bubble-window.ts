/**
 * Bubble window renderer.
 *
 * The pet window is tiny, so dialogue is rendered here instead. This page only
 * measures the text and reports the box back to the main process, which then
 * sizes, positions and finally hides the window.
 */
const element = document.getElementById('bubble') as HTMLDivElement;
const api = window.petAPI;

/** Extra pixels so the rounded border and shadow are never clipped. */
const PAD = 6;

function report(): void {
  if (!api) return;
  const rect = element.getBoundingClientRect();
  api.reportBubbleSize(Math.ceil(rect.width) + PAD, Math.ceil(rect.height) + PAD);
}

function render(text: string, duration: number): void {
  element.textContent = text;
  element.classList.add('is-visible');
  element.setAttribute('data-ms', String(duration));

  // Measure synchronously: reading getBoundingClientRect() forces layout, and
  // requestAnimationFrame never ticks in a window that has not been shown yet.
  report();
  setTimeout(report, 40);
}

if (api) {
  api.onBubble(({ text, duration }) => render(text, duration));

  // Pull whatever is already queued as well: a pushed message can arrive before
  // this script runs, and pulling makes the very first bubble reliable.
  void api.fetchBubble().then((payload) => {
    if (payload) render(payload.text, payload.duration);
    api.bubbleReady();
  });
}
