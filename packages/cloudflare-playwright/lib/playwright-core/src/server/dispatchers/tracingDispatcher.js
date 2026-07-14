import { ArtifactDispatcher } from './artifactDispatcher.js';
import { Dispatcher } from './dispatcher.js';

class TracingDispatcher extends Dispatcher {
  constructor(scope, tracing) {
    super(scope, tracing, "Tracing", {});
    this._type_Tracing = true;
    this._started = false;
  }
  static from(scope, tracing) {
    const result = scope.connection.existingDispatcher(tracing);
    return result || new TracingDispatcher(scope, tracing);
  }
  async tracingStart(params, progress) {
    this._object.start(params);
    this._started = true;
  }
  async tracingStartChunk(params, progress) {
    return await this._object.startChunk(progress, params);
  }
  async tracingGroup(params, progress) {
    const { name, location } = params;
    this._object.group(name, location, progress.metadata);
  }
  async tracingGroupEnd(params, progress) {
    this._object.groupEnd();
  }
  async tracingStopChunk(params, progress) {
    const { artifact, entries } = await this._object.stopChunk(progress, params);
    return { artifact: artifact ? ArtifactDispatcher.from(this, artifact) : void 0, entries };
  }
  async tracingStop(params, progress) {
    this._started = false;
    await this._object.stop(progress);
  }
  _onDispose() {
    if (this._started)
      this._object.stopChunk(void 0, { mode: "discard" }).then(() => this._object.stop(void 0)).catch(() => {
      });
    this._started = false;
  }
}

export { TracingDispatcher };
