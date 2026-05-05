import type { DmProposal, Turn } from '@simplechat/types';
import { marked } from 'marked';
import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from '../../lib/api.js';
import { planMessageStream } from '../../lib/stream.js';
import { useSettingsStore } from '../../store/settings.js';
import { useStoriesStore } from '../../store/stories.js';
import { DmProposalCard } from './DmProposalCard.js';

marked.setOptions({ breaks: true });

interface Props {
	storyId: string;
}

export function DmChatTab({ storyId }: Props) {
	const [chatId, setChatId] = useState<string | null>(null);
	const [turns, setTurns] = useState<Turn[]>([]);
	const [isStreaming, setIsStreaming] = useState(false);
	const [streamingText, setStreamingText] = useState('');
	const [pendingProposals, setPendingProposals] = useState<DmProposal[]>([]);
	const [acceptingIds, setAcceptingIds] = useState<Set<string>>(new Set());
	const [error, setError] = useState<string | null>(null);
	const [input, setInput] = useState('');
	const [loading, setLoading] = useState(true);

	const abortRef = useRef<AbortController | null>(null);
	const messagesRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const model = useSettingsStore((st) => st.generation.model);
	const { reloadCharacters, reloadLocations, characters } = useStoriesStore();

	useEffect(() => {
		let cancelled = false;
		async function init() {
			setLoading(true);
			try {
				const allChats = await api.chats.list(storyId);
				const planChat = allChats.find((c) => c.mode === 'planning');
				if (cancelled) return;
				if (planChat) {
					setChatId(planChat.id);
					const history = await api.chats.history(
						storyId,
						planChat.id,
					);
					if (!cancelled) setTurns(history);
				} else {
					const created = await api.chats.create(storyId, {
						activeSpeakers: [],
						mode: 'planning',
						title: 'Story Planning',
					});
					if (!cancelled) {
						setChatId(created.id);
						setTurns([]);
					}
				}
			} catch (err) {
				if (!cancelled) setError((err as Error).message);
			} finally {
				if (!cancelled) setLoading(false);
			}
		}
		init();
		return () => {
			cancelled = true;
		};
	}, [storyId]);

	useEffect(() => {
		const el = messagesRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [turns.length, isStreaming, pendingProposals.length]);

	const handleSend = async () => {
		if (!chatId || !input.trim() || isStreaming) return;
		const text = input.trim();
		setInput('');
		setError(null);
		setPendingProposals([]);

		const tempUserTurn: Turn = {
			chatId,
			id: `temp-${Date.now()}`,
			pinned: false,
			role: 'user',
			speaker: 'user',
			text,
			timestamp: new Date().toISOString(),
		};
		const streamingPlaceholder: Turn = {
			chatId,
			id: 'streaming',
			pinned: false,
			role: 'assistant',
			speaker: 'dm',
			text: '',
			timestamp: new Date().toISOString(),
		};
		setTurns((prev) => [...prev, tempUserTurn, streamingPlaceholder]);
		setIsStreaming(true);
		setStreamingText('');

		const ac = new AbortController();
		abortRef.current = ac;

		let accumulated = '';
		await planMessageStream({
			chatId,
			model: model || undefined,
			onChunk: (chunk) => {
				accumulated += chunk;
				setStreamingText(accumulated);
				setTurns((prev) =>
					prev.map((t) =>
						t.id === 'streaming' ? { ...t, text: accumulated } : t,
					),
				);
			},
			onDone: async () => {
				abortRef.current = null;
				setIsStreaming(false);
				setStreamingText('');
				try {
					const fresh = await api.chats.history(storyId, chatId);
					setTurns(fresh);
				} catch {
					setTurns((prev) =>
						prev.filter((t) => t.id !== 'streaming'),
					);
				}
			},
			onError: (msg) => {
				abortRef.current = null;
				setIsStreaming(false);
				setStreamingText('');
				setError(msg);
				setTurns((prev) =>
					prev.filter(
						(t) => t.id !== 'streaming' && t.id !== tempUserTurn.id,
					),
				);
			},
			onProposals: (proposals) => {
				setPendingProposals(proposals);
			},
			signal: ac.signal,
			storyId,
			text,
		});
	};

	const handleStop = () => {
		abortRef.current?.abort();
		abortRef.current = null;
		setIsStreaming(false);
		setStreamingText('');
		setTurns((prev) => prev.filter((t) => t.id !== 'streaming'));
	};

	const handleAccept = async (proposal: DmProposal) => {
		setAcceptingIds((prev) => new Set([...prev, proposal.id]));
		try {
			const d = proposal.entityData;
			if (proposal.type === 'character') {
				const pub = (d.public ?? {}) as Record<string, unknown>;
				const priv = (d.private ?? {}) as Record<string, unknown>;
				await api.characters.create(storyId, {
					name: typeof d.name === 'string' ? d.name : 'Unknown',
					private: {
						fears: Array.isArray(priv.fears)
							? (priv.fears as string[])
							: [],
						hiddenEmotionalState: '',
						moralLimits: '',
						privateKnowledge: [],
						trueMotives:
							typeof priv.trueMotives === 'string'
								? priv.trueMotives
								: '',
					},
					public: {
						age: typeof pub.age === 'string' ? pub.age : '',
						appearance:
							typeof pub.appearance === 'string'
								? pub.appearance
								: '',
						clothing:
							typeof pub.clothing === 'string'
								? pub.clothing
								: '',
						gender:
							typeof pub.gender === 'string' ? pub.gender : '',
						personality: Array.isArray(pub.personality)
							? (pub.personality as string[])
							: [],
						reputation: '',
						species:
							typeof pub.species === 'string' ? pub.species : '',
						speechStyle:
							typeof pub.speechStyle === 'string'
								? pub.speechStyle
								: '',
						voiceNotes: '',
					},
					role: typeof d.role === 'string' ? d.role : '',
				});
				await reloadCharacters();
			} else if (proposal.type === 'location') {
				await api.locations.create(storyId, {
					atmosphere:
						typeof d.atmosphere === 'string'
							? d.atmosphere
							: undefined,
					description:
						typeof d.description === 'string'
							? d.description
							: undefined,
					layout: typeof d.layout === 'string' ? d.layout : undefined,
					lighting:
						typeof d.lighting === 'string' ? d.lighting : undefined,
					name: typeof d.name === 'string' ? d.name : 'Unknown',
					notes: typeof d.notes === 'string' ? d.notes : undefined,
					smells: typeof d.smells === 'string' ? d.smells : undefined,
					soundscape:
						typeof d.soundscape === 'string'
							? d.soundscape
							: undefined,
					tags: Array.isArray(d.tags) ? (d.tags as string[]) : [],
				});
				await reloadLocations();
			} else if (proposal.type === 'memory') {
				const charName =
					typeof d.characterName === 'string' ? d.characterName : '';
				const char = characters.find(
					(c) => c.name.toLowerCase() === charName.toLowerCase(),
				);
				if (!char)
					throw new Error(
						`Character "${charName}" not found in this story`,
					);
				await api.characterMemories.create(storyId, char.id, {
					deltas: { effects: [] },
					importance:
						typeof d.importance === 'number' ? d.importance : 0.5,
					summary: typeof d.summary === 'string' ? d.summary : '',
					tags: Array.isArray(d.tags) ? (d.tags as string[]) : [],
				});
			}
			setPendingProposals((prev) =>
				prev.filter((p) => p.id !== proposal.id),
			);
		} catch (err) {
			setError((err as Error).message);
		} finally {
			setAcceptingIds((prev) => {
				const next = new Set(prev);
				next.delete(proposal.id);
				return next;
			});
		}
	};

	const handleDecline = (proposalId: string) => {
		setPendingProposals((prev) => prev.filter((p) => p.id !== proposalId));
	};

	const handleKeyDown = (e: KeyboardEvent) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	};

	const getSpeakerName = (turn: Turn) => {
		if (turn.role === 'user') return 'You';
		return 'DM';
	};

	if (loading) {
		return (
			<div class="flex h-[200px] items-center justify-center text-[13px] text-text-muted">
				Loading DM Chat…
			</div>
		);
	}

	return (
		<div class="flex h-[520px] min-h-0 flex-col">
			{error && (
				<div class="mb-2 flex shrink-0 items-center justify-between gap-2 rounded-sm border border-error bg-[#ff444422] px-3 py-2 text-error text-xs">
					<span>⚠ {error}</span>
					<button
						class="shrink-0 px-1 text-error text-sm"
						onClick={() => setError(null)}
					>
						✕
					</button>
				</div>
			)}

			<div
				class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto py-2"
				ref={messagesRef}
			>
				{turns.length === 0 && !isStreaming && (
					<div class="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-text-muted">
						<strong class="text-sm text-text-secondary">
							Story Workshop
						</strong>
						<p class="max-w-90 text-xs leading-normal">
							Chat with your DM to plan characters, locations, and
							backstory. Ask for suggestions or describe what you
							have in mind — the DM will propose additions you can
							accept directly.
						</p>
					</div>
				)}
				{turns.map((turn) => (
					<div
						key={turn.id}
						class={`flex flex-col gap-1 ${turn.role === 'user' ? 'items-end' : 'items-start'}`}
					>
						<div class="flex items-center gap-1.5 px-1">
							<span class="font-semibold text-[11px] text-text-muted uppercase tracking-wider">
								{getSpeakerName(turn)}
							</span>
						</div>
						<div
							class={`wrap-break-word max-w-[92%] rounded px-3.25 py-2.25 text-[14px] text-text-primary leading-[1.55] ${turn.role === 'user' ? 'rounded-br-[3px] bg-accent-dim' : 'rounded-bl-[3px] border border-border-light bg-bg-tertiary'}`}
							dangerouslySetInnerHTML={{
								__html: marked.parse(
									turn.text ||
										(turn.id === 'streaming' ? '…' : ''),
								) as string,
							}}
						/>
						{turn.id === 'streaming' && (
							<span class="ml-[2px] inline-block h-[1em] w-[2px] animate-[blink_1s_step-end_infinite] bg-text-primary align-text-bottom" />
						)}
					</div>
				))}

				{pendingProposals.length > 0 && (
					<div class="flex flex-col gap-2 py-2 pb-1">
						<div class="pl-[2px] font-semibold text-[11px] text-text-muted uppercase tracking-[0.06em]">
							Suggestions from DM
						</div>
						{pendingProposals.map((p) => (
							<DmProposalCard
								key={p.id}
								proposal={p}
								onAccept={() => handleAccept(p)}
								onDecline={() => handleDecline(p.id)}
								isAccepting={acceptingIds.has(p.id)}
							/>
						))}
					</div>
				)}
			</div>

			<div class="mt-2 flex shrink-0 flex-col gap-1.5 border-border-light border-t pt-2.5">
				<textarea
					ref={textareaRef}
					class="box-border w-full resize-none rounded-sm border border-border-light bg-bg-primary px-3 py-[9px] font-[inherit] text-[13px] text-text-primary leading-[1.5] focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
					value={input}
					onInput={(e) =>
						setInput((e.target as HTMLTextAreaElement).value)
					}
					onKeyDown={handleKeyDown}
					placeholder="Chat with your DM to plan the story…"
					rows={2}
					disabled={isStreaming}
				/>
				<div class="flex justify-end">
					{isStreaming ? (
						<button
							class="rounded-sm border border-error bg-transparent px-[18px] py-1.5 font-semibold text-[13px] text-error transition-colors duration-150 hover:bg-[#ff444422]"
							onClick={handleStop}
						>
							Stop
						</button>
					) : (
						<button
							class="rounded-sm bg-accent px-[18px] py-1.5 font-semibold text-[13px] text-white transition-opacity duration-150 hover:enabled:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
							onClick={handleSend}
							disabled={!input.trim()}
						>
							Send
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
