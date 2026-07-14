/**
 * Click test fixtures — HTML pages for click parity tests.
 *
 * Adapted from Playwright's tests/assets/input/ directory:
 * - button.html → /input/button
 * - checkbox.html → /input/checkbox
 * - scrollable.html → /input/scrollable
 * - rotatedButton.html → /input/rotated-button
 * - wrappedlink.html → /wrappedlink
 * - offscreenbuttons.html → /offscreenbuttons
 *
 * @module tests/integration/fixtures/click
 */

import type { TestPages } from "./registry.js";

/**
 * Click test pages.
 *
 * Each page is served at the path specified by its key.
 */
export const clickPages: TestPages = {
  // Button test — basic button with click tracking
  // Upstream: playwright/tests/assets/input/button.html
  "/input/button": `<!DOCTYPE html>
<html>
<head><title>Button test</title></head>
<body>
<button>Click target</button>
<script>
window.result = 'Was not clicked';
window.offsetX = undefined;
window.offsetY = undefined;
window.pageX = undefined;
window.pageY = undefined;
window.shiftKey = undefined;
document.querySelector('button').addEventListener('click', e => {
  result = 'Clicked';
  offsetX = e.offsetX;
  offsetY = e.offsetY;
  pageX = e.pageX;
  pageY = e.pageY;
  shiftKey = e.shiftKey;
}, false);
</script>
</body>
</html>`,

  // Checkbox test — checkbox with event tracking
  // Upstream: playwright/tests/assets/input/checkbox.html
  "/input/checkbox": `<!DOCTYPE html>
<html>
<head><title>Selection Test</title></head>
<body>
<label for="agree">Remember Me</label>
<input id="agree" type="checkbox">
<script>
window.result = { check: null, events: [] };
let checkbox = document.querySelector('input');
const events = ['change', 'click', 'dblclick', 'input', 'mousedown', 'mouseenter', 'mouseleave', 'mousemove', 'mouseout', 'mouseover', 'mouseup'];
for (let event of events) {
  checkbox.addEventListener(event, () => {
    if (['change', 'click', 'dblclick', 'input'].includes(event) === true) {
      result.check = checkbox.checked;
    }
    result.events.push(event);
  }, false);
}
</script>
</body>
</html>`,

  // Scrollable test — container with many buttons for scroll+click tests
  // Upstream: playwright/tests/assets/input/scrollable.html
  "/input/scrollable": `<!DOCTYPE html>
<html>
<head><title>Scrollable test</title></head>
<body>
<script>
for (let i = 0; i < 100; i++) {
  let button = document.createElement('button');
  button.textContent = i + ': not clicked';
  button.id = 'button-' + i;
  button.onclick = () => button.textContent = 'clicked';
  button.oncontextmenu = event => {
    event.preventDefault();
    button.textContent = 'context menu';
  };
  document.body.appendChild(button);
  document.body.appendChild(document.createElement('br'));
}
</script>
</body>
</html>`,

  // Wrapped link test — link inside transformed container
  // Upstream: playwright/tests/assets/wrappedlink.html
  "/wrappedlink": `<style>
:root { font-family: monospace; }
body { display: flex; align-items: center; justify-content: center; }
div { width: 10ch; word-wrap: break-word; border: 1px solid blue; transform: rotate(33deg); line-height: 8ch; padding: 2ch; }
a { margin-left: 7ch; }
</style>
<div>
  <a href='#clicked'>123321</a>
</div>
<script>
document.querySelector('a').addEventListener('click', () => { window.__clicked = true; });
</script>`,

  // Rotated button test — button with Y-axis rotation
  // Upstream: playwright/tests/assets/input/rotatedButton.html
  "/input/rotated-button": `<!DOCTYPE html>
<html>
<head><title>Rotated button test</title></head>
<body>
<button onclick="clicked();">Click target</button>
<style>button { transform: rotateY(180deg); }</style>
<script>
window.result = 'Was not clicked';
function clicked() { result = 'Clicked'; }
</script>
</body>
</html>`,

  // Offscreen buttons test — buttons at various positions requiring scroll
  // Upstream: playwright/tests/assets/offscreenbuttons.html
  "/offscreenbuttons": `<!DOCTYPE html>
<html>
<head><title>Offscreen Buttons</title></head>
<body>
<script>
for (let i = 0; i < 11; i++) {
  const button = document.createElement('button');
  button.textContent = 'button #' + i;
  button.id = 'btn' + i;
  button.onclick = () => console.log('button #' + i + ' clicked');
  button.style.position = 'absolute';
  button.style.width = '100px';
  button.style.height = '20px';
  if (i < 4) {
    button.style.left = (i * 110) + 'px';
    button.style.top = '0px';
  } else if (i < 8) {
    button.style.left = ((i - 4) * 110) + 'px';
    button.style.top = '500px';
  } else {
    button.style.left = ((i - 8) * 110) + 'px';
    button.style.top = '1000px';
  }
  document.body.appendChild(button);
}
</script>
</body>
</html>`,
};
