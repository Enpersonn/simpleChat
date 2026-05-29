import {
	allow,
	createFunctionProvider,
	createPermissions,
	createToolSystem,
} from '@llm-helpers/tools';
import {
	getAllTools,
	getStoryReadTools,
	getStoryWriteTools,
} from './tools/index.js';

export function createStoryToolSystem() {
	const provider = createFunctionProvider('story', getAllTools());
	return createToolSystem({ providers: [provider] });
}

export function createStoryReadToolSystem() {
	const provider = createFunctionProvider('story-read', getStoryReadTools());
	return createToolSystem({ providers: [provider] });
}

export function createStoryWriteToolSystem() {
	const provider = createFunctionProvider(
		'story-write',
		getStoryWriteTools(),
	);
	return createToolSystem({
		permissions: createPermissions({
			default: 'deny',
			rules: [
				allow('stories.add'),
				allow('stories.update'),
				allow('stories.delete'),
				allow('characters.add'),
				allow('characters.update'),
				allow('characters.delete'),
				allow('locations.add'),
				allow('locations.update'),
				allow('locations.delete'),
				allow('chats.add'),
				allow('chats.update'),
				allow('chats.delete'),
				allow('turns.add'),
				allow('turns.update'),
				allow('turns.delete'),
				allow('chat_states.add'),
				allow('chat_states.update'),
				allow('chat_states.delete'),
				allow('memories.add'),
				allow('memories.update'),
				allow('memories.delete'),
				allow('character_memory_relations.add'),
				allow('character_memory_relations.update'),
				allow('character_memory_relations.delete'),
				allow('field_defs.add'),
				allow('field_defs.update'),
				allow('field_defs.delete'),
				allow('timeline.addEntry'),
				allow('timeline.removeEntry'),
				allow('timeline.reorder'),
			],
		}),
		providers: [provider],
	});
}

export function createStoryPlanningToolSystem() {
	const readProvider = createFunctionProvider(
		'story-read',
		getStoryReadTools(),
	);
	const writeProvider = createFunctionProvider(
		'story-write',
		getStoryWriteTools(),
	);
	return createToolSystem({
		permissions: createPermissions({
			default: 'deny',
			rules: [
				allow('*.get'),
				allow('*.list'),
				allow('memories.getChainForCharacter'),
				allow('timeline.get'),
				allow('*.add'),
				allow('*.update'),
				allow('*.delete'),
				allow('timeline.addEntry'),
				allow('timeline.removeEntry'),
				allow('timeline.reorder'),
			],
		}),
		providers: [readProvider, writeProvider],
	});
}
