import { randomUUID } from 'node:crypto';
import type { Turn } from '@simplechat/types';
import { appendTurn } from '../../../store.js';
import type { GenerationContext } from '../../../types.js';

export const persistAssistantTurn = async (ctx: GenerationContext) => {
	const assistantTurn: Turn = {
		chatId: ctx.chatId,
		id: randomUUID(),
		meta: { mode: ctx.chat.mode },
		pinned: false,
		role: 'assistant',
		speaker: ctx.activeSpeaker,
		text: ctx.assistantText,
		timestamp: new Date().toISOString(),
	};

	await appendTurn(assistantTurn);

	ctx.turns.push(assistantTurn);

	return {
		turnId: assistantTurn.id,
	};
};
