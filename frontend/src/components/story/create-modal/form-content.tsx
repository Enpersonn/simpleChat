import type {
	MemoryDelta,
	ImportJobPartialResult,
	MemoryDeltaEffect,
	Story,
} from '@simplechat/types';
import {
	type Dispatch,
	type StateUpdater,
	useEffect,
	useState,
} from 'preact/hooks';
import { api } from '@/src/lib/api';
import { useImportJobStore } from '@/src/store/import-jobs';
import { useStoriesStore } from '@/src/store/stories';
import { Button } from '../../shared/Button';
import { DialogClose } from '../../shared/Dialog';
import { TagBox } from '../../shared/form/tag-box';
import { f } from '../../shared/formCls';
import { DRAFT_STEPS, GENRE_OPTIONS, TONE_OPTIONS } from '../constants';
import { emptyPreview } from '.';
import { convertDeltasToEffects } from './conver-deltas-to-effect';
import { ImportJobPanel } from './ImportJobPanel';
import type { LivePreview } from './live-preview-panel';
import type {
	PendingChar,
	PendingLocation,
	PendingMemory,
	RawRelation,
} from './types';

interface Props {
	selectStory: (id: string | null) => Promise<void>;
	tab: 'write' | 'import';
	setTab: Dispatch<StateUpdater<'write' | 'import'>>;
	genStep: 0 | 1 | 2 | 3 | 4;
	setGenStep: Dispatch<StateUpdater<0 | 1 | 2 | 3 | 4>>;
	setLivePreview: Dispatch<StateUpdater<LivePreview>>;
	pendingChars: PendingChar[];
	setEditingChar: Dispatch<
		StateUpdater<PendingChar | 'new' | 'new-persona' | null>
	>;
	setPendingChars: Dispatch<StateUpdater<PendingChar[]>>;
}

