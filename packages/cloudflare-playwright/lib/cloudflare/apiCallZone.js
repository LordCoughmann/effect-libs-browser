import { AsyncLocalStorage } from 'node:async_hooks';

const apiCallZone = new AsyncLocalStorage();

export { apiCallZone };
