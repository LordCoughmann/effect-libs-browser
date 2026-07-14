function makeWaitForNextTask() {
  if (process.versions.electron)
    return (callback) => setTimeout(callback, 0);
  if (parseInt(process.versions.node, 10) >= 11)
    return setImmediate;
  let spinning = false;
  const callbacks = [];
  const loop = () => {
    const callback = callbacks.shift();
    if (!callback) {
      spinning = false;
      return;
    }
    setImmediate(loop);
    callback();
  };
  return (callback) => {
    callbacks.push(callback);
    if (!spinning) {
      spinning = true;
      setImmediate(loop);
    }
  };
}

export { makeWaitForNextTask };
