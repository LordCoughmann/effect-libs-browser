import { Dispatcher } from './dispatcher.js';
import { PageDispatcher } from './pageDispatcher.js';

class DialogDispatcher extends Dispatcher {
  constructor(scope, dialog) {
    const page = PageDispatcher.fromNullable(scope, dialog.page().initializedOrUndefined());
    super(page || scope, dialog, "Dialog", {
      page,
      type: dialog.type(),
      message: dialog.message(),
      defaultValue: dialog.defaultValue()
    });
    this._type_Dialog = true;
  }
  async accept(params, progress) {
    await progress.race(this._object.accept(params.promptText));
  }
  async dismiss(params, progress) {
    await progress.race(this._object.dismiss());
  }
}

export { DialogDispatcher };
