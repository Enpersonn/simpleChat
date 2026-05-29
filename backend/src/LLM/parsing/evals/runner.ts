import { mkdir } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blessBaseline, compareToBaseline } from './baseline.js';
import { runBenchmarkRepeat } from './execution.js';
import { buildFindings } from './findings.js';
import { listBenchmarkStories } from './fixtures.js';
import { loadStoryTargets } from './loader.js';
import { buildMetricRegistryOutput } from './metrics.js';
import { writeRunArtifacts, writeSuiteArtifacts } from './report.js';
import type { BenchmarkCompletedRun } from './types.js';
import { slugify } from './utils.js';

const EVAL_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUTPUT_ROOT = resolve(
	EVAL_DIR,
	'../../../../data/extraction-evals',
);

type CliOptions = {
	all: boolean;
	bless: boolean;
	help: boolean;
	outputRootDir: string;
	pipelineOnly: boolean;
	repeatCount: number;
	targets: string[];
};

function parseArgs(argv: string[]): CliOptions {
	const targets: string[] = [];
	let all = false;
	let bless = false;
	let help = false;
	let outputRootDir = DEFAULT_OUTPUT_ROOT;
	let pipelineOnly = false;
	let repeatCount = 1;

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === '--all') {
			all = true;
			continue;
		}
		if (arg === '--bless') {
			bless = true;
			continue;
		}
		if (arg === '--pipeline-only') {
			pipelineOnly = true;
			continue;
		}
		if (arg === '--help' || arg === '-h') {
			help = true;
			continue;
		}
		if (arg === '--repeat') {
			repeatCount = Number(argv[index + 1] ?? '1');
			index += 1;
			continue;
		}
		if (arg.startsWith('--repeat=')) {
			repeatCount = Number(arg.slice('--repeat='.length));
			continue;
		}
		if (arg === '--output-dir') {
			outputRootDir = resolve(
				process.cwd(),
				argv[index + 1] ?? DEFAULT_OUTPUT_ROOT,
			);
			index += 1;
			continue;
		}
		if (arg.startsWith('--output-dir=')) {
			outputRootDir = resolve(
				process.cwd(),
				arg.slice('--output-dir='.length),
			);
			continue;
		}
		targets.push(arg);
	}

	return {
		all,
		bless,
		help,
		outputRootDir,
		pipelineOnly,
		repeatCount:
			Number.isFinite(repeatCount) && repeatCount > 0 ? repeatCount : 1,
		targets,
	};
}

function printHelp() {
	console.log(
		[
			'Usage:',
			'  npm run benchmark:parse --workspace=backend -- <story-id|path>',
			'  npm run benchmark:parse:all --workspace=backend',
			'',
			'Options:',
			'  --all              Run every registered benchmark story',
			'  --bless            Write or refresh the blessed baseline snapshot',
			'  --repeat <N>       Run the same story N times and emit repeat variance',
			'  --pipeline-only    Skip isolated stage reruns',
			'  --output-dir <p>   Override the output root directory',
			'',
			'Registered stories:',
			...listBenchmarkStories().map(
				(story) => `  ${story.id.padEnd(20)} ${story.title}`,
			),
		].join('\n'),
	);
}

function buildSuiteDirName(options: CliOptions) {
	const base =
		options.all || options.targets.length !== 1
			? 'suite'
			: slugify(
					basename(options.targets[0], extname(options.targets[0])) ||
						options.targets[0],
				);
	return `${new Date().toISOString().replaceAll(':', '-')}-${base}`;
}

async function runStoryBenchmark(
	loadedStory: Awaited<ReturnType<typeof loadStoryTargets>>[number],
	storyOutDir: string,
	options: CliOptions,
): Promise<BenchmarkCompletedRun> {
	console.log(`\nEvaluating ${loadedStory.manifest.title}`);
	console.log(`  fixture: ${loadedStory.originalPath}`);
	console.log(`  repeats: ${options.repeatCount}`);

	const repeats = [];
	for (
		let repeatIndex = 1;
		repeatIndex <= options.repeatCount;
		repeatIndex += 1
	) {
		console.log(`  run ${repeatIndex}/${options.repeatCount}`);
		repeats.push(
			await runBenchmarkRepeat(
				loadedStory,
				repeatIndex,
				options.pipelineOnly,
			),
		);
	}

	const metrics = buildMetricRegistryOutput(loadedStory, repeats);
	metrics.families.baselineComparison = compareToBaseline(
		loadedStory,
		metrics.qualitySnapshot,
		metrics.stageMetricRows,
		loadedStory.baseline,
	);
	const findings = buildFindings(metrics);

	const completedRun: BenchmarkCompletedRun = {
		findings,
		loadedStory,
		metrics,
		repeats,
		storyOutDir,
	};

	await writeRunArtifacts(completedRun);
	if (options.bless) {
		await blessBaseline(
			loadedStory,
			metrics.qualitySnapshot,
			metrics.stageMetricRows,
		);
		console.log('  baseline: blessed');
	}
	console.log(`  artifacts: ${storyOutDir}`);

	return completedRun;
}

export async function runParserBenchmarkCli(argv: string[]) {
	const options = parseArgs(argv);
	if (options.help || (!options.all && options.targets.length === 0)) {
		printHelp();
		return options.help ? 0 : 1;
	}

	const loadedStories = await loadStoryTargets(options.targets, options.all);
	if (loadedStories.length === 0) {
		throw new Error('No stories were loaded for benchmarking.');
	}

	const suiteDir = join(options.outputRootDir, buildSuiteDirName(options));
	await mkdir(suiteDir, { recursive: true });

	const completedRuns: BenchmarkCompletedRun[] = [];
	for (const story of loadedStories) {
		const storyDir = join(
			suiteDir,
			`${story.manifest.id}-${slugify(story.manifest.title)}`,
		);
		completedRuns.push(await runStoryBenchmark(story, storyDir, options));
	}

	await writeSuiteArtifacts(suiteDir, completedRuns);
	console.log(`\nWrote suite artifacts to ${suiteDir}`);
	return 0;
}
