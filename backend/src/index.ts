import cors from "@fastify/cors";
import Fastify from "fastify";
import { HOST, PORT } from "./config.js";
import { charactersRoutes } from "./features/characters/routes.js";
import { chatsRoutes } from "./features/chats/routes/index.js";
import { locationsRoutes } from "./features/locations/routes.js";
import { characterMemoriesRoutes } from "./features/memories/routes.js";
import { storiesRoutes } from "./features/stories/routes.js";
import { canonTimelineRoutes } from "./features/timeline/routes.js";
import { aiRoutes } from "./routes/ai.js";
import { fieldDefsRoutes } from "./routes/field-defs.js";
import { ollamaRoutes } from "./routes/ollama.js";
import { settingsRoutes } from "./routes/settings.js";

const app = Fastify({ logger: { level: "info" } });

await app.register(cors, {
  origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
});

app.addContentTypeParser(
  "application/json",
  { parseAs: "string" },
  (req, body, done) => {
    try {
      done(null, JSON.parse(body as string));
    } catch (err) {
      done(err as Error, undefined);
    }
  },
);

await app.register(storiesRoutes);
await app.register(charactersRoutes);
await app.register(locationsRoutes);
await app.register(characterMemoriesRoutes);
await app.register(chatsRoutes);
await app.register(ollamaRoutes);
await app.register(settingsRoutes);
await app.register(canonTimelineRoutes);
await app.register(fieldDefsRoutes);
await app.register(aiRoutes);

app.get("/health", async () => ({ ok: true }));

try {
  await app.listen({ port: PORT, host: HOST });
  console.log(`Backend running at http://${HOST}:${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
