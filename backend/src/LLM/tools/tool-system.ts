import { createFunctionProvider, createToolSystem } from '@llm-helpers/tools';
import { getAllTools } from './tools/index.js';

export function createStoryToolSystem() {
	const tools = getAllTools();
	const provider = createFunctionProvider('story', tools);
	return createToolSystem({ providers: [provider] });
}
