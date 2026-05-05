import {
	ChatEntityStateSchema,
	ChatSchema,
	type Turn,
	TurnSchema,
} from '@simplechat/types';
import { BaseStorageObject } from '../../storage/base';

export const chat_store = new BaseStorageObject('chats', ChatSchema);
export const turn_store = new BaseStorageObject('turns', TurnSchema);
export const chat_state_store = new BaseStorageObject(
	'chat_states',
	ChatEntityStateSchema,
);

export async function appendTurn(turn: Turn): Promise<void> {
	await turn_store.add(turn);
	await chat_store.update(turn.chatId, {});
}

export async function deleteAfterTurn(
	_storyId: string,
	chatId: string,
	turnId: string,
): Promise<boolean> {
	const turns = await turn_store.list({ chatId });
	const idx = turns.findIndex((t) => t.id === turnId);
	if (idx === -1) return false;
	await turn_store.replaceAll(turns.slice(0, idx + 1));
	return true;
}

export async function deleteSingleTurn(
	_storyId: string,
	chatId: string,
	turnId: string,
): Promise<boolean> {
	const turns = await turn_store.list({ chatId });
	const filtered = turns.filter((t) => t.id !== turnId);
	if (filtered.length === turns.length) return false;
	await turn_store.replaceAll(filtered);
	return true;
}
