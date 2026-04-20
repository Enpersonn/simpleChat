import type { FastifyInstance } from 'fastify'
import { AppSettingsSchema } from '@simplechat/types'
import { getSettings, saveSettings } from '../config.js'

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/settings', async () => {
    return getSettings()
  })

  app.patch('/settings', async (req, reply) => {
    const current = await getSettings()
    const merged = { ...current, ...(req.body as object) }
    const parsed = AppSettingsSchema.safeParse(merged)
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    await saveSettings(parsed.data)
    return parsed.data
  })
}
