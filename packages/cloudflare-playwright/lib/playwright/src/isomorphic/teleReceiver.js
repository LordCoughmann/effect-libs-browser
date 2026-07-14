({
  reporter: [[process.env.CI ? "dot" : "list"]]});
function computeTestCaseOutcome(test) {
  let skipped = 0;
  let expected = 0;
  let unexpected = 0;
  for (const result of test.results) {
    if (result.status === "interrupted") ; else if (result.status === "skipped" && test.expectedStatus === "skipped") {
      ++skipped;
    } else if (result.status === "skipped") ; else if (result.status === test.expectedStatus) {
      ++expected;
    } else {
      ++unexpected;
    }
  }
  if (expected === 0 && unexpected === 0)
    return "skipped";
  if (unexpected === 0)
    return "expected";
  if (expected === 0 && skipped === 0)
    return "unexpected";
  return "flaky";
}

export { computeTestCaseOutcome };
