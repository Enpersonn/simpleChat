import type {
	CanonEntry,
	Character,
	CharacterMemory,
	Chat,
} from '@simplechat/types';
import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from '../../lib/api.js';
import { useChatsStore } from '../../store/chats.js';
import { useStoriesStore } from '../../store/stories.js';
import { NewChatModal } from '../chat/NewChatModal.js';

interface Props {
	storyId: string;
	onClose: () => void;
}

export function CanonTimelineModal({ storyId, onClose }: Props) {
	const {
		canonTimeline,
		characters,
		stories,
		reorderCanonTimeline,
		removeCanonEntry,
		loadCanonTimeline,
	} = useStoriesStore();
	const { openChat, generateOpener } = useChatsStore();

	const story = stories.find((st) => st.id === storyId);

	const [memoryCache, setMemoryCache] = useState<
		Record<string, CharacterMemory>
	>({});
	const [activeCharFilter, setActiveCharFilter] = useState<string | null>(
		null,
	);
	const [draggingId, setDraggingId] = useState<string | null>(null);
	const [dropTargetIdx, setDropTargetIdx] = useState<number | null>(null);
	const [startChatAnchors, setStartChatAnchors] = useState<Record<
		string,
		string
	> | null>(null);
	const dragOverEntryRef = useRef<string | null>(null);

	useEffect(() => {
		loadCanonTimeline(storyId);
	}, [storyId]);

	useEffect(() => {
		if (!canonTimeline) return;
		const missing = canonTimeline.entries.filter(
			(e) => !memoryCache[e.memoryId],
		);
		if (missing.length === 0) return;
		const charIds = [...new Set(missing.map((e) => e.characterId))];
		charIds.forEach(async (charId) => {
			try {
				const mems = await api.characterMemories.list(storyId, charId);
				setMemoryCache((prev) => {
					const next = { ...prev };
					mems.forEach((m) => {
						next[m.id] = m;
					});
					return next;
				});
			} catch {
				/* ignore */
			}
		});
	}, [canonTimeline]);

	const entries = canonTimeline?.entries ?? [];
	const charMap = new Map<string, Character>(
		characters.map((c) => [c.id, c]),
	);

	const visibleEntries = activeCharFilter
		? entries.filter((e) => e.characterId === activeCharFilter)
		: entries;

	const charsInTimeline = [...new Set(entries.map((e) => e.characterId))]
		.map((id) => charMap.get(id))
		.filter((c): c is Character => c !== undefined);

	const computeAnchorsUpTo = (entryId: string): Record<string, string> => {
		const anchors: Record<string, string> = {};
		for (const entry of entries) {
			anchors[entry.characterId] = entry.memoryId;
			if (entry.id === entryId) break;
		}
		return anchors;
	};

	// ─── Drag & Drop ─────────────────────────────────────────────────────────────

	const handleDragStart = (e: DragEvent, entryId: string) => {
		setDraggingId(entryId);
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', entryId);
		}
	};

	const handleDragOver = (e: DragEvent, idx: number) => {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		setDropTargetIdx(idx);
		dragOverEntryRef.current = entries[idx]?.id ?? null;
	};

	const handleDrop = async (e: DragEvent, idx: number) => {
		e.preventDefault();
		const draggedId = e.dataTransfer?.getData('text/plain') ?? draggingId;
		if (!draggedId) return;
		setDraggingId(null);
		setDropTargetIdx(null);

		const currentIds = entries.map((en) => en.id);
		const fromIdx = currentIds.indexOf(draggedId);
		if (fromIdx === idx || fromIdx === -1) return;

		const next = [...currentIds];
		next.splice(fromIdx, 1);
		const insertAt = fromIdx < idx ? idx - 1 : idx;
		next.splice(insertAt, 0, draggedId);
		await reorderCanonTimeline(storyId, next);
	};

	const handleDragEnd = () => {
		setDraggingId(null);
		setDropTargetIdx(null);
	};

	const handleDelete = async (entryId: string) => {
		if (
			!confirm(
				'Remove this entry from the canon timeline? The memory itself will not be deleted.',
			)
		)
			return;
		await removeCanonEntry(storyId, entryId);
	};

	const handleStartChat = (entry: CanonEntry) => {
		const anchors = computeAnchorsUpTo(entry.id);
		setStartChatAnchors(anchors);
	};

	return (
		<>
			<div
				class="fixed inset-0 z-100 flex items-stretch justify-center bg-black/70 backdrop-blur-sm"
				onClick={(e) => {
					if (e.target === e.currentTarget) onClose();
				}}
			>
				<div class="flex w-[680px] max-w-full flex-col overflow-hidden border-border-light border-x bg-bg-primary">
					{/* Header */}
					<div class="flex shrink-0 items-center justify-between border-border border-b bg-bg-secondary px-6 py-[18px] pb-[14px]">
						<div class="flex flex-col gap-[2px]">
							<span class="font-semibold text-base text-text-primary">
								Canon Timeline
							</span>
							{story && (
								<span class="text-[11px] text-text-muted">
									{story.title}
								</span>
							)}
						</div>
						<button
							class="shrink-0 rounded-sm px-2 py-1 text-[18px] text-text-muted transition-colors duration-150 hover:bg-bg-hover hover:text-text-primary"
							onClick={onClose}
						>
							✕
						</button>
					</div>

					{/* Toolbar */}
					{charsInTimeline.length > 0 && (
						<div class="flex shrink-0 flex-wrap items-center gap-2 border-border border-b bg-bg-secondary px-6 py-2.5">
							<span class="shrink-0 font-semibold text-[11px] text-text-muted uppercase tracking-[0.06em]">
								Filter
							</span>
							<button
								class={`cursor-pointer whitespace-nowrap rounded-xl border px-2.5 py-[3px] text-[11px] transition-all duration-150 ${activeCharFilter === null ? 'border-accent bg-accent-dim text-accent' : 'border-border-light bg-transparent text-text-secondary hover:border-accent hover:text-text-primary'}`}
								onClick={() => setActiveCharFilter(null)}
							>
								All
							</button>
							{charsInTimeline.map((char) => (
								<button
									key={char.id}
									class={`cursor-pointer whitespace-nowrap rounded-xl border px-2.5 py-[3px] text-[11px] transition-all duration-150 ${activeCharFilter === char.id ? 'border-accent bg-accent-dim text-accent' : 'border-border-light bg-transparent text-text-secondary hover:border-accent hover:text-text-primary'}`}
									onClick={() =>
										setActiveCharFilter(
											activeCharFilter === char.id
												? null
												: char.id,
										)
									}
								>
									{char.name}
								</button>
							))}
						</div>
					)}

					{/* Body */}
					<div class="flex flex-1 flex-col gap-0 overflow-y-auto px-6 py-6">
						{visibleEntries.length === 0 && (
							<div class="flex flex-col items-center justify-center gap-2.5 px-6 py-[60px] text-center text-text-muted">
								<span class="text-[32px] opacity-40">⏱</span>
								<span class="text-sm italic">
									{entries.length === 0
										? 'No canon memories yet. Import a story with text to extract events automatically, or add memories to characters and add them here.'
										: 'No events match the current filter.'}
								</span>
							</div>
						)}

						{visibleEntries.length > 0 && (
							<>
								<div class="flex items-center gap-2.5 py-2 font-semibold text-[11px] text-text-muted uppercase tracking-[0.08em]">
									<span class="h-px flex-1 bg-border-light" />
									<span>Start of Story</span>
									<span class="h-px flex-1 bg-border-light" />
								</div>

								{visibleEntries.map((entry, idx) => {
									const char = charMap.get(entry.characterId);
									const memory = memoryCache[entry.memoryId];
									const isDragging = draggingId === entry.id;
									const isDropTarget =
										dropTargetIdx === idx &&
										draggingId !== null;

									return (
										<div
											key={entry.id}
											class="flex flex-col items-center"
											onDragOver={(e) =>
												handleDragOver(
													e as DragEvent,
													idx,
												)
											}
											onDrop={(e) =>
												handleDrop(e as DragEvent, idx)
											}
										>
											<div
												class={`w-[2px] shrink-0 bg-border-light transition-all duration-100 ${isDropTarget ? '!bg-accent h-7 rounded-[2px]' : 'h-3'}`}
											/>

											<div
												class={`relative flex w-full cursor-grab items-start gap-3 rounded-lg border border-border-light bg-bg-secondary px-4 py-3.5 transition-all duration-150 hover:border-border hover:shadow-lg ${isDragging ? 'opacity-40' : ''}`}
												draggable
												onDragStart={(e) =>
													handleDragStart(
														e as DragEvent,
														entry.id,
													)
												}
												onDragEnd={handleDragEnd}
											>
												<span class="shrink-0 cursor-grab select-none pt-[2px] text-base text-text-muted leading-[1.4] group-hover:text-text-secondary">
													⠿
												</span>

												<div class="flex min-w-0 flex-1 flex-col gap-1.5">
													<div class="flex flex-wrap items-center gap-2">
														<span class="shrink-0 text-[13px] opacity-80">
															{char?.isUserPersona
																? '🧑'
																: '🎭'}
														</span>
														<span class="shrink-0 font-semibold text-accent text-xs">
															{char?.name ??
																'Unknown'}
														</span>
														{entry.label && (
															<span class="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-text-muted italic">
																{entry.label}
															</span>
														)}
													</div>

													{memory ? (
														<>
															<div class="text-[13px] text-text-primary leading-[1.45]">
																{memory.summary}
															</div>
															<div class="flex flex-wrap items-center gap-1.5">
																{memory.tags
																	.slice(0, 4)
																	.map(
																		(
																			tag,
																		) => (
																			<span
																				key={
																					tag
																				}
																				class="whitespace-nowrap rounded-[9px] bg-bg-active px-[7px] py-[2px] text-sm text-text-muted"
																			>
																				{
																					tag
																				}
																			</span>
																		),
																	)}
																<div
																	class="relative h-[3px] w-12 shrink-0 overflow-hidden rounded-[2px] bg-border-light"
																	title={`Importance: ${memory.importance.toFixed(1)}`}
																>
																	<div
																		class="absolute top-0 left-0 h-full rounded-[2px] bg-accent"
																		style={{
																			width: `${memory.importance * 100}%`,
																		}}
																	/>
																</div>
																<span class="text-sm text-text-muted">
																	{memory.importance.toFixed(
																		1,
																	)}
																</span>
															</div>
														</>
													) : (
														<div
															class="text-[13px] leading-[1.45]"
															style={{
																color: 'var(--text-muted)',
																fontStyle:
																	'italic',
															}}
														>
															{entry.label ??
																'Memory not found'}
														</div>
													)}
												</div>

												<div class="flex shrink-0 flex-col items-end gap-1.5">
													<button
														class="whitespace-nowrap rounded-sm border border-transparent bg-accent-dim px-2.5 py-[5px] font-semibold text-[11px] text-accent transition-all duration-150 hover:border-accent hover:bg-accent hover:text-white"
														onClick={() =>
															handleStartChat(
																entry,
															)
														}
														title="Start a new chat from this point in the story"
													>
														▶ Start here
													</button>
													<button
														class="rounded-sm px-1.5 py-1 text-[11px] text-text-muted leading-none transition-all duration-150 hover:bg-[rgba(239,68,68,0.1)] hover:text-error"
														onClick={() =>
															handleDelete(
																entry.id,
															)
														}
														title="Remove from timeline"
													>
														✕
													</button>
												</div>
											</div>
										</div>
									);
								})}

								<div
									class="flex flex-col items-center"
									onDragOver={(e) =>
										handleDragOver(
											e as DragEvent,
											visibleEntries.length,
										)
									}
									onDrop={(e) =>
										handleDrop(
											e as DragEvent,
											visibleEntries.length,
										)
									}
								>
									<div
										class={`w-[2px] shrink-0 bg-border-light transition-all duration-100 ${dropTargetIdx === visibleEntries.length ? '!bg-accent h-7 rounded-[2px]' : 'h-3'}`}
									/>
								</div>

								<div class="flex items-center gap-2.5 py-2 font-semibold text-[11px] text-text-muted uppercase tracking-[0.08em]">
									<span class="h-px flex-1 bg-border-light" />
									<span>End of Canon</span>
									<span class="h-px flex-1 bg-border-light" />
								</div>
							</>
						)}
					</div>
				</div>
			</div>

			{startChatAnchors !== null && (
				<NewChatModal
					storyId={storyId}
					initialAnchors={startChatAnchors}
					onClose={() => setStartChatAnchors(null)}
					onCreated={(chat: Chat, openingMode) => {
						setStartChatAnchors(null);
						onClose();
						openChat(storyId, chat.id).then(() => {
							if (openingMode === 'auto')
								generateOpener(storyId, chat.id);
						});
					}}
				/>
			)}
		</>
	);
}
