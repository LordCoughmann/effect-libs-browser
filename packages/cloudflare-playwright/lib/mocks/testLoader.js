import { _rootSuites } from '../internal.js';

async function loadTestFile(file) {
  const suite = _rootSuites.find((s) => s._requireFile === file);
  if (!suite)
    throw new Error(`Test file not found: ${file}`);
  return suite;
}

export { loadTestFile };
