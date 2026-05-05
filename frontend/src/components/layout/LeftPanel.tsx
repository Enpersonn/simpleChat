import type {
	Character,
	Chat,
	StoryLocation as Location,
} from '@simplechat/types';
import { createPortal } from 'preact/compat';
import { useEffect, useState } from 'preact/hooks';
import { useChatsStore } from '../../store/chats.js';
import { useSettingsStore } from '../../store/settings.js';
import { useStoriesStore } from '../../store/stories.js';
import { NewChatModal } from '../chat/NewChatModal.js';
import { ConfirmDialog } from '../shared/ConfirmDialog.js';
import { ModeTag } from '../shared/ModeTag.js';
import { OllamaStatus } from '../shared/OllamaStatus.js';
import { CanonTimelineModal } from '../story/CanonTimelineModal.js';
import { CharacterModal } from '../story/CharacterModal.js';
import { StoryCreateModal } from '../story/create-modal';
import { EditStoryModal } from '../story/EditStoryModal.js';
import { LocationModal } from '../story/LocationModal.js';
import { SettingsModal } from '../story/SettingsModal.js';

export function LeftPanel() {
	const {
		stories,
		selectedStoryId,
		characters,
		locations,
		characterMemories,
		loading: storiesLoading,
		error: storiesError,
		loadStories,
		selectStory,
		deleteStory,
		deleteCharacter,
		deleteLocation,
		loadCharacterTimeline,
		initCharacterGenesis,
	} = useStoriesStore();
	const {
		chats,
		activeChatId,
		loadChats,
		openChat,
		generateOpener,
		deleteChat,
	} = useChatsStore();
	const ollamaHealthy = useSettingsStore((s) => s.ollamaHealthy);
	const setGeneration = useSettingsStore((s) => s.setGeneration);

	const [editingStory, setEditingStory] = useState<string | null>(null);
	const [showNewChat, setShowNewChat] = useState(false);
	const [branchAnchors, setBranchAnchors] = useState<Record<
		string,
		string
	> | null>(null);
	const [editingChar, setEditingChar] = useState<
		Character | null | 'new' | 'new-persona'
	>(null);
	const [editingLocation, setEditingLocation] = useState<
		Location | null | 'new'
	>(null);
	const [showSettings, setShowSettings] = useState(false);
	const [showTimeline, setShowTimeline] = useState(false);
	const [expandedTimeline, setExpandedTimeline] = useState<string | null>(
		null,
	);
	const [pendingConfirm, setPendingConfirm] = useState<{
		message: string;
		onConfirm: () => void;
	} | null>(null);

	useEffect(() => {
		loadStories();
	}, []);

	useEffect(() => {
		if (selectedStoryId) loadChats(selectedStoryId);
	}, [selectedStoryId]);

	const handleStoryClick = async (id: string) => {
		if (id === selectedStoryId) return;
		await selectStory(id);
	};

	const handleBack = async () => {
		await selectStory(null);
	};

	const handleChatClick = (chat: Chat) => {
		if (!selectedStoryId) return;
		if (chat.id === activeChatId) return;
		openChat(selectedStoryId, chat.id);
		setGeneration({
			responseLength:
				chat.mode === 'storyteller' ? 'paragraph+' : 'medium',
		});
	};

	const handleDeleteStory = (e: MouseEvent, id: string) => {
		e.stopPropagation();
		setPendingConfirm({
			message: 'Delete this story and all its chats?',
			onConfirm: () => deleteStory(id),
		});
	};

	const handleDeleteChar = (e: MouseEvent, charId: string) => {
		e.stopPropagation();
		setPendingConfirm({
			message: 'Delete this character?',
			onConfirm: () => deleteCharacter(charId),
		});
	};

	const handleDeleteLocation = (e: MouseEvent, locationId: string) => {
		e.stopPropagation();
		setPendingConfirm({
			message: 'Delete this location?',
			onConfirm: () => deleteLocation(locationId),
		});
	};

	const handleDeleteChat = (e: MouseEvent, chatId: string) => {
		e.stopPropagation();
		if (!selectedStoryId) return;
		setPendingConfirm({
			message: 'Delete this chat and all its messages?',
			onConfirm: () => deleteChat(selectedStoryId, chatId),
		});
	};

	const handleToggleTimeline = async (charId: string) => {
		if (expandedTimeline === charId) {
			setExpandedTimeline(null);
			return;
		}
		setExpandedTimeline(charId);
		if (!characterMemories[charId]) {
			await loadCharacterTimeline(charId);
		}
	};

	const handleBranchFromMemory = (charId: string, memoryId: string) => {
		setBranchAnchors({ [charId]: memoryId });
		setShowNewChat(true);
	};

	const handleInitGenesis = async (e: MouseEvent, charId: string) => {
		e.stopPropagation();
		await initCharacterGenesis(charId);
	};

	const selectedStory = stories.find((s) => s.id === selectedStoryId);
	const storyChats = chats.filter(
		(c) => c.storyId === selectedStoryId && c.mode !== 'planning',
	);

	/* Shared class strings */
	const itemCls =
		"group/item flex items-center gap-1.5 px-3 py-1.5 cursor-pointer text-[13px] text-text-secondary relative transition-colors duration-100 hover:bg-bg-hover hover:text-text-primary data-[active=true]:bg-gold-dim data-[active=true]:text-text-primary before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-0.5 before:bg-transparent data-[active=true]:before:bg-gold before:rounded-r-sm";
	const itemActionsCls =
		'hidden group-hover/item:flex items-center gap-0.5 shrink-0';
	const iconBtnCls =
		'text-[12px] px-1 py-px rounded-sm text-text-muted leading-none transition-colors duration-100 hover:text-text-primary hover:bg-bg-active data-[active=true]:text-accent';
	const sectionCls = 'py-2 pb-1';
	const sectionHeaderCls = 'flex items-center justify-between px-3 py-1';
	const sectionLabelCls =
		'text-sm font-semibold tracking-[0.08em] uppercase text-gold-label';
	const addBtnCls =
		'text-[18px] leading-none text-text-muted px-0.5 rounded-sm transition-colors duration-150 hover:text-accent';
	const emptyCls = 'px-3 py-2 text-[12px] text-text-muted italic';

	return (
		<div class="flex h-full flex-col overflow-hidden">
			{selectedStoryId && selectedStory ? (
				/* ── Story detail view ── */
				<>
					<div class="flex min-h-[44px] shrink-0 items-center gap-1.5 border-border border-b px-3 py-2.5">
						<button
							type="button"
							class="shrink-0 rounded-sm px-1.5 py-0.5 text-[16px] text-text-muted transition-colors duration-150 hover:bg-gold-dim hover:text-gold"
							onClick={handleBack}
							title="Back to stories"
						>
							←
						</button>
						<span
							class="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-display font-semibold text-[12px] text-gold tracking-[0.06em]"
							title={selectedStory.title}
						>
							{selectedStory.title}
						</span>
						<OllamaStatus healthy={ollamaHealthy} />
					</div>

					<div class="flex-1 overflow-y-auto overflow-x-hidden">
						{/* Chats */}
						<div class={sectionCls}>
							<div class={sectionHeaderCls}>
								<span class={sectionLabelCls}>Chats</span>
								<button
									type="button"
									class={addBtnCls}
									onClick={() => setShowNewChat(true)}
									title="New chat"
								>
									+
								</button>
							</div>
							{storyChats.length === 0 && (
								<div class={emptyCls}>No chats yet</div>
							)}
							{storyChats.map((chat) => (
								<button
									type="button"
									key={chat.id}
									class={itemCls}
									data-active={
										chat.id === activeChatId
											? 'true'
											: undefined
									}
									onClick={() => handleChatClick(chat)}
								>
									<span class="shrink-0 text-[12px] opacity-70">
										{chat.mode === 'storyteller'
											? '📝'
											: '💬'}
									</span>
									<span
										class="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
										title={
											chat.title ||
											`Chat ${chat.id.slice(0, 6)}`
										}
									>
										{chat.title ||
											`Chat ${chat.id.slice(0, 6)}`}
									</span>
									<ModeTag mode={chat.mode} />
									<div class={itemActionsCls}>
										<button
											type="button"
											class={iconBtnCls}
											onClick={(e) =>
												handleDeleteChat(e, chat.id)
											}
											title="Delete chat"
										>
											✕
										</button>
									</div>
								</button>
							))}
						</div>

						{/* Player Personas */}
						<div class={sectionCls}>
							<div class={sectionHeaderCls}>
								<span class={sectionLabelCls}>
									Your Persona
								</span>
								<button
									type="button"
									class={addBtnCls}
									onClick={() =>
										setEditingChar('new-persona')
									}
									title="New persona"
								>
									+
								</button>
							</div>
							{characters.filter((c) => c.isUserPersona)
								.length === 0 && (
								<div class={emptyCls}>
									No persona yet — add one to define your
									character
								</div>
							)}
							{characters
								.filter((c) => c.isUserPersona)
								.map((char) => (
									<div key={char.id} class={itemCls}>
										<span class="shrink-0 text-[12px] opacity-70">
											🧑
										</span>
										<span
											class="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
											title={char.name}
										>
											{char.name}
										</span>
										{char.role && (
											<span class="max-w-[60px] shrink-0 overflow-hidden text-ellipsis whitespace-nowrap text-[9px] text-text-muted">
												{char.role}
											</span>
										)}
										<div class={itemActionsCls}>
											<button
												type="button"
												class={iconBtnCls}
												onClick={(e) => {
													e.stopPropagation();
													setEditingChar(char);
												}}
												title="Edit persona"
											>
												✎
											</button>
											<button
												type="button"
												class={iconBtnCls}
												onClick={(e) =>
													handleDeleteChar(e, char.id)
												}
												title="Delete persona"
											>
												✕
											</button>
										</div>
									</div>
								))}
						</div>

						{/* AI Characters */}
						<div class={sectionCls}>
							<div class={sectionHeaderCls}>
								<span class={sectionLabelCls}>Characters</span>
								<button
									type="button"
									class={addBtnCls}
									onClick={() => setEditingChar('new')}
									title="New character"
								>
									+
								</button>
							</div>
							{characters.filter((c) => !c.isUserPersona)
								.length === 0 && (
								<div class={emptyCls}>No characters yet</div>
							)}
							{characters
								.filter((c) => !c.isUserPersona)
								.map((char) => (
									<div key={char.id}>
										<div class={itemCls}>
											<span class="shrink-0 text-[12px] opacity-70">
												🎭
											</span>
											<span
												class="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
												title={char.name}
											>
												{char.name}
											</span>
											{char.role && (
												<span class="max-w-[60px] shrink-0 overflow-hidden text-ellipsis whitespace-nowrap text-[9px] text-text-muted">
													{char.role}
												</span>
											)}
											<div class={itemActionsCls}>
												<button
													type="button"
													class={iconBtnCls}
													data-active={
														expandedTimeline ===
														char.id
															? 'true'
															: undefined
													}
													onClick={(e) => {
														e.stopPropagation();
														handleToggleTimeline(
															char.id,
														);
													}}
													title="Character timeline"
												>
													⏱
												</button>
												<button
													type="button"
													class={iconBtnCls}
													onClick={(e) => {
														e.stopPropagation();
														setEditingChar(char);
													}}
													title="Edit character"
												>
													✎
												</button>
												<button
													type="button"
													class={iconBtnCls}
													onClick={(e) =>
														handleDeleteChar(
															e,
															char.id,
														)
													}
													title="Delete character"
												>
													✕
												</button>
											</div>
										</div>
										{expandedTimeline === char.id && (
											<div class="mx-3 mb-1.5 ml-8 flex flex-col gap-1 border-border border-l-2 pl-2">
												{!char.genesisMemoryId && (
													<button
														type="button"
														class="w-full rounded-sm border border-border border-dashed px-2 py-1 text-left text-[11px] text-text-muted transition-colors duration-100 hover:border-accent hover:text-accent"
														onClick={(e) =>
															handleInitGenesis(
																e,
																char.id,
															)
														}
													>
														Initialize timeline from
														traits
													</button>
												)}
												{(
													characterMemories[
														char.id
													] ?? []
												).length === 0 &&
													char.genesisMemoryId && (
														<div class={emptyCls}>
															No memories yet
														</div>
													)}
												{[
													...(characterMemories[
														char.id
													] ?? []),
												]
													.sort((a, b) =>
														a.relation.createdAt.localeCompare(
															b.relation
																.createdAt,
														),
													)
													.map(
														({
															relation,
															memory: mem,
														}) => {
															const locName =
																mem.locationId
																	? locations.find(
																			(
																				l,
																			) =>
																				l.id ===
																				mem.locationId,
																		)?.name
																	: undefined;
															return (
																<div
																	key={mem.id}
																	class="flex items-start gap-[5px] text-[11px] text-text-secondary"
																>
																	<span
																		class="mt-px shrink-0 text-[9px] text-text-muted"
																		title={
																			mem.importance >=
																			0.8
																				? 'High importance'
																				: 'Normal'
																		}
																	>
																		{mem.importance >=
																		0.8
																			? '●'
																			: '○'}
																	</span>
																	<span
																		class="min-w-0 flex-1 leading-[1.4]"
																		title={
																			mem.summary
																		}
																	>
																		{mem
																			.summary
																			.length >
																		72
																			? `${mem.summary.slice(0, 69)}…`
																			: mem.summary}
																	</span>
																	{locName && (
																		<span
																			class="max-w-[60px] shrink-0 overflow-hidden text-ellipsis whitespace-nowrap text-[9px] text-text-muted"
																			title={`Location: ${locName}`}
																		>
																			📍
																			{
																				locName
																			}
																		</span>
																	)}
																	<button
																		type="button"
																		class="shrink-0 whitespace-nowrap rounded-sm bg-accent-dim px-1.5 py-px text-accent text-sm transition-colors duration-100 hover:bg-accent hover:text-text-on-accent"
																		onClick={() =>
																			handleBranchFromMemory(
																				char.id,
																				relation.id,
																			)
																		}
																		title="Start a new chat from this point in the timeline"
																	>
																		Branch
																	</button>
																</div>
															);
														},
													)}
											</div>
										)}
									</div>
								))}
						</div>

						{/* Locations */}
						<div class={sectionCls}>
							<div class={sectionHeaderCls}>
								<span class={sectionLabelCls}>Locations</span>
								<button
									type="button"
									class={addBtnCls}
									onClick={() => setEditingLocation('new')}
									title="New location"
								>
									+
								</button>
							</div>
							{locations.length === 0 && (
								<div class={emptyCls}>No locations yet</div>
							)}
							{locations.map((loc) => (
								<div key={loc.id} class={itemCls}>
									<span class="shrink-0 text-[12px] opacity-70">
										📍
									</span>
									<span
										class="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
										title={loc.name}
									>
										{loc.name}
									</span>
									<div class={itemActionsCls}>
										<button
											type="button"
											class={iconBtnCls}
											onClick={(e) => {
												e.stopPropagation();
												setEditingLocation(loc);
											}}
											title="Edit location"
										>
											✎
										</button>
										<button
											type="button"
											class={iconBtnCls}
											onClick={(e) =>
												handleDeleteLocation(e, loc.id)
											}
											title="Delete location"
										>
											✕
										</button>
									</div>
								</div>
							))}
						</div>

						{/* Story-level actions */}
						<div class={sectionCls}>
							<div class={sectionHeaderCls}>
								<span class={sectionLabelCls}>Story</span>
								<button
									type="button"
									class={iconBtnCls}
									onClick={() =>
										setEditingStory(selectedStoryId)
									}
									title="Edit story settings"
								>
									✎
								</button>
							</div>
							<button
								type="button"
								class="flex w-full items-center gap-2 rounded-none px-3 py-1.5 text-left text-[12px] text-text-muted transition-colors duration-100 hover:bg-bg-hover hover:text-gold"
								onClick={() => setShowTimeline(true)}
							>
								<span>⏱</span>
								<span>Canon Timeline</span>
							</button>
						</div>
					</div>

					<div class="shrink-0 border-border border-t px-2.5 py-2">
						<button
							class="w-full rounded-sm px-2 py-1.5 text-left text-[12px] text-text-muted transition-colors duration-100 hover:bg-bg-hover hover:text-text-primary"
							type="button"
							onClick={() => setShowSettings(true)}
						>
							⚙ Settings
						</button>
					</div>
				</>
			) : (
				/* ── Stories list view ── */
				<>
					<div class="flex shrink-0 items-center justify-between border-border border-b px-3 pt-3.5 pb-2.5">
						<span class="font-display font-semibold text-[13px] text-gold tracking-[0.1em]">
							✦ SimpleChat
						</span>
						<OllamaStatus healthy={ollamaHealthy} />
					</div>

					<div class="flex-1 overflow-y-auto overflow-x-hidden">
						<div class={sectionCls}>
							<div class={sectionHeaderCls}>
								<span class={sectionLabelCls}>Stories</span>
								<StoryCreateModal selectStory={selectStory} />
							</div>
							{storiesLoading && (
								<div
									class={emptyCls}
									style={{ fontStyle: 'normal' }}
								>
									Loading…
								</div>
							)}
							{storiesError && !storiesLoading && (
								<div
									class={emptyCls}
									style={{
										color: 'var(--error)',
										fontStyle: 'normal',
									}}
								>
									{storiesError}
								</div>
							)}
							{!storiesLoading &&
								stories.length === 0 &&
								!storiesError && (
									<div class={emptyCls}>No stories yet</div>
								)}
							{stories.map((story) => (
								<div
									key={story.id}
									type="button"
									class={itemCls}
									onClick={() => handleStoryClick(story.id)}
								>
									<span class="shrink-0 text-[12px] opacity-70">
										📖
									</span>
									<span
										class="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
										title={story.title}
									>
										{story.title}
									</span>
									<div class={itemActionsCls}>
										<button
											type="button"
											class={iconBtnCls}
											onClick={(e) => {
												e.stopPropagation();
												selectStory(story.id).then(() =>
													setEditingStory(story.id),
												);
											}}
											title="Edit story"
										>
											✎
										</button>
										<button
											type="button"
											class={iconBtnCls}
											onClick={(e) =>
												handleDeleteStory(e, story.id)
											}
											title="Delete story"
										>
											✕
										</button>
									</div>
								</div>
							))}
						</div>
					</div>

					<div class="shrink-0 border-border border-t px-2.5 py-2">
						<button
							type="button"
							class="w-full rounded-sm px-2 py-1.5 text-left text-[12px] text-text-muted transition-colors duration-100 hover:bg-bg-hover hover:text-text-primary"
							onClick={() => setShowSettings(true)}
						>
							Settings
						</button>
					</div>
				</>
			)}
			{editingStory &&
				selectedStory &&
				editingStory === selectedStory.id &&
				createPortal(
					<EditStoryModal
						story={selectedStory}
						onClose={() => setEditingStory(null)}
						onSaved={() => setEditingStory(null)}
					/>,
					document.body,
				)}

			{(editingChar === 'new' || editingChar === 'new-persona') &&
				createPortal(
					<CharacterModal
						defaultIsPersona={editingChar === 'new-persona'}
						onClose={() => setEditingChar(null)}
						onSaved={() => setEditingChar(null)}
					/>,
					document.body,
				)}

			{editingChar &&
				editingChar !== 'new' &&
				editingChar !== 'new-persona' &&
				createPortal(
					<CharacterModal
						initial={editingChar}
						onClose={() => setEditingChar(null)}
						onSaved={() => setEditingChar(null)}
					/>,
					document.body,
				)}

			{showNewChat &&
				selectedStoryId &&
				createPortal(
					<NewChatModal
						storyId={selectedStoryId}
						initialAnchors={branchAnchors ?? undefined}
						onClose={() => {
							setShowNewChat(false);
							setBranchAnchors(null);
						}}
						onCreated={(chat, openingMode) => {
							setShowNewChat(false);
							setBranchAnchors(null);
							openChat(selectedStoryId, chat.id).then(() => {
								if (openingMode === 'auto')
									generateOpener(selectedStoryId, chat.id);
							});
							loadChats(selectedStoryId);
						}}
					/>,
					document.body,
				)}

			{editingLocation === 'new' &&
				createPortal(
					<LocationModal
						onClose={() => setEditingLocation(null)}
						onSaved={() => setEditingLocation(null)}
					/>,
					document.body,
				)}

			{editingLocation &&
				editingLocation !== 'new' &&
				createPortal(
					<LocationModal
						initial={editingLocation}
						onClose={() => setEditingLocation(null)}
						onSaved={() => setEditingLocation(null)}
					/>,
					document.body,
				)}

			{showSettings &&
				createPortal(
					<SettingsModal onClose={() => setShowSettings(false)} />,
					document.body,
				)}

			{showTimeline &&
				selectedStoryId &&
				createPortal(
					<CanonTimelineModal
						storyId={selectedStoryId}
						onClose={() => setShowTimeline(false)}
					/>,
					document.body,
				)}

			{pendingConfirm && (
				<ConfirmDialog
					message={pendingConfirm.message}
					onConfirm={() => {
						pendingConfirm.onConfirm();
						setPendingConfirm(null);
					}}
					onCancel={() => setPendingConfirm(null)}
				/>
			)}
		</div>
	);
}
