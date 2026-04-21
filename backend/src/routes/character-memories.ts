import type { FastifyInstance } from 'fastify'
import { CharacterMemoryCreateSchema, CharacterMemoryUpdateSchema } from '@simplechat/types'
import * as storage from '../storage.js'

export async function characterMemoriesRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string; cid: string } }>(
    '/stories/:id/characters/:cid/memories',
    async (req) => {
      return storage.listCharacterMemories(req.params.id, req.params.cid)
    },
  )

  app.get<{ Params: { id: string; cid: string }; Querystring: { from?: string } }>(
    '/stories/:id/characters/:cid/memories/chain',
    async (req, reply) => {
      const { id, cid } = req.params
      const { from } = req.query
      if (from) {
        return storage.getMemoryChain(id, cid, from)
      }
      // No anchor: return full chain from natural head
      const heads = await storage.getMemoryHeads(id, cid)
      if (heads.length === 0) return []
      const head = heads.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
      return storage.getMemoryChain(id, cid, head.id)
    },
  )

  app.post<{ Params: { id: string; cid: string } }>(
    '/stories/:id/characters/:cid/memories',
    async (req, reply) => {
      const body = CharacterMemoryCreateSchema.safeParse(req.body)
      if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
      const memory = await storage.addCharacterMemory(req.params.id, req.params.cid, body.data)
      return reply.status(201).send(memory)
    },
  )

  app.patch<{ Params: { id: string; cid: string; mid: string } }>(
    '/stories/:id/characters/:cid/memories/:mid',
    async (req, reply) => {
      const body = CharacterMemoryUpdateSchema.safeParse(req.body)
      if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
      const memory = await storage.updateCharacterMemory(req.params.id, req.params.cid, req.params.mid, body.data)
      if (!memory) return reply.status(404).send({ error: 'Memory not found' })
      return memory
    },
  )

  app.delete<{ Params: { id: string; cid: string; mid: string } }>(
    '/stories/:id/characters/:cid/memories/:mid',
    async (req, reply) => {
      const ok = await storage.deleteCharacterMemory(req.params.id, req.params.cid, req.params.mid)
      if (!ok) return reply.status(404).send({ error: 'Memory not found' })
      return { ok: true }
    },
  )
}
