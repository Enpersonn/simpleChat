import type { GenerationInput } from '../../types.js';
import { createChatSkillRunner } from './chat-skills.js';
import { createGenerationContext } from './create-generation-context.js';
import { createGenerationStream } from './generation-stream.js';

export const chatGenerationService = {
	async run(input: GenerationInput): Promise<void> {
		const stream = createGenerationStream(input.req, input.reply);
		try {
			const ctx = await createGenerationContext(input, stream);
			const runner = createChatSkillRunner(ctx);
			await runner.run('chat.respond', {});
			stream.done();
		} catch (error) {
			stream.error(error);
		}
	},
};
