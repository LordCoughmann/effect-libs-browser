import { isRegExp } from '../../utils/isomorphic/rtti.js';
import { colors } from '../../utilsBundle.js';
import { isString } from '../../utils/isomorphic/stringUtils.js';

function serializeExpectedTextValues(items, options = {}) {
  return items.map((i) => ({
    string: isString(i) ? i : void 0,
    regexSource: isRegExp(i) ? i.source : void 0,
    regexFlags: isRegExp(i) ? i.flags : void 0,
    matchSubstring: options.matchSubstring,
    ignoreCase: options.ignoreCase,
    normalizeWhiteSpace: options.normalizeWhiteSpace
  }));
}
const printSubstring = (val) => val.replace(/"|\\/g, "\\$&");
const printReceivedStringContainExpectedSubstring = (utils, received, start, length) => utils.RECEIVED_COLOR(
  '"' + printSubstring(received.slice(0, start)) + utils.INVERTED_COLOR(printSubstring(received.slice(start, start + length))) + printSubstring(received.slice(start + length)) + '"'
);
const printReceivedStringContainExpectedResult = (utils, received, result) => result === null ? utils.printReceived(received) : printReceivedStringContainExpectedSubstring(
  utils,
  received,
  result.index,
  result[0].length
);
function formatMatcherMessage(utils, details) {
  const receiver = details.receiver ?? (details.locator ? "locator" : "page");
  let message = utils.DIM_COLOR("expect(") + utils.RECEIVED_COLOR(receiver) + utils.DIM_COLOR(")" + (details.promise ? "." + details.promise : "") + (details.isNot ? ".not" : "") + ".") + details.matcherName + utils.DIM_COLOR("(") + utils.EXPECTED_COLOR(details.expectation) + utils.DIM_COLOR(")") + " failed\n\n";
  const diffLines = details.printedDiff?.split("\n");
  if (diffLines?.length === 2) {
    details.printedExpected = diffLines[0];
    details.printedReceived = diffLines[1];
    details.printedDiff = void 0;
  }
  const align = !details.errorMessage && details.printedExpected?.startsWith("Expected:") && (!details.printedReceived || details.printedReceived.startsWith("Received:"));
  if (details.locator)
    message += `Locator: ${align ? " " : ""}${details.locator}
`;
  if (details.printedExpected)
    message += details.printedExpected + "\n";
  if (details.printedReceived)
    message += details.printedReceived + "\n";
  if (details.timedOut && details.timeout)
    message += `Timeout: ${align ? " " : ""}${details.timeout}ms
`;
  if (details.printedDiff)
    message += details.printedDiff + "\n";
  if (details.errorMessage) {
    message += details.errorMessage;
    if (!details.errorMessage.endsWith("\n"))
      message += "\n";
  }
  message += callLogText(utils, details.log);
  return message;
}
const callLogText = (utils, log) => {
  if (!log || !log.some((l) => !!l))
    return "";
  return `
Call log:
${utils.DIM_COLOR(log.join("\n"))}
`;
};
({
  DIM_COLOR: colors.dim,
  RECEIVED_COLOR: colors.red,
  EXPECTED_COLOR: colors.green,
  INVERTED_COLOR: colors.inverse});

export { callLogText, formatMatcherMessage, printReceivedStringContainExpectedResult, printReceivedStringContainExpectedSubstring, serializeExpectedTextValues };
