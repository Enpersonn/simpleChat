import { useState, useEffect, useRef } from 'preact/hooks';
import type {
	CanonEntry,
	CharacterMemory,
	Character,
	Chat,
} from '@simplechat/types';
import { useStoriesStore } from '../../store/stories.js';
import { api } from '../../lib/api.js';
import { NewChatModal } from '../chat/NewChatModal.js';
import { useChatsStore } from '../../store/chats.js';

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
				class="fixed inset-0 bg-black/70 flex items-stretch justify-center z-100 backdrop-blur-sm"
				onClick={(e) => {
					if (e.target === e.currentTarget) onClose();
				}}
			>
				<div class="bg-bg-primary border-x border-border-light w-[680px] max-w-full flex flex-col overflow-hidden">
					{/* Header */}
					<div class="flex items-center justify-between py-[18px] px-6 pb-[14px] border-b border-border shrink-0 bg-bg-secondary">
						<div class="flex flex-col gap-[2px]">
							<span class="text-base font-semibold text-text-primary">
								Canon Timeline
							</span>
							{story && (
								<span class="text-[11px] text-text-muted">
									{story.title}
								</span>
							)}
						</div>
						<button
							class="text-text-muted text-[18px] py-1 px-2 rounded-sm shrink-0 transition-colors duration-150 hover:text-text-primary hover:bg-bg-hover"
							onClick={onClose}
						>
							✕
						</button>
					</div>

					{/* Toolbar */}
					{charsInTimeline.length > 0 && (
						<div class="flex items-center gap-2 py-2.5 px-6 border-b border-border shrink-0 bg-bg-secondary flex-wrap">
							<span class="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted shrink-0">
								Filter
							</span>
							<button
								class={`text-[11px] py-[3px] px-2.5 rounded-xl border transition-all duration-150 whitespace-nowrap cursor-pointer ${activeCharFilter === null ? 'bg-accent-dim border-accent text-accent' : 'border-border-light text-text-secondary bg-transparent hover:border-accent hover:text-text-primary'}`}
								onClick={() => setActiveCharFilter(null)}
							>
								All
							</button>
							{charsInTimeline.map((char) => (
								<button
									key={char.id}
									class={`text-[11px] py-[3px] px-2.5 rounded-xl border transition-all duration-150 whitespace-nowrap cursor-pointer ${activeCharFilter === char.id ? 'bg-accent-dim border-accent text-accent' : 'border-border-light text-text-secondary bg-transparent hover:border-accent hover:text-text-primary'}`}
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
					<div class="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-0">
						{visibleEntries.length === 0 && (
							<div class="flex flex-col items-center justify-center gap-2.5 py-[60px] px-6 text-text-muted text-center">
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
								<div class="flex items-center gap-2.5 py-2 text-text-muted text-[11px] font-semibold tracking-[0.08em] uppercase">
									<span class="flex-1 h-px bg-border-light" />
									<span>Start of Story</span>
									<span class="flex-1 h-px bg-border-light" />
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
												class={`w-[2px] shrink-0 bg-border-light transition-all duration-100 ${isDropTarget ? 'h-7 !bg-accent rounded-[2px]' : 'h-3'}`}
											/>

											<div
												class={`w-full bg-bg-secondary border border-border-light rounded-lg py-3.5 px-4 flex gap-3 items-start cursor-grab transition-all duration-150 relative hover:border-border hover:shadow-lg ${isDragging ? 'opacity-40' : ''}`}
												draggable
												onDragStart={(e) =>
													handleDragStart(
														e as DragEvent,
														entry.id,
													)
												}
												onDragEnd={handleDragEnd}
											>
												<span class="text-base text-text-muted cursor-grab shrink-0 leading-[1.4] select-none pt-[2px] group-hover:text-text-secondary">
													⠿
												</span>

												<div class="flex-1 min-w-0 flex flex-col gap-1.5">
													<div class="flex items-center gap-2 flex-wrap">
														<span class="text-[13px] opacity-80 shrink-0">
															{char?.isUserPersona
																? '🧑'
																: '🎭'}
														</span>
														<span class="text-xs font-semibold text-accent shrink-0">
															{char?.name ??
																'Unknown'}
														</span>
														{entry.label && (
															<span class="text-[11px] text-text-muted italic overflow-hidden text-ellipsis whitespace-nowrap">
																{entry.label}
															</span>
														)}
													</div>

													{memory ? (
														<>
															<div class="text-[13px] text-text-primary leading-[1.45]">
																{memory.summary}
															</div>
															<div class="flex items-center gap-1.5 flex-wrap">
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
																				class="text-[10px] py-[2px] px-[7px] rounded-[9px] bg-bg-active text-text-muted whitespace-nowrap"
																			>
																				{
																					tag
																				}
																			</span>
																		),
																	)}
																<div
																	class="h-[3px] rounded-[2px] bg-border-light w-12 relative overflow-hidden shrink-0"
																	title={`Importance: ${memory.importance.toFixed(1)}`}
																>
																	<div
																		class="absolute top-0 left-0 h-full rounded-[2px] bg-accent"
																		style={{
																			width: `${memory.importance * 100}%`,
																		}}
																	/>
																</div>
																<span class="text-[10px] text-text-muted">
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

												<div class="flex flex-col items-end gap-1.5 shrink-0">
													<button
														class="text-[11px] font-semibold py-[5px] px-2.5 rounded-sm bg-accent-dim text-accent border border-transparent whitespace-nowrap transition-all duration-150 hover:bg-accent hover:text-white hover:border-accent"
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
														class="text-[11px] py-1 px-1.5 rounded-sm text-text-muted transition-all duration-150 leading-none hover:text-error hover:bg-[rgba(239,68,68,0.1)]"
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
										class={`w-[2px] shrink-0 bg-border-light transition-all duration-100 ${dropTargetIdx === visibleEntries.length ? 'h-7 !bg-accent rounded-[2px]' : 'h-3'}`}
									/>
								</div>

								<div class="flex items-center gap-2.5 py-2 text-text-muted text-[11px] font-semibold tracking-[0.08em] uppercase">
									<span class="flex-1 h-px bg-border-light" />
									<span>End of Canon</span>
									<span class="flex-1 h-px bg-border-light" />
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
