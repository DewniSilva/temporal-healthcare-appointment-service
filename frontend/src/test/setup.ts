import '@testing-library/jest-dom/vitest';

// jsdom does not implement the imperative <dialog> methods our modal/drawer
// components rely on for focus trapping. This minimal polyfill only toggles
// the `open` property, which is enough for component behavior under test.
if (typeof HTMLDialogElement !== 'undefined') {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.open = true;
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.open = false;
    };
  }
}
