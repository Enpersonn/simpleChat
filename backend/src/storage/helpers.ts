import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { dataDir } from '../config';
export async function storyDir(storyId: string): Promise<string> {
	return join(await dataDir(), 'stories', storyId);
}

export async function readJson<T>(path: string, fallback: T): Promise<T> {
	try {
		return JSON.parse(await readFile(path, 'utf-8')) as T;
	} catch {
		return fallback;
	}
}

export async function writeJson(path: string, data: unknown): Promise<void> {
	await mkdir(resolve(path, '..'), { recursive: true });
	await writeFile(path, JSON.stringify(data, null, 2));
}

export function now(): string {
	return new Date().toISOString();
}
