import type { CharacterCreate } from '@simplechat/types';
import { useState } from 'preact/hooks';
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '../../shared/Dialog.js';
import { f } from '../../shared/formCls.js';
import { CharacterModal } from '../CharacterModal.js';
import { FormContent } from './form-content.js';
import { type LivePreview, StoryPreviewPanel } from './live-preview-panel.js';
import type { PendingChar } from './types.js';

interface Props {
	selectStory: (id: string | null) => Promise<void>;
}
export const emptyPreview = (): LivePreview => ({
	characters: [],
	genres: [],
	locations: [],
	memories: [],
	title: '',
	tone: [],
});

export function StoryCreateModal({ selectStory }: Props) {
	const [tab, setTab] = useState<'write' | 'import'>('write');
	const [pendingChars, setPendingChars] = useState<PendingChar[]>([]);
	const [editingChar, setEditingChar] = useState<
		PendingChar | 'new' | 'new-persona' | null
	>(null);
	const [genStep, setGenStep] = useState<0 | 1 | 2 | 3 | 4>(0);
	const [livePreview, setLivePreview] = useState<LivePreview>(emptyPreview());

	const saveChar = (data: CharacterCreate) => {
		if (editingChar === 'new' || editingChar === 'new-persona') {
			setPendingChars((prev) => [
				...prev,
				{ ...data, _localId: `char-${Date.now()}` },
			]);
		} else if (editingChar) {
			const id = editingChar._localId;
			setPendingChars((prev) =>
				prev.map((c) =>
					c._localId === id ? { ...data, _localId: id } : c,
				),
			);
		}
	};

	return (
		<Dialog>
			<DialogTrigger asChild>
				<button
					type="button"
					class={
						'rounded-sm px-0.5 text-[18px] text-text-muted leading-none transition-colors duration-150 hover:text-accent'
					}
					title="New story"
				>
					+
				</button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>New Story</DialogTitle>
					<DialogClose />
				</DialogHeader>

				<div class="-mx-6 flex min-h-0 flex-1 flex-row">
					<div class="flex w-130 shrink-0 flex-col gap-4.5 overflow-y-auto px-6 pt-1 pb-6">
						<div class={f.tabs}>
							<button
								type="button"
								class={f.tabBtn}
								data-active={
									tab === 'write' ? 'true' : undefined
								}
								onClick={() => setTab('write')}
							>
								Write
							</button>
							<button
								type="button"
								class={f.tabBtn}
								data-active={
									tab === 'import' ? 'true' : undefined
								}
								onClick={() => setTab('import')}
							>
								Import from text
							</button>
						</div>
						<FormContent
							selectStory={selectStory}
							setGenStep={setGenStep}
							setPendingChars={setPendingChars}
							pendingChars={pendingChars}
							tab={tab}
							setTab={setTab}
							setLivePreview={setLivePreview}
							setEditingChar={setEditingChar}
							genStep={genStep}
						/>
					</div>
					<div class="min-w-65 flex-1 overflow-y-auto border-border border-l bg-bg-primary px-6 pt-1 pb-6">
						<StoryPreviewPanel
							preview={livePreview}
							genStep={genStep}
							tab={tab}
						/>
					</div>
				</div>

				{editingChar !== null && (
					<CharacterModal
						initialDraft={
							editingChar === 'new' ||
							editingChar === 'new-persona'
								? undefined
								: editingChar
						}
						defaultIsPersona={
							editingChar === 'new-persona' ||
							(typeof editingChar === 'object' &&
								!!editingChar?.isUserPersona)
						}
						onClose={() => setEditingChar(null)}
						onSaved={() => setEditingChar(null)}
						onSaveData={saveChar}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}
