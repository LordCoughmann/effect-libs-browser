import fs from 'node:fs';

const kBindingName = "__pw_devtools__";
class CRDevTools {
  constructor(preferencesPath) {
    this._preferencesPath = preferencesPath;
    this._savePromise = Promise.resolve();
  }
  install(session) {
    session.on("Runtime.bindingCalled", async (event) => {
      if (event.name !== kBindingName)
        return;
      const parsed = JSON.parse(event.payload);
      let result = void 0;
      if (parsed.method === "getPreferences") {
        if (this._prefs === void 0) {
          try {
            const json = await fs.promises.readFile(this._preferencesPath, "utf8");
            this._prefs = JSON.parse(json);
          } catch (e) {
            this._prefs = {};
          }
        }
        result = this._prefs;
      } else if (parsed.method === "setPreference") {
        this._prefs[parsed.params[0]] = parsed.params[1];
        this._save();
      } else if (parsed.method === "removePreference") {
        delete this._prefs[parsed.params[0]];
        this._save();
      } else if (parsed.method === "clearPreferences") {
        this._prefs = {};
        this._save();
      }
      session.send("Runtime.evaluate", {
        expression: `window.DevToolsAPI.embedderMessageAck(${parsed.id}, ${JSON.stringify(result)})`,
        contextId: event.executionContextId
      }).catch((e) => null);
    });
    Promise.all([
      session.send("Runtime.enable"),
      session.send("Runtime.addBinding", { name: kBindingName }),
      session.send("Page.enable"),
      session.send("Page.addScriptToEvaluateOnNewDocument", { source: `
        (() => {
          const init = () => {
            // Lazy init happens when InspectorFrontendHost is initialized.
            // At this point DevToolsHost is ready to be used.
            const host = window.DevToolsHost;
            const old = host.sendMessageToEmbedder.bind(host);
            host.sendMessageToEmbedder = message => {
              if (['getPreferences', 'setPreference', 'removePreference', 'clearPreferences'].includes(JSON.parse(message).method))
                window.${kBindingName}(message);
              else
                old(message);
            };
          };
          let value;
          Object.defineProperty(window, 'InspectorFrontendHost', {
            configurable: true,
            enumerable: true,
            get() { return value; },
            set(v) { value = v; init(); },
          });
        })()
      ` }),
      session.send("Runtime.runIfWaitingForDebugger")
    ]).catch((e) => null);
  }
  _save() {
    this._savePromise = this._savePromise.then(async () => {
      await fs.promises.writeFile(this._preferencesPath, JSON.stringify(this._prefs)).catch((e) => null);
    });
  }
}

export { CRDevTools };
