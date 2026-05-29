import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { access } from 'node:fs/promises';
import type { BenchmarkMetricRow } from './types.js';

export function slugify(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80);
}

export function normalizeWhitespace(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}

export function normalizeName(value: string): string {
	return normalizeWhitespace(value)
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9\s]/g, ' ')
		.replace(
			/\b(mr|mrs|ms|miss|dr|sir|lady|lord|inspector|captain)\b/g,
			' ',
		)
		.replace(/\s+/g, ' ')
		.trim();
}

export function nameTokens(value: string): string[] {
	return normalizeName(value).split(' ').filter(Boolean);
}

export function namesComparable(left: string, right: string): boolean {
	const leftTokens = nameTokens(left);
	const rightTokens = nameTokens(right);
	if (leftTokens.length === 0 || rightTokens.length === 0) return false;
	const leftJoined = leftTokens.join(' ');
	const rightJoined = rightTokens.join(' ');
	if (leftJoined === rightJoined) return true;
	const rightSet = new Set(rightTokens);
	const overlap = leftTokens.filter((token) => rightSet.has(token));
	if (overlap.length === 0) return false;
	return overlap.length >= Math.min(leftTokens.length, rightTokens.length);
}

export function uniqueStrings(values: string[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const value of values) {
		const trimmed = normalizeWhitespace(value);
		if (!trimmed) continue;
		const key = trimmed.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(trimmed);
	}
	return result;
}

export function average(values: number[]): number {
	if (values.length === 0) return 0;
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function median(values: number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((left, right) => left - right);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 1
		? sorted[middle]
		: (sorted[middle - 1] + sorted[middle]) / 2;
}

export function standardDeviation(values: number[]): number {
	if (values.length <= 1) return 0;
	const mean = average(values);
	return Math.sqrt(
		average(values.map((value) => (value - mean) * (value - mean))),
	);
}

export function hashText(text: string): string {
	return createHash('sha256').update(text).digest('hex');
}

export async function fileExists(path: string): Promise<boolean> {
	try {
		await access(path, fsConstants.F_OK);
		return true;
	} catch {
		return false;
	}
}

export function toCsvValue(value: BenchmarkMetricRow[string]): string {
	if (value === null || value === undefined) return '';
	const text = String(value);
	if (text.includes(',') || text.includes('"') || text.includes('\n')) {
		return `"${text.replaceAll('"', '""')}"`;
	}
	return text;
}

export function rowsToCsv(rows: BenchmarkMetricRow[]): string {
	if (rows.length === 0) return '';
	const headers = Object.keys(rows[0]);
	return [
		headers.join(','),
		...rows.map((row) =>
			headers.map((header) => toCsvValue(row[header])).join(','),
		),
	].join('\n');
}

export function recordsToNdjson(records: unknown[]): string {
	return records.map((record) => JSON.stringify(record)).join('\n');
}

export function summarizeOutput(output: unknown): Record<string, unknown> {
	if (!output) return { kind: 'empty' };
	if (Array.isArray(output)) {
		if (output.length === 0) return { count: 0, kind: 'array' };
		const first = output[0] as Record<string, unknown>;
		if (typeof first?.name === 'string') {
			return {
				count: output.length,
				kind: 'named-array',
				sample: output
					.slice(0, 5)
					.map(
						(item) => (item as Record<string, unknown>).name ?? '',
					),
			};
		}
		if (typeof first?.characterName === 'string') {
			return {
				count: output.length,
				kind: 'memory-array',
				sample: output
					.slice(0, 5)
					.map(
						(item) =>
							`${(item as Record<string, unknown>).characterName ?? ''}::${(item as Record<string, unknown>).summary ?? ''}`,
					),
			};
		}
		return { count: output.length, kind: 'array' };
	}
	if (typeof output === 'object' && output !== null) {
		return {
			keys: Object.keys(output as Record<string, unknown>).length,
			kind: 'object',
		};
	}
	return { kind: typeof output };
}

export function toTimestampMs(timestamp: string | undefined): number {
	return timestamp ? new Date(timestamp).getTime() : 0;
}
