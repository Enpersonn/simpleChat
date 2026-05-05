// ─── Live Preview Panel ───────────────────────────────────────────────────────

import { f } from '../../shared/formCls';
import { PreviewCard } from './preview-card';
import { SkeletonBlock, SkeletonCard } from './skeleton';

const STEP_SECTIONS = ['core', 'characters', 'locations', 'memories'] as const;
type StepSection = (typeof STEP_SECTIONS)[number];

function sectionForStep(step: number): StepSection | null {
	if (step === 1) return 'core';
	if (step === 2) return 'characters';
	if (step === 3) return 'locations';
	if (step === 4) return 'memories';
	return null;
}

export interface LivePreview {
	title: string;
	genres: string[];
	tone: string[];
	characters: Array<{ name: string; role: string; isUserPersona: boolean }>;
	locations: Array<{ name: string; description: string }>;
	memories: Array<{
		characterName: string;
		summary: string;
		importance: number;
	}>;
}

interface PreviewPanelProps {
	preview: LivePreview;
	genStep: number;
	tab: 'write' | 'import';
}

export function StoryPreviewPanel({
	preview,
	genStep,
	tab,
}: PreviewPanelProps) {
	const activeSection = sectionForStep(genStep);
	const isDone = genStep === 0;

	return (
		<div class={f.previewPanel}>
			<div class="mb-4 text-sm text-text-muted uppercase tracking-widest">
				{isDone
					? 'Story Preview'
					: tab === 'import'
						? 'Extracting…'
						: 'Generating…'}
			</div>

			{/* Title + pills */}
			{preview.title ? (
				<div class={f.previewFadeIn}>
					<div class="mb-2.5 font-bold text-[20px] text-text-primary leading-[1.3]">
						{preview.title}
					</div>
					{(preview.genres.length > 0 || preview.tone.length > 0) && (
						<div class="flex flex-wrap gap-1.25">
							{preview.genres.map((g) => (
								<span
									key={g}
									class="rounded-full border border-accent bg-accent-dim px-2 py-[2px] font-medium text-accent text-sm"
								>
									{g}
								</span>
							))}
							{preview.tone.map((t) => (
								<span
									key={t}
									class="rounded-full border border-border bg-bg-tertiary px-2 py-[2px] text-sm text-text-muted"
								>
									{t}
								</span>
							))}
						</div>
					)}
				</div>
			) : (
				activeSection === 'core' && <SkeletonBlock lines={2} />
			)}

			{/* Characters */}
			{(preview.characters.length > 0 ||
				activeSection === 'characters') && (
				<div class="mt-5">
					<div class="mb-2 font-semibold text-sm text-text-muted uppercase tracking-[0.06em]">
						Characters
					</div>
					{preview.characters.map((c) => (
						<PreviewCard
							key={c.name}
							icon={c.isUserPersona ? '🧑' : '🎭'}
							name={c.name}
							sub={c.role}
						/>
					))}
					{activeSection === 'characters' && <SkeletonCard />}
				</div>
			)}

			{/* Locations */}
			{(preview.locations.length > 0 ||
				activeSection === 'locations') && (
				<div class="mt-5">
					<div class="mb-2 font-semibold text-sm text-text-muted uppercase tracking-[0.06em]">
						Locations
					</div>
					{preview.locations.map((l) => (
						<PreviewCard
							key={l.name}
							icon="📍"
							name={l.name}
							sub={
								l.description.slice(0, 55) +
								(l.description.length > 55 ? '…' : '')
							}
						/>
					))}
					{activeSection === 'locations' && <SkeletonCard />}
				</div>
			)}

			{/* Memories / Backstory */}
			{(preview.memories.length > 0 || activeSection === 'memories') && (
				<div class="mt-5">
					<div class="mb-2 font-semibold text-sm text-text-muted uppercase tracking-[0.06em]">
						{tab === 'import' ? 'Canon Events' : 'Backstory'}
					</div>
					{preview.memories.map((m, i) => (
						<PreviewCard
							key={i}
							icon="🧠"
							name={m.characterName}
							sub={
								m.summary.slice(0, 70) +
								(m.summary.length > 70 ? '…' : '')
							}
							importance={m.importance}
						/>
					))}
					{activeSection === 'memories' && <SkeletonCard />}
				</div>
			)}
		</div>
	);
}
