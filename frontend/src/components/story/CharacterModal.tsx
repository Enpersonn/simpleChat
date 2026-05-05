import type {
	Character,
	CharacterCreate,
	CharacterMemoryRelation,
	EntityFieldDef,
	LocationRelationship,
	MemoryDeltaEffect,
	MemoryItem,
} from '@simplechat/types';
import { useEffect, useState } from 'preact/hooks';
import { Controller, FormProvider, useForm } from 'react-hook-form';
import { api } from '../../lib/api.js';
import { useStoriesStore } from '../../store/stories.js';
import { Button } from '../shared/Button.js';
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '../shared/Dialog.js';
import { RHFInput, RHFTextArea } from '../shared/form/index.js';
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
	branchLabel: '',
	effects: [],
	importance: 0.5,
	summary: '',
	tags: '',
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
				entityType: 'character',
				op: 'set' as const,
				path: '',
				value: '',
				weight: 1,
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
						color: 'var(--text-muted)',
						fontSize: '12px',
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
						class="w-[110px] shrink-0 rounded-sm border border-border bg-bg-tertiary px-[10px] py-2 text-[13px] text-text-primary transition-colors duration-150 focus:border-accent focus:outline-none"
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
						type="button"
						class={f.iconActionBtn}
						onClick={() => remove(idx)}
						title="Remove effect"
					>
						✕
					</button>
				</div>
			))}

			<button
				type="button"
				class={f.aiBtn}
				onClick={add}
				style={{ marginTop: '6px' }}
			>
				+ Add effect
			</button>
		</div>
	);
}

// ─── Form values ──────────────────────────────────────────────────────────────

