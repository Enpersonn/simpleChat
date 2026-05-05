import type { MoodTag, ResponseLength } from '@simplechat/types';
import { useRef, useState } from 'preact/hooks';
import { useChatsStore } from '../../store/chats.js';
import { useSettingsStore } from '../../store/settings.js';
import { useStoriesStore } from '../../store/stories.js';
import { DebugPanel } from '../debug/DebugPanel.js';
import { OllamaStatus } from '../shared/OllamaStatus.js';

const MOOD_TAGS: MoodTag[] = [
	'tense',
	'warm',
	'eerie',
	'playful',
	'melancholy',
	'action-heavy',
	'mysterious',
	'romantic',
	'dark',
	'hopeful',
];

const LENGTHS: { value: ResponseLength; label: string }[] = [
	{ label: 'Short', value: 'short' },
	{ label: 'Medium', value: 'medium' },
	{ label: 'Long', value: 'long' },
	{ label: 'Extended', value: 'paragraph+' },
];

const label =
	'text-[10px] font-semibold tracking-[0.08em] uppercase text-text-muted mb-0.5';

export function RightPanel() {
	const {
		generation,
		setGeneration,
		availableModels,
		appSettings,
		ollamaHealthy,
		loadModels,
		modelsLoading,
	} = useSettingsStore();
	const { activeChatId, activeStoryId, updateChat } = useChatsStore();
	const characters = useStoriesStore((st) => st.characters);
	const [showAdvanced, setShowAdvanced] = useState(false);
	const [showDebug, setShowDebug] = useState(false);
	const [modelSwitched, setModelSwitched] = useState(false);
	const modelSwitchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const activeSpeakers =
		useChatsStore(
			(st) =>
				st.chats.find((c) => c.id === st.activeChatId)
					?.activeSpeakers ?? null,
		) ?? [];

	const chats = useChatsStore((st) => st.chats);
	const activeChat = chats.find((c) => c.id === activeChatId);

	const toggleMood = (tag: MoodTag) => {
		const current = generation.moodTags;
		const next = current.includes(tag)
			? current.filter((t) => t !== tag)
			: [...current, tag];
		setGeneration({ moodTags: next });
	};

	const activeSpeakerChars = activeSpeakers
		.map((id) => characters.find((c) => c.id === id))
		.filter(Boolean);

	const handleModelChange = (value: string) => {
		setGeneration({ model: value });
		setModelSwitched(true);
		if (modelSwitchTimer.current) clearTimeout(modelSwitchTimer.current);
		modelSwitchTimer.current = setTimeout(
			() => setModelSwitched(false),
			2000,
		);
	};

	const inputCls =
		'w-full px-2 py-1.5 text-xs border border-border rounded-sm bg-bg-tertiary text-text-primary focus:border-accent focus:outline-none';

	return (
		<div class="flex flex-col gap-4 p-3">
			{/* Model selector */}
			<div class="flex flex-col gap-2">
				<div class="mb-1 flex items-center gap-1.5">
					<span class={label} style={{ margin: 0 }}>
						Model
					</span>
					<OllamaStatus healthy={ollamaHealthy} />
					{modelSwitched && (
						<span class="ml-auto font-semibold text-sm text-success">
							✓ switched
						</span>
					)}
					<button
						type="button"
						class={`ml-auto rounded-sm border border-transparent bg-none px-1 py-0.5 text-[13px] text-text-muted transition-all duration-150 enabled:hover:border-border enabled:hover:text-accent disabled:cursor-default disabled:opacity-40 ${modelSwitched ? 'ml-0' : 'ml-auto'}`}
						onClick={() => loadModels()}
						disabled={modelsLoading}
						title={
							modelsLoading ? 'Loading…' : 'Refresh model list'
						}
					>
						<span
							class={
								modelsLoading
									? 'inline-block animate-spin-slow'
									: undefined
							}
						>
							↻
						</span>
					</button>
				</div>
				{availableModels.length > 0 ? (
					<select
						class={inputCls}
						value={generation.model || appSettings.activeModel}
						onChange={(e) =>
							handleModelChange(
								(e.target as HTMLSelectElement).value,
							)
						}
					>
						{availableModels.map((m) => (
							<option key={m} value={m}>
								{m}
							</option>
						))}
					</select>
				) : (
					<input
						class={`${inputCls} placeholder:text-text-muted`}
						type="text"
						placeholder={
							appSettings.activeModel || 'Enter model name…'
						}
						value={generation.model}
						onInput={(e) =>
							handleModelChange(
								(e.target as HTMLInputElement).value,
							)
						}
					/>
				)}
				{ollamaHealthy === false && (
					<div class="text-[11px] text-error italic">
						Ollama unreachable — check Settings
					</div>
				)}
			</div>

			{/* Mode */}
			<div class="flex flex-col gap-2">
				<div class={label}>Mode</div>
				<div class="flex overflow-hidden rounded border border-border bg-bg-tertiary">
					<button
						type="button"
						class="flex-1 px-1 py-1.5 text-center font-medium text-[11px] text-text-muted transition-colors duration-150 hover:text-text-primary data-[active=true]:bg-accent data-[active=true]:text-text-on-accent"
						data-active={
							!activeChat || activeChat.mode === 'interactive'
								? 'true'
								: undefined
						}
						onClick={() => {
							if (activeChatId && activeStoryId)
								updateChat(activeStoryId, activeChatId, {
									mode: 'interactive',
								});
						}}
					>
						Interactive RP
					</button>
					<button
						type="button"
						class="flex-1 px-1 py-1.5 text-center font-medium text-[11px] text-text-muted transition-colors duration-150 hover:text-text-primary data-[active=true]:bg-accent data-[active=true]:text-text-on-accent"
						data-active={
							activeChat?.mode === 'storyteller'
								? 'true'
								: undefined
						}
						onClick={() => {
							if (activeChatId && activeStoryId)
								updateChat(activeStoryId, activeChatId, {
									mode: 'storyteller',
								});
						}}
					>
						Storyteller
					</button>
				</div>
			</div>

			{/* Active speakers */}
			{activeSpeakerChars.length > 0 && (
				<div class="flex flex-col gap-2">
					<div class={label}>Speaking As</div>
					{activeSpeakerChars.map(
						(char) =>
							char && (
								<div
									key={char.id}
									class="flex cursor-pointer items-center gap-1.5 rounded-sm border border-border bg-bg-tertiary px-2 py-[5px] text-text-secondary text-xs transition-colors duration-150 hover:border-accent"
								>
									<div class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-dim font-bold text-accent text-sm">
										{char.name[0]?.toUpperCase()}
									</div>
									<span>{char.name}</span>
									<span class="ml-auto text-sm text-text-muted">
										{char.role}
									</span>
								</div>
							),
					)}
				</div>
			)}

			{/* Response length */}
			<div class="flex flex-col gap-2">
				<div class={label}>Response Length</div>
				<div class="flex flex-wrap gap-1">
					{LENGTHS.map((l) => (
						<button
							key={l.value}
							type="button"
							class="min-w-0 flex-1 whitespace-nowrap rounded-sm border border-border bg-bg-tertiary px-1 py-[5px] text-center text-[11px] text-text-muted transition-all duration-150 hover:border-accent hover:text-text-primary data-[active=true]:border-accent data-[active=true]:bg-accent-dim data-[active=true]:text-accent"
							data-active={
								generation.responseLength === l.value
									? 'true'
									: undefined
							}
							onClick={() =>
								setGeneration({ responseLength: l.value })
							}
						>
							{l.label}
						</button>
					))}
				</div>
			</div>

			{/* Mood tags */}
			<div class="flex flex-col gap-2">
				<div class={label}>Mood</div>
				<div class="flex flex-wrap gap-1">
					{MOOD_TAGS.map((tag) => (
						<button
							key={tag}
							type="button"
							class="cursor-pointer rounded-full border border-border bg-bg-tertiary px-2 py-[3px] text-[11px] text-text-muted transition-all duration-150 hover:border-accent hover:text-text-primary data-[active=true]:border-accent data-[active=true]:bg-accent-dim data-[active=true]:text-accent"
							data-active={
								generation.moodTags.includes(tag)
									? 'true'
									: undefined
							}
							onClick={() => toggleMood(tag)}
						>
							{tag}
						</button>
					))}
				</div>
			</div>

			{/* Feel text */}
			<div class="flex flex-col gap-2">
				<div class={label}>Style Note</div>
				<textarea
					class="min-h-14 w-full resize-y rounded-sm border border-border bg-bg-tertiary px-[9px] py-[7px] text-text-primary text-xs leading-normal placeholder:text-text-muted focus:border-accent focus:outline-none"
					placeholder="e.g. sharp dialogue, minimal narration, tension through silence…"
					value={generation.feelText}
					onInput={(e) =>
						setGeneration({
							feelText: (e.target as HTMLTextAreaElement).value,
						})
					}
				/>
			</div>

			{/* Advanced */}
			<div>
				<button
					type="button"
					class="flex w-full cursor-pointer items-center gap-1.5 border-border border-t py-1 pt-[10px] text-[11px] text-text-muted hover:text-text-secondary"
					onClick={() => setShowAdvanced((v) => !v)}
				>
					<span>Advanced Parameters</span>
					<span
						class={`transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`}
					>
						▾
					</span>
				</button>

				{showAdvanced && (
					<div class="mt-[10px] flex flex-col gap-3">
						<SliderRow
							label="Temperature"
							value={generation.temperature}
							min={0}
							max={2}
							step={0.05}
							onChange={(v) => setGeneration({ temperature: v })}
						/>
						<SliderRow
							label="Top P"
							value={generation.top_p}
							min={0}
							max={1}
							step={0.05}
							onChange={(v) => setGeneration({ top_p: v })}
						/>
						<SliderRow
							label="Top K"
							value={generation.top_k}
							min={1}
							max={100}
							step={1}
							onChange={(v) => setGeneration({ top_k: v })}
						/>
						<SliderRow
							label="Repeat Penalty"
							value={generation.repeat_penalty}
							min={1}
							max={2}
							step={0.05}
							onChange={(v) =>
								setGeneration({ repeat_penalty: v })
							}
						/>
					</div>
				)}
			</div>

			{/* Debug panel */}
			<div>
				<button
					type="button"
					class="flex w-full cursor-pointer items-center gap-1.5 border-border border-t py-1 pt-[10px] text-[11px] text-text-muted hover:text-text-secondary"
					onClick={() => setShowDebug((v) => !v)}
				>
					<span>Debug</span>
					<span
						class={`transition-transform duration-200 ${showDebug ? 'rotate-180' : ''}`}
					>
						▾
					</span>
				</button>
				{showDebug && <DebugPanel />}
			</div>
		</div>
	);
}

function SliderRow({
	label: lbl,
	value,
	min,
	max,
	step,
	onChange,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	step: number;
	onChange: (v: number) => void;
}) {
	return (
		<div class="flex flex-col gap-1">
			<div class="flex justify-between text-[11px] text-text-secondary">
				<span>{lbl}</span>
				<span class="text-accent tabular-nums">{value.toFixed(2)}</span>
			</div>
			<input
				type="range"
				class="w-full cursor-pointer accent-[var(--accent)]"
				min={min}
				max={max}
				step={step}
				value={value}
				onInput={(e) =>
					onChange(Number((e.target as HTMLInputElement).value))
				}
			/>
		</div>
	);
}
