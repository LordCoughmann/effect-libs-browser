function generateCode(actions, languageGenerator, options) {
  const header = languageGenerator.generateHeader(options);
  const footer = languageGenerator.generateFooter(options.saveStorage);
  const actionTexts = actions.map((a) => generateActionText(languageGenerator, a, !!options.generateAutoExpect)).filter(Boolean);
  const text = [header, ...actionTexts, footer].join("\n");
  return { header, footer, actionTexts, text };
}
function generateActionText(generator, action, generateAutoExpect) {
  let text = generator.generateAction(action);
  if (!text)
    return;
  if (generateAutoExpect && action.action.preconditionSelector) {
    const expectAction = {
      frame: action.frame,
      startTime: action.startTime,
      endTime: action.startTime,
      action: {
        name: "assertVisible",
        selector: action.action.preconditionSelector,
        signals: []
      }
    };
    const expectText = generator.generateAction(expectAction);
    if (expectText)
      text = expectText + "\n\n" + text;
  }
  return text;
}
function sanitizeDeviceOptions(device, options) {
  const cleanedOptions = {};
  for (const property in options) {
    if (JSON.stringify(device[property]) !== JSON.stringify(options[property]))
      cleanedOptions[property] = options[property];
  }
  return cleanedOptions;
}
function toSignalMap(action) {
  let popup;
  let download;
  let dialog;
  for (const signal of action.signals) {
    if (signal.name === "popup")
      popup = signal;
    else if (signal.name === "download")
      download = signal;
    else if (signal.name === "dialog")
      dialog = signal;
  }
  return {
    popup,
    download,
    dialog
  };
}
function toKeyboardModifiers(modifiers) {
  const result = [];
  if (modifiers & 1)
    result.push("Alt");
  if (modifiers & 2)
    result.push("ControlOrMeta");
  if (modifiers & 4)
    result.push("ControlOrMeta");
  if (modifiers & 8)
    result.push("Shift");
  return result;
}
function toClickOptionsForSourceCode(action) {
  const modifiers = toKeyboardModifiers(action.modifiers);
  const options = {};
  if (action.button !== "left")
    options.button = action.button;
  if (modifiers.length)
    options.modifiers = modifiers;
  if (action.clickCount > 2)
    options.clickCount = action.clickCount;
  if (action.position)
    options.position = action.position;
  return options;
}

export { generateCode, sanitizeDeviceOptions, toClickOptionsForSourceCode, toKeyboardModifiers, toSignalMap };
