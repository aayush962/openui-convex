import { defineApp } from "convex/server";
import agent from "@convex-dev/agent/convex.config.js";
import openui from "openui-convex/convex.config.js";
const app = defineApp();
app.use(agent);
app.use(openui);
export default app;
