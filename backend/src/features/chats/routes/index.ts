import type { FastifyInstance } from 'fastify';
import { chatCRUDRoutes } from './crud.js';
import { chatGenerationRoutes } from './generation.js';
import { chatMemoryRoutes } from './memories.js';
import { DmPlaningRoutes as dmPlaningRoutes } from './planning.js';
import { ChatStateRoutes } from './state.js';
import { chatTurnRoutes } from './turns.js';

export async function chatsRoutes(app: FastifyInstance): Promise<void> {
	app.register(chatCRUDRoutes);
	app.register(chatGenerationRoutes);
	app.register(ChatStateRoutes);
	app.register(chatMemoryRoutes);
	app.register(dmPlaningRoutes);
	app.register(chatTurnRoutes);
}
