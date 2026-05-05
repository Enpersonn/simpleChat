import { useEffect, useState } from 'preact/hooks';
import { Controller, FormProvider, useForm } from 'react-hook-form';
import { useSettingsStore } from '../../store/settings.js';
import { Button } from '../shared/Button.js';
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '../shared/Dialog.js';
import { f } from '../shared/formCls.js';
import { OllamaStatus } from '../shared/OllamaStatus.js';

type FormValues = {
	endpoint: string;
	model: string;
	theme: 'dark' | 'light';
	fontSize: number;
	globalNote: string;
};

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

	const form = useForm<FormValues>({
		defaultValues: {
			endpoint: appSettings.ollamaEndpoint,
			fontSize: appSettings.fontSize,
			globalNote: appSettings.globalNote,
			model: appSettings.activeModel,
			theme: appSettings.theme,
		},
	});

	const theme = form.watch('theme');
	const fontSize = form.watch('fontSize');
	const model = form.watch('model');

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
		try {
			await saveSettings({
				ollamaEndpoint: form.getValues('endpoint').trim(),
			});
		} catch {
			// non-fatal
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

	const onSubmit = async (data: FormValues) => {
		setSubmitting(true);
		setError('');
		try {
			await saveSettings({
				activeModel: data.model.trim(),
				fontSize: data.fontSize,
				globalNote: data.globalNote.trim(),
				ollamaEndpoint: data.endpoint.trim(),
				theme: data.theme,
			});
			onClose();
		} catch (err) {
			setError((err as Error).message);
			setSubmitting(false);
		}
	};

	return (
		<Dialog defaultOpen={true} onClose={onClose}>
			<DialogContent class="w-[460px]">
				<DialogHeader>
					<DialogTitle>Settings</DialogTitle>
					<DialogClose />
				</DialogHeader>

				{error && <p class={f.errorMsg}>{error}</p>}

				<FormProvider {...form}>
					<form
						class="flex flex-col gap-4.5"
						onSubmit={form.handleSubmit(onSubmit)}
					>
						<div class={f.field}>
							<div class="flex items-center gap-[6px]">
								<label class={f.label} htmlFor="ollama-endpoint">
									Ollama Endpoint
								</label>
								<OllamaStatus healthy={ollamaHealthy} />
							</div>
							<div class="flex items-center gap-[6px]">
								<input
									id="ollama-endpoint"
									class={f.input}
									style={{ flex: 1 }}
									{...form.register('endpoint')}
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
									{...form.register('model')}
									placeholder="e.g. llama3:8b"
								/>
								<button
									type="button"
									class="shrink-0 rounded-sm border border-border bg-bg-tertiary px-[10px] py-[7px] text-[15px] text-text-muted transition-all duration-150 hover:enabled:border-accent hover:enabled:text-accent disabled:cursor-default disabled:opacity-50"
									onClick={() => loadModels()}
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
											data-active={m === model ? 'true' : undefined}
											onClick={() => form.setValue('model', m)}
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
							<span class={f.label}>Theme</span>
							<div class={f.toggleRow}>
								{(['dark', 'light'] as const).map((t) => (
									<button
										type="button"
										key={t}
										class={f.tag}
										data-active={theme === t ? 'true' : undefined}
										onClick={() => form.setValue('theme', t)}
									>
										{t === 'dark' ? '🌙 Dark' : '☀️ Light'}
									</button>
								))}
							</div>
						</div>

						<div class={f.field}>
							<label class={f.label} htmlFor="font-size">
								Font Size ({fontSize}px)
							</label>
							<Controller
								control={form.control}
								name="fontSize"
								render={({ field }) => (
									<input
										id="font-size"
										type="range"
										min={12}
										max={20}
										step={1}
										value={field.value}
										onInput={(e) =>
											field.onChange(
												Number(
													(e.target as HTMLInputElement).value,
												),
											)
										}
										style={{
											accentColor: 'var(--accent)',
											width: '100%',
										}}
									/>
								)}
							/>
						</div>

						<div class={f.field}>
							<label class={f.label} htmlFor="global-note">
								Global Note{' '}
								<span class={f.labelHint}>
									(appended to every system prompt)
								</span>
							</label>
							<textarea
								id="global-note"
								class={f.textarea}
								{...form.register('globalNote')}
								placeholder="e.g. always write in present tense, avoid purple prose…"
								style={{ minHeight: '72px' }}
							/>
						</div>

						<DialogFooter>
							<Button
								type="button"
								variant="secondary"
								onClick={onClose}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={submitting}>
								{submitting ? 'Saving…' : 'Save Settings'}
							</Button>
						</DialogFooter>
					</form>
				</FormProvider>
			</DialogContent>
		</Dialog>
	);
}
