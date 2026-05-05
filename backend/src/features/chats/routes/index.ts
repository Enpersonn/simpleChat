import type { FastifyInstance } from 'fastify';
import { chatCRUDRoutes } from './crud';
import { chatGenerationRoutes } from './generation';
import { chatMemoryRoutes } from './memories';
import { DmPlaningRoutes as dmPlaningRoutes } from './planning';
import { ChatStateRoutes } from './state';
import { chatTurnRoutes } from './turns';

export async function chatsRoutes(app: FastifyInstance): Promise<void> {
	app.register(chatCRUDRoutes);
	app.register(chatGenerationRoutes);
	app.register(ChatStateRoutes);
	app.register(chatMemoryRoutes);
	app.register(dmPlaningRoutes);
	app.register(chatTurnRoutes);
}
