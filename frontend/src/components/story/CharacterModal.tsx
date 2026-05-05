import { useState, useEffect } from 'preact/hooks';
import type {
	Character,
	CharacterCreate,
	CharacterMemoryRelation,
	EntityFieldDef,
	LocationRelationship,
	MemoryDeltaEffect,
	MemoryItem,
} from '@simplechat/types';
import { useStoriesStore } from '../../store/stories.js';
import { api } from '../../lib/api.js';
import { f } from '../shared/formCls.js';

type RelationEntry = {
	charId: string;
	otherCharName: string;
	emotion: string;
	publicAttitude: string;
	privateAttitude: string;
	trustLevel: number;
	sourceMemoryId?: string;
};
type MemoryPair = { relation: CharacterMemoryRelation; memory: MemoryItem };

interface Props {
	initial?: Character;
	initialDraft?: CharacterCreate;
	defaultIsPersona?: boolean;
	onClose: () => void;
	onSaved: (char: Character) => void;
	onSaveData?: (data: CharacterCreate) => void;
}

interface MemoryFormState {
	id?: string;
	relationId?: string;
	summary: string;
	tags: string;
	importance: number;
	branchLabel: string;
	effects: MemoryDeltaEffect[];
}

const emptyMemoryForm = (): MemoryFormState => ({
	summary: '',
	tags: '',
	importance: 0.5,
	branchLabel: '',
	effects: [],
});

// ─── EffectsEditor ────────────────────────────────────────────────────────────

interface EffectsEditorProps {
	effects: MemoryDeltaEffect[];
	onChange: (effects: MemoryDeltaEffect[]) => void;
	fieldDefs: EntityFieldDef[];
}

const ALL_OPS = [
	'set',
	'unset',
	'add',
	'remove',
	'increment',
	'decrement',
] as const;

function EffectsEditor({ effects, onChange, fieldDefs }: EffectsEditorProps) {
	const update = (idx: number, patch: Partial<MemoryDeltaEffect>) => {
		const next = effects.map((e, i) =>
			i === idx ? { ...e, ...patch } : e,
		);
		onChange(next);
	};

	const remove = (idx: number) =>
		onChange(effects.filter((_, i) => i !== idx));

	const add = () =>
		onChange([
			...effects,
			{
				path: '',
				op: 'set' as const,
				value: '',
				weight: 1,
				entityType: 'character',
			},
		]);

	const getOpsForPath = (path: string) => {
		const def = fieldDefs.find((d) => d.path === path);
		return def?.suggestedOps?.length ? def.suggestedOps : ALL_OPS;
	};

	const getLabelForPath = (path: string) => {
		const def = fieldDefs.find((d) => d.path === path);
		return def?.label ?? path;
	};

	return (
		<div class="flex flex-col gap-1.5">
			<datalist id="effect-paths-list">
				{fieldDefs.map((d) => (
					<option key={d.id} value={d.path}>
						{d.label}
					</option>
				))}
			</datalist>

			{effects.length === 0 && (
				<div
					style={{
						fontSize: '12px',
						color: 'var(--text-muted)',
						padding: '4px 0 8px',
					}}
				>
					No effects yet. Add one to change character or location
					attributes.
				</div>
			)}

			{effects.map((effect, idx) => (
				<div key={idx} class="flex items-center gap-1.5">
					<div style="flex:2" class="min-w-0">
						<input
							class={f.input}
							list="effect-paths-list"
							placeholder="Path (e.g. public.personality)"
							value={effect.path}
							onInput={(e) =>
								update(idx, {
									path: (e.target as HTMLInputElement).value,
								})
							}
							title={
								getLabelForPath(effect.path) !== effect.path
									? getLabelForPath(effect.path)
									: undefined
							}
						/>
					</div>
					<select
						class="w-[110px] shrink-0 px-[10px] py-2 rounded-sm border border-border bg-bg-tertiary text-text-primary text-[13px] transition-colors duration-150 focus:border-accent focus:outline-none"
						value={effect.op}
						onChange={(e) =>
							update(idx, {
								op: (e.target as HTMLSelectElement)
									.value as MemoryDeltaEffect['op'],
							})
						}
					>
						{getOpsForPath(effect.path).map((op) => (
							<option key={op} value={op}>
								{op}
							</option>
						))}
					</select>
					{effect.op !== 'unset' && (
						<input
							class={f.input}
							style={{ flex: 1 }}
							placeholder="Value"
							value={
								typeof effect.value === 'string'
									? effect.value
									: effect.value != null
										? String(effect.value)
										: ''
							}
							onInput={(e) =>
								update(idx, {
									value: (e.target as HTMLInputElement).value,
								})
							}
						/>
					)}
					<button
						class={f.iconActionBtn}
						onClick={() => remove(idx)}
						title="Remove effect"
					>
						✕
					</button>
				</div>
			))}

			<button class={f.aiBtn} onClick={add} style={{ marginTop: '6px' }}>
				+ Add effect
			</button>
		</div>
	);
}

