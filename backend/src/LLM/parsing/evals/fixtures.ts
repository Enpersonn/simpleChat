import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BenchmarkStoryManifest } from './types.js';

const EVAL_DIR = dirname(fileURLToPath(import.meta.url));

function evalPath(...parts: string[]) {
	return resolve(EVAL_DIR, ...parts);
}

export const benchmarkStories: BenchmarkStoryManifest[] = [
	{
		baselinePath: evalPath('baselines', 'fall.json'),
		fixturePath: evalPath('fixtures', 'fall.md'),
		goldPath: evalPath('gold', 'fall.json'),
		id: 'fall',
		notes: [
			'Primary stress test for disguise, identity linkage, relationship shifts, and world-rule extraction.',
		],
		slices: ['story-core', 'identities', 'memories', 'relationships'],
		tags: ['priority:primary', 'stress:identity', 'stress:timeline'],
		title: 'FALL',
	},
	{
		baselinePath: evalPath('baselines', 'holmes.json'),
		fixturePath: evalPath('fixtures', 'holmes.txt'),
		goldPath: evalPath('gold', 'holmes.json'),
		id: 'holmes',
		notes: [
			'Large public-domain benchmark for named entities and alias sanity.',
		],
		slices: ['characters', 'locations', 'identities'],
		tags: ['domain:mystery', 'stress:aliases', 'stress:large-text'],
		title: 'The Adventures of Sherlock Holmes',
	},
	{
		baselinePath: evalPath('baselines', 'monte-cristo.json'),
		fixturePath: evalPath('fixtures', 'monte-cristo.txt'),
		goldPath: evalPath('gold', 'monte-cristo.json'),
		id: 'monte-cristo',
		notes: [
			'Large-cast and long-arc benchmark for timeline and location spread.',
		],
		slices: ['characters', 'locations', 'memories'],
		tags: ['domain:adventure', 'stress:timeline', 'stress:large-cast'],
		title: 'The Count of Monte Cristo',
	},
	{
		baselinePath: evalPath('baselines', 'yellow-wallpaper.json'),
		fixturePath: evalPath('fixtures', 'yellow-wallpaper.txt'),
		goldPath: evalPath('gold', 'yellow-wallpaper.json'),
		id: 'yellow-wallpaper',
		notes: [
			'Small intimate prose benchmark for subtle psychological progression.',
		],
		slices: ['story-core', 'memories', 'characters'],
		tags: ['domain:gothic', 'stress:subtlety', 'stress:small-cast'],
		title: 'The Yellow Wallpaper',
	},
];

const storyMap = new Map(benchmarkStories.map((story) => [story.id, story]));

export function listBenchmarkStories(): BenchmarkStoryManifest[] {
	return [...benchmarkStories];
}

export function getBenchmarkStory(
	storyId: string,
): BenchmarkStoryManifest | undefined {
	return storyMap.get(storyId);
}

export function createAdHocStoryManifest(path: string): BenchmarkStoryManifest {
	const filename = path.split(/[\\/]/).at(-1) ?? path;
	const base = filename.replace(/\.[^.]+$/, '');
	return {
		baselinePath: '',
		fixturePath: path,
		goldPath: '',
		id: base.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
		slices: ['ad-hoc'],
		tags: ['source:path', 'benchmark:adhoc'],
		title: base,
	};
}
