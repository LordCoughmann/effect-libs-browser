var Session;
((Session2) => {
  ((UserPromptHandlerType2) => {
    UserPromptHandlerType2["Accept"] = "accept";
    UserPromptHandlerType2["Dismiss"] = "dismiss";
    UserPromptHandlerType2["Ignore"] = "ignore";
  })(Session2.UserPromptHandlerType || (Session2.UserPromptHandlerType = {}));
})(Session || (Session = {}));
var BrowsingContext;
((BrowsingContext2) => {
  ((ReadinessState2) => {
    ReadinessState2["None"] = "none";
    ReadinessState2["Interactive"] = "interactive";
    ReadinessState2["Complete"] = "complete";
  })(BrowsingContext2.ReadinessState || (BrowsingContext2.ReadinessState = {}));
})(BrowsingContext || (BrowsingContext = {}));
((BrowsingContext2) => {
  ((UserPromptType2) => {
    UserPromptType2["Alert"] = "alert";
    UserPromptType2["Beforeunload"] = "beforeunload";
    UserPromptType2["Confirm"] = "confirm";
    UserPromptType2["Prompt"] = "prompt";
  })(BrowsingContext2.UserPromptType || (BrowsingContext2.UserPromptType = {}));
})(BrowsingContext || (BrowsingContext = {}));
((BrowsingContext2) => {
  ((CreateType2) => {
    CreateType2["Tab"] = "tab";
    CreateType2["Window"] = "window";
  })(BrowsingContext2.CreateType || (BrowsingContext2.CreateType = {}));
})(BrowsingContext || (BrowsingContext = {}));
var Emulation;
((Emulation2) => {
  ((ForcedColorsModeTheme2) => {
    ForcedColorsModeTheme2["Light"] = "light";
    ForcedColorsModeTheme2["Dark"] = "dark";
  })(Emulation2.ForcedColorsModeTheme || (Emulation2.ForcedColorsModeTheme = {}));
})(Emulation || (Emulation = {}));
((Emulation2) => {
  ((ScreenOrientationNatural2) => {
    ScreenOrientationNatural2["Portrait"] = "portrait";
    ScreenOrientationNatural2["Landscape"] = "landscape";
  })(Emulation2.ScreenOrientationNatural || (Emulation2.ScreenOrientationNatural = {}));
})(Emulation || (Emulation = {}));
var Network;
((Network2) => {
  ((CollectorType2) => {
    CollectorType2["Blob"] = "blob";
  })(Network2.CollectorType || (Network2.CollectorType = {}));
})(Network || (Network = {}));
((Network2) => {
  ((SameSite2) => {
    SameSite2["Strict"] = "strict";
    SameSite2["Lax"] = "lax";
    SameSite2["None"] = "none";
    SameSite2["Default"] = "default";
  })(Network2.SameSite || (Network2.SameSite = {}));
})(Network || (Network = {}));
((Network2) => {
  ((DataType2) => {
    DataType2["Request"] = "request";
    DataType2["Response"] = "response";
  })(Network2.DataType || (Network2.DataType = {}));
})(Network || (Network = {}));
((Network2) => {
  ((InterceptPhase2) => {
    InterceptPhase2["BeforeRequestSent"] = "beforeRequestSent";
    InterceptPhase2["ResponseStarted"] = "responseStarted";
    InterceptPhase2["AuthRequired"] = "authRequired";
  })(Network2.InterceptPhase || (Network2.InterceptPhase = {}));
})(Network || (Network = {}));
var Script;
((Script2) => {
  ((ResultOwnership2) => {
    ResultOwnership2["Root"] = "root";
    ResultOwnership2["None"] = "none";
  })(Script2.ResultOwnership || (Script2.ResultOwnership = {}));
})(Script || (Script = {}));
var Log;
((Log2) => {
  ((Level2) => {
    Level2["Debug"] = "debug";
    Level2["Info"] = "info";
    Level2["Warn"] = "warn";
    Level2["Error"] = "error";
  })(Log2.Level || (Log2.Level = {}));
})(Log || (Log = {}));
var Input;
((Input2) => {
  ((PointerType2) => {
    PointerType2["Mouse"] = "mouse";
    PointerType2["Pen"] = "pen";
    PointerType2["Touch"] = "touch";
  })(Input2.PointerType || (Input2.PointerType = {}));
})(Input || (Input = {}));

export { BrowsingContext, Emulation, Input, Log, Network, Script, Session };
