import { Worker } from '../page.js';
import { CRExecutionContext, createHandle } from './crExecutionContext.js';
import { CRNetworkManager } from './crNetworkManager.js';
import { BrowserContext } from '../browserContext.js';
import { Route } from '../network.js';
import { ConsoleMessage } from '../console.js';
import { toConsoleMessageLocation } from './crProtocolHelper.js';

class CRServiceWorker extends Worker {
  constructor(browserContext, session, url) {
    super(browserContext, url);
    this._session = session;
    this.browserContext = browserContext;
    if (!process.env.PLAYWRIGHT_DISABLE_SERVICE_WORKER_NETWORK)
      this._networkManager = new CRNetworkManager(null, this);
    session.once("Runtime.executionContextCreated", (event) => {
      this.createExecutionContext(new CRExecutionContext(session, event.context));
    });
    if (this.browserContext._browser.majorVersion() >= 143)
      session.on("Inspector.workerScriptLoaded", () => this.workerScriptLoaded());
    else
      this.workerScriptLoaded();
    if (this._networkManager && this._isNetworkInspectionEnabled()) {
      this.updateRequestInterception();
      this.updateExtraHTTPHeaders();
      this.updateHttpCredentials();
      this.updateOffline();
      this._networkManager.addSession(
        session,
        void 0,
        true
        /* isMain */
      ).catch(() => {
      });
    }
    session.on("Runtime.consoleAPICalled", (event) => {
      if (!this.existingExecutionContext || process.env.PLAYWRIGHT_DISABLE_SERVICE_WORKER_CONSOLE)
        return;
      const args = event.args.map((o) => createHandle(this.existingExecutionContext, o));
      const message = new ConsoleMessage(null, this, event.type, void 0, args, toConsoleMessageLocation(event.stackTrace));
      this.browserContext.emit(BrowserContext.Events.Console, message);
    });
    session.send("Runtime.enable", {}).catch((e) => {
    });
    session.send("Runtime.runIfWaitingForDebugger").catch((e) => {
    });
    session.on("Inspector.targetReloadedAfterCrash", () => {
      session._sendMayFail("Runtime.runIfWaitingForDebugger", {});
    });
  }
  didClose() {
    this._networkManager?.removeSession(this._session);
    this._session.dispose();
    super.didClose();
  }
  async updateOffline() {
    if (!this._isNetworkInspectionEnabled())
      return;
    await this._networkManager?.setOffline(!!this.browserContext._options.offline).catch(() => {
    });
  }
  async updateHttpCredentials() {
    if (!this._isNetworkInspectionEnabled())
      return;
    await this._networkManager?.authenticate(this.browserContext._options.httpCredentials || null).catch(() => {
    });
  }
  async updateExtraHTTPHeaders() {
    if (!this._isNetworkInspectionEnabled())
      return;
    await this._networkManager?.setExtraHTTPHeaders(this.browserContext._options.extraHTTPHeaders || []).catch(() => {
    });
  }
  async updateRequestInterception() {
    if (!this._isNetworkInspectionEnabled())
      return;
    await this._networkManager?.setRequestInterception(this.needsRequestInterception()).catch(() => {
    });
  }
  needsRequestInterception() {
    return this._isNetworkInspectionEnabled() && this.browserContext.requestInterceptors.length > 0;
  }
  reportRequestFinished(request, response) {
    this.browserContext.emit(BrowserContext.Events.RequestFinished, { request, response });
  }
  requestFailed(request, _canceled) {
    this.browserContext.emit(BrowserContext.Events.RequestFailed, request);
  }
  requestReceivedResponse(response) {
    this.browserContext.emit(BrowserContext.Events.Response, response);
  }
  requestStarted(request, route) {
    this.browserContext.emit(BrowserContext.Events.Request, request);
    if (route)
      new Route(request, route).handle(this.browserContext.requestInterceptors);
  }
  _isNetworkInspectionEnabled() {
    return this.browserContext._options.serviceWorkers !== "block";
  }
}

export { CRServiceWorker };
