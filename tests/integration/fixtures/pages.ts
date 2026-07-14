/**
 * Test HTML pages for integration tests.
 *
 * Served by the HTTP server for browser automation tests.
 */

export const testPages: Record<string, string> = {
  // JSON endpoint for page.request tests
  "/simple.json": `{"foo": "bar"}
`,

  "/": `<!DOCTYPE html>
<html>
<head><title>Test Home</title></head>
<body>
  <h1>Test Page</h1>
  <nav>
    <a href="/links">Links Page</a>
    <a href="/form">Form Page</a>
  </nav>
</body>
</html>`,
  "/links": `<!DOCTYPE html><html><head><title>Links Page</title></head><body><h1>Links Page</h1><ul><li><a href="/page1">Link 1</a></li><li><a href="/page2">Link 2</a></li><li><a href="/page3">Link 3</a></li></ul></body></html>`,
  "/page1": `<!DOCTYPE html><html><head><title>Page 1</title></head><body><h1>Page 1</h1><p>Navigated successfully.</p></body></html>`,
  "/form": `<!DOCTYPE html><html><head><title>Form Page</title></head><body><h1>Form Test</h1><form id="test-form"><input type="text" name="username" /><input type="password" name="password" /><button type="submit">Submit</button></form><div id="result"></div><script>document.getElementById('test-form').addEventListener('submit', (e) => { e.preventDefault(); document.getElementById('result').textContent = 'Form submitted!'; });</script></body></html>`,
  "/dynamic": `<!DOCTYPE html><html><body><h1>Dynamic Content</h1><div id="content">Loading...</div><script>setTimeout(() => { document.getElementById('content').textContent = 'Dynamic content loaded!'; }, 100);</script></body></html>`,
  "/keypress": `<!DOCTYPE html><html><body><h1>Key Press Test</h1><input id="key-input" type="text" /><div id="key-result"></div><script>document.getElementById('key-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { document.getElementById('key-result').textContent = 'Key: Enter'; } });</script></body></html>`,
  "/delayed-element": `<!DOCTYPE html><html><body><div id="container"></div><script>setTimeout(() => { const div = document.createElement('div'); div.id = 'late-element'; div.textContent = 'I appeared!'; document.getElementById('container').appendChild(div); }, 200);</script></body></html>`,
  "/storage": `<!DOCTYPE html><html><body><div id="session-output"></div><script>sessionStorage.setItem('test-key', 'initial-value'); document.getElementById('session-output').textContent = sessionStorage.getItem('test-key');</script></body></html>`,

  // Phase 1: networkidle0 testing - page with multiple sequential network requests
  "/network-requests": `<!DOCTYPE html><html><head><title>Network Requests</title></head><body><h1>Network Requests Test</h1><div id="status">Loading...</div><script>
// Trigger multiple sequential network requests
const urls = ['/api/data1', '/api/data2', '/api/data3'];
let completed = 0;
urls.forEach((url, i) => {
  setTimeout(() => {
    fetch(url).catch(() => {}).finally(() => {
      completed++;
      if (completed === urls.length) {
        document.getElementById('status').textContent = 'All requests completed';
      }
    });
  }, i * 100);
});
</script></body></html>`,

  // Phase 3: error testing - page with JS functions that throw errors
  "/error-script": `<!DOCTYPE html><html><head><title>Error Script</title></head><body><h1>Error Script Test</h1><script>
window.throwError = function() { throw new Error('Test error from page'); };
window.throwTypeError = function() { throw new TypeError('Type error from page'); };
window.throwCustomError = function() { throw { name: 'CustomError', message: 'Custom error message' }; };
window.successValue = 42;
</script></body></html>`,

  // Simple empty page for timeout tests (no target elements)
  "/empty": `<!DOCTYPE html><html><head><title>Empty Page</title></head><body><h1>Empty Page</h1><p>No interactive elements here.</p></body></html>`,

  // Basic-auth-protected page. The HTTP server returns 401 + WWW-Authenticate
  // for /auth/* paths when the Authorization header is missing or wrong, and
  // the page body when it's present. Used by `setHTTPCredentials` parity tests.
  "/auth/protected": `<!DOCTYPE html><html><head><title>Auth Protected</title></head><body><h1>Authenticated</h1><p>You are authenticated.</p></body></html>`,

  // Geolocation test — calls navigator.geolocation.getCurrentPosition and
  // surfaces the result as JSON in #geo-result. The window.__geoReady
  // promise resolves when the callback fires, so tests can wait for it.
  "/geolocation": `<!DOCTYPE html><html><head><title>Geolocation Test</title></head><body><h1>Geolocation Test</h1><div id="geo-result">pending</div><script>
window.__geo = { status: 'pending' };
window.__geoReady = new Promise((resolve) => {
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      window.__geo = {
        status: 'ok',
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      };
      document.getElementById('geo-result').textContent = JSON.stringify(window.__geo);
      resolve();
    },
    (err) => {
      window.__geo = { status: 'error', code: err.code, message: err.message };
      document.getElementById('geo-result').textContent = JSON.stringify(window.__geo);
      resolve();
    },
    { timeout: 5000 }
  );
});
</script></body></html>`,

  // Grid layout for screenshot dimension tests (inspired by Playwright's grid.html)
  "/grid": `<!DOCTYPE html><html><head><title>Grid</title><style>
body { margin: 0; padding: 0; }
.box { display: inline-block; width: 50px; height: 50px; margin: 0; padding: 0; box-sizing: border-box; border: 1px solid #333; }
</style></head><body><script>
for (let i = 0; i < 160; i++) {
  const box = document.createElement('div');
  box.className = 'box';
  box.style.backgroundColor = 'hsl(' + (i * 2) + ', 100%, 90%)';
  document.body.appendChild(box);
}
</script></body></html>`,

  // Type test — input that echoes typed characters
  "/type-test": `<!DOCTYPE html><html><head><title>Type Test</title></head><body><h1>Type Test</h1><input id="type-input" type="text" /><div id="type-result"></div><script>document.getElementById('type-input').addEventListener('input', (e) => { document.getElementById('type-result').textContent = e.target.value; });</script></body></html>`,

  // Press test — input that captures keydown events
  "/press-test": `<!DOCTYPE html><html><head><title>Press Test</title></head><body><h1>Press Test</h1><input id="press-input" type="text" /><div id="press-result"></div><script>document.getElementById('press-input').addEventListener('keydown', (e) => { document.getElementById('press-result').textContent = 'Key: ' + e.key; });</script></body></html>`,

  // Session storage test — page that reads/writes sessionStorage
  "/session-storage": `<!DOCTYPE html><html><head><title>Session Storage</title></head><body><h1>Session Storage Test</h1><div id="storage-output"></div><script>document.getElementById('storage-output').textContent = sessionStorage.getItem('integration-test-key') || 'no-value';</script></body></html>`,

  // API echo endpoint — returns request body and method
  "/api/echo": `<!DOCTYPE html><html><body>echo</body></html>`,

  // Local storage test — page that reads/writes localStorage
  "/local-storage": `<!DOCTYPE html><html><head><title>Local Storage</title></head><body><h1>Local Storage Test</h1><div id="storage-output"></div><script>document.getElementById('storage-output').textContent = localStorage.getItem('integration-test-key') || 'no-value';</script></body></html>`,

  // Element content test — page with structured elements for innerText/innerHTML/getAttribute
  "/element-content": `<!DOCTYPE html><html><head><title>Element Content</title></head><body><h1 id="heading">Hello World</h1><div id="content"><p class="intro">First paragraph</p><p class="body">Second paragraph</p></div><a id="link" href="/links" target="_blank" data-testid="nav-link">Go to links</a></body></html>`,

  // Network fetch test — page with buttons that trigger fetch requests
  "/network-fetch": `<!DOCTYPE html><html><head><title>Network Fetch</title></head><body><h1>Network Fetch Test</h1><div id="result"></div><button id="fetch-btn" onclick="fetchData()">Fetch Data</button><script>function fetchData() { fetch('/api/echo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: 'hello' }) }).then(r => r.json()).then(d => { document.getElementById('result').textContent = JSON.stringify(d); }).catch(e => { document.getElementById('result').textContent = 'Error: ' + e.message; }); }</script></body></html>`,

  // ── Pages for waitFor* tests ─────────────────────────────────────────────

  // One-style page — loads an external CSS file that can be stalled via server routes
  "/one-style": `<!DOCTYPE html><html><head><title>One Style</title><link rel="stylesheet" href="/one-style.css"></head><body><div>hello, world!</div></body></html>`,

  // One-style CSS — minimal CSS (served statically; can be overridden via dynamic routes)
  "/one-style.css": `body { color: red; }`,

  // Test script JS — minimal valid JS for addScriptTag URL tests
  "/test-script.js": `window.__fromUrlScript = 'loaded';`,

  // Frame page — simple page for waitForURL/navigation URL matching
  "/frame": `<!DOCTYPE html><html><head><title>Frame Page</title></head><body><h1>Frame Page</h1></body></html>`,

  // Frames container — page with one iframe (matches Playwright's one-frame.html)
  "/frames/one-frame.html": `<!DOCTYPE html><html><head><title>Frames Container</title></head><body><iframe id="frame1" name="frame1" src='./frame.html'></iframe></body></html>`,

  // Frame content — the iframe content (matches Playwright's frame.html)
  "/frames/frame.html": `<!DOCTYPE html><html><head><title>Frame</title></head><body><div>Hi, I'm frame</div><h1 id="frame-h1">Frame</h1><button id="frame-btn">Click me</button><input id="frame-input" type="text" /><input id="frame-check" type="checkbox" /><p id="frame-p">frame paragraph</p><script>const btn = document.getElementById('frame-btn'); const out = document.createElement('div'); out.id = 'frame-output'; document.body.appendChild(out); btn.addEventListener('click', () => { out.textContent = 'clicked'; });</script></body></html>`,

  // Three-frame container — for ambiguity tests (locator-frame.spec.ts).
  // Each iframe points to a distinct iframe-N.html with its own button.
  // Adapted from Playwright's routeAmbiguous() helper, but as static pages.
  "/frames/three-frames.html": `<!DOCTYPE html><html><head><title>Three Frames</title></head><body><iframe name="a" src='./iframe-1.html'></iframe><iframe name="b" src='./iframe-2.html'></iframe><iframe name="c" src='./iframe-3.html'></iframe></body></html>`,
  "/frames/iframe-1.html": `<!DOCTYPE html><html><head><title>Iframe 1</title></head><body><button>Hello from iframe-1.html</button></body></html>`,
  "/frames/iframe-2.html": `<!DOCTYPE html><html><head><title>Iframe 2</title></head><body><button>Hello from iframe-2.html</button></body></html>`,
  "/frames/iframe-3.html": `<!DOCTYPE html><html><head><title>Iframe 3</title></head><body><button>Hello from iframe-3.html</button></body></html>`,

  // Console log page — simple page used by waitForFunction navigation tests
  "/consolelog": `<!DOCTYPE html><html><head><title>Console Log</title></head><body><h1>Console Log Page</h1></body></html>`,

  // Self-requesting page — page that makes an XHR request to itself
  // Used by goto "should work with self-requesting page" test
  "/self-request": `<!DOCTYPE html><html><head><title>Self Request</title></head><body><script>var req = new XMLHttpRequest(); req.open('GET', '/self-request'); req.send(null);</script></body></html>`,

  // Global variable page — sets a global JavaScript variable
  // Used by route interception tests to verify pausing behavior
  // Adapted from Playwright's tests/assets/global-var.html
  "/global-var": `<script>var globalVar = 123;</script>`,

  // History API page — page that uses pushState to change URL after load
  // Used by goto "should return response when page changes its URL after load" test
  // Adapted from Playwright's tests/assets/historyapi.html
  "/historyapi": `<script>window.addEventListener('DOMContentLoaded', () => { history.pushState({}, '', '#1'); });</script>`,

  // ── Pages for goto tests ─────────────────────────────────────────────

  // Load event page — tracks script loading order for proper load waiting tests
  // Adapted from Playwright's tests/assets/load-event/load-event.html
  "/load-event/load-event.html": `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Load Event Test</title></head><body><script>window.results = []; window.addEventListener('load', function() { window.results.push('load'); }); window.addEventListener('DOMContentLoaded', function() { window.results.push('DOMContentLoaded'); });</script><script type="module" src="./module.js"></script><script>window.results.push('script tag after module');</script></body></html>`,

  // Module script for load-event page
  "/load-event/module.js": `import {foo} from '/slow.js'; console.log('foo is', foo); window.results.push('module');`,

  // Slow script for load-event module (can be stalled via dynamic routes)
  "/slow.js": `export const foo = 'slow'; window.results.push('slow module');`,

  // ── Pages for fill tests ─────────────────────────────────────────────
  // Adapted from Playwright's tests/assets/input/textarea.html
  "/input/textarea": `<!DOCTYPE html><html><head><title>Textarea test</title></head><body><textarea spellcheck="false"></textarea><input></input><div contenteditable="true"></div><div class="plain">Plain div</div><script>window.result = ''; let textarea = document.querySelector('textarea'); textarea.addEventListener('input', () => result = textarea.value, false); let input = document.querySelector('input'); input.addEventListener('input', () => result = input.value, false);</script></body></html>`,

  // ── Pages for keyboard tests ─────────────────────────────────────────────
  // Adapted from Playwright's tests/assets/input/keyboard.html
  // Logs keydown/keypress/keyup events with key, code, location, modifiers
  "/input/keyboard": `<!DOCTYPE html><html><head><title>Keyboard test</title></head><body><textarea></textarea><script>window.result = ""; let textarea = document.querySelector('textarea'); textarea.focus(); textarea.addEventListener('keydown', event => { log('Keydown:', event.key, event.code, getLocation(event), modifiers(event)); }); textarea.addEventListener('keypress', event => { log('Keypress:', event.key, event.code, getLocation(event), event.charCode, modifiers(event)); }); textarea.addEventListener('keyup', event => { log('Keyup:', event.key, event.code, getLocation(event), modifiers(event)); }); function modifiers(event) { let m = []; if (event.altKey) m.push('Alt'); if (event.ctrlKey) m.push('Control'); if (event.shiftKey) m.push('Shift'); return '[' + m.join(' ') + ']'; } function getLocation(event) { switch (event.location) { case 0: return 'STANDARD'; case 1: return 'LEFT'; case 2: return 'RIGHT'; case 3: return 'NUMPAD'; default: return 'Unknown: ' + event.location; }; } function log(...args) { console.log.apply(console, args); window.result += args.join(' ') + '\n'; } window.getResult = function() { let temp = window.result.trim(); window.result = ""; return temp; }</script></body></html>`,

  // ── Pages for selectOption tests ─────────────────────────────────────────────

  // Select test — select element with options for selectOption tests
  // Adapted from Playwright's tests/assets/input/select.html
  "/input/select": `<!DOCTYPE html><html><head><title>Selection Test</title></head><body><select><option value="black">Black</option><option value="blue">Blue</option><option value="brown">Brown</option><option value="cyan">Cyan</option><option value="gray">Gray</option><option value="green">Green</option><option value="indigo">Indigo</option><option value="magenta">Magenta</option><option value="orange">Orange</option><option value="pink">Pink</option><option value="purple">Purple</option><option value="red">Red</option><option value="violet">Violet</option><option value="white" id="whiteOption">White</option><option value="yellow">Yellow</option></select><script>window.result = { onInput: null, onChange: null, onBubblingChange: null, onBubblingInput: null }; let select = document.querySelector('select'); function makeEmpty() { for (let i = select.options.length - 1; i >= 0; --i) { select.remove(i); } } function makeMultiple() { select.setAttribute('multiple', true); } select.addEventListener('input', () => { result.onInput = Array.from(select.querySelectorAll('option:checked')).map((option) => option.value); }, false); select.addEventListener('change', () => { result.onChange = Array.from(select.querySelectorAll('option:checked')).map((option) => option.value); }, false); document.body.addEventListener('input', () => { result.onBubblingInput = Array.from(select.querySelectorAll('option:checked')).map((option) => option.value); }, false); document.body.addEventListener('change', () => { result.onBubblingChange = Array.from(select.querySelectorAll('option:checked')).map((option) => option.value); }, false);</script></body></html>`,

  // File upload — page with a file input and a display div for the
  // selected file's name. Used by Locator.setInputFiles tests.
  "/input/fileupload": `<!DOCTYPE html><html><head><title>File Upload</title></head><body><input type="file" id="f" /><div id="result"></div><script>const input = document.getElementById('f'); input.addEventListener('change', () => { document.getElementById('result').textContent = input.files[0]?.name || 'no-file'; });</script></body></html>`,

  // ── Pages for selector engine tests ─────────────────────────────────────────────

  // Deep shadow DOM — nested shadow roots for testing >> chaining with spaces
  // Adapted from Playwright's tests/assets/deep-shadow.html
  "/deep-shadow.html": `<script>
window.addEventListener('DOMContentLoaded', () => {
  const outer = document.createElement('section');
  document.body.appendChild(outer);

  const root1 = document.createElement('div');
  root1.setAttribute('id', 'root1');
  outer.appendChild(root1);
  const shadowRoot1 = root1.attachShadow({mode: 'open'});
  const span1 = document.createElement('span');
  span1.setAttribute('data-testid', 'foo');
  span1.textContent = 'Hello from root1';
  shadowRoot1.appendChild(span1);

  const root2 = document.createElement('div');
  shadowRoot1.appendChild(root2);
  const shadowRoot2 = root2.attachShadow({mode: 'open'});
  const span2 = document.createElement('span');
  span2.setAttribute('data-testid', 'foo');
  span2.setAttribute('id', 'target');
  span2.textContent = 'Hello from root2';
  shadowRoot2.appendChild(span2);

  const root3 = document.createElement('div');
  shadowRoot1.appendChild(root3);
  const shadowRoot3 = root3.attachShadow({mode: 'open'});
  const span3 = document.createElement('span');
  span3.setAttribute('data-testid', 'foo');
  span3.textContent = 'Hello from root3';
  shadowRoot3.appendChild(span3);
  const span4 = document.createElement('span');
  span4.textContent = 'Hello from root3 #2';
  span4.setAttribute('attr', 'value space');
  shadowRoot3.appendChild(span4);
});
</script>`,

  // Shadow root with button — page with a button inside a closed shadow root
  // Used by "should click shadow root button" test
  // Adapted from Playwright's tests/assets/closed-shadow.html
  "/closed-shadow.html": `<!DOCTYPE html><html><body>
<script>
  const div = document.createElement('div');
  document.body.appendChild(div);
  const shadowRoot = div.attachShadow({mode: 'closed'});
  const button = document.createElement('button');
  button.textContent = 'Shadow button';
  button.setAttribute('id', 'shadow-btn');
  button.addEventListener('click', () => { window.__clicked = true; });
  shadowRoot.appendChild(button);
</script>
</body></html>`,

  // Shadow root with slot — page with light DOM content slotted into a shadow root
  // Used by "should click into shadow root with slotted div" test
  // Adapted from Playwright's tests/assets/shadow-with-slot.html
  "/shadow-with-slot.html": `<!DOCTYPE html><html><body>
<div id="host">
  <button id="slotted-btn">Slotted button</button>
  <template shadowrootmode="open">
    <div><slot></slot></div>
  </template>
</div>
<script>
  document.getElementById('slotted-btn').addEventListener('click', () => { window.__clicked = true; });
</script>
</body></html>`,

  // Frameset — page with a real <frameset> element. The two <frame name=...>
  // children are exposed as CDP frames (verified empirically with Chrome 149).
  // Used by "should click button inside frameset" test.
  // Adapted from Playwright's tests/assets/frameset.html
  "/frameset.html": `<!DOCTYPE html><html>
<frameset cols="50%,50%">
  <frame name="first" src="/frames/frame.html">
  <frame name="second" src="/frames/frame.html">
</frameset>
</html>`,

  // ── Pages for exposeFunction/exposeBinding tests ────────────────────────────

  // Compute page — calls window.compute(3, 2) and stores the result.
  // Used by `exposeFunction should work` and similar.
  "/compute": `<!DOCTYPE html><html><head><title>Compute test</title></head><body><h1>Compute page</h1><script>window.result = undefined; window.compute = window.compute;</script></body></html>`,

  // ── Pages for download tests ──────────────────────────────────────────────
  // The HTTP server treats /download/* as Content-Disposition: attachment
  // so the browser triggers a download. The test page that contains the
  // download link is at /download-test.html (NOT under /download/) so it
  // can be navigated to as a normal page.
  "/download-test.html": `<!DOCTYPE html><html><body><h1>Download Test</h1><a id="dl" href="/download/test.csv" download>Download CSV</a></body></html>`,
  "/download/test.csv": "id,name\n1,Alice\n2,Bob\n3,Charlie\n",

  // Nested frames container — three iframes, used by `exposeFunction should work on frames`.
  // Adapted from Playwright's tests/assets/frames/nested-frames.html.
  "/frames/nested-frames.html": `<!DOCTYPE html><html><head><title>Nested Frames</title></head><body><iframe src='./frame.html' name='one'></iframe><iframe src='./frame.html' name='two'></iframe><iframe src='./frame.html' name='three'></iframe></body></html>`,

  // Lazy-loading iframe — has loading="lazy" attribute. Used by goto
  // "should work with lazy loading iframes".
  "/frames/one-lazy-frame.html": `<!DOCTYPE html><html><head><title>Lazy Frame</title></head><body><iframe id="frame1" name="frame1" loading="lazy" src='./frame.html'></iframe></body></html>`,

  // Nested iframe — outer iframe contains an inner iframe. Used by
  // locator-frame "should work for nested iframe" tests.
  "/frames/nested-iframe.html": `<!DOCTYPE html><html><head><title>Nested Iframe</title></head><body><iframe id="outer" name="outer" src='./frame.html'><iframe id="inner" name="inner" src='./frame.html'></iframe></iframe></body></html>`,
};
