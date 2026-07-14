/**
 * @license
 * Copyright 2024 Google Inc.
 * Modifications copyright (c) Microsoft Corporation.
 * SPDX-License-Identifier: Apache-2.0
 */
var Permissions;
((Permissions2) => {
  ((PermissionState2) => {
    PermissionState2["Granted"] = "granted";
    PermissionState2["Denied"] = "denied";
    PermissionState2["Prompt"] = "prompt";
  })(Permissions2.PermissionState || (Permissions2.PermissionState = {}));
})(Permissions || (Permissions = {}));

export { Permissions };
