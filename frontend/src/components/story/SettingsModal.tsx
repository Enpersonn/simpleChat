import { useEffect, useState } from 'preact/hooks';
import { useSettingsStore } from '../../store/settings.js';
import { f } from '../shared/formCls.js';
import { OllamaStatus } from '../shared/OllamaStatus.js';

export function SettingsModal({ onClose }: { onClose: () => void }) {
	const {
		appSettings,
		saveSettings,
		availableModels,
		loadModels,
		modelsLoading,
		ollamaHealthy,
		checkHealth,
	} = useSettingsStore();

	const [endpoint, setEndpoint] = useState(appSettings.ollamaEndpoint);
	const [model, setModel] = useState(appSettings.activeModel);
	const [theme, setTheme] = useState(appSettings.theme);
	const [fontSize, setFontSize] = useState(appSettings.fontSize);
	const [globalNote, setGlobalNote] = useState(appSettings.globalNote);
	useEffect(() => {
		document.documentElement.setAttribute('data-theme', theme);
	}, [theme]);

	useEffect(() => {
		document.documentElement.style.setProperty(
			'--bubble-font-size',
			`${fontSize}px`,
		);
	}, [fontSize]);

	const [submitting, setSubmitting] = useState(false);
	const [testing, setTesting] = useState(false);
	const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null);
	const [error, setError] = useState('');

	const handleTest = async () => {
		setTesting(true);
		setTestResult(null);
		// Save endpoint first so the backend uses the current value when testing
		try {
			await saveSettings({ ollamaEndpoint: endpoint.trim() });
		} catch {
			// non-fatal — the test will still reflect reality
		}
		await checkHealth();
		const store = useSettingsStore.getState();
		const healthy = store.ollamaHealthy;
		setTestResult(healthy ? 'ok' : 'fail');
		if (healthy) {
			await loadModels();
		}
		setTesting(false);
	};

	const handleLoadModels = async () => {
		await loadModels();
	};

	const handleSubmit = async () => {
		setSubmitting(true);
		setError('');
		try {
			await saveSettings({
				activeModel: model.trim(),
				fontSize,
				globalNote: globalNote.trim(),
				ollamaEndpoint: endpoint.trim(),
				theme,
			});
			onClose();
		} catch (err) {
			setError((err as Error).message);
			setSubmitting(false);
		}
	};

	return (
		<div
			class={f.overlay}
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div class={f.modal} style={{ width: '460px' }}>
				<div class={f.header}>
					<span class={f.title}>Settings</span>
					<button type="button" class={f.closeBtn} onClick={onClose}>
						✕
					</button>
				</div>

				{error && <p class={f.errorMsg}>{error}</p>}

				<div class={f.field}>
					<div class="flex items-center gap-[6px]">
						<label class={f.label}>Ollama Endpoint</label>
						<OllamaStatus healthy={ollamaHealthy} />
					</div>
					<div class="flex items-center gap-[6px]">
						<input
							class={f.input}
							style={{ flex: 1 }}
							value={endpoint}
							onInput={(e) =>
								setEndpoint(
									(e.target as HTMLInputElement).value,
								)
							}
							placeholder="http://localhost:11434"
						/>
						<button
							type="button"
							class="shrink-0 rounded-sm border border-accent bg-accent-dim px-[12px] py-[7px] font-semibold text-[12px] text-accent transition-all duration-150 hover:enabled:bg-accent hover:enabled:text-text-on-accent disabled:cursor-default disabled:opacity-50"
							onClick={handleTest}
							disabled={testing}
						>
							{testing ? '…' : 'Test'}
						</button>
					</div>
					{testResult === 'ok' && (
						<div class="rounded-sm border border-success-border bg-success-dim px-[8px] py-[5px] text-[12px] text-success">
							✓ Connected — {availableModels.length} model
							{availableModels.length !== 1 ? 's' : ''} found
						</div>
					)}
					{testResult === 'fail' && (
						<div class="rounded-sm border border-error-border bg-error-dim px-[8px] py-[5px] text-[12px] text-error">
							✕ Could not reach Ollama at this endpoint. Is it
							running?
						</div>
					)}
				</div>

				<div class={f.field}>
					<label class={f.label} htmlFor="activeModel">
						Active Model (default)
					</label>
					<div class="flex items-center gap-[6px]">
						<input
							id="activeModel"
							class={f.input}
							style={{ flex: 1 }}
							value={model}
							onInput={(e) =>
								setModel((e.target as HTMLInputElement).value)
							}
							placeholder="e.g. llama3:8b"
						/>
						<button
							type="button"
							class="shrink-0 rounded-sm border border-border bg-bg-tertiary px-[10px] py-[7px] text-[15px] text-text-muted transition-all duration-150 hover:enabled:border-accent hover:enabled:text-accent disabled:cursor-default disabled:opacity-50"
							onClick={handleLoadModels}
							disabled={modelsLoading}
							title={
								modelsLoading
									? 'Loading…'
									: 'Load available models'
							}
							style={{ minWidth: '32px' }}
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
					{availableModels.length > 0 && (
						<div class="flex max-h-40 flex-col gap-0.5 overflow-y-auto rounded-sm border border-border bg-bg-tertiary p-[4px]">
							{availableModels.map((m) => (
								<button
									type="button"
									key={m}
									class="flex items-center justify-between overflow-hidden text-ellipsis whitespace-nowrap rounded-sm px-[8px] py-[5px] text-left text-[12px] text-text-secondary hover:bg-bg-hover hover:text-text-primary data-[active=true]:bg-accent-dim data-[active=true]:font-medium data-[active=true]:text-accent"
									data-active={
										m === model ? 'true' : undefined
									}
									onClick={() => setModel(m)}
								>
									{m}
									{m === model && (
										<span class="shrink-0 text-[11px] text-accent">
											✓
										</span>
									)}
								</button>
							))}
						</div>
					)}
					{availableModels.length === 0 && !modelsLoading && (
						<div class="text-[11px] text-text-muted italic">
							Click ↻ to load available models from Ollama
						</div>
					)}
					{modelsLoading && (
						<div class="text-[11px] text-text-muted italic">
							Loading models…
						</div>
					)}
				</div>

				<div class={f.field}>
					<label class={f.label}>Theme</label>
					<div class={f.toggleRow}>
						{(['dark', 'light'] as const).map((t) => (
							<button
								type="button"
								key={t}
								class={f.tag}
								data-active={theme === t ? 'true' : undefined}
								onClick={() => setTheme(t)}
							>
								{t === 'dark' ? '🌙 Dark' : '☀️ Light'}
							</button>
						))}
					</div>
				</div>

				<div class={f.field}>
					<label class={f.label}>Font Size ({fontSize}px)</label>
					<input
						type="range"
						min={12}
						max={20}
						step={1}
						value={fontSize}
						onInput={(e) =>
							setFontSize(
								Number((e.target as HTMLInputElement).value),
							)
						}
						style={{ accentColor: 'var(--accent)', width: '100%' }}
					/>
				</div>

				<div class={f.field}>
					<label id="global-note-text-area" class={f.label}>
						Global Note{' '}
						<span class={f.labelHint}>
							(appended to every system prompt)
						</span>
					</label>
					<textarea
						class={f.textarea}
						value={globalNote}
						onInput={(e) =>
							setGlobalNote(
								(e.target as HTMLTextAreaElement).value,
							)
						}
						placeholder="e.g. always write in present tense, avoid purple prose…"
						style={{ minHeight: '72px' }}
					/>
				</div>

				<div class={f.footer}>
					<button class={f.cancelBtn} onClick={onClose}>
						Cancel
					</button>
					<button
						class={f.submitBtn}
						onClick={handleSubmit}
						disabled={submitting}
					>
						{submitting ? 'Saving…' : 'Save Settings'}
					</button>
				</div>
			</div>
		</div>
	);
}
