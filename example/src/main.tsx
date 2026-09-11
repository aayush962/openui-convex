import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import Chat from "./pages/Chat";
import "@openuidev/react-ui/styles/index.css";
import "./styles.css";

const url = import.meta.env.VITE_CONVEX_URL as string | undefined;
if (!url) throw new Error("VITE_CONVEX_URL is not set — run `npx convex dev` and check .env.local");
const convex = new ConvexReactClient(url);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <Chat />
    </ConvexProvider>
  </StrictMode>,
);
