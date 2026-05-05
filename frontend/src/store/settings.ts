import { create } from 'zustand';
import type { AppSettings, MoodTag, ResponseLength } from '@simplechat/types';
import { DEFAULT_SETTINGS, DEFAULT_PROMPT_PROFILES } from '@simplechat/types';
import { api } from '../lib/api.js';

interface GenerationConfig {
	moodTags: MoodTag[];
	responseLength: ResponseLength;
	feelText: string;
	temperature: number;
	top_p: number;
	top_k: number;
	repeat_penalty: number;
	model: string;
}

interface SettingsState {
	appSettings: AppSettings;
	generation: GenerationConfig;
	ollamaHealthy: boolean | null;
	availableModels: string[];
	modelsLoading: boolean;

	loadSettings: () => Promise<void>;
	saveSettings: (data: Partial<AppSettings>) => Promise<void>;
	setGeneration: (data: Partial<GenerationConfig>) => void;
	checkHealth: () => Promise<void>;
	loadModels: () => Promise<void>;
}

const DEFAULT_GENERATION: GenerationConfig = {
	moodTags: [],
	responseLength: 'medium',
	feelText: '',
	temperature: 0.85,
	top_p: 0.9,
	top_k: 40,
	repeat_penalty: 1.1,
	model: '',
};

export const useSettingsStore = create<SettingsState>((set) => ({
	appSettings: DEFAULT_SETTINGS,
	generation: DEFAULT_GENERATION,
	ollamaHealthy: null,
	availableModels: [],
	modelsLoading: false,

	loadSettings: async () => {
		try {
			const s = await api.settings.get();
			set((state) => ({
				appSettings: s,
				generation: { ...state.generation, model: s.activeModel },
			}));
		} catch {
			// keep defaults
		}
	},

	saveSettings: async (data: Partial<AppSettings>) => {
		const updated = await api.settings.update(data);
		set({ appSettings: updated });
		// Re-check health and reload models after any settings change (endpoint may have changed)
		try {
			const { ok } = await api.ollama.health();
			set({ ollamaHealthy: ok });
			if (ok) {
				try {
					const models = await api.ollama.models();
					set({ availableModels: models.map((m) => m.name) });
				} catch {
					// Models unavailable but Ollama itself is healthy
				}
			}
		} catch {
			set({ ollamaHealthy: false });
		}
	},

	setGeneration: (data: Partial<GenerationConfig>) => {
		set((s) => ({ generation: { ...s.generation, ...data } }));
	},

	checkHealth: async () => {
		try {
			const { ok } = await api.ollama.health();
			set({ ollamaHealthy: ok });
		} catch {
			set({ ollamaHealthy: false });
		}
	},

	loadModels: async () => {
		set({ modelsLoading: true });
		try {
			const models = await api.ollama.models();
			set({
				availableModels: models.map((m) => m.name),
				modelsLoading: false,
			});
		} catch {
			set({ availableModels: [], modelsLoading: false });
		}
	},
}));

export { DEFAULT_GENERATION, DEFAULT_PROMPT_PROFILES };
