import require$$0 from '../../../../_virtual/inspector.js';
import fs from 'node:fs';
import path__default from 'node:path';

const profileDir = process.env.PWTEST_PROFILE_DIR || "";
let session;
async function startProfiling() {
  if (!profileDir)
    return;
  session = new (require$$0).Session();
  session.connect();
  await new Promise((f) => {
    session.post("Profiler.enable", () => {
      session.post("Profiler.start", f);
    });
  });
}
async function stopProfiling(profileName) {
  if (!profileDir)
    return;
  await new Promise((f) => session.post("Profiler.stop", (err, { profile }) => {
    if (!err) {
      fs.mkdirSync(profileDir, { recursive: true });
      fs.writeFileSync(path__default.join(profileDir, profileName + ".json"), JSON.stringify(profile));
    }
    f();
  }));
}

export { startProfiling, stopProfiling };
