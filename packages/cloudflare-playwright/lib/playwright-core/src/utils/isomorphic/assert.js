function assert(value, message) {
  if (!value)
    throw new Error(message || "Assertion error");
}

export { assert };
