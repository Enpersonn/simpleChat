import type { StoryLocation as Location } from '@simplechat/types';
import { useState } from 'preact/hooks';
import { FormProvider, useForm } from 'react-hook-form';
import { z } from 'zod';
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
	DialogTrigger,
} from '../shared/Dialog.js';
import { Input, RHFInput, RHFTextArea } from '../shared/form/index.js';
import RHFTagBox from '../shared/form/tag-box/rhf.js';
import { f } from '../shared/formCls.js';

interface Props {
	initial?: Location;
}

const schema = z.object({
	atmosphere: z.string().optional().default(''),
	description: z.string().optional().default(''),
	layout: z.string().optional().default(''),
	lighting: z.string().optional().default(''),
	name: z.string().min(1, 'Name is required'),
	notes: z.string().optional().default(''),
	smells: z.string().optional().default(''),
	soundscape: z.string().optional().default(''),
	tags: z.array(z.string()).default([]),
});
type FormValues = z.infer<typeof schema>;

export function LocationModal({ initial }: Props) {
	const { createLocation, updateLocation, selectedStoryId, stories } =
		useStoriesStore();
	const isEdit = !!initial;

	const form = useForm<FormValues>({
		defaultValues: {
			atmosphere: '',
			description: '',
			layout: '',
			lighting: '',
			name: '',
			notes: '',
			smells: '',
			soundscape: '',
			tags: [],
			...initial,
		},
	});

	const [genPrompt, setGenPrompt] = useState('');
	const [generating, setGenerating] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleGenerate = async () => {
		const prompt = genPrompt.trim();

		if (!prompt || !selectedStoryId || generating) return;

		setGenerating(true);
		setError(null);

		try {
			const selectedStory = stories.find((s) => s.id === selectedStoryId);

			const storyContext = selectedStory
				? [
						`Story: "${selectedStory.title}"`,
						selectedStory.premise
							? `Premise: ${selectedStory.premise}`
							: null,
					]
						.filter(Boolean)
						.join('\n')
				: undefined;

			const result = await api.ai.generate<FormValues>(
				'location',
				prompt,
				{
					storyContext,
				},
			);

			const parsed = schema.parse(result);

			form.reset({
				...form.getValues(),
				...parsed,
			});
		} catch (err) {
			setError(
				err instanceof Error
					? err.message
					: 'Failed to generate location',
			);
		} finally {
			setGenerating(false);
		}
	};

	const handleSubmit = async (data: FormValues) => {
		setSubmitting(true);
		setError(null);

		try {
			const parsedData = schema.parse(data);

			isEdit
				? await updateLocation(initial!.id, parsedData)
				: await createLocation(parsedData);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : 'Failed to save location',
			);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Dialog>
			<DialogTrigger>
				<Button size="icon" variant="ghost" title="Edit story">
					{initial ? '✎' : '+'}
				</Button>
			</DialogTrigger>
			<DialogContent class="w-full max-w-3xl">
				<DialogHeader>
					<DialogTitle>
						{isEdit ? 'Edit Location' : 'New Location'}
					</DialogTitle>
					<DialogClose />
				</DialogHeader>

				<div class={f.generateSection}>
					<div class={f.generateRow}>
						<Input
							class={f.input}
							placeholder="Describe the location briefly (e.g. a dimly lit tavern with low ceilings)"
							value={genPrompt}
							onInput={(e) =>
								setGenPrompt(
									(e.target as HTMLInputElement).value,
								)
							}
							onKeyDown={(e) =>
								e.key === 'Enter' && handleGenerate()
							}
						/>
						<Button
							class={f.generateBtn}
							onClick={handleGenerate}
							disabled={generating || !genPrompt.trim()}
						>
							{generating ? '…' : 'Generate'}
						</Button>
					</div>
				</div>
				<FormProvider {...form}>
					<form
						class="flex flex-col gap-4 pt-1"
						onSubmit={form.handleSubmit(handleSubmit)}
					>
						<div class="flex flex-col gap-4.5">
							<RHFInput
								name="name"
								label="Name"
								placeholder="The Rusty Flagon"
								required
							/>
							<RHFTextArea
								name="description"
								label="Description"
								placeholder="Overview of this location"
							/>
							<RHFTextArea
								name="layout"
								label="Layout"
								placeholder="Spatial description — size, shape, exits, notable features"
							/>
							<RHFTextArea
								name="lighting"
								label="Lighting"
								placeholder="e.g. Candlelit, warm amber glow from sconces"
							/>
							<RHFTextArea
								name="atmosphere"
								label="Atmosphere"
								placeholder="e.g. Smoky, intimate, faintly oppressive"
							/>
							<RHFTextArea
								name="soundscape"
								label="Soundscape"
								placeholder="e.g. Muffled conversation, distant dripping water"
							/>
							<RHFTextArea
								name="smells"
								label="Smells"
								placeholder="e.g. Woodsmoke, tallow, spilled ale"
							/>
							<RHFTextArea
								name="notes"
								label="Notes"
								placeholder="Consistency rules: always cold, no windows, ceiling so low tall people duck"
							/>
							<RHFTagBox name="tags" label="Tags" />
						</div>

						{error && <p class={f.errorMsg}>{error}</p>}

						<DialogFooter>
							<Button type="button" variant="secondary">
								Cancel
							</Button>
							<Button type="submit" disabled={submitting}>
								{submitting ? 'Saving…' : 'Save Changes'}
							</Button>
						</DialogFooter>
					</form>
				</FormProvider>
			</DialogContent>
		</Dialog>
	);
}
