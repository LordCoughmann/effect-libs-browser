import { serializeError } from '../util.js';

function testInfoError(error) {
  return serializeError(error);
}

export { testInfoError };