type FormValues = {
	name: string;
	role: string;
	isUserPersona: boolean;
	modelOverride: string;
	age: string;
	gender: string;
	species: string;
	clothing: string;
	appearance: string;
	personality: string;
	speechStyle: string;
	trueMotives: string;
	fears: string;
};

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

	const toArray = (str: string) =>
		str
			.split(',')
			.map((x) => x.trim())
			.filter(Boolean);

	const form = useForm<FormValues>({
		defaultValues: {
			age: initial?.public.age ?? initialDraft?.public?.age ?? '',
			appearance:
				initial?.public.appearance ??
				initialDraft?.public?.appearance ??
				'',
			clothing:
				initial?.public.clothing ??
				initialDraft?.public?.clothing ??
				'',
			fears: (
				initial?.private.fears ??
				initialDraft?.private?.fears ??
				[]
			).join(', '),
			gender:
				initial?.public.gender ?? initialDraft?.public?.gender ?? '',
			isUserPersona:
				initial?.isUserPersona ??
				initialDraft?.isUserPersona ??
				defaultIsPersona ??
				false,
			modelOverride:
				initial?.modelOverride ?? initialDraft?.modelOverride ?? '',
			name: initial?.name ?? initialDraft?.name ?? '',
			personality: (
				initial?.public.personality ??
				initialDraft?.public?.personality ??
				[]
			).join(', '),
			role: initial?.role ?? initialDraft?.role ?? '',
			species:
				initial?.public.species ??
				initialDraft?.public?.species ??
				'human',
			speechStyle:
				initial?.public.speechStyle ??
				initialDraft?.public?.speechStyle ??
				'',
			trueMotives:
				initial?.private.trueMotives ??
				initialDraft?.private?.trueMotives ??
				'',
		},
	});

	const name = form.watch('name');

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
	}, [isEdit, initial, selectedStoryId]);

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
			if (result.name) form.setValue('name', result.name);
			if (result.role) form.setValue('role', result.role);
			if (result.age) form.setValue('age', result.age);
			if (result.gender) form.setValue('gender', result.gender);
			if (result.species) form.setValue('species', result.species);
			if (result.clothing) form.setValue('clothing', result.clothing);
			if (result.appearance) form.setValue('appearance', result.appearance);
			if (result.personality.length)
				form.setValue('personality', result.personality.join(', '));
			if (result.speechStyle)
				form.setValue('speechStyle', result.speechStyle);
			if (result.trueMotives)
				form.setValue('trueMotives', result.trueMotives);
			if (result.fears.length)
				form.setValue('fears', result.fears.join(', '));
		} catch (err) {
			setError((err as Error).message);
		} finally {
			setGenerating(false);
		}
	};

	const onSubmit = async (data: FormValues) => {
		setSubmitting(true);
		setError('');
		const characterData: CharacterCreate = {
			isUserPersona: data.isUserPersona,
			modelOverride: data.modelOverride.trim(),
			name: data.name.trim(),
			private: {
				fears: toArray(data.fears),
				hiddenEmotionalState:
					initial?.private.hiddenEmotionalState ?? '',
				moralLimits: initial?.private.moralLimits ?? '',
				privateKnowledge: initial?.private.privateKnowledge ?? [],
				trueMotives: data.trueMotives.trim(),
			},
			public: {
				age: data.age.trim(),
				appearance: data.appearance.trim(),
				clothing: data.clothing.trim(),
				gender: data.gender.trim(),
				personality: toArray(data.personality),
				reputation: initial?.public.reputation ?? '',
				species: data.species.trim() || 'human',
				speechStyle: data.speechStyle.trim(),
				voiceNotes: initial?.public.voiceNotes ?? '',
			},
			role: data.role.trim(),
		};
		try {
			if (onSaveData) {
				onSaveData(characterData);
				onClose();
				return;
			}
			const char = isEdit
				? await updateCharacter(initial!.id, characterData)
				: await createCharacter(characterData);
			onSaved(char);
		} catch (err) {
			setError((err as Error).message);
			setSubmitting(false);
		}
	};

	const openNewMemory = () => setMemoryForm(emptyMemoryForm());

	const openEditMemory = ({ relation, memory }: MemoryPair) => {
		setMemoryForm({
			branchLabel: relation.branchLabel ?? '',
			effects: memory.deltas.effects,
			id: memory.id,
			importance: memory.importance,
			relationId: relation.id,
			summary: memory.summary,
			tags: memory.tags.join(', '),
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
						branchLabel:
							memoryForm.branchLabel.trim() || undefined,
						deltas: { effects: memoryForm.effects },
						importance: memoryForm.importance,
						summary: memoryForm.summary.trim(),
						tags: toArray(memoryForm.tags),
					},
				);
			} else {
				await api.characterMemories.create(
					selectedStoryId,
					initial.id,
					{
						branchLabel:
							memoryForm.branchLabel.trim() || undefined,
						deltas: { effects: memoryForm.effects },
						importance: memoryForm.importance,
						summary: memoryForm.summary.trim(),
						tags: toArray(memoryForm.tags),
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

	const modalTitle = isEdit
		? form.watch('isUserPersona')
			? 'Edit Persona'
			: 'Edit Character'
		: form.watch('isUserPersona')
			? 'New Persona'
			: 'New Character';

	return (
		<Dialog defaultOpen={true} onClose={onClose}>
			<DialogContent class="w-[520px]">
				<DialogHeader>
					<DialogTitle>{modalTitle}</DialogTitle>
					<DialogClose />
				</DialogHeader>

				{isEdit && (
					<div class={f.tabs}>
						<button
							type="button"
							class={f.tabBtn}
							data-active={
								activeTab === 'character' ? 'true' : undefined
							}
							onClick={() => setActiveTab('character')}
						>
							Character
						</button>
						<button
							type="button"
							class={f.tabBtn}
							data-active={
								activeTab === 'memories' ? 'true' : undefined
							}
							onClick={() => setActiveTab('memories')}
						>
							Memories
						</button>
						<button
							type="button"
							class={f.tabBtn}
							data-active={
								activeTab === 'relations' ? 'true' : undefined
							}
							onClick={() => setActiveTab('relations')}
						>
							Relations
						</button>
						<button
							type="button"
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
					<FormProvider {...form}>
						<form
							class="flex flex-col gap-4.5"
							onSubmit={form.handleSubmit(onSubmit)}
						>
							{selectedStoryId && (
								<div class={f.generateSection}>
									<span class={f.label}>
										Generate from description
									</span>
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
											style={{ flex: 1, minHeight: '56px' }}
										/>
										<button
											type="button"
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

							<RHFInput
								name="name"
								label="Name"
								placeholder="e.g. Seraphine Voss"
								required
							/>

							<RHFInput
								name="role"
								label="Role / Title"
								placeholder="e.g. Merchant, Detective, Villain"
							/>

							<div class={f.field}>
								<Controller
									control={form.control}
									name="isUserPersona"
									render={({ field }) => (
										<label
											class={f.label}
											style={{
												alignItems: 'center',
												display: 'flex',
												fontSize: '13px',
												gap: '8px',
												letterSpacing: 0,
												textTransform: 'none',
											}}
										>
											<input
												type="checkbox"
												checked={field.value}
												onChange={(e) =>
													field.onChange(
														(
															e.target as HTMLInputElement
														).checked,
													)
												}
											/>
											This is the player's persona (user
											character)
										</label>
									)}
								/>
							</div>

							<div class={f.field}>
								<span class={f.label}>Personal Info</span>
								<div class={f.infoGrid}>
									<div class={f.infoCell}>
										<span class={f.subLabel}>Age</span>
										<input
											class={f.input}
											{...form.register('age')}
											placeholder="e.g. mid-30s"
										/>
									</div>
									<div class={f.infoCell}>
										<span class={f.subLabel}>Gender</span>
										<input
											class={f.input}
											{...form.register('gender')}
											placeholder="e.g. woman"
										/>
									</div>
									<div class={f.infoCell}>
										<span class={f.subLabel}>Species</span>
										<input
											class={f.input}
											{...form.register('species')}
											placeholder="e.g. human, wolf"
										/>
									</div>
								</div>
							</div>

							<RHFInput
								name="clothing"
								label="Clothing"
								placeholder="e.g. worn leather coat, silver earrings"
							/>

							<RHFTextArea
								name="appearance"
								label="Appearance"
								placeholder="Physical description, mannerisms…"
								style={{ minHeight: '60px' }}
							/>

							<RHFInput
								name="personality"
								label="Personality Traits"
								description="Comma-separated"
								placeholder="e.g. sardonic, loyal, restless"
							/>

							<RHFTextArea
								name="speechStyle"
								label="Speech Style"
								placeholder="How they speak — terse, verbose, formal, dialect…"
								style={{ minHeight: '56px' }}
							/>

							<RHFTextArea
								name="trueMotives"
								label="True Motives"
								description="Private — LLM only"
								placeholder="Hidden goals never directly revealed in play…"
								style={{ minHeight: '56px' }}
							/>

							<RHFInput
								name="fears"
								label="Hidden Fears"
								description="Comma-separated, private"
								placeholder="e.g. abandonment, losing control"
							/>

							<RHFInput
								name="modelOverride"
								label="Model Override"
								description="Leave blank to use chat default"
								placeholder="e.g. llama3:8b"
							/>

							<DialogFooter>
								<Button
									type="button"
									variant="secondary"
									onClick={onClose}
								>
									Cancel
								</Button>
								<Button
									type="submit"
									disabled={submitting || !name.trim()}
								>
									{submitting
										? 'Saving…'
										: isEdit
											? 'Save Changes'
											: 'Create Character'}
								</Button>
							</DialogFooter>
						</form>
					</FormProvider>
				)}

				{activeTab === 'locations' && (
					<div class="flex max-h-[400px] flex-col gap-2 overflow-y-auto">
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
													comfort: 5,
													emotion: '',
													locationId: loc.id,
													notes: '',
													tension: 0,
													...patch,
												});
											}
											return next;
										});
									};
									return (
										<div
											key={loc.id}
											class="group/memcard flex flex-col gap-[5px] rounded-sm border border-border bg-bg-tertiary px-3 py-2.5"
										>
											<div class="flex items-center gap-1.5">
												<span
													style={{
														fontSize: '13px',
														fontWeight: 600,
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
																	Number.parseInt(
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
																	Number.parseInt(
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
								<DialogFooter>
									<Button
										type="button"
										variant="secondary"
										onClick={onClose}
									>
										Cancel
									</Button>
									<Button
										type="button"
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
									</Button>
								</DialogFooter>
							</>
						)}
					</div>
				)}

				{activeTab === 'relations' && (
					<div class="flex max-h-[400px] flex-col gap-2 overflow-y-auto">
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
										class="group/memcard flex flex-col gap-[5px] rounded-sm border border-border bg-bg-tertiary px-3 py-2.5"
									>
										<div class="flex items-center gap-1.5">
											<span
												style={{
													fontSize: '13px',
													fontWeight: 600,
												}}
											>
												{r.otherCharName}
											</span>
											{r.emotion && (
												<span class="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm text-text-muted italic">
													{r.emotion}
												</span>
											)}
											<span
												class="shrink-0 rounded-full bg-bg-secondary px-1.5 py-[1px] font-semibold text-sm text-text-muted"
												style={{ marginLeft: 'auto' }}
											>
												{r.trustLevel}/10
											</span>
										</div>
										{r.publicAttitude && (
											<div class="text-text-primary text-xs leading-normal">
												{r.publicAttitude}
											</div>
										)}
										{r.privateAttitude && (
											<div
												class="text-text-primary text-xs leading-normal"
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
													color: 'var(--text-muted)',
													fontSize: '11px',
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

				{activeTab === 'memories' &&
					(memoryForm === null ? (
						<div class="flex flex-col gap-3.5">
							<div class="flex items-center justify-between">
								<span class="text-text-muted text-xs">
									{pairs.length}{' '}
									{pairs.length === 1
										? 'memory'
										: 'memories'}{' '}
									in chain
								</span>
								<button
									type="button"
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

							<div class="flex max-h-[400px] flex-col gap-2 overflow-y-auto">
								{pairs.map(({ relation, memory: m }) => (
									<div
										key={m.id}
										class="group/memcard flex flex-col gap-[5px] rounded-sm border border-border bg-bg-tertiary px-3 py-2.5"
									>
										<div class="flex items-center gap-1.5">
											<span
												class="shrink-0 rounded-full bg-bg-secondary px-1.5 py-[1px] font-semibold text-sm text-text-muted data-[high=true]:bg-accent-dim data-[high=true]:text-accent"
												data-high={
													m.importance >= 0.8
														? 'true'
														: undefined
												}
											>
												{Math.round(m.importance * 100)}%
											</span>
											{relation.branchLabel && (
												<span class="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm text-text-muted italic">
													{relation.branchLabel}
												</span>
											)}
											<div class="hidden shrink-0 gap-0.5 group-hover/memcard:flex">
												<button
													type="button"
													class={f.iconActionBtn}
													onClick={() =>
														openEditMemory({
															memory: m,
															relation,
														})
													}
												>
													✎
												</button>
												<button
													type="button"
													class={f.iconActionBtn}
													onClick={() =>
														handleDeleteMemory(m.id)
													}
												>
													✕
												</button>
											</div>
										</div>
										<div class="text-text-primary text-xs leading-normal">
											{m.summary}
										</div>
										{m.tags.length > 0 && (
											<div class="flex flex-wrap gap-1">
												{m.tags.map((t) => (
													<span
														key={t}
														class="rounded-full border border-border bg-bg-secondary px-1.5 py-[1px] text-sm text-text-muted"
													>
														{t}
													</span>
												))}
											</div>
										)}
										{m.deltas.effects.length > 0 && (
											<div class="mt-0.5 flex flex-wrap gap-1">
												<span class="rounded-full bg-success-dim px-1.5 py-[1px] text-sm text-success">
													{m.deltas.effects.length}{' '}
													{m.deltas.effects.length === 1
														? 'effect'
														: 'effects'}
												</span>
											</div>
										)}
									</div>
								))}
							</div>
						</div>
					) : (
						<div class="flex flex-col gap-3.5">
							<div class={f.field}>
								<label
									class={f.label}
									htmlFor="mem-summary"
								>
									Summary{' '}
									<span class={f.required}>*</span>
								</label>
								<textarea
									id="mem-summary"
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
								<label class={f.label} htmlFor="mem-tags">
									Tags{' '}
									<span class={f.labelHint}>
										(comma-separated)
									</span>
								</label>
								<input
									id="mem-tags"
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
								<span class={f.label}>
									Importance:{' '}
									{Math.round(memoryForm.importance * 100)}%
								</span>
								<input
									type="range"
									min="0"
									max="1"
									step="0.05"
									value={memoryForm.importance}
									onInput={(e) =>
										setMF({
											importance: Number.parseFloat(
												(e.target as HTMLInputElement)
													.value,
											),
										})
									}
									style={{ width: '100%' }}
								/>
								<div
									style={{
										color: 'var(--text-muted)',
										display: 'flex',
										fontSize: '10px',
										justifyContent: 'space-between',
									}}
								>
									<span>Low</span>
									<span>Always included at 80%+</span>
									<span>High</span>
								</div>
							</div>

							<div class={f.field}>
								<label
									class={f.label}
									htmlFor="mem-branch-label"
								>
									Branch Label{' '}
									<span class={f.labelHint}>(optional)</span>
								</label>
								<input
									id="mem-branch-label"
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
								<span class={f.label}>Character Effects</span>
								<EffectsEditor
									effects={memoryForm.effects}
									onChange={(effects) => setMF({ effects })}
									fieldDefs={fieldDefs}
								/>
							</div>

							<DialogFooter>
								<Button
									type="button"
									variant="secondary"
									onClick={() => setMemoryForm(null)}
								>
									Cancel
								</Button>
								<Button
									type="button"
									disabled={
										memSaving || !memoryForm.summary.trim()
									}
									onClick={handleSaveMemory}
								>
									{memSaving
										? 'Saving…'
										: memoryForm.id
											? 'Save Changes'
											: 'Add Memory'}
								</Button>
							</DialogFooter>
						</div>
					))}
			</DialogContent>
		</Dialog>
	);
}
