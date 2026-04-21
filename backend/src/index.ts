import Fastify from 'fastify'
import cors from '@fastify/cors'
import { PORT, HOST } from './config.js'
import { storiesRoutes } from './routes/stories.js'
import { charactersRoutes } from './routes/characters.js'
import { locationsRoutes } from './routes/locations.js'
import { characterMemoriesRoutes } from './routes/character-memories.js'
import { chatsRoutes } from './routes/chats.js'
import { ollamaRoutes } from './routes/ollama.js'
import { settingsRoutes } from './routes/settings.js'
import { canonTimelineRoutes } from './routes/canon-timeline.js'

const app = Fastify({ logger: { level: 'info' } })

await app.register(cors, {
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
})

app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
  try {
    done(null, JSON.parse(body as string))
  } catch (err) {
    done(err as Error, undefined)
  }
})

await app.register(storiesRoutes)
await app.register(charactersRoutes)
await app.register(locationsRoutes)
await app.register(characterMemoriesRoutes)
await app.register(chatsRoutes)
await app.register(ollamaRoutes)
await app.register(settingsRoutes)
await app.register(canonTimelineRoutes)

app.get('/health', async () => ({ ok: true }))

try {
  await app.listen({ port: PORT, host: HOST })
  console.log(`Backend running at http://${HOST}:${PORT}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
