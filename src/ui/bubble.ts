/** Speech bubble with a short auto-dismiss timer. */
export class Bubble {
  private timer = 0;

  constructor(private readonly element: HTMLElement) {}

  /** Display a line and hide it after `ms` milliseconds. */
  show(text: string, ms = 2600): void {
    window.clearTimeout(this.timer);
    this.element.textContent = text;
    this.element.classList.add('is-visible');
    this.timer = window.setTimeout(() => this.hide(), ms);
  }

  /** Hide the bubble immediately. */
  hide(): void {
    window.clearTimeout(this.timer);
    this.element.classList.remove('is-visible');
  }
}
