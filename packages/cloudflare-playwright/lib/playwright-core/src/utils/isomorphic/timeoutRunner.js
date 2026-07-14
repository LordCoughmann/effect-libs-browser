import { monotonicTime } from './time.js';

async function raceAgainstDeadline(cb, deadline) {
  let timer;
  return Promise.race([
    cb().then((result) => {
      return { result, timedOut: false };
    }),
    new Promise((resolve) => {
      const kMaxDeadline = 2147483647;
      const timeout = (deadline || kMaxDeadline) - monotonicTime();
      timer = setTimeout(() => resolve({ timedOut: true }), timeout);
    })
  ]).finally(() => {
    clearTimeout(timer);
  });
}
async function pollAgainstDeadline(callback, deadline, pollIntervals = [100, 250, 500, 1e3]) {
  const lastPollInterval = pollIntervals.pop() ?? 1e3;
  let lastResult;
  const wrappedCallback = () => Promise.resolve().then(callback);
  while (true) {
    const time = monotonicTime();
    if (deadline && time >= deadline)
      break;
    const received = await raceAgainstDeadline(wrappedCallback, deadline);
    if (received.timedOut)
      break;
    lastResult = received.result.result;
    if (!received.result.continuePolling)
      return { result: lastResult, timedOut: false };
    const interval = pollIntervals.shift() ?? lastPollInterval;
    if (deadline && deadline <= monotonicTime() + interval)
      break;
    await new Promise((x) => setTimeout(x, interval));
  }
  return { timedOut: true, result: lastResult };
}

export { pollAgainstDeadline, raceAgainstDeadline };
