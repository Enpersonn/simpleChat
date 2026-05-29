import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadBaseline } from './baseline.js';
import {
	createAdHocStoryManifest,
	getBenchmarkStory,
	listBenchmarkStories,
} from './fixtures.js';
import { BenchmarkGoldSchema, type BenchmarkLoadedStory } from './types.js';
import { fileExists, hashText, slugify } from './utils.js';

async function readGold(goldPath: string) {
	const raw = await readFile(goldPath, 'utf8');
	return BenchmarkGoldSchema.parse(JSON.parse(raw));
}

export async function loadRegisteredStory(
	storyId: string,
): Promise<BenchmarkLoadedStory> {
	const manifest = getBenchmarkStory(storyId);
	if (!manifest) {
		throw new Error(
			`Unknown benchmark story "${storyId}". Available ids: ${listBenchmarkStories()
				.map((story) => story.id)
				.join(', ')}`,
		);
	}
	if (!(await fileExists(manifest.fixturePath))) {
		throw new Error(
			`Missing fixture file for ${storyId}: ${manifest.fixturePath}`,
		);
	}
	if (!(await fileExists(manifest.goldPath))) {
		throw new Error(
			`Missing gold file for ${storyId}: ${manifest.goldPath}`,
		);
	}
	const text = await readFile(manifest.fixturePath, 'utf8');
	return {
		baseline: await loadBaseline(manifest.baselinePath),
		context: manifest.context,
		fixtureHash: hashText(text),
		gold: await readGold(manifest.goldPath),
		manifest,
		originalPath: manifest.fixturePath,
		text,
	};
}

export async function loadAdHocStory(
	pathLike: string,
): Promise<BenchmarkLoadedStory> {
	const path = resolve(process.cwd(), pathLike);
	if (!(await fileExists(path))) {
		throw new Error(`Story file not found: ${path}`);
	}
	const manifest = createAdHocStoryManifest(path);
	const text = await readFile(path, 'utf8');
	return {
		baseline: null,
		context: undefined,
		fixtureHash: hashText(text),
		gold: BenchmarkGoldSchema.parse({}),
		manifest: {
			...manifest,
			id: slugify(manifest.id),
		},
		originalPath: path,
		text,
	};
}

export async function loadStoryTargets(
	targets: string[],
	all: boolean,
): Promise<BenchmarkLoadedStory[]> {
	if (all) {
		return Promise.all(
			listBenchmarkStories().map((story) =>
				loadRegisteredStory(story.id),
			),
		);
	}

	const loaded: BenchmarkLoadedStory[] = [];
	for (const target of targets) {
		if (getBenchmarkStory(target)) {
			loaded.push(await loadRegisteredStory(target));
			continue;
		}
		loaded.push(await loadAdHocStory(target));
	}
	return loaded;
}