export const FormContent = ({
	selectStory,
	setGenStep,
	setPendingChars,
	pendingChars,
	tab,
	setTab,
	setLivePreview,
	setEditingChar,
	genStep,
}: Props) => {
	const createStory = useStoriesStore((s) => s.createStory);
	const activeJobId = useImportJobStore((state) => state.activeJobId);
	const connectionStatus = useImportJobStore(
		(state) => state.connectionStatus,
	);
	const draftText = useImportJobStore((state) => state.draftText);
	const importError = useImportJobStore((state) => state.error);
	const recentJobs = useImportJobStore((state) => state.recentJobs);
	const resumeLatestJob = useImportJobStore((state) => state.resumeLatestJob);
	const setDraftText = useImportJobStore((state) => state.setDraftText);
	const snapshot = useImportJobStore((state) => state.snapshot);
	const startImport = useImportJobStore((state) => state.startImport);
	const [title, setTitle] = useState('');
	const [premise, setPremise] = useState('');
	const [openingMessage, setOpeningMessage] = useState('');
	const [genres, setGenres] = useState<string[]>([]);
	const [tones, setTones] = useState<string[]>([]);
	const [rules, setRules] = useState('');
	const [writingStyle, setWritingStyle] = useState('');
	const [customGenre, setCustomGenre] = useState('');
	const [customTone, setCustomTone] = useState('');
	const [pendingLocations, setPendingLocations] = useState<PendingLocation[]>(
		[],
	);
	const [error, setError] = useState('');
	const [pendingMemories, setPendingMemories] = useState<PendingMemory[]>([]);
	const [submitting, setSubmitting] = useState(false);
	const toggle = (
		arr: string[],
		val: string,
		setArr: (a: string[]) => void,
	) => {
		setArr(
			arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val],
		);
	};

	const onCreated = (story: Story) => {
		selectStory(story.id);
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

	const applyGeneratedFields = (result: {
		title?: string;
		premise?: string;
		genres: string[];
		tone: string[];
		rules: string[];
		writingStyle: string | { prose?: string };
		characters: Array<{
			name: string;
			role: string;
			isUserPersona: boolean;
			age: string;
			gender: string;
			species: string;
			clothing: string;
			appearance: string;
			personality: string[];
			speechStyle: string;
			trueMotives: string;
			fears: string[];
			relationships?: RawRelation[];
		}>;
		locations?: Array<{
			name: string;
			description: string;
			layout: string;
			lighting: string;
			atmosphere: string;
			soundscape: string;
			smells: string;
			notes: string;
			tags: string[];
		}>;
	}) => {
		if (result.title && !title.trim()) setTitle(result.title);
		if (result.premise) setPremise(result.premise);
		if (result.genres.length) setGenres(result.genres);
		if (result.tone.length) setTones(result.tone);
		if (result.rules.length) setRules(result.rules.join('\n'));
		if (result.writingStyle)
			setWritingStyle(
				typeof result.writingStyle === 'string'
					? result.writingStyle
					: (result.writingStyle.prose ?? ''),
			);
		if (result.characters?.length) {
			const newChars: PendingChar[] = result.characters.map((c, i) => ({
				_localId: `draft-${Date.now()}-${i}`,
				_rawRelationships: c.relationships?.length
					? c.relationships
					: undefined,
				isUserPersona: c.isUserPersona,
				name: c.name,
				private: {
					fears: c.fears,
					hiddenEmotionalState: '',
					moralLimits: '',
					privateKnowledge: [],
					trueMotives: c.trueMotives,
				},
				public: {
					age: c.age,
					appearance: c.appearance,
					clothing: c.clothing,
					gender: c.gender,
					personality: c.personality,
					reputation: '',
					species: c.species || 'human',
					speechStyle: c.speechStyle,
					voiceNotes: '',
				},
				role: c.role,
			}));
			setPendingChars((prev) => [...prev, ...newChars]);
		}
		if (result.locations?.length) {
			const newLocs: PendingLocation[] = result.locations.map((l, i) => ({
				_localId: `loc-${Date.now()}-${i}`,
				atmosphere: l.atmosphere,
				description: l.description,
				layout: l.layout,
				lighting: l.lighting,
				name: l.name,
				notes: l.notes,
				smells: l.smells,
				soundscape: l.soundscape,
				tags: l.tags,
			}));
			setPendingLocations((prev) => [...prev, ...newLocs]);
		}
	};

	const applyImportResult = (result: ImportJobPartialResult) => {
		const storyCore = result.storyCore;
		if (storyCore) {
			setTitle(storyCore.title);
			setPremise(storyCore.premise);
			setGenres(storyCore.genres);
			setTones(storyCore.tone);
			const allRules = [
				...storyCore.rules.worldRules,
				...storyCore.rules.storyRules,
				...storyCore.rules.characterRules,
			];
			setRules(allRules.join('\n'));
			setWritingStyle(storyCore.writingStyle.prose);
		}

		setPendingChars(
			result.characters.map((character, index) => ({
				_localId: `import-char-${index}-${character.name}`,
				_rawRelationships: character.relationships.length
					? character.relationships
					: undefined,
				isUserPersona: character.isUserPersona,
				name: character.name,
				private: {
					fears: character.fears,
					hiddenEmotionalState: '',
					moralLimits: '',
					privateKnowledge: [],
					trueMotives: character.trueMotives,
				},
				public: {
					age: character.age,
					appearance: character.appearance,
					clothing: character.clothing,
					gender: character.gender,
					personality: character.personality,
					reputation: '',
					species: character.species || 'human',
					speechStyle: character.speechStyle,
					voiceNotes: '',
				},
				role: character.role,
			})),
		);

		setPendingLocations(
			result.locations.map((location, index) => ({
				_localId: `import-loc-${index}-${location.name}`,
				atmosphere: location.atmosphere,
				description: location.description,
				layout: location.layout,
				lighting: location.lighting,
				name: location.name,
				notes: location.notes,
				smells: location.smells,
				soundscape: location.soundscape,
				tags: location.tags,
			})),
		);

		setPendingMemories(
			result.memories.map((memory, index) => ({
				_localId: `import-mem-${index}-${memory.characterName}`,
				characterName: memory.characterName,
				deltas: { effects: memory.deltas.effects },
				importance: memory.importance,
				summary: memory.summary,
				tags: memory.tags,
			})),
		);

		setLivePreview({
			characters: result.characters.map((character) => ({
				isUserPersona: character.isUserPersona,
				name: character.name,
				role: character.role,
			})),
			genres: storyCore?.genres ?? [],
			locations: result.locations.map((location) => ({
				description: location.description,
				name: location.name,
			})),
			memories: result.memories.map((memory) => ({
				characterName: memory.characterName,
				importance: memory.importance,
				summary: memory.summary,
			})),
			title: storyCore?.title ?? '',
			tone: storyCore?.tone ?? [],
		});
	};

	useEffect(() => {
		void resumeLatestJob();
	}, []);

	useEffect(() => {
		if (!snapshot) return;
		applyImportResult(snapshot.partialResult);
		if (snapshot.status === 'completed') {
			setTab('write');
		}
	}, [snapshot?.lastSeq]);

	useEffect(() => {
		if (!importError) return;
		setError(importError);
	}, [importError]);

	useEffect(() => {
		const shouldWarn =
			snapshot?.status === 'queued' || snapshot?.status === 'running';
		if (!shouldWarn) return;

		const onBeforeUnload = (event: BeforeUnloadEvent) => {
			event.preventDefault();
			event.returnValue =
				'An import is still running. You can reconnect later, but this page is currently following the live job.';
		};

		window.addEventListener('beforeunload', onBeforeUnload);
		return () => window.removeEventListener('beforeunload', onBeforeUnload);
	}, [snapshot?.status]);

	const handleDraft = async () => {
		if (!premise.trim() || generating) return;
		setGenStep(1);
		setError('');
		setLivePreview(emptyPreview());
		try {
			const core = await api.ai.generate<{
				title?: string;
				genres: string[];
				tone: string[];
				rules: string[];
				writingStyle: { prose?: string };
			}>('story-core', premise.trim(), { includeTitle: !title.trim() });
			applyGeneratedFields({ ...core, characters: [] });
			setLivePreview((p) => ({
				...p,
				genres: core.genres,
				title: core.title ?? title,
				tone: core.tone,
			}));
			setGenStep(2);
			const styleContext = [
				core.genres.length ? `Genres: ${core.genres.join(', ')}` : '',
				core.tone.length ? `Tone: ${core.tone.join(', ')}` : '',
				core.writingStyle?.prose
					? `Writing style: ${core.writingStyle.prose}`
					: '',
			]
				.filter(Boolean)
				.join('\n');
			const { characters } = await api.ai.generate<{
				characters: Array<{
					name: string;
					role: string;
					isUserPersona: boolean;
					age: string;
					gender: string;
					species: string;
					clothing: string;
					appearance: string;
					personality: string[];
					speechStyle: string;
					trueMotives: string;
					fears: string[];
					relationships?: Array<{
						otherCharacterName: string;
						emotion: string;
						publicAttitude: string;
						privateAttitude: string;
						trustLevel: number;
					}>;
				}>;
			}>('story-characters', premise.trim(), { styleContext });
			applyGeneratedFields({
				characters,
				genres: [],
				rules: [],
				tone: [],
				writingStyle: '',
			});
			setLivePreview((p) => ({
				...p,
				characters: characters.map((c) => ({
					isUserPersona: c.isUserPersona,
					name: c.name,
					role: c.role,
				})),
			}));
			setGenStep(3);
			const { locations } = await api.ai.generate<{
				locations: Array<{
					name: string;
					description: string;
					layout: string;
					lighting: string;
					atmosphere: string;
					soundscape: string;
					smells: string;
					notes: string;
					tags: string[];
				}>;
			}>('story-locations', premise.trim(), { styleContext });
			applyGeneratedFields({
				characters: [],
				genres: [],
				locations,
				rules: [],
				tone: [],
				writingStyle: '',
			});
			setLivePreview((p) => ({
				...p,
				locations: locations.map((l) => ({
					description: l.description,
					name: l.name,
				})),
			}));
			setGenStep(4);
			const { memories } = await api.ai.generate<{
				memories: Array<{
					characterName: string;
					summary: string;
					tags: string[];
					importance: number;
					deltas?: Record<string, unknown>;
					relationshipEffects?: Array<{
						otherCharacterName: string;
						emotion: string;
						publicAttitude: string;
						privateAttitude: string;
						trustLevel: number;
					}>;
				}>;
			}>('story-memories', premise.trim(), {
				characterNames: characters.map((c) => c.name),
				premise: premise.trim(),
			});
			if (memories.length > 0) {
				const newMems: PendingMemory[] = memories.map((m, i) => ({
					_localId: `mem-${Date.now()}-${i}`,
					characterName: m.characterName,
					deltas: m.deltas,
					importance: m.importance,
					relationshipEffects: m.relationshipEffects,
					summary: m.summary,
					tags: m.tags,
				}));
				setPendingMemories((prev) => [...prev, ...newMems]);
				setLivePreview((p) => ({
					...p,
					memories: memories.map((m) => ({
						characterName: m.characterName,
						importance: m.importance,
						summary: m.summary,
					})),
				}));
			}
		} catch (err) {
			setError((err as Error).message);
		} finally {
			setGenStep(0);
		}
	};

	const handleParse = async () => {
		if (!draftText.trim() || generating) return;
		setError('');
		setLivePreview(emptyPreview());
		setPendingChars([]);
		setPendingLocations([]);
		setPendingMemories([]);
		await startImport();
	};

	const handleSubmit = async () => {
		if (!title.trim()) {
			setError('Title is required');
			return;
		}
		setSubmitting(true);
		setError('');
		try {
			const story = await createStory({
				genres,
				openingMessage: openingMessage.trim(),
				premise: premise.trim(),
				rules: {
					characterRules: [],
					storyRules: [],
					worldRules: rules
						.split('\n')
						.map((r) => r.trim())
						.filter(Boolean),
				},
				title: title.trim(),
				tone: tones,
				writingStyle: {
					dialogue: '',
					interiority: '',
					pacing: '',
					prose: writingStyle.trim(),
					sensory: '',
				},
			});

			const createdChars: Array<{ id: string; name: string }> = [];
			for (const {
				_localId: _,
				_rawRelationships: __,
				...charData
			} of pendingChars) {
				const char = await api.characters.create(story.id, charData);
				createdChars.push({ id: char.id, name: char.name });
			}

			const resolveName = (name: string) =>
				createdChars.find(
					(c) => c.name.toLowerCase() === name.toLowerCase(),
				);

			for (const pending of pendingChars) {
				if (!pending._rawRelationships?.length) continue;
				const char = resolveName(pending.name);
				if (!char) continue;
				const relationships = pending._rawRelationships
					.map((r) => {
						const other = resolveName(r.otherCharacterName);
						if (!other) return null;
						return {
							charId: other.id,
							emotion: r.emotion,
							history: '',
							privateAttitude: r.privateAttitude,
							publicAttitude: r.publicAttitude,
							trustLevel: r.trustLevel,
							visibility: 'public' as const,
						};
					})
					.filter((r): r is NonNullable<typeof r> => r !== null);
				if (relationships.length > 0) {
					await api.characters.update(story.id, char.id, {
						relationships,
					});
				}
			}

			for (const { _localId: _, ...locData } of pendingLocations) {
				await api.locations.create(story.id, locData);
			}

			for (const {
				_localId: _,
				characterName,
				summary,
				tags,
				importance,
				deltas,
				relationshipEffects,
			} of pendingMemories) {
				const char = resolveName(characterName);
				if (!char) continue;
				const resolvedRelDelta = (relationshipEffects ?? [])
					.map((r) => {
						const other = resolveName(r.otherCharacterName);
						if (!other) return null;
						return {
							charId: other.id,
							emotion: r.emotion || undefined,
							privateAttitude: r.privateAttitude || undefined,
							publicAttitude: r.publicAttitude || undefined,
							trustLevel: r.trustLevel,
						};
					})
					.filter((r): r is NonNullable<typeof r> => r !== null);
				const effects: MemoryDeltaEffect[] = [
					...((deltas &&
					typeof deltas === 'object' &&
					Array.isArray((deltas as MemoryDelta).effects)
						? (deltas as MemoryDelta).effects
						: convertDeltasToEffects(deltas ?? {})) as MemoryDeltaEffect[]),
					...(resolvedRelDelta.length
						? [
								{
									entityType: 'character',
									op: 'set' as const,
									path: 'relationships',
									value: resolvedRelDelta as Record<
										string,
										unknown
									>[],
									weight: 1,
								},
							]
						: []),
				];
				const { memory } = await api.characterMemories.create(
					story.id,
					char.id,
					{
						deltas: { effects },
						importance,
						summary,
						tags,
					},
				);
				await api.canonTimeline.addEntry(story.id, {
					characterId: char.id,
					label: summary.slice(0, 60),
					memoryId: memory.id,
				});
			}

			onCreated(story);
		} catch (err) {
			setError((err as Error).message);
			setSubmitting(false);
		}
	};

	const removeChar = (localId: string) =>
		setPendingChars((prev) => prev.filter((c) => c._localId !== localId));
	const removeLoc = (localId: string) =>
		setPendingLocations((prev) =>
			prev.filter((l) => l._localId !== localId),
		);

	const customGenres = genres.filter((g) => !GENRE_OPTIONS.includes(g));
	const customTones = tones.filter((t) => !TONE_OPTIONS.includes(t));

	const steps = DRAFT_STEPS;
	const draftGenerating = tab === 'write' && genStep > 0;
	const importActive =
		connectionStatus === 'connecting' ||
		connectionStatus === 'live' ||
		connectionStatus === 'reconnecting' ||
		snapshot?.status === 'queued' ||
		snapshot?.status === 'running';
	const generating = draftGenerating || importActive;
	const showImportPanel =
		!!snapshot || !!activeJobId || recentJobs.length > 0 || importActive;

	return (
		<>
			{error && <div class={f.errorMsg}>{error}</div>}

			{draftGenerating && (
				<div class={f.genProgress}>
					<span class={f.genSpinner}>↻</span>
					<span class={f.genLabel}>{steps[genStep - 1]}</span>
					<span class={f.genCount}>
						{genStep} / {steps.length}
					</span>
				</div>
			)}

			{tab === 'import' && (
				<div class={f.field}>
					<label class={f.label} for="import-text">
						Paste your story notes, excerpts, or drafts
					</label>
					<textarea
						id="import-text"
						class={f.textarea}
						placeholder="Paste story notes, chapter drafts, character sketches, world-building notes…"
						value={draftText}
						onInput={(e) =>
							setDraftText(
								(e.target as HTMLTextAreaElement).value,
							)
						}
						style={{ minHeight: '220px' }}
					/>
					<div class={f.aiBar}>
						<Button
							variant="secondary"
							onClick={handleParse}
							disabled={!draftText.trim() || importActive}
						>
							{importActive
								? 'Import running…'
								: '✨ Parse & Generate'}
						</Button>
					</div>
					<div class="mt-1 text-[11px] text-text-muted">
						The import runs as a durable backend job. You can
						refresh and reconnect to the live trace without losing
						progress.
					</div>
					{showImportPanel && (
						<div class="mt-4">
							<ImportJobPanel />
						</div>
					)}
				</div>
			)}

			{tab === 'write' && (
				<>
					<div class={f.field}>
						<label class={f.label}>
							Title <span class={f.required}>*</span>
						</label>
						<input
							class={f.input}
							placeholder="e.g. Ashes of Vallor"
							value={title}
							onInput={(e) =>
								setTitle((e.target as HTMLInputElement).value)
							}
						/>
					</div>

					<div class={f.field}>
						<label class={f.label}>Premise</label>
						<textarea
							class={f.textarea}
							placeholder="What is this story about? Who are the key players? What world does it inhabit?"
							value={premise}
							onInput={(e) =>
								setPremise(
									(e.target as HTMLTextAreaElement).value,
								)
							}
							style={{ minHeight: '120px' }}
						/>
						<div class={f.aiBar}>
							<Button
								type="button"
								variant="secondary"
								onClick={handleDraft}
								disabled={generating || !premise.trim()}
								title="Use the premise to generate genres, tone, rules, writing style, characters, locations and backstory"
							>
								{generating
									? '✨ Drafting…'
									: '✨ Draft all fields from premise'}
							</Button>
						</div>
					</div>

					<div class={f.field}>
						<label class={f.label}>Genre</label>
						<TagBox
							options={GENRE_OPTIONS}
							selected={genres}
							setSelected={setGenres}
						/>
					</div>

					<div class={f.field}>
						<label class={f.label}>Tone</label>
						<TagBox
							options={TONE_OPTIONS}
							selected={tones}
							setSelected={setTones}
						/>
					</div>

					<div class={f.field}>
						<label class={f.label}>
							World Rules{' '}
							<span class={f.labelHint}>(one per line)</span>
						</label>
						<textarea
							class={f.textarea}
							placeholder={
								'No modern technology\nMagic has a social cost\nThe gods are silent'
							}
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
							placeholder="e.g. cinematic, sensory-rich, short punchy dialogue, third-person intimate"
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
							<span class={f.labelHint}>(optional)</span>
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
						<div class={f.charSectionHeader}>
							<label class={f.label} style={{ margin: 0 }}>
								Characters
							</label>
							<div class={f.charAddBtns}>
								<Button
									class={f.aiBtn}
									onClick={() =>
										setEditingChar('new-persona')
									}
								>
									+ Persona
								</Button>
								<Button
									class={f.aiBtn}
									onClick={() => setEditingChar('new')}
								>
									+ Character
								</Button>
							</div>
						</div>
						{pendingChars.length === 0 && (
							<div class="text-text-muted text-xs">
								No characters yet — draft from premise or add
								manually.
							</div>
						)}
						{pendingChars.map((c) => (
							<div key={c._localId} class={f.charRow}>
								<span class={f.charIcon}>
									{c.isUserPersona ? '🧑' : '🎭'}
								</span>
								<span class={f.charName}>{c.name}</span>
								{c.role && (
									<span class={f.charRole}>{c.role}</span>
								)}
								<span class={f.charActions}>
									<Button
										variant="ghost"
										size="icon"
										onClick={() => setEditingChar(c)}
									>
										✎
									</Button>
									<Button
										variant="ghost"
										size="icon"
										class={f.iconActionBtn}
										onClick={() => removeChar(c._localId)}
									>
										✕
									</Button>
								</span>
							</div>
						))}
					</div>

					{pendingLocations.length > 0 && (
						<div class={f.field}>
							<label class={f.label}>Locations</label>
							{pendingLocations.map((l) => (
								<div key={l._localId} class={f.charRow}>
									<span class={f.charIcon}>📍</span>
									<span class={f.charName}>{l.name}</span>
									{l.description && (
										<span class={f.charRole}>
											{l.description}
										</span>
									)}
									<span class={f.charActions}>
										<button
											type="button"
											class={f.iconActionBtn}
											onClick={() =>
												removeLoc(l._localId)
											}
										>
											✕
										</button>
									</span>
								</div>
							))}
						</div>
					)}

					{pendingMemories.length > 0 && (
						<div class={f.field}>
							<label class={f.label}>
								Canon Memories{' '}
								<span class={f.labelHint}>
									({pendingMemories.length} events extracted)
								</span>
							</label>
							{pendingMemories.map((m) => (
								<div key={m._localId} class={f.charRow}>
									<span class={f.charIcon}>🧠</span>
									<span
										class={f.charName}
										title={m.summary}
										style={{ fontStyle: 'italic' }}
									>
										{m.characterName}
									</span>
									<span class={f.charRole} title={m.summary}>
										{m.summary.slice(0, 50)}
										{m.summary.length > 50 ? '…' : ''}
									</span>
									<span class={f.charActions}>
										<button
											type="button"
											class={f.iconActionBtn}
											onClick={() =>
												setPendingMemories((prev) =>
													prev.filter(
														(x) =>
															x._localId !==
															m._localId,
													),
												)
											}
										>
											✕
										</button>
									</span>
								</div>
							))}
							<div class="mt-1 text-[11px] text-text-muted">
								These will be added to the canon timeline on
								story creation. Remove any you don't want.
							</div>
						</div>
					)}
				</>
			)}

			<div class={f.footer}>
				<DialogClose>Cancel</DialogClose>
				{tab === 'import' ? (
					<Button
						onClick={() => setTab('write')}
						disabled={generating}
					>
						{generating ? 'Parsing…' : 'Review fields →'}
					</Button>
				) : (
					<Button
						onClick={handleSubmit}
						disabled={submitting || !title.trim()}
					>
						{submitting ? 'Creating…' : 'Create Story'}
					</Button>
				)}
			</div>
		</>
	);
};
