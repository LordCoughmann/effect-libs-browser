import { spawn } from '../../../../mocks/childProcess.js';

function spawnAsync(cmd, args, options = {}) {
  const process = spawn(cmd, args, Object.assign({ windowsHide: true }, options));
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    if (process.stdout)
      process.stdout.on("data", (data) => stdout += data.toString());
    if (process.stderr)
      process.stderr.on("data", (data) => stderr += data.toString());
    process.on("close", (code) => resolve({ stdout, stderr, code }));
    process.on("error", (error) => resolve({ stdout, stderr, code: 0, error }));
  });
}

export { spawnAsync };
