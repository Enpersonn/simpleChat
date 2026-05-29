import { HttpError } from '../../../../error-handlers.js';
import { characters_store } from '../../../characters/store.js';
import { locations_store } from '../../../locations/store.js';
import { stories_store } from '../../../stories/store.js';
import { defaultChatState } from '../../helpers.js';
import { chat_state_store, chat_store, turn_store } from '../../store.js';

export async function loadGenerationData(storyId: string, chatId: string) {
	const [story, chat, characters, turns, locations, chatState] =
		await Promise.all([
			stories_store.get(storyId),
			chat_store.get(chatId),
			characters_store.list({ storyId }),
			turn_store.list({ chatId }),
			locations_store.list({ storyId }),
			chat_state_store.get(chatId),
		]);

	if (!story) throw new HttpError(404, 'Story not found');
	if (!chat) throw new HttpError(404, 'Chat not found');

	return {
		characters,
		chat,
		chatState: chatState ?? defaultChatState(chatId, storyId),
		locations,
		story,
		turns,
	};
}
