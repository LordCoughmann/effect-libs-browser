import { CSharpLanguageGenerator } from './csharp.js';
import { JavaLanguageGenerator } from './java.js';
import { JavaScriptLanguageGenerator } from './javascript.js';
import { JsonlLanguageGenerator } from './jsonl.js';
import { PythonLanguageGenerator } from './python.js';

function languageSet() {
  return /* @__PURE__ */ new Set([
    new JavaScriptLanguageGenerator(
      /* isPlaywrightTest */
      true
    ),
    new JavaScriptLanguageGenerator(
      /* isPlaywrightTest */
      false
    ),
    new PythonLanguageGenerator(
      /* isAsync */
      false,
      /* isPytest */
      true
    ),
    new PythonLanguageGenerator(
      /* isAsync */
      false,
      /* isPytest */
      false
    ),
    new PythonLanguageGenerator(
      /* isAsync */
      true,
      /* isPytest */
      false
    ),
    new CSharpLanguageGenerator("mstest"),
    new CSharpLanguageGenerator("nunit"),
    new CSharpLanguageGenerator("library"),
    new JavaLanguageGenerator("junit"),
    new JavaLanguageGenerator("library"),
    new JsonlLanguageGenerator()
  ]);
}

export { languageSet };
