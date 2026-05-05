import type { CharacterMemory, Chat, ChatMode } from '@simplechat/types';
import { useEffect, useState } from 'preact/hooks';
import { api } from '../../lib/api.js';
import { useChatsStore } from '../../store/chats.js';
import { useStoriesStore } from '../../store/stories.js';
import { f } from '../shared/formCls.js';

type OpeningMode = 'none' | 'story' | 'auto';

interface Props {
	storyId: string;
	initialAnchors?: Record<string, string>;
	onClose: () => void;
	onCreated: (chat: Chat, openingMode: OpeningMode) => void;
}

export function NewChatModal({
	storyId,
	initialAnchors,
	onClose,
	onCreated,
}: Props) {
	const { characters, stories, locations } = useStoriesStore();
	const createChat = useChatsStore((s) => s.createChat);
	const story = stories.find((s) => s.id === storyId);

	const [title, setTitle] = useState('');
	const [mode, setMode] = useState<ChatMode>('interactive');
	const [speakers, setSpeakers] = useState<string[]>([]);
	const [openingMode, setOpeningMode] = useState<OpeningMode>(
		story?.openingMessage ? 'story' : 'none',
	);
	const [customOpening, setCustomOpening] = useState(
		story?.openingMessage ?? '',
	);
	const [submitting, setSubmitting] = useState(false);
	const [startingLocationId, setStartingLocationId] = useState<
		string | undefined
	>(locations.length === 1 ? locations[0].id : undefined);

	// Memory anchors: { [charId]: memoryId } — undefined key = use natural head
	const [memoryAnchors, setMemoryAnchors] = useState<Record<string, string>>(
		initialAnchors ?? {},
	);
	// Memories per char for the picker
	const [charMemories, setCharMemories] = useState<
		Record<string, CharacterMemory[]>
	>({});
	const [expandedCharId, setExpandedCharId] = useState<string | null>(null);

	const nonPersonaChars = characters.filter((c) => !c.isUserPersona);

	useEffect(() => {
		// Load memories for all non-persona characters to know which have timelines
		const load = async () => {
			const results: Record<string, CharacterMemory[]> = {};
			await Promise.all(
				nonPersonaChars.map(async (c) => {
					try {
						const mems = await api.characterMemories.list(
							storyId,
							c.id,
						);
						if (mems.length > 0) results[c.id] = mems;
					} catch {
						/* ignore */
					}
				}),
			);
			setCharMemories(results);
		};
		load();
	}, [storyId]);

	const toggleSpeaker = (id: string) => {
		setSpeakers((prev) =>
			prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
		);
	};

	const setAnchor = (charId: string, memoryId: string | null) => {
		setMemoryAnchors((prev) => {
			if (memoryId === null) {
				const next = { ...prev };
				delete next[charId];
				return next;
			}
			return { ...prev, [charId]: memoryId };
		});
	};

	const handleSubmit = async () => {
		setSubmitting(true);
		try {
			const anchorsToPass =
				Object.keys(memoryAnchors).length > 0
					? memoryAnchors
					: undefined;
			const chat = await createChat(
				storyId,
				mode,
				speakers,
				anchorsToPass,
				startingLocationId,
			);
			if (openingMode === 'story' && customOpening.trim()) {
				await api.chats.seed(storyId, chat.id, customOpening.trim());
				onCreated(chat, 'none');
			} else {
				onCreated(chat, openingMode);
			}
		} catch {
			setSubmitting(false);
		}
	};

	const charsWithMemories = nonPersonaChars.filter(
		(c) => (charMemories[c.id]?.length ?? 0) > 0,
	);

	return (
		<div
			class={f.overlay}
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div class={f.modalSm}>
				<div class={f.header}>
					<span class={f.title}>New Chat</span>
					<button class={f.closeBtn} onClick={onClose}>
						✕
					</button>
				</div>

				<div class={f.field}>
					<label class={f.label}>Mode</label>
					<div class={f.toggleRow}>
						{(['interactive', 'storyteller'] as ChatMode[]).map(
							(m) => (
								<button
									type="button"
									key={m}
									class={f.tag}
									data-active={
										mode === m ? 'true' : undefined
									}
									onClick={() => setMode(m)}
								>
									{m === 'interactive'
										? '💬 Interactive RP'
										: '📝 Storyteller'}
								</button>
							),
						)}
					</div>
				</div>

				{nonPersonaChars.length > 0 && (
					<div class={f.field}>
						<label class={f.label}>
							Speaking As (Active Characters)
						</label>
						<div class={f.tagGroup}>
							{nonPersonaChars.map((char) => (
								<button
									type="button"
									key={char.id}
									class={f.tag}
									data-active={
										speakers.includes(char.id)
											? 'true'
											: undefined
									}
									onClick={() => toggleSpeaker(char.id)}
								>
									{char.name}
									{char.role ? ` · ${char.role}` : ''}
								</button>
							))}
						</div>
					</div>
				)}

				<div class={f.field}>
					<label class={f.label}>Starting Location</label>
					{locations.length === 0 ? (
						<p class={f.hint}>
							No locations in this story — add one in the
							Locations panel first.
						</p>
					) : (
						<div class={f.tagGroup}>
							{locations.map((loc) => (
								<button
									key={loc.id}
									type="button"
									class={f.tag}
									data-active={
										startingLocationId === loc.id
											? 'true'
											: undefined
									}
									onClick={() =>
										setStartingLocationId(loc.id)
									}
								>
									{loc.name}
								</button>
							))}
						</div>
					)}
				</div>

				{charsWithMemories.length > 0 && (
					<div class={f.field}>
						<label class={f.label}>Memory Timeline</label>
						<div class="flex flex-col gap-[6px]">
							{charsWithMemories.map((char) => {
								const mems = charMemories[char.id] ?? [];
								const anchor = memoryAnchors[char.id] ?? null;
								const anchorMem = anchor
									? mems.find((m) => m.id === anchor)
									: null;
								const isExpanded = expandedCharId === char.id;
								return (
									<div
										key={char.id}
										class="flex flex-col gap-1 rounded-sm border border-border bg-bg-tertiary px-2 py-1.5"
									>
										<div class="flex flex-wrap items-center gap-1.5">
											<span class="min-w-0 flex-1 font-medium text-[12px] text-text-primary">
												{char.name}
											</span>
											<div class="flex shrink-0 gap-1">
												<button
													type="button"
													class="rounded-full border border-border bg-bg-secondary px-2 py-0.5 text-[11px] text-text-muted transition-all duration-150 hover:border-accent hover:text-text-primary data-[active=true]:border-accent data-[active=true]:bg-accent-dim data-[active=true]:text-accent"
													data-active={
														anchor === null
															? 'true'
															: undefined
													}
													onClick={() => {
														setAnchor(
															char.id,
															null,
														);
														setExpandedCharId(null);
													}}
												>
													Latest
												</button>
												<button
													type="button"
													class="rounded-full border border-border bg-bg-secondary px-2 py-0.5 text-[11px] text-text-muted transition-all duration-150 hover:border-accent hover:text-text-primary data-[active=true]:border-accent data-[active=true]:bg-accent-dim data-[active=true]:text-accent"
													data-active={
														isExpanded
															? 'true'
															: undefined
													}
													onClick={() =>
														setExpandedCharId(
															isExpanded
																? null
																: char.id,
														)
													}
												>
													Choose point…
												</button>
											</div>
											{anchorMem && (
												<span
													class="max-w-[160px] overflow-hidden text-ellipsis whitespace-nowrap text-accent text-sm opacity-80"
													title={anchorMem.summary}
												>
													⚓{' '}
													{anchorMem.summary.slice(
														0,
														30,
													)}
													{anchorMem.summary.length >
													30
														? '…'
														: ''}
												</span>
											)}
										</div>
										{isExpanded && (
											<div class="mt-1 flex max-h-[160px] flex-col gap-0.5 overflow-y-auto">
												{[...mems]
													.reverse()
													.map((m) => (
														<button
															type="button"
															key={m.id}
															class="flex flex-col gap-0.5 rounded-sm border border-transparent bg-bg-secondary px-2 py-[5px] text-left transition-all duration-100 hover:border-border hover:bg-bg-hover data-[active=true]:border-accent data-[active=true]:bg-accent-dim"
															data-active={
																anchor === m.id
																	? 'true'
																	: undefined
															}
															onClick={() => {
																setAnchor(
																	char.id,
																	m.id,
																);
																setExpandedCharId(
																	null,
																);
															}}
														>
															<span class="text-[12px] text-text-primary leading-snug">
																{m.summary}
															</span>
															{m.tags.length >
																0 && (
																<span class="text-sm text-text-muted">
																	{m.tags
																		.slice(
																			0,
																			3,
																		)
																		.join(
																			', ',
																		)}
																</span>
															)}
														</button>
													))}
											</div>
										)}
									</div>
								);
							})}
						</div>
					</div>
				)}

				<div class={f.field}>
					<label class={f.label}>Opening Message</label>
					<div class={f.toggleRow}>
						{(['none', 'story', 'auto'] as OpeningMode[]).map(
							(m) => (
								<button
									type="button"
									key={m}
									class={f.tag}
									data-active={
										openingMode === m ? 'true' : undefined
									}
									onClick={() => setOpeningMode(m)}
								>
									{m === 'none'
										? 'None'
										: m === 'story'
											? 'Story opening'
											: '✨ Auto-generate'}
								</button>
							),
						)}
					</div>
					{openingMode === 'story' && (
						<textarea
							class={f.textarea}
							placeholder="Opening message the AI will send first…"
							value={customOpening}
							onInput={(e) =>
								setCustomOpening(
									(e.target as HTMLTextAreaElement).value,
								)
							}
							style={{ minHeight: '80px' }}
						/>
					)}
					{openingMode === 'auto' && (
						<p class={f.hint}>
							The AI will generate an opening scene using the
							story context when the chat starts.
						</p>
					)}
				</div>

				<div class={f.footer}>
					<button type="button" class={f.cancelBtn} onClick={onClose}>
						Cancel
					</button>
					<button
						type="button"
						class={f.submitBtn}
						onClick={handleSubmit}
						disabled={submitting}
					>
						{submitting ? 'Creating…' : 'Start Chat'}
					</button>
				</div>
			</div>
		</div>
	);
}
