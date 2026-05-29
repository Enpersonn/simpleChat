#!/usr/bin/env tsx

import { runParserBenchmarkCli } from '../LLM/parsing/evals/runner.js';

runParserBenchmarkCli(process.argv.slice(2))
	.then((code) => {
		process.exit(code);
	})
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
