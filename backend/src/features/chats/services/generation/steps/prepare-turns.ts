import type { Turn } from '@simplechat/types';
import { randomUUID } from 'crypto';
import { appendTurn, deleteSingleTurn } from '../../../store.js';
import type { GenerationContext } from '../../../types.js';

export async function prepareTurns(ctx: GenerationContext) {
	const { kind, chat, params } = ctx;

	if (kind === 'message') {
		const userTurn: Turn = {
			chatId: ctx.chatId,
			id: randomUUID(),
			meta: { mode: chat.mode },
			pinned: false,
			role: 'user',
			speaker: params.speaker!,
			text: params.text!,
			timestamp: new Date().toISOString(),
		};

		await appendTurn(userTurn);

		ctx.turns = [...ctx.originalTurns, userTurn];
		return;
	}

	if (kind === 'regenerate') {
		const lastAssistant = [...ctx.originalTurns]
			.reverse()
			.find((t) => t.role === 'assistant');

		if (lastAssistant) {
			await deleteSingleTurn(ctx.storyId, ctx.chatId, lastAssistant.id);
			ctx.turns = ctx.originalTurns.filter(
				(t) => t.id !== lastAssistant.id,
			);
		} else {
			ctx.turns = ctx.originalTurns;
		}

		return;
	}

	if (kind === 'opener') {
		ctx.turns = [];
		return;
	}
}
