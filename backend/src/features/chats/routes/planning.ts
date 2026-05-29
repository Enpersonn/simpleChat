import { randomUUID } from 'node:crypto';
import { createOrchestrator } from '@llm-helpers/agents';
import { createAgent } from '@llm-helpers/an-agent-runtime-handler';
import type { DmProposal, Turn } from '@simplechat/types';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createOllamaRuntime } from '../../../LLM/runtime.js';
import {
	createStoryPlanningToolSystem,
	createStoryReadToolSystem,
} from '../../../LLM/tools/tool-system.js';
import { writeStreamEvent } from '../../../stream-events.js';
import { characters_store } from '../../characters/store.js';
import { locations_store } from '../../locations/store.js';
import { stories_store } from '../../stories/store.js';
import { buildDmSystemPrompt, emitPipeline } from '../helpers.js';
import { appendTurn, chat_store, turn_store } from '../store.js';

export async function DmPlaningRoutes(app: FastifyInstance): Promise<void> {
	app.post<{ Params: { storyId: string; chatId: string } }>(
		'/stories/:storyId/chats/:chatId/plan-message',
		async (req, reply) => {
			const { storyId, chatId } = req.params;
			const { text, model } = req.body as {
				text?: string;
				model?: string;
			};
			if (!text?.trim())
				return reply.status(400).send({ error: 'text is required' });

			const [story, chat, characters, locations, existingTurns] =
				await Promise.all([
					stories_store.get(storyId),
					chat_store.get(chatId),
					characters_store.list({ storyId }),
					locations_store.list({ storyId }),
					turn_store.list({ chatId }),
				]);

			if (!story)
				return reply.status(404).send({ error: 'Story not found' });
			if (!chat)
				return reply.status(404).send({ error: 'Chat not found' });
			if (chat.mode !== 'planning')
				return reply
					.status(400)
					.send({ error: 'Chat is not a planning chat' });

			const userTurn: Turn = {
				chatId,
				id: randomUUID(),
				meta: { mode: 'planning' },
				pinned: false,
				role: 'user',
				speaker: 'user',
				text: text.trim(),
				timestamp: new Date().toISOString(),
			};
			await appendTurn(userTurn);

			const allTurns = [...existingTurns, userTurn];

			const allowedOrigins = [
				'http://localhost:5173',
				'http://127.0.0.1:5173',
			];
			const reqOrigin = req.headers.origin ?? '';
			const corsOrigin = allowedOrigins.includes(reqOrigin)
				? reqOrigin
				: allowedOrigins[0];
			reply.raw.writeHead(200, {
				'Access-Control-Allow-Origin': corsOrigin,
				'Cache-Control': 'no-cache',
				'Content-Type': 'application/x-ndjson',
				'Transfer-Encoding': 'chunked',
				'X-Accel-Buffering': 'no',
			});

			const systemPrompt = buildDmSystemPrompt(
				story,
				characters,
				locations,
			);

			const historyMessages: Array<{
				role: 'user' | 'assistant';
				content: string;
			}> = allTurns.map((t) => ({
				content: t.text,
				role: t.role as 'user' | 'assistant',
			}));

			const runtime = await createOllamaRuntime({
				model: model || undefined,
			});
			const readTools = createStoryReadToolSystem();
			const planningTools = createStoryPlanningToolSystem();
			const proposalSchema = z.object({
				proposals: z.array(
					z.object({
						entityData: z.record(z.string(), z.unknown()),
						id: z.string().optional(),
						rationale: z.string().default(''),
						type: z.enum(['character', 'location', 'memory']),
					}),
				),
			});

			const orchestrator = createOrchestrator({
				agents: {
					'canon-researcher': {
						options: {
							maxSteps: 6,
						},
						provider: runtime.provider,
						systemPrompt: [
							'You are a canon researcher for the planning agent.',
							'Use the available read tools to verify facts about the current story, cast, locations, chats, memories, and canon timeline.',
							'Return concise factual notes only.',
						].join('\n\n'),
						tools: readTools,
					},
					planner: {
						options: {
							maxSteps: 10,
							stream: true,
						},
						provider: runtime.provider,
						systemPrompt: [
							systemPrompt,
							'You are the user-facing planning agent.',
							'When you need factual clarification from existing canon, use the ask skill to consult the "canon-researcher" agent.',
							'Return only the planning response for the user. Do not return JSON.',
						].join('\n\n'),
						tools: readTools,
					},
					'proposal-author': {
						options: {
							maxSteps: 6,
						},
						provider: runtime.provider,
						systemPrompt: [
							'You are the structured proposal author for story planning.',
							'Return ONLY valid JSON matching this schema:',
							JSON.stringify(
								z.toJSONSchema(proposalSchema),
								null,
								2,
							),
							'A proposal is when the planner suggested a concrete character, location, or character backstory memory that could be added.',
							'Do not propose already-existing entities from canon.',
							'For character entityData include: name, role, public.age, public.gender, public.species, public.appearance, public.personality, public.speechStyle, public.clothing, private.trueMotives, private.fears.',
							'For location entityData include: name, description, layout, lighting, atmosphere, soundscape, smells, notes, tags.',
							'For memory entityData include: characterName, summary, tags, importance.',
						].join('\n\n'),
						tools: planningTools,
					},
				},
				router: (task) =>
					task.startsWith('__proposal__')
						? 'proposal-author'
						: 'planner',
				sharedContext: historyMessages,
			});

			let fullText = '';
			orchestrator.bus.on('agent_handoff', (event) => {
				writeStreamEvent(reply.raw, {
					from: event.from,
					message: event.message,
					to: event.to,
					type: 'handoff',
				});
			});
			orchestrator.bus.on('tool_call', (event) => {
				writeStreamEvent(reply.raw, {
					args: event.args,
					name: event.toolName,
					type: 'tool_call',
				});
			});
			orchestrator.bus.on('tool_result', (event) => {
				writeStreamEvent(reply.raw, {
					name: event.toolName,
					output: event.result,
					type: 'tool_result',
				});
			});
			orchestrator.bus.on('skill_call', (event) => {
				writeStreamEvent(reply.raw, {
					args: event.args,
					name: event.skillName,
					type: 'skill_call',
				});
			});
			orchestrator.bus.on('skill_result', (event) => {
				writeStreamEvent(reply.raw, {
					name: event.skillName,
					output: event.result,
					type: 'skill_result',
				});
			});
			orchestrator.bus.on('token', (event) => {
				if (event.agent !== 'planner') return;
				fullText += event.text;
				writeStreamEvent(reply.raw, {
					text: event.text,
					type: 'content',
				});
			});

			try {
				const plannerStartedAt = Date.now();
				emitPipeline(reply.raw, 'planning_reply', 'start');
				const result = await orchestrator.run(
					`Respond to the latest planning request from the author.\n\nLatest message:\n${text}`,
				);
				emitPipeline(
					reply.raw,
					'planning_reply',
					'complete',
					plannerStartedAt,
					{
						length: result.length,
					},
				);
				if (!fullText) fullText = result;
			} catch (err) {
				const msg = err instanceof Error ? err.message : 'Stream error';
				writeStreamEvent(reply.raw, { message: msg, type: 'error' });
				reply.raw.end();
				return;
			}

			if (fullText) {
				await appendTurn({
					chatId,
					id: randomUUID(),
					meta: { mode: 'planning' },
					pinned: false,
					role: 'assistant',
					speaker: 'dm',
					text: fullText,
					timestamp: new Date().toISOString(),
				});

				const charNames = characters.map((c) => c.name).join(', ');
				const extractorInput = [
					`Story: ${story.title}`,
					charNames ? `Existing characters: ${charNames}` : '',
					`DM response:\n${fullText}`,
				]
					.filter(Boolean)
					.join('\n');

				let proposals: DmProposal[] = [];
				try {
					const proposalStartedAt = Date.now();
					emitPipeline(reply.raw, 'proposal_author', 'start');
					const proposalAgent = createAgent(
						runtime.provider,
						planningTools,
						{
							maxSteps: 6,
						},
					);
					proposalAgent.bus.on('tool_call', (event) => {
						writeStreamEvent(reply.raw, {
							args: event.args,
							name: event.toolName,
							type: 'tool_call',
						});
					});
					proposalAgent.bus.on('tool_result', (event) => {
						writeStreamEvent(reply.raw, {
							name: event.toolName,
							output: event.result,
							type: 'tool_result',
						});
					});
					const proposalHistory = await proposalAgent.start({
						messages: [
							{
								content: [
									'You are the proposal-author agent.',
									'Return ONLY valid JSON matching this schema:',
									JSON.stringify(
										z.toJSONSchema(proposalSchema),
										null,
										2,
									),
								].join('\n\n'),
								role: 'system',
							},
							{
								content: extractorInput,
								role: 'user',
							},
						],
					});
					const proposalText =
						[...proposalHistory]
							.reverse()
							.find((entry) => entry.role === 'assistant')
							?.content ?? '{"proposals":[]}';
					const parsed = proposalSchema.parse(
						JSON.parse(proposalText),
					);
					proposals = parsed.proposals.map((proposal) => ({
						entityData: proposal.entityData,
						id: proposal.id ?? randomUUID(),
						rationale: proposal.rationale,
						type: proposal.type,
					}));
					emitPipeline(
						reply.raw,
						'proposal_author',
						'complete',
						proposalStartedAt,
						{
							count: proposals.length,
						},
					);
				} catch {
					// non-fatal: proposals remain empty
				}

				if (proposals.length > 0) {
					writeStreamEvent(reply.raw, {
						channel: 'proposals',
						data: proposals,
						name: 'proposals',
						status: 'complete',
						type: 'progress',
					});
				}
			}

			writeStreamEvent(reply.raw, { type: 'done' });
			reply.raw.end();
		},
	);
}
