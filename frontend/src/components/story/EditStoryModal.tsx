import { useState } from 'preact/hooks';
import type { Story, Character } from '@simplechat/types';
import { useStoriesStore } from '../../store/stories.js';
import { api } from '../../lib/api.js';
import { CharacterModal } from './CharacterModal.js';
import { DmChatTab } from './DmChatTab.js';
import { f } from '../shared/formCls.js';

const GENRE_OPTIONS = [
	'Fantasy',
	'Sci-Fi',
	'Horror',
	'Romance',
	'Mystery',
	'Thriller',
	'Historical',
	'Contemporary',
];
const TONE_OPTIONS = [
	'Dark',
	'Light',
	'Grim',
	'Hopeful',
	'Intimate',
	'Epic',
	'Tense',
	'Whimsical',
	'Melancholic',
	'Romantic',
];

interface Props {
	story: Story;
	onClose: () => void;
	onSaved: (story: Story) => void;
}

export function EditStoryModal({ story, onClose, onSaved }: Props) {
	const { updateStory, characters, deleteCharacter } = useStoriesStore();
	const [title, setTitle] = useState(story.title);
	const [premise, setPremise] = useState(story.premise);
	const [genres, setGenres] = useState<string[]>(story.genres);
	const [tones, setTones] = useState<string[]>(story.tone);
	const [rules, setRules] = useState(story.rules.worldRules.join('\n'));
	const [writingStyle, setWritingStyle] = useState(story.writingStyle.prose);
	const [systemPromptOverride, setSystemPromptOverride] = useState(
		story.systemPromptOverride ?? '',
	);
	const [openingMessage, setOpeningMessage] = useState(
		story.openingMessage ?? '',
	);
	const [customGenre, setCustomGenre] = useState('');
	const [customTone, setCustomTone] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const [generating, setGenerating] = useState(false);
	const [error, setError] = useState('');
	const [editingChar, setEditingChar] = useState<
		Character | null | 'new' | 'new-persona'
	>(null);
	const [activeTab, setActiveTab] = useState<'settings' | 'dm'>('settings');

	const toggle = (
		arr: string[],
		val: string,
		setArr: (a: string[]) => void,
	) => {
		setArr(
			arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val],
		);
	};

	const addCustomTag = (
		val: string,
		arr: string[],
		setArr: (a: string[]) => void,
		setInput: (v: string) => void,
	) => {
		const trimmed = val.trim();
		if (trimmed && !arr.includes(trimmed)) setArr([...arr, trimmed]);
		setInput('');
	};

	const handleRegenerate = async () => {
		if (generating) return;
		setGenerating(true);
		setError('');
		try {
			const result = await api.ai.generate<{
				genres: string[];
				tone: string[];
				rules: {
					worldRules: string[];
					storyRules: string[];
					characterRules: string[];
				};
				writingStyle: { prose: string };
			}>('supporting-fields', story.premise, {
				storyContext: `Story: "${story.title}"`,
			});
			if (result.genres.length) setGenres(result.genres);
			if (result.tone.length) setTones(result.tone);
			if (result.rules.worldRules.length)
				setRules(result.rules.worldRules.join('\n'));
			if (result.writingStyle.prose)
				setWritingStyle(result.writingStyle.prose);
		} catch (err) {
			setError((err as Error).message);
		} finally {
			setGenerating(false);
		}
	};

	const handleSubmit = async () => {
		if (!title.trim()) {
			setError('Title is required');
			return;
		}
		setSubmitting(true);
		setError('');
		try {
			const updated = await updateStory(story.id, {
				title: title.trim(),
				premise: premise.trim(),
				genres,
				tone: tones,
				rules: {
					worldRules: rules
						.split('\n')
						.map((r) => r.trim())
						.filter(Boolean),
					storyRules: story.rules.storyRules,
					characterRules: story.rules.characterRules,
				},
				writingStyle: {
					...story.writingStyle,
					prose: writingStyle.trim(),
				},
				systemPromptOverride: systemPromptOverride.trim(),
				openingMessage: openingMessage.trim(),
			});
			onSaved(updated);
		} catch (err) {
			setError((err as Error).message);
			setSubmitting(false);
		}
	};

	const handleDeleteChar = async (charId: string) => {
		if (!confirm('Delete this character?')) return;
		try {
			await deleteCharacter(charId);
		} catch {
			/* ignore */
		}
	};

	const customGenres = genres.filter((g) => !GENRE_OPTIONS.includes(g));
	const customTones = tones.filter((t) => !TONE_OPTIONS.includes(t));

	return (
		<>
			<div
				class={f.overlay}
				onClick={(e) => {
					if (e.target === e.currentTarget) onClose();
				}}
			>
				<div class={f.modal}>
					<div class={f.header}>
						<span class={f.title}>Edit Story</span>
						<button class={f.closeBtn} onClick={onClose}>
							✕
						</button>
					</div>

					{/* Tab bar */}
					<div class="flex gap-0.5 border-b border-border-light pb-0 mb-1 shrink-0">
						<button
							class="py-[7px] px-4 text-[13px] font-medium text-text-muted rounded-t-sm cursor-pointer bg-transparent border-none border-b-2 border-transparent -mb-px transition-colors duration-150 hover:text-text-primary data-[active=true]:text-accent data-[active=true]:border-b-accent data-[active=true]:font-semibold"
							data-active={
								activeTab === 'settings' ? 'true' : undefined
							}
							onClick={() => setActiveTab('settings')}
						>
							Settings
						</button>
						<button
							class="py-[7px] px-4 text-[13px] font-medium text-text-muted rounded-t-sm cursor-pointer bg-transparent border-none border-b-2 border-transparent -mb-px transition-colors duration-150 hover:text-text-primary data-[active=true]:text-accent data-[active=true]:border-b-accent data-[active=true]:font-semibold"
							data-active={
								activeTab === 'dm' ? 'true' : undefined
							}
							onClick={() => setActiveTab('dm')}
						>
							DM Chat
						</button>
					</div>

					{activeTab === 'dm' && <DmChatTab storyId={story.id} />}

					{activeTab === 'settings' && (
						<>
							{error && <p class={f.errorMsg}>{error}</p>}

							<div class={f.field}>
								<label class={f.label}>
									Title <span class={f.required}>*</span>
								</label>
								<input
									class={f.input}
									value={title}
									onInput={(e) =>
										setTitle(
											(e.target as HTMLInputElement)
												.value,
										)
									}
								/>
							</div>

							<div class={f.field}>
								<label class={f.label}>Premise</label>
								<textarea
									class={f.textarea}
									value={premise}
									onInput={(e) =>
										setPremise(
											(e.target as HTMLTextAreaElement)
												.value,
										)
									}
									placeholder="What is this story about?"
									style={{ minHeight: '120px' }}
								/>
								<div class={f.aiBar}>
									<button
										class={f.aiBtn}
										onClick={handleRegenerate}
										disabled={generating || !premise.trim()}
										title="Regenerate genres, tone, rules and writing style from the current premise"
									>
										{generating
											? '✨ Regenerating…'
											: '✨ Regenerate metadata from premise'}
									</button>
								</div>
							</div>

							<div class={f.field}>
								<label class={f.label}>Genre</label>
								<div class={f.tagGroup}>
									{GENRE_OPTIONS.map((g) => (
										<button
											key={g}
											class={f.tag}
											data-active={
												genres.includes(g)
													? 'true'
													: undefined
											}
											onClick={() =>
												toggle(genres, g, setGenres)
											}
										>
											{g}
										</button>
									))}
									{customGenres.map((g) => (
										<button
											key={g}
											class={f.tag}
											data-active="true"
											onClick={() =>
												toggle(genres, g, setGenres)
											}
										>
											{g}
											<span class={f.tagRemove}>×</span>
										</button>
									))}
								</div>
								<div class={f.tagAddRow}>
									<input
										class={f.customTagInput}
										placeholder="Add genre…"
										value={customGenre}
										onInput={(e) =>
											setCustomGenre(
												(e.target as HTMLInputElement)
													.value,
											)
										}
										onKeyDown={(e) => {
											if (e.key === 'Enter') {
												e.preventDefault();
												addCustomTag(
													customGenre,
													genres,
													setGenres,
													setCustomGenre,
												);
											}
										}}
									/>
									<button
										class={f.tagAddBtn}
										onClick={() =>
											addCustomTag(
												customGenre,
												genres,
												setGenres,
												setCustomGenre,
											)
										}
									>
										+
									</button>
								</div>
							</div>

							<div class={f.field}>
								<label class={f.label}>Tone</label>
								<div class={f.tagGroup}>
									{TONE_OPTIONS.map((t) => (
										<button
											key={t}
											class={f.tag}
											data-active={
												tones.includes(t)
													? 'true'
													: undefined
											}
											onClick={() =>
												toggle(tones, t, setTones)
											}
										>
											{t}
										</button>
									))}
									{customTones.map((t) => (
										<button
											key={t}
											class={f.tag}
											data-active="true"
											onClick={() =>
												toggle(tones, t, setTones)
											}
										>
											{t}
											<span class={f.tagRemove}>×</span>
										</button>
									))}
								</div>
								<div class={f.tagAddRow}>
									<input
										class={f.customTagInput}
										placeholder="Add tone…"
										value={customTone}
										onInput={(e) =>
											setCustomTone(
												(e.target as HTMLInputElement)
													.value,
											)
										}
										onKeyDown={(e) => {
											if (e.key === 'Enter') {
												e.preventDefault();
												addCustomTag(
													customTone,
													tones,
													setTones,
													setCustomTone,
												);
											}
										}}
									/>
									<button
										class={f.tagAddBtn}
										onClick={() =>
											addCustomTag(
												customTone,
												tones,
												setTones,
												setCustomTone,
											)
										}
									>
										+
									</button>
								</div>
							</div>

							<div class={f.field}>
								<label class={f.label}>
									World Rules{' '}
									<span class={f.labelHint}>
										(one per line)
									</span>
								</label>
								<textarea
									class={f.textarea}
									value={rules}
									onInput={(e) =>
										setRules(
											(e.target as HTMLTextAreaElement)
												.value,
										)
									}
									style={{ minHeight: '60px' }}
								/>
							</div>

							<div class={f.field}>
								<label class={f.label}>Writing Style</label>
								<textarea
									class={f.textarea}
									value={writingStyle}
									onInput={(e) =>
										setWritingStyle(
											(e.target as HTMLTextAreaElement)
												.value,
										)
									}
									style={{ minHeight: '56px' }}
								/>
							</div>

							<div class={f.field}>
								<label class={f.label}>
									Opening Message{' '}
									<span class={f.labelHint}>
										(optional — used when starting a new
										chat)
									</span>
								</label>
								<textarea
									class={f.textarea}
									placeholder="The scene opens on a rain-slicked street…"
									value={openingMessage}
									onInput={(e) =>
										setOpeningMessage(
											(e.target as HTMLTextAreaElement)
												.value,
										)
									}
									style={{ minHeight: '60px' }}
								/>
							</div>

							<div class={f.field}>
								<label class={f.label}>
									System Prompt Override{' '}
									<span class={f.labelHint}>
										(replaces all default instructions if
										set)
									</span>
								</label>
								<textarea
									class={f.textarea}
									value={systemPromptOverride}
									onInput={(e) =>
										setSystemPromptOverride(
											(e.target as HTMLTextAreaElement)
												.value,
										)
									}
									placeholder="Leave blank to use default instructions…"
									style={{ minHeight: '80px' }}
								/>
							</div>

							<div class={f.field}>
								<div class={f.charSectionHeader}>
									<label
										class={f.label}
										style={{ margin: 0 }}
									>
										Characters
									</label>
									<div class={f.charAddBtns}>
										<button
											class={f.aiBtn}
											onClick={() =>
												setEditingChar('new-persona')
											}
										>
											+ Persona
										</button>
										<button
											class={f.aiBtn}
											onClick={() =>
												setEditingChar('new')
											}
										>
											+ Character
										</button>
									</div>
								</div>
								{characters.length === 0 && (
									<p class={f.hint}>No characters yet.</p>
								)}
								{characters.map((c) => (
									<div key={c.id} class={f.charRow}>
										<span class={f.charIcon}>
											{c.isUserPersona ? '🧑' : '🎭'}
										</span>
										<span class={f.charName}>{c.name}</span>
										{c.role && (
											<span class={f.charRole}>
												{c.role}
											</span>
										)}
										<span class={f.charActions}>
											<button
												class={f.iconActionBtn}
												onClick={() =>
													setEditingChar(c)
												}
											>
												✎
											</button>
											<button
												class={f.iconActionBtn}
												onClick={() =>
													handleDeleteChar(c.id)
												}
											>
												✕
											</button>
										</span>
									</div>
								))}
							</div>

							<div class={f.footer}>
								<button class={f.cancelBtn} onClick={onClose}>
									Cancel
								</button>
								<button
									class={f.submitBtn}
									onClick={handleSubmit}
									disabled={submitting || !title.trim()}
								>
									{submitting ? 'Saving…' : 'Save Changes'}
								</button>
							</div>
						</>
					)}
				</div>
			</div>

			{editingChar !== null && (
				<CharacterModal
					initial={
						editingChar === 'new' || editingChar === 'new-persona'
							? undefined
							: editingChar
					}
					defaultIsPersona={editingChar === 'new-persona'}
					onClose={() => setEditingChar(null)}
					onSaved={() => setEditingChar(null)}
				/>
			)}
		</>
	);
}
