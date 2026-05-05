import type { Character, Story } from '@simplechat/types';
import { useState } from 'preact/hooks';
import { api } from '../../lib/api.js';
import { useStoriesStore } from '../../store/stories.js';
import { Badge } from '../shared/Badge.js';
import { Button } from '../shared/Button.js';
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '../shared/Dialog.js';
import { f } from '../shared/formCls.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../shared/Tabs.js';
import { CharacterModal } from './CharacterModal.js';
import { GENRE_OPTIONS, TONE_OPTIONS } from './constants.js';
import { DmChatTab } from './DmChatTab.js';

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
				genres,
				openingMessage: openingMessage.trim(),
				premise: premise.trim(),
				rules: {
					characterRules: story.rules.characterRules,
					storyRules: story.rules.storyRules,
					worldRules: rules
						.split('\n')
						.map((r) => r.trim())
						.filter(Boolean),
				},
				systemPromptOverride: systemPromptOverride.trim(),
				title: title.trim(),
				tone: tones,
				writingStyle: {
					...story.writingStyle,
					prose: writingStyle.trim(),
				},
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

	const handleClick = () => {
		selectStory(story.id).then(() => setEditingStory(story.id));
	};

	return (
		<Dialog>
			<DialogTrigger>
				<Button
					onClick={handleClick}
					size="icon"
					variant="ghost"
					title="Edit story"
				>
					✎
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Edit Story</DialogTitle>
					<DialogClose />
				</DialogHeader>

				{/* Tab bar */}
				<Tabs defaultValue="settings">
					<TabsList class="mb-1 flex shrink-0 gap-0.5 border-border-light border-b pb-0">
						<TabsTrigger value="settings">Settings</TabsTrigger>
						<TabsTrigger value="dm">DM Chat</TabsTrigger>
					</TabsList>

					<TabsContent value="dm">
						<DmChatTab storyId={story.id} />
					</TabsContent>
					<TabsContent value="settings">
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
										(e.target as HTMLInputElement).value,
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
										(e.target as HTMLTextAreaElement).value,
									)
								}
								placeholder="What is this story about?"
								style={{ minHeight: '120px' }}
							/>
							<div class={f.aiBar}>
								<Button
									variant="secondary"
									onClick={handleRegenerate}
									disabled={generating || !premise.trim()}
									title="Regenerate genres, tone, rules and writing style from the current premise"
								>
									{generating
										? '✨ Regenerating…'
										: '✨ Regenerate metadata from premise'}
								</Button>
							</div>
						</div>

						<div class={f.field}>
							<label class={f.label}>Genre</label>
							<div class={f.tagGroup}>
								{GENRE_OPTIONS.map((g) => (
									<Badge
										key={g}
										active={genres.includes(g)}
										onClick={() =>
											toggle(genres, g, setGenres)
										}
									>
										{g}
									</Badge>
								))}
								{customGenres.map((g) => (
									<Badge
										key={g}
										active={genres.includes(g)}
										onClick={() =>
											toggle(genres, g, setGenres)
										}
									>
										{g}
										<span class={f.tagRemove}>×</span>
									</Badge>
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
								<Button
									variant="secondary"
									size="icon"
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
								</Button>
							</div>
						</div>

						<div class={f.field}>
							<label class={f.label}>Tone</label>
							<div class={f.tagGroup}>
								{TONE_OPTIONS.map((t) => (
									<Badge
										key={t}
										active={tones.includes(t)}
										onClick={() =>
											toggle(tones, t, setTones)
										}
									>
										{t}
									</Badge>
								))}
								{customTones.map((t) => (
									<Badge
										key={t}
										active
										onClick={() =>
											toggle(tones, t, setTones)
										}
									>
										{t}
										<span class={f.tagRemove}>×</span>
									</Badge>
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
								<Button
									variant="secondary"
									size="icon"
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
								</Button>
							</div>
						</div>

						<div class={f.field}>
							<label class={f.label}>
								World Rules{' '}
								<span class={f.labelHint}>(one per line)</span>
							</label>
							<textarea
								class={f.textarea}
								value={rules}
								onInput={(e) =>
									setRules(
										(e.target as HTMLTextAreaElement).value,
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
										(e.target as HTMLTextAreaElement).value,
									)
								}
								style={{ minHeight: '56px' }}
							/>
						</div>

						<div class={f.field}>
							<label class={f.label}>
								Opening Message{' '}
								<span class={f.labelHint}>
									(optional — used when starting a new chat)
								</span>
							</label>
							<textarea
								class={f.textarea}
								placeholder="The scene opens on a rain-slicked street…"
								value={openingMessage}
								onInput={(e) =>
									setOpeningMessage(
										(e.target as HTMLTextAreaElement).value,
									)
								}
								style={{ minHeight: '60px' }}
							/>
						</div>

						<div class={f.field}>
							<label class={f.label}>
								System Prompt Override{' '}
								<span class={f.labelHint}>
									(replaces all default instructions if set)
								</span>
							</label>
							<textarea
								class={f.textarea}
								value={systemPromptOverride}
								onInput={(e) =>
									setSystemPromptOverride(
										(e.target as HTMLTextAreaElement).value,
									)
								}
								placeholder="Leave blank to use default instructions…"
								style={{ minHeight: '80px' }}
							/>
						</div>

						<div class={f.field}>
							<div class={f.charSectionHeader}>
								<label class={f.label} style={{ margin: 0 }}>
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
										onClick={() => setEditingChar('new')}
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
										<span class={f.charRole}>{c.role}</span>
									)}
									<span class={f.charActions}>
										<button
											class={f.iconActionBtn}
											onClick={() => setEditingChar(c)}
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
					</TabsContent>
				</Tabs>

				{editingChar !== null && (
					<CharacterModal
						initial={
							editingChar === 'new' ||
							editingChar === 'new-persona'
								? undefined
								: editingChar
						}
						defaultIsPersona={editingChar === 'new-persona'}
						onClose={() => setEditingChar(null)}
						onSaved={() => setEditingChar(null)}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}
