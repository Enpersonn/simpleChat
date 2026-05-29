import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import {
	type CanonEntryCreate,
	CanonEntrySchema,
	type CanonTimeline,
	CanonTimelineSchema,
} from '@simplechat/types';
import { readJson, storyDir, writeJson } from '../../storage/helpers.js';

async function canonTimelinePath(storyId: string): Promise<string> {
	const dir = await storyDir(storyId);
	return join(dir, 'canon-timeline.json');
}

export async function getCanonTimeline(
	storyId: string,
): Promise<CanonTimeline> {
	const path = await canonTimelinePath(storyId);
	const raw = await readJson<unknown>(path, null);
	if (raw) {
		const result = CanonTimelineSchema.safeParse(raw);
		if (result.success) return result.data;
	}
	return CanonTimelineSchema.parse({ storyId, entries: [] });
}

export async function saveCanonTimeline(
	storyId: string,
	timeline: CanonTimeline,
): Promise<void> {
	await writeJson(await canonTimelinePath(storyId), timeline);
}

export async function addCanonEntry(
	storyId: string,
	data: CanonEntryCreate,
): Promise<CanonTimeline> {
	const timeline = await getCanonTimeline(storyId);
	const entry = CanonEntrySchema.parse({ id: randomUUID(), ...data });
	timeline.entries.push(entry);
	await saveCanonTimeline(storyId, timeline);
	return timeline;
}

export async function removeCanonEntry(
	storyId: string,
	entryId: string,
): Promise<CanonTimeline> {
	const timeline = await getCanonTimeline(storyId);
	timeline.entries = timeline.entries.filter((e) => e.id !== entryId);
	await saveCanonTimeline(storyId, timeline);
	return timeline;
}

export async function reorderCanonTimeline(
	storyId: string,
	orderedEntryIds: string[],
): Promise<CanonTimeline> {
	const timeline = await getCanonTimeline(storyId);
	const byId = new Map(timeline.entries.map((e) => [e.id, e]));
	const reordered = orderedEntryIds
		.map((id) => byId.get(id))
		.filter((e): e is NonNullable<typeof e> => e !== undefined);
	const missing = timeline.entries.filter(
		(e) => !orderedEntryIds.includes(e.id),
	);
	timeline.entries = [...reordered, ...missing];
	await saveCanonTimeline(storyId, timeline);
	return timeline;
}
