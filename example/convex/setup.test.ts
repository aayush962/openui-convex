/// <reference types="vite/client" />
import { test } from "vitest";
import { convexTest } from "convex-test";
import { defineSchema } from "convex/server";
import openui from "openui-convex/test";
import agent from "@convex-dev/agent/test";

const modules = import.meta.glob("./**/*.*s");

/** Apps that test code using the component register it, plus every other component the app installs. */
export function initConvexTest() {
  const t = convexTest(defineSchema({}), modules);
  openui.register(t);
  agent.register(t);
  return t;
}

test("setup", () => {});
