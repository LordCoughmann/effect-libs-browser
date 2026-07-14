/**
 * Select option test fixtures — HTML pages for selectOption parity tests.
 *
 * Adapted from Playwright's tests/assets/input/select.html
 *
 * @module tests/integration/fixtures/select
 */

import type { TestPages } from "./registry.js";

/**
 * Select test pages.
 *
 * Served at /input/select — mirrors Playwright's test asset layout.
 */
export const selectPages: TestPages = {
  "/input/select": `<!DOCTYPE html>
<html>
  <head>
    <title>Selection Test</title>
  </head>
  <body>
    <select>
      <option value="black">Black</option>
      <option value="blue">Blue</option>
      <option value="brown">Brown</option>
      <option value="cyan">Cyan</option>
      <option value="gray">Gray</option>
      <option value="green">Green</option>
      <option value="indigo">Indigo</option>
      <option value="magenta">Magenta</option>
      <option value="orange">Orange</option>
      <option value="pink">Pink</option>
      <option value="purple">Purple</option>
      <option value="red">Red</option>
      <option value="violet">Violet</option>
      <option value="white" id="whiteOption">White</option>
      <option value="yellow">Yellow</option>
    </select>
    <script>
      window.result = {
        onInput: null,
        onChange: null,
        onBubblingChange: null,
        onBubblingInput: null,
      };

      let select = document.querySelector('select');

      function makeEmpty() {
        for (let i = select.options.length - 1; i >= 0; --i) {
          select.remove(i);
        }
      }

      function makeMultiple() {
        select.setAttribute('multiple', true);
      }

      select.addEventListener('input', () => {
        result.onInput = Array.from(select.querySelectorAll('option:checked')).map((option) => {
          return option.value;
        });
      }, false);

      select.addEventListener('change', () => {
        result.onChange = Array.from(select.querySelectorAll('option:checked')).map((option) => {
          return option.value;
        });
      }, false);

      document.body.addEventListener('input', () => {
        result.onBubblingInput = Array.from(select.querySelectorAll('option:checked')).map((option) => {
          return option.value;
        });
      }, false);

      document.body.addEventListener('change', () => {
        result.onBubblingChange = Array.from(select.querySelectorAll('option:checked')).map((option) => {
          return option.value;
        });
      }, false);
    </script>
  </body>
</html>`,
};
