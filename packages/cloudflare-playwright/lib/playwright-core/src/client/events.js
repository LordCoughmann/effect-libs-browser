const Events = {
  AndroidDevice: {
    WebView: "webview",
    Close: "close"
  },
  AndroidSocket: {
    Data: "data",
    Close: "close"
  },
  AndroidWebView: {
    Close: "close"
  },
  Browser: {
    Disconnected: "disconnected"
  },
  BrowserContext: {
    Console: "console",
    Close: "close",
    Dialog: "dialog",
    Page: "page",
    // Can't use just 'error' due to node.js special treatment of error events.
    // @see https://nodejs.org/api/events.html#events_error_events
    WebError: "weberror",
    // Deprecated in v1.56, never emitted anymore.
    ServiceWorker: "serviceworker",
    Request: "request",
    Response: "response",
    RequestFailed: "requestfailed",
    RequestFinished: "requestfinished"
  },
  Page: {
    Close: "close",
    Crash: "crash",
    Console: "console",
    Dialog: "dialog",
    Download: "download",
    FileChooser: "filechooser",
    DOMContentLoaded: "domcontentloaded",
    // Can't use just 'error' due to node.js special treatment of error events.
    // @see https://nodejs.org/api/events.html#events_error_events
    PageError: "pageerror",
    Request: "request",
    Response: "response",
    RequestFailed: "requestfailed",
    RequestFinished: "requestfinished",
    FrameAttached: "frameattached",
    FrameDetached: "framedetached",
    FrameNavigated: "framenavigated",
    Load: "load",
    Popup: "popup",
    WebSocket: "websocket",
    Worker: "worker"
  },
  PageAgent: {
    Turn: "turn"
  },
  WebSocket: {
    Close: "close",
    Error: "socketerror",
    FrameReceived: "framereceived",
    FrameSent: "framesent"
  },
  Worker: {
    Close: "close",
    Console: "console"
  },
  ElectronApplication: {
    Close: "close",
    Console: "console",
    Window: "window"
  }
};

export { Events };