// ─── CharacterModal ───────────────────────────────────────────────────────────

export function CharacterModal({
	initial,
	initialDraft,
	defaultIsPersona,
	onClose,
	onSaved,
	onSaveData,
}: Props) {
	const {
		createCharacter,
		updateCharacter,
		selectedStoryId,
		stories,
		locations,
		fieldDefs,
	} = useStoriesStore();
	const isEdit = !!initial;

	const [activeTab, setActiveTab] = useState<
		'character' | 'memories' | 'relations' | 'locations'
	>('character');
	const [name, setName] = useState(initial?.name ?? initialDraft?.name ?? '');
	const [role, setRole] = useState(initial?.role ?? initialDraft?.role ?? '');
	const [isUserPersona, setIsUserPersona] = useState(
		initial?.isUserPersona ??
			initialDraft?.isUserPersona ??
			defaultIsPersona ??
			false,
	);
	const [modelOverride, setModelOverride] = useState(
		initial?.modelOverride ?? initialDraft?.modelOverride ?? '',
	);
	const [age, setAge] = useState(
		initial?.public.age ?? initialDraft?.public?.age ?? '',
	);
	const [gender, setGender] = useState(
		initial?.public.gender ?? initialDraft?.public?.gender ?? '',
	);
	const [species, setSpecies] = useState(
		initial?.public.species ?? initialDraft?.public?.species ?? 'human',
	);
	const [clothing, setClothing] = useState(
		initial?.public.clothing ?? initialDraft?.public?.clothing ?? '',
	);
	const [appearance, setAppearance] = useState(
		initial?.public.appearance ?? initialDraft?.public?.appearance ?? '',
	);
	const [personality, setPersonality] = useState(
		(
			initial?.public.personality ??
			initialDraft?.public?.personality ??
			[]
		).join(', '),
	);
	const [speechStyle, setSpeechStyle] = useState(
		initial?.public.speechStyle ?? initialDraft?.public?.speechStyle ?? '',
	);
	const [trueMotives, setTrueMotives] = useState(
		initial?.private.trueMotives ??
			initialDraft?.private?.trueMotives ??
			'',
	);
	const [fears, setFears] = useState(
		(initial?.private.fears ?? initialDraft?.private?.fears ?? []).join(
			', ',
		),
	);
	const [genPrompt, setGenPrompt] = useState('');
	const [generating, setGenerating] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState('');

	const [pairs, setPairs] = useState<MemoryPair[]>([]);
	const [memoryForm, setMemoryForm] = useState<MemoryFormState | null>(null);
	const [memSaving, setMemSaving] = useState(false);

	const [relations, setRelations] = useState<RelationEntry[]>([]);

	const [locFeelings, setLocFeelings] = useState<LocationRelationship[]>(
		initial?.locationRelationships ?? [],
	);
	const [locSaving, setLocSaving] = useState(false);

	useEffect(() => {
		if (isEdit && initial && selectedStoryId) {
			api.characterMemories
				.chain(selectedStoryId, initial.id)
				.then(setPairs)
				.catch((err: unknown) =>
					setError(
						err instanceof Error
							? err.message
							: 'Failed to load memories',
					),
				);
			api.characters
				.relationships(selectedStoryId, initial.id)
				.then(setRelations)
				.catch((err: unknown) =>
					setError(
						err instanceof Error
							? err.message
							: 'Failed to load relationships',
					),
				);
		}
	}, [isEdit, initial?.id, selectedStoryId]);

	const reloadMemories = () => {
		if (selectedStoryId && initial) {
			api.characterMemories
				.chain(selectedStoryId, initial.id)
				.then(setPairs)
				.catch((err: unknown) =>
					setError(
						err instanceof Error
							? err.message
							: 'Failed to reload memories',
					),
				);
		}
	};

	const toArray = (str: string) =>
		str
			.split(',')
			.map((x) => x.trim())
			.filter(Boolean);

	const handleGenerate = async () => {
		if (!genPrompt.trim() || !selectedStoryId || generating) return;
		setGenerating(true);
		setError('');
		try {
			const selectedStory = stories.find((s) => s.id === selectedStoryId);
			const storyContext = selectedStory
				? `Story: "${selectedStory.title}"${selectedStory.premise ? `\nPremise: ${selectedStory.premise}` : ''}`
				: undefined;
			const result = await api.ai.generate<{
				name: string;
				role: string;
				age: string;
				gender: string;
				species: string;
				clothing: string;
				appearance: string;
				personality: string[];
				speechStyle: string;
				trueMotives: string;
				fears: string[];
			}>('character', genPrompt.trim(), { storyContext });
			if (result.name) setName(result.name);
			if (result.role) setRole(result.role);
			if (result.age) setAge(result.age);
			if (result.gender) setGender(result.gender);
			if (result.species) setSpecies(result.species);
			if (result.clothing) setClothing(result.clothing);
			if (result.appearance) setAppearance(result.appearance);
			if (result.personality.length)
				setPersonality(result.personality.join(', '));
			if (result.speechStyle) setSpeechStyle(result.speechStyle);
			if (result.trueMotives) setTrueMotives(result.trueMotives);
			if (result.fears.length) setFears(result.fears.join(', '));
		} catch (err) {
			setError((err as Error).message);
		} finally {
			setGenerating(false);
		}
	};

	const handleSubmit = async () => {
		if (!name.trim()) {
			setError('Name is required');
			return;
		}
		setSubmitting(true);
		setError('');
		const data: CharacterCreate = {
			name: name.trim(),
			role: role.trim(),
			isUserPersona,
			modelOverride: modelOverride.trim(),
			public: {
				age: age.trim(),
				gender: gender.trim(),
				species: species.trim() || 'human',
				clothing: clothing.trim(),
				appearance: appearance.trim(),
				personality: toArray(personality),
				speechStyle: speechStyle.trim(),
				reputation: initial?.public.reputation ?? '',
				voiceNotes: initial?.public.voiceNotes ?? '',
			},
			private: {
				trueMotives: trueMotives.trim(),
				fears: toArray(fears),
				privateKnowledge: initial?.private.privateKnowledge ?? [],
				moralLimits: initial?.private.moralLimits ?? '',
				hiddenEmotionalState:
					initial?.private.hiddenEmotionalState ?? '',
			},
		};
		try {
			if (onSaveData) {
				onSaveData(data);
				onClose();
				return;
			}
			const char = isEdit
				? await updateCharacter(initial!.id, data)
				: await createCharacter(data);
			onSaved(char);
		} catch (err) {
			setError((err as Error).message);
			setSubmitting(false);
		}
	};

	const openNewMemory = () => setMemoryForm(emptyMemoryForm());

	const openEditMemory = ({ relation, memory }: MemoryPair) => {
		setMemoryForm({
			id: memory.id,
			relationId: relation.id,
			summary: memory.summary,
			tags: memory.tags.join(', '),
			importance: memory.importance,
			branchLabel: relation.branchLabel ?? '',
			effects: memory.deltas.effects,
		});
	};

	const handleSaveMemory = async () => {
		if (!memoryForm || !selectedStoryId || !initial) return;
		if (!memoryForm.summary.trim()) return;
		setMemSaving(true);
		try {
			if (memoryForm.id) {
				await api.characterMemories.update(
					selectedStoryId,
					initial.id,
					memoryForm.id,
					{
						summary: memoryForm.summary.trim(),
						tags: toArray(memoryForm.tags),
						importance: memoryForm.importance,
						branchLabel: memoryForm.branchLabel.trim() || undefined,
						deltas: { effects: memoryForm.effects },
					},
				);
			} else {
				await api.characterMemories.create(
					selectedStoryId,
					initial.id,
					{
						summary: memoryForm.summary.trim(),
						tags: toArray(memoryForm.tags),
						importance: memoryForm.importance,
						branchLabel: memoryForm.branchLabel.trim() || undefined,
						deltas: { effects: memoryForm.effects },
					},
				);
			}
			reloadMemories();
			setMemoryForm(null);
		} catch (err) {
			setError((err as Error).message);
		} finally {
			setMemSaving(false);
		}
	};

	const handleDeleteMemory = async (memId: string) => {
		if (!selectedStoryId || !initial) return;
		await api.characterMemories.delete(selectedStoryId, initial.id, memId);
		reloadMemories();
	};

	const setMF = (patch: Partial<MemoryFormState>) =>
		setMemoryForm((prev) => (prev ? { ...prev, ...patch } : prev));

	const memories = pairs.map((p) => p.memory);

	return (
		<div
			class={f.overlay}
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div class={f.modal}>
				<div class={f.header}>
					<span class={f.title}>
						{isEdit
							? isUserPersona
								? 'Edit Persona'
								: 'Edit Character'
							: isUserPersona
								? 'New Persona'
								: 'New Character'}
					</span>
					<button class={f.closeBtn} onClick={onClose}>
						✕
					</button>
				</div>

				{isEdit && (
					<div class={f.tabs}>
						<button
							class={f.tabBtn}
							data-active={
								activeTab === 'character' ? 'true' : undefined
							}
							onClick={() => setActiveTab('character')}
						>
							Character
						</button>
						<button
							class={f.tabBtn}
							data-active={
								activeTab === 'memories' ? 'true' : undefined
							}
							onClick={() => setActiveTab('memories')}
						>
							Memories
						</button>
						<button
							class={f.tabBtn}
							data-active={
								activeTab === 'relations' ? 'true' : undefined
							}
							onClick={() => setActiveTab('relations')}
						>
							Relations
						</button>
						<button
							class={f.tabBtn}
							data-active={
								activeTab === 'locations' ? 'true' : undefined
							}
							onClick={() => setActiveTab('locations')}
						>
							Locations
						</button>
					</div>
				)}

				{error && <p class={f.errorMsg}>{error}</p>}

				{activeTab === 'character' && (
					<>
						{selectedStoryId && (
							<div class={f.generateSection}>
								<label class={f.label}>
									Generate from description
								</label>
								<div class={f.generateRow}>
									<textarea
										class={f.textarea}
										placeholder="e.g. a bitter old sea captain secretly searching for his lost daughter…"
										value={genPrompt}
										onInput={(e) =>
											setGenPrompt(
												(
													e.target as HTMLTextAreaElement
												).value,
											)
										}
										style={{ minHeight: '56px', flex: 1 }}
									/>
									<button
										class={f.generateBtn}
										onClick={handleGenerate}
										disabled={
											generating || !genPrompt.trim()
										}
									>
										{generating
											? 'Generating…'
											: '✨ Generate'}
									</button>
								</div>
							</div>
						)}

						<div class={f.field}>
							<label class={f.label}>
								Name <span class={f.required}>*</span>
							</label>
							<input
								class={f.input}
								value={name}
								onInput={(e) =>
									setName(
										(e.target as HTMLInputElement).value,
									)
								}
								placeholder="e.g. Seraphine Voss"
							/>
						</div>

						<div class={f.field}>
							<label class={f.label}>Role / Title</label>
							<input
								class={f.input}
								value={role}
								onInput={(e) =>
									setRole(
										(e.target as HTMLInputElement).value,
									)
								}
								placeholder="e.g. Merchant, Detective, Villain"
							/>
						</div>

						<div class={f.field}>
							<label
								class={f.label}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: '8px',
									textTransform: 'none',
									fontSize: '13px',
									letterSpacing: 0,
								}}
							>
								<input
									type="checkbox"
									checked={isUserPersona}
									onChange={(e) =>
										setIsUserPersona(
											(e.target as HTMLInputElement)
												.checked,
										)
									}
								/>
								This is the player's persona (user character)
							</label>
						</div>

						<div class={f.field}>
							<label class={f.label}>Personal Info</label>
							<div class={f.infoGrid}>
								<div class={f.infoCell}>
									<span class={f.subLabel}>Age</span>
									<input
										class={f.input}
										value={age}
										onInput={(e) =>
											setAge(
												(e.target as HTMLInputElement)
													.value,
											)
										}
										placeholder="e.g. mid-30s"
									/>
								</div>
								<div class={f.infoCell}>
									<span class={f.subLabel}>Gender</span>
									<input
										class={f.input}
										value={gender}
										onInput={(e) =>
											setGender(
												(e.target as HTMLInputElement)
													.value,
											)
										}
										placeholder="e.g. woman"
									/>
								</div>
								<div class={f.infoCell}>
									<span class={f.subLabel}>Species</span>
									<input
										class={f.input}
										value={species}
										onInput={(e) =>
											setSpecies(
												(e.target as HTMLInputElement)
													.value,
											)
										}
										placeholder="e.g. human, wolf"
									/>
								</div>
							</div>
						</div>

						<div class={f.field}>
							<label class={f.label}>Clothing</label>
							<input
								class={f.input}
								value={clothing}
								onInput={(e) =>
									setClothing(
										(e.target as HTMLInputElement).value,
									)
								}
								placeholder="e.g. worn leather coat, silver earrings"
							/>
						</div>

						<div class={f.field}>
							<label class={f.label}>Appearance</label>
							<textarea
								class={f.textarea}
								value={appearance}
								onInput={(e) =>
									setAppearance(
										(e.target as HTMLTextAreaElement).value,
									)
								}
								placeholder="Physical description, mannerisms…"
								style={{ minHeight: '60px' }}
							/>
						</div>

						<div class={f.field}>
							<label class={f.label}>
								Personality Traits{' '}
								<span class={f.labelHint}>
									(comma-separated)
								</span>
							</label>
							<input
								class={f.input}
								value={personality}
								onInput={(e) =>
									setPersonality(
										(e.target as HTMLInputElement).value,
									)
								}
								placeholder="e.g. sardonic, loyal, restless"
							/>
						</div>

						<div class={f.field}>
							<label class={f.label}>Speech Style</label>
							<textarea
								class={f.textarea}
								value={speechStyle}
								onInput={(e) =>
									setSpeechStyle(
										(e.target as HTMLTextAreaElement).value,
									)
								}
								placeholder="How they speak — terse, verbose, formal, dialect…"
								style={{ minHeight: '56px' }}
							/>
						</div>

						<div class={f.field}>
							<label class={f.label}>
								True Motives{' '}
								<span class={f.labelHint}>
									(private — LLM only)
								</span>
							</label>
							<textarea
								class={f.textarea}
								value={trueMotives}
								onInput={(e) =>
									setTrueMotives(
										(e.target as HTMLTextAreaElement).value,
									)
								}
								placeholder="Hidden goals never directly revealed in play…"
								style={{ minHeight: '56px' }}
							/>
						</div>

						<div class={f.field}>
							<label class={f.label}>
								Hidden Fears{' '}
								<span class={f.labelHint}>
									(comma-separated, private)
								</span>
							</label>
							<input
								class={f.input}
								value={fears}
								onInput={(e) =>
									setFears(
										(e.target as HTMLInputElement).value,
									)
								}
								placeholder="e.g. abandonment, losing control"
							/>
						</div>

						<div class={f.field}>
							<label class={f.label}>
								Model Override{' '}
								<span class={f.labelHint}>
									(leave blank to use chat default)
								</span>
							</label>
							<input
								class={f.input}
								value={modelOverride}
								onInput={(e) =>
									setModelOverride(
										(e.target as HTMLInputElement).value,
									)
								}
								placeholder="e.g. llama3:8b"
							/>
						</div>

						<div class={f.footer}>
							<button class={f.cancelBtn} onClick={onClose}>
								Cancel
							</button>
							<button
								class={f.submitBtn}
								onClick={handleSubmit}
								disabled={submitting || !name.trim()}
							>
								{submitting
									? 'Saving…'
									: isEdit
										? 'Save Changes'
										: 'Create Character'}
							</button>
						</div>
					</>
				)}

				{activeTab === 'locations' && (
					<div class="flex flex-col gap-2 max-h-[400px] overflow-y-auto">
						{locations.length === 0 ? (
							<p class={f.hint}>
								No locations in this story yet.
							</p>
						) : (
							<>
								{locations.map((loc) => {
									const feeling = locFeelings.find(
										(r) => r.locationId === loc.id,
									);
									const comfort = feeling?.comfort ?? 5;
									const tension = feeling?.tension ?? 0;
									const emotion = feeling?.emotion ?? '';
									const notes = feeling?.notes ?? '';
									const updateFeeling = (
										patch: Partial<LocationRelationship>,
									) => {
										setLocFeelings((prev) => {
											const idx = prev.findIndex(
												(r) => r.locationId === loc.id,
											);
											const next = [...prev];
											if (idx >= 0) {
												next[idx] = {
													...next[idx],
													...patch,
												};
											} else {
												next.push({
													locationId: loc.id,
													comfort: 5,
													tension: 0,
													emotion: '',
													notes: '',
													...patch,
												});
											}
											return next;
										});
									};
									return (
										<div
											key={loc.id}
											class="py-2.5 px-3 border border-border rounded-sm bg-bg-tertiary flex flex-col gap-[5px] group/memcard"
										>
											<div class="flex items-center gap-1.5">
												<span
													style={{
														fontWeight: 600,
														fontSize: '13px',
													}}
												>
													{loc.name}
												</span>
											</div>
											<div
												class={f.infoGrid}
												style={{ marginTop: '6px' }}
											>
												<div class={f.infoCell}>
													<span class={f.subLabel}>
														Comfort: {comfort}/10
													</span>
													<input
														type="range"
														min="0"
														max="10"
														step="1"
														value={comfort}
														onInput={(e) =>
															updateFeeling({
																comfort:
																	parseInt(
																		(
																			e.target as HTMLInputElement
																		).value,
																		10,
																	),
															})
														}
														style={{
															width: '100%',
														}}
													/>
												</div>
												<div class={f.infoCell}>
													<span class={f.subLabel}>
														Tension: {tension}/10
													</span>
													<input
														type="range"
														min="0"
														max="10"
														step="1"
														value={tension}
														onInput={(e) =>
															updateFeeling({
																tension:
																	parseInt(
																		(
																			e.target as HTMLInputElement
																		).value,
																		10,
																	),
															})
														}
														style={{
															width: '100%',
														}}
													/>
												</div>
											</div>
											<div
												class={f.field}
												style={{ marginTop: '6px' }}
											>
												<span class={f.subLabel}>
													Emotion at this place
												</span>
												<input
													class={f.input}
													placeholder="e.g. nostalgic, uneasy, at home"
													value={emotion}
													onInput={(e) =>
														updateFeeling({
															emotion: (
																e.target as HTMLInputElement
															).value,
														})
													}
												/>
											</div>
											<div class={f.field}>
												<span class={f.subLabel}>
													Notes (private)
												</span>
												<input
													class={f.input}
													placeholder="Why they feel this way…"
													value={notes}
													onInput={(e) =>
														updateFeeling({
															notes: (
																e.target as HTMLInputElement
															).value,
														})
													}
												/>
											</div>
										</div>
									);
								})}
								<div class={f.footer}>
									<button
										class={f.cancelBtn}
										onClick={onClose}
									>
										Cancel
									</button>
									<button
										type="button"
										class={f.submitBtn}
										disabled={locSaving}
										onClick={async () => {
											if (!selectedStoryId || !initial)
												return;
											setLocSaving(true);
											try {
												const updated =
													await updateCharacter(
														initial.id,
														{
															locationRelationships:
																locFeelings,
														},
													);
												onSaved(updated);
											} catch (err) {
												setError(
													(err as Error).message,
												);
											} finally {
												setLocSaving(false);
											}
										}}
									>
										{locSaving
											? 'Saving…'
											: 'Save Location Feelings'}
									</button>
								</div>
							</>
						)}
					</div>
				)}

				{activeTab === 'relations' && (
					<div class="flex flex-col gap-2 max-h-[400px] overflow-y-auto">
						{relations.length === 0 ? (
							<p class={f.hint}>
								No relations yet. Add memories with relationship
								effects to establish them.
							</p>
						) : (
							relations.map((r) => {
								const sourceMem = r.sourceMemoryId
									? memories.find(
											(m) => m.id === r.sourceMemoryId,
										)
									: undefined;
								return (
									<div
										key={r.charId}
										class="py-2.5 px-3 border border-border rounded-sm bg-bg-tertiary flex flex-col gap-[5px] group/memcard"
									>
										<div class="flex items-center gap-1.5">
											<span
												style={{
													fontWeight: 600,
													fontSize: '13px',
												}}
											>
												{r.otherCharName}
											</span>
											{r.emotion && (
												<span class="text-[10px] text-text-muted italic flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
													{r.emotion}
												</span>
											)}
											<span
												class="text-[10px] font-semibold py-[1px] px-1.5 rounded-full bg-bg-secondary text-text-muted shrink-0"
												style={{ marginLeft: 'auto' }}
											>
												{r.trustLevel}/10
											</span>
										</div>
										{r.publicAttitude && (
											<div class="text-xs text-text-primary leading-normal">
												{r.publicAttitude}
											</div>
										)}
										{r.privateAttitude && (
											<div
												class="text-xs text-text-primary leading-normal"
												style={{
													color: 'var(--text-muted)',
													fontStyle: 'italic',
												}}
											>
												Private: {r.privateAttitude}
											</div>
										)}
										{sourceMem && (
											<div
												style={{
													fontSize: '11px',
													color: 'var(--text-muted)',
													marginTop: '4px',
												}}
											>
												Source:{' '}
												{sourceMem.summary.slice(0, 70)}
												{sourceMem.summary.length > 70
													? '…'
													: ''}
											</div>
										)}
									</div>
								);
							})
						)}
					</div>
				)}

				{activeTab === 'memories' && (
					<>
						{memoryForm === null ? (
							<>
								<div class="flex items-center justify-between">
									<span class="text-xs text-text-muted">
										{pairs.length}{' '}
										{pairs.length === 1
											? 'memory'
											: 'memories'}{' '}
										in chain
									</span>
									<button
										class={f.aiBtn}
										onClick={openNewMemory}
									>
										+ Add Memory
									</button>
								</div>

								{pairs.length === 0 && (
									<p class={f.hint}>
										No memories yet. Add memories to shape
										how this character evolves over time.
									</p>
								)}

								<div class="flex flex-col gap-2 max-h-[400px] overflow-y-auto">
									{pairs.map(({ relation, memory: m }) => (
										<div
											key={m.id}
											class="py-2.5 px-3 border border-border rounded-sm bg-bg-tertiary flex flex-col gap-[5px] group/memcard"
										>
											<div class="flex items-center gap-1.5">
												<span
													class="text-[10px] font-semibold py-[1px] px-1.5 rounded-full bg-bg-secondary text-text-muted shrink-0 data-[high=true]:bg-accent-dim data-[high=true]:text-accent"
													data-high={
														m.importance >= 0.8
															? 'true'
															: undefined
													}
												>
													{Math.round(
														m.importance * 100,
													)}
													%
												</span>
												{relation.branchLabel && (
													<span class="text-[10px] text-text-muted italic flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
														{relation.branchLabel}
													</span>
												)}
												<div class="hidden gap-0.5 shrink-0 group-hover/memcard:flex">
													<button
														class={f.iconActionBtn}
														onClick={() =>
															openEditMemory({
																relation,
																memory: m,
															})
														}
													>
														✎
													</button>
													<button
														class={f.iconActionBtn}
														onClick={() =>
															handleDeleteMemory(
																m.id,
															)
														}
													>
														✕
													</button>
												</div>
											</div>
											<div class="text-xs text-text-primary leading-normal">
												{m.summary}
											</div>
											{m.tags.length > 0 && (
												<div class="flex flex-wrap gap-1">
													{m.tags.map((t) => (
														<span
															key={t}
															class="text-[10px] py-[1px] px-1.5 rounded-full bg-bg-secondary text-text-muted border border-border"
														>
															{t}
														</span>
													))}
												</div>
											)}
											{m.deltas.effects.length > 0 && (
												<div class="flex flex-wrap gap-1 mt-0.5">
													<span class="text-[10px] py-[1px] px-1.5 rounded-full bg-success-dim text-success">
														{
															m.deltas.effects
																.length
														}{' '}
														{m.deltas.effects
															.length === 1
															? 'effect'
															: 'effects'}
													</span>
												</div>
											)}
										</div>
									))}
								</div>
							</>
						) : (
							<div class="flex flex-col gap-3.5">
								<div class={f.field}>
									<label class={f.label}>
										Summary{' '}
										<span class={f.required}>*</span>
									</label>
									<textarea
										class={f.textarea}
										placeholder="What happened? What changed for this character?"
										value={memoryForm.summary}
										onInput={(e) =>
											setMF({
												summary: (
													e.target as HTMLTextAreaElement
												).value,
											})
										}
										style={{ minHeight: '80px' }}
									/>
								</div>

								<div class={f.field}>
									<label class={f.label}>
										Tags{' '}
										<span class={f.labelHint}>
											(comma-separated)
										</span>
									</label>
									<input
										class={f.input}
										placeholder="e.g. betrayal, war, loss"
										value={memoryForm.tags}
										onInput={(e) =>
											setMF({
												tags: (
													e.target as HTMLInputElement
												).value,
											})
										}
									/>
								</div>

								<div class={f.field}>
									<label class={f.label}>
										Importance:{' '}
										{Math.round(
											memoryForm.importance * 100,
										)}
										%
									</label>
									<input
										type="range"
										min="0"
										max="1"
										step="0.05"
										value={memoryForm.importance}
										onInput={(e) =>
											setMF({
												importance: parseFloat(
													(
														e.target as HTMLInputElement
													).value,
												),
											})
										}
										style={{ width: '100%' }}
									/>
									<div
										style={{
											display: 'flex',
											justifyContent: 'space-between',
											fontSize: '10px',
											color: 'var(--text-muted)',
										}}
									>
										<span>Low</span>
										<span>Always included at 80%+</span>
										<span>High</span>
									</div>
								</div>

								<div class={f.field}>
									<label class={f.label}>
										Branch Label{' '}
										<span class={f.labelHint}>
											(optional)
										</span>
									</label>
									<input
										class={f.input}
										placeholder="e.g. Before the war"
										value={memoryForm.branchLabel}
										onInput={(e) =>
											setMF({
												branchLabel: (
													e.target as HTMLInputElement
												).value,
											})
										}
									/>
								</div>

								<div class={f.field}>
									<label class={f.label}>
										Character Effects
									</label>
									<EffectsEditor
										effects={memoryForm.effects}
										onChange={(effects) =>
											setMF({ effects })
										}
										fieldDefs={fieldDefs}
									/>
								</div>

								<div class={f.footer}>
									<button
										class={f.cancelBtn}
										onClick={() => setMemoryForm(null)}
									>
										Cancel
									</button>
									<button
										class={f.submitBtn}
										onClick={handleSaveMemory}
										disabled={
											memSaving ||
											!memoryForm.summary.trim()
										}
									>
										{memSaving
											? 'Saving…'
											: memoryForm.id
												? 'Save Changes'
												: 'Add Memory'}
									</button>
								</div>
							</div>
						)}
					</>
				)}
			</div>
		</div>
	);
}
