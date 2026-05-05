import { readFile } from 'node:fs/promises';
import {
	chunkText,
	type ExtractedValue,
	type ExtractionTag,
	extractFromText,
} from './indext.js';

const STORIES = {
	holmes: {
		title: 'The Adventures of Sherlock Holmes',
		url: 'https://www.gutenberg.org/cache/epub/1661/pg1661.txt',
		groundTruth: {
			characters: [
				'Sherlock Holmes',
				'Watson',
				'Mrs. Hudson',
				'Irene Adler',
				'Inspector Lestrade',
			],
			locations: ['Baker Street', 'London'],
		},
	},
	'monte-cristo': {
		title: 'The Count of Monte Cristo',
		url: 'https://www.gutenberg.org/cache/epub/1184/pg1184.txt',
		groundTruth: {
			characters: [
				'Edmond Dantès',
				'Mercédès',
				'Fernand',
				'Danglars',
				'Villefort',
			],
			locations: ['Marseilles', 'Elba'],
		},
	},
	'yellow-wallpaper': {
		title: 'The Yellow Wallpaper',
		url: 'https://www.gutenberg.org/cache/epub/1952/pg1952.txt',
		groundTruth: {
			characters: ['John', 'Jennie'],
			locations: ['colonial mansion', 'nursery'],
		},
	},
} satisfies Record<
	string,
	{
		title: string;
		url: string;
		groundTruth?: Partial<Record<string, string[]>>;
	}
>;

type StoryKey = keyof typeof STORIES;

const DEFAULT_TAGS: ExtractionTag[] = [
	[
		'characters',
		"a named individual person, being, or entity — not collective nouns like 'demons', 'angels', or 'servants'",
	],
	[
		'locations',
		"a named place, building, region, realm, or setting — not vague descriptions like 'a corner' or 'the street'",
	],
	// [
	//   "items",
	//   "a distinct physical object a character can hold, carry, or use — not body parts, not locations, not abstract concepts",
	// ],
];

function stripGutenbergBoilerplate(text: string): string {
	const startMarker = '*** START OF THE PROJECT GUTENBERG EBOOK';
	const endMarker = '*** END OF THE PROJECT GUTENBERG EBOOK';
	const startIdx = text.indexOf(startMarker);
	const endIdx = text.indexOf(endMarker);
	if (startIdx !== -1) text = text.slice(text.indexOf('\n', startIdx) + 1);
	if (endIdx !== -1) text = text.slice(0, text.lastIndexOf('\n', endIdx));
	return text.trim();
}

async function fetchText(url: string): Promise<string> {
	process.stdout.write(`Fetching ${url} ...\n`);
	const res = await fetch(url);
	if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
	return stripGutenbergBoilerplate(await res.text());
}

// ─── Scoring ──────────────────────────────────────────────────────────────

function scoreRecall(found: string[], expected: string[]) {
	const foundLower = new Set(found.map((s) => s.toLowerCase()));
	const hits = expected.filter((e) => foundLower.has(e.toLowerCase()));
	const missing = expected.filter((e) => !foundLower.has(e.toLowerCase()));
	return {
		recall: expected.length > 0 ? hits.length / expected.length : 1,
		hits,
		missing,
	};
}

// ─── Display ──────────────────────────────────────────────────────────────

function printProgress(done: number, total: number, startMs: number) {
	const pct = Math.round((done / total) * 100);
	const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
	const filled = Math.floor(pct / 5);
	const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
	process.stdout.write(
		`\r  [${bar}] ${pct}% (${done}/${total})  ${elapsed}s`,
	);
}

function printResults(
	result: Record<string, ExtractedValue[]>,
	groundTruth?: Partial<Record<string, string[]>>,
) {
	for (const [tag, entries] of Object.entries(result)) {
		console.log(`── ${tag} (${entries.length})`);
		console.log(
			`  ${entries.map((e) => `${e.value}(num of chunks: ${e.chunkIndices.length})`).join(',\n ') || '(none)'}`,
		);
		const gt = groundTruth?.[tag];
		if (gt) {
			const { recall, hits, missing } = scoreRecall(
				entries.map((e) => e.value),
				gt,
			);
			console.log(
				`  recall: ${(recall * 100).toFixed(0)}%  [${hits.length}/${gt.length} known entities]`,
			);
			if (missing.length) console.log(`  missed: ${missing.join(', ')}`);
		}
		console.log();
	}
}

async function main() {
	const arg = process.argv[2];

	if (!arg || arg === '--help') {
		console.log(
			[
				'',
				'Usage:',
				'  npx tsx test-run.ts <story>         — run a preset Gutenberg story',
				'  npx tsx test-run.ts <path/to/file>  — run on a local text file',
				'',
				'Presets:',
				...Object.entries(STORIES).map(
					([k, s]) => `  ${k.padEnd(20)} ${s.title}`,
				),
				'',
			].join('\n'),
		);
		process.exit(0);
	}

	let text: string;
	let groundTruth: Partial<Record<string, string[]>> | undefined;
	let label: string;

	if (arg in STORIES) {
		const story = STORIES[arg as StoryKey];
		text = await fetchText(story.url);
		groundTruth = story.groundTruth;
		label = story.title;
	} else {
		text = await readFile(arg, 'utf8');
		label = arg;
	}

	console.log(`\n${label}`);
	console.log('─'.repeat(label.length));
	console.log(`Text:   ${text.length.toLocaleString()} chars`);

	const t0 = Date.now();
	const chunks = chunkText(text);
	console.log(
		`Chunks: ${chunks.length}  (avg ${Math.round(text.length / chunks.length)} chars, 300 char overlap)\n`,
	);

	const extractStart = Date.now();
	console.log('Extracting...');

	const result = await extractFromText({
		chunks,
		extractionTags: DEFAULT_TAGS,
		onProgress: (done, total) => printProgress(done, total, extractStart),
	});

	process.stdout.write('\n\n');
	console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);

	printResults(result, groundTruth);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
