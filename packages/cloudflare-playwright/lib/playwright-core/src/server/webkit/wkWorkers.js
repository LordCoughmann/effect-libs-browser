import { eventsHelper } from '../utils/eventsHelper.js';
import { Worker } from '../page.js';
import { WKSession } from './wkConnection.js';
import { WKExecutionContext, createHandle } from './wkExecutionContext.js';

class WKWorkers {
  constructor(page) {
    this._sessionListeners = [];
    this._workerSessions = /* @__PURE__ */ new Map();
    this._page = page;
  }
  setSession(session) {
    eventsHelper.removeEventListeners(this._sessionListeners);
    this.clear();
    this._sessionListeners = [
      eventsHelper.addEventListener(session, "Worker.workerCreated", (event) => {
        const worker = new Worker(this._page, event.url);
        const workerSession = new WKSession(session.connection, event.workerId, (message) => {
          session.send("Worker.sendMessageToWorker", {
            workerId: event.workerId,
            message: JSON.stringify(message)
          }).catch((e) => {
            workerSession.dispatchMessage({ id: message.id, error: { message: e.message } });
          });
        });
        this._workerSessions.set(event.workerId, workerSession);
        worker.createExecutionContext(new WKExecutionContext(workerSession, void 0));
        worker.workerScriptLoaded();
        this._page.addWorker(event.workerId, worker);
        workerSession.on("Console.messageAdded", (event2) => this._onConsoleMessage(worker, event2));
        Promise.all([
          workerSession.send("Runtime.enable"),
          workerSession.send("Console.enable"),
          session.send("Worker.initialized", { workerId: event.workerId })
        ]).catch((e) => {
          this._page.removeWorker(event.workerId);
        });
      }),
      eventsHelper.addEventListener(session, "Worker.dispatchMessageFromWorker", (event) => {
        const workerSession = this._workerSessions.get(event.workerId);
        if (!workerSession)
          return;
        workerSession.dispatchMessage(JSON.parse(event.message));
      }),
      eventsHelper.addEventListener(session, "Worker.workerTerminated", (event) => {
        const workerSession = this._workerSessions.get(event.workerId);
        if (!workerSession)
          return;
        workerSession.dispose();
        this._workerSessions.delete(event.workerId);
        this._page.removeWorker(event.workerId);
      })
    ];
  }
  clear() {
    this._page.clearWorkers();
    this._workerSessions.clear();
  }
  async initializeSession(session) {
    await session.send("Worker.enable");
  }
  async _onConsoleMessage(worker, event) {
    const { type, level, text, parameters, url, line: lineNumber, column: columnNumber } = event.message;
    let derivedType = type || "";
    if (type === "log")
      derivedType = level;
    else if (type === "timing")
      derivedType = "timeEnd";
    const handles = (parameters || []).map((p) => {
      return createHandle(worker.existingExecutionContext, p);
    });
    const location = {
      url: url || "",
      lineNumber: (lineNumber || 1) - 1,
      columnNumber: (columnNumber || 1) - 1
    };
    this._page.addConsoleMessage(worker, derivedType, handles, location, handles.length ? void 0 : text);
  }
}

export { WKWorkers };
