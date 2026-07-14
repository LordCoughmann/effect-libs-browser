/**
 * Unit tests for Locator helper functions.
 *
 * Tests the pure selector-translation logic in src/cdp/internal/Page/Locator.ts.
 * Browser-side CDP tests run via integration tests; this file covers the
 * helpers that produce selector strings without needing a browser.
 */

import { describe, it } from "@effect/vitest";
import { strictEqual } from "@effect/vitest/utils";

import {
  composeSelectors,
  getByLabelSelector,
  getByRoleSelector,
  getByTextSelector,
  getByTestIdSelector,
} from "../../../packages/browser-cdp/src/internal/Page/Locator.js";

describe("Locator - selector helpers", () => {
  describe("composeSelectors", () => {
    it("returns head when tail is empty", () => {
      strictEqual(composeSelectors("button", ""), "button");
    });

    it("joins with >> separator", () => {
      strictEqual(composeSelectors("form", "button"), "form >> button");
    });

    it("chains multiple times (idempotent on head)", () => {
      const step1 = composeSelectors("div", "span");
      const step2 = composeSelectors(step1, ".text");
      strictEqual(step2, "div >> span >> .text");
    });
  });

  describe("getByRoleSelector", () => {
    it("translates role to [role=...] selector", () => {
      strictEqual(getByRoleSelector("button"), '[role="button"]');
    });

    it("includes aria-checked when checked is set", () => {
      strictEqual(
        getByRoleSelector("checkbox", { checked: true }),
        '[role="checkbox"][aria-checked="true"]',
      );
    });

    it("includes multiple aria attributes", () => {
      strictEqual(
        getByRoleSelector("button", { pressed: true, disabled: false }),
        '[role="button"][aria-disabled="false"][aria-pressed="true"]',
      );
    });

    it("includes aria-label when name is a string", () => {
      strictEqual(
        getByRoleSelector("button", { name: "Submit" }),
        '[role="button"][aria-label="Submit"]',
      );
    });

    it("escapes quotes in role name", () => {
      strictEqual(getByRoleSelector('weird"role'), '[role="weird\\"role"]');
    });

    it("escapes backslashes in role name", () => {
      strictEqual(getByRoleSelector("role\\with"), '[role="role\\\\with"]');
    });
  });

  describe("getByTextSelector", () => {
    it("translates string to text=...", () => {
      strictEqual(getByTextSelector("hello"), 'text="hello"');
    });

    it("quotes string value", () => {
      strictEqual(getByTextSelector("hello world"), 'text="hello world"');
    });

    it("translates RegExp to text=/.../flags", () => {
      strictEqual(getByTextSelector(/hello/i), "text=/hello/i");
    });

    it("preserves regex flags", () => {
      strictEqual(getByTextSelector(/foo/gim), "text=/foo/gim");
    });
  });

  describe("getByLabelSelector", () => {
    it("translates string to [aria-label=...]", () => {
      strictEqual(getByLabelSelector("Email"), '[aria-label="Email"]');
    });

    it("translates RegExp to bare [aria-label]", () => {
      strictEqual(getByLabelSelector(/.*/), "[aria-label]");
    });
  });

  describe("getByTestIdSelector", () => {
    it("translates string to [data-testid=...]", () => {
      strictEqual(getByTestIdSelector("submit"), '[data-testid="submit"]');
    });

    it("translates RegExp to bare [data-testid]", () => {
      strictEqual(getByTestIdSelector(/test.*/), "[data-testid]");
    });
  });
});
