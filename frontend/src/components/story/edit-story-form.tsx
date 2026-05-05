import { zodResolver } from '@hookform/resolvers/zod';
import type { Character, Story } from '@simplechat/types';
import { useState } from 'preact/hooks';
import { FormProvider, useForm } from 'react-hook-form';
import { z } from 'zod';
import { api } from '../../lib/api.js';
import { useStoriesStore } from '../../store/stories.js';
import { Button } from '../shared/Button.js';
import { useDialog } from '../shared/Dialog.js';
import { RHFInput, RHFTextArea } from '../shared/form/index.js';
import RHFTagBox from '../shared/form/tag-box/rhf.js';
import { f } from '../shared/formCls.js';
import { CharacterModal } from './CharacterModal.js';
import { GENRE_OPTIONS, TONE_OPTIONS } from './constants.js';

const schema = z.object({
	genres: z.array(z.string()),
	openingMessage: z.string(),
	premise: z.string(),
	systemPromptOverride: z.string(),
	title: z.string().min(1, 'Title is required'),
	tones: z.array(z.string()),
	worldRules: z.string(),
	writingStyle: z.string(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
	onSaved: (story: Story) => void;

	story: Story;
}
export const EditStoryForm = ({ story, onSaved }: Props) => {
	const { onClose } = useDialog();
	const { updateStory, characters, deleteCharacter } = useStoriesStore();
	const [submitting, setSubmitting] = useState(false);
	const [generating, setGenerating] = useState(false);
	const [apiError, setApiError] = useState('');

	const [editingChar, setEditingChar] = useState<
		Character | null | 'new' | 'new-persona'
	>(null);
	const form = useForm<FormValues>({
		defaultValues: {
			genres: story.genres,
			openingMessage: story.openingMessage ?? '',
			premise: story.premise,
			systemPromptOverride: story.systemPromptOverride ?? '',
			title: story.title,
			tones: story.tone,
			worldRules: story.rules.worldRules.join('\n'),
			writingStyle: story.writingStyle.prose,
		},
		resolver: zodResolver(schema),
	});

	const premise = form.watch('premise');

	const handleRegenerate = async () => {
		if (generating || !premise.trim()) return;
		setGenerating(true);
		setApiError('');
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
			}>('supporting-fields', premise, {
				storyContext: `Story: "${story.title}"`,
			});
			if (result.genres.length)
				form.setValue('genres', result.genres, { shouldDirty: true });
			if (result.tone.length)
				form.setValue('tones', result.tone, { shouldDirty: true });
			if (result.rules.worldRules.length)
				form.setValue(
					'worldRules',
					result.rules.worldRules.join('\n'),
					{ shouldDirty: true },
				);
			if (result.writingStyle.prose)
				form.setValue('writingStyle', result.writingStyle.prose, {
					shouldDirty: true,
				});
		} catch (err) {
			setApiError((err as Error).message);
		} finally {
			setGenerating(false);
		}
	};
	const handleSubmit = async (data: FormValues) => {
		setSubmitting(true);
		setApiError('');
		try {
			const updated = await updateStory(story.id, {
				genres: data.genres,
				openingMessage: data.openingMessage.trim(),
				premise: data.premise.trim(),
				rules: {
					characterRules: story.rules.characterRules,
					storyRules: story.rules.storyRules,
					worldRules: data.worldRules
						.split('\n')
						.map((r) => r.trim())
						.filter(Boolean),
				},
				systemPromptOverride: data.systemPromptOverride.trim(),
				title: data.title.trim(),
				tone: data.tones,
				writingStyle: {
					...story.writingStyle,
					prose: data.writingStyle.trim(),
				},
			});
			onSaved(updated);
		} catch (err) {
			setApiError((err as Error).message);
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

	return (
		<FormProvider {...form}>
			<form
				class="flex flex-col gap-4 pt-1"
				onSubmit={form.handleSubmit(handleSubmit)}
			>
				{apiError && <p class={f.errorMsg}>{apiError}</p>}

				<RHFInput name="title" label="Title" required />

				<div class="flex flex-col gap-1">
					<RHFTextArea
						name="premise"
						label="Premise"
						placeholder="What is this story about?"
						style={{ minHeight: '100px' }}
					/>
					<div class={f.aiBar}>
						<Button
							size="small"
							variant="secondary"
							disabled={generating || !premise.trim()}
							title="Regenerate genres, tone, rules and writing style from the current premise"
							onClick={handleRegenerate}
						>
							{generating
								? '✨ Regenerating…'
								: '✨ Regenerate metadata'}
						</Button>
					</div>
				</div>

				<RHFTagBox
					name="genres"
					label="Genre"
					options={GENRE_OPTIONS}
				/>
				<RHFTagBox name="tones" label="Tones" options={TONE_OPTIONS} />

				<RHFTextArea
					name="worldRules"
					label="World Rules"
					description="One rule per line"
					style={{ minHeight: '60px' }}
				/>
				<RHFTextArea
					name="writingStyle"
					label="Writing Style"
					style={{ minHeight: '56px' }}
				/>
				<RHFTextArea
					name="openingMessage"
					label="Opening Message"
					description="Optional — used when starting a new chat"
					placeholder="The scene opens on a rain-slicked street…"
					style={{ minHeight: '60px' }}
				/>
				<RHFTextArea
					name="systemPromptOverride"
					label="System Prompt Override"
					description="Replaces all default instructions if set"
					placeholder="Leave blank to use default instructions…"
					style={{ minHeight: '80px' }}
				/>

				{/* Characters */}
				<div class={f.field}>
					<div class={f.charSectionHeader}>
						<span class={f.label}>Characters</span>
						<div class={f.charAddBtns}>
							<button
								class={f.aiBtn}
								type="button"
								onClick={() => setEditingChar('new-persona')}
							>
								+ Persona
							</button>
							<button
								class={f.aiBtn}
								type="button"
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
							{c.role && <span class={f.charRole}>{c.role}</span>}
							<span class={f.charActions}>
								<button
									class={f.iconActionBtn}
									type="button"
									onClick={() => setEditingChar(c)}
								>
									✎
								</button>
								<button
									class={f.iconActionBtn}
									type="button"
									onClick={() => handleDeleteChar(c.id)}
								>
									✕
								</button>
							</span>
						</div>
					))}
				</div>

				<div class={'flex justify-end gap-2.5'}>
					<Button type="button" variant="secondary" onClick={onClose}>
						Cancel
					</Button>
					<Button type="submit" disabled={submitting}>
						{submitting ? 'Saving…' : 'Save Changes'}
					</Button>
				</div>
			</form>
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
		</FormProvider>
	);
};
