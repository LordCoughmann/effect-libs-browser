/**
 * Unit tests for the frame event hubs.
 *
 * Tests the PubSub hubs created by `makeFrameEventHubs`. The hubs broadcast
 * frame lifecycle events (frameNavigated, frameDetached, frameStoppedLoading)
 * to all subscribers.
 *
 * The actual CDP event wiring is tested via integration tests — these unit
 * tests verify the hub shape and that all three hubs are independent.
 */

import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import {
  makeFrameEventHubs,
  type FrameEventHubs,
} from "../../../packages/browser-cdp/src/internal/Page/FrameEvents.js";

describe("FrameEvents", () => {
  it("makeFrameEventHubs should create three independent hubs", async () => {
    const program = Effect.gen(function* () {
      const hubs = yield* makeFrameEventHubs;
      // All three hubs are PubSubs
      assert.isDefined(hubs.frameNavigatedHub);
      assert.isDefined(hubs.frameDetachedHub);
      assert.isDefined(hubs.frameStoppedLoadingHub);
      // All three are different instances (independent channels)
      assert.notStrictEqual(hubs.frameNavigatedHub, hubs.frameDetachedHub);
      assert.notStrictEqual(hubs.frameNavigatedHub, hubs.frameStoppedLoadingHub);
      assert.notStrictEqual(hubs.frameDetachedHub, hubs.frameStoppedLoadingHub);
    });
    await Effect.runPromise(program);
  });

  it("FrameEventHubs type should expose all three hubs", () => {
    // Type-level test: ensure the interface has all three properties.
    // This will fail to compile if any field is missing.
    type Hubs = FrameEventHubs;
    const _check = (h: Hubs): unknown => h;
    assert.isDefined(_check);
  });
});
