import { type EntityFieldDef, EntityFieldDefSchema } from '@simplechat/types';
import { BaseStorageObject } from '../base.js';
import { now } from '../helpers.js';

export const field_defs_store = new BaseStorageObject(
	'field_defs',
	EntityFieldDefSchema,
);

type DefaultDef = {
	entityType: string;
	path: string;
	label: string;
	valueType: EntityFieldDef['valueType'];
	suggestedOps: string[];
};

const DEFAULT_DEFS: DefaultDef[] = [
	// Character fields
	{
		entityType: 'character',
		path: 'public.personality',
		label: 'Personality traits',
		valueType: 'string_array',
		suggestedOps: ['add', 'remove'],
	},
	{
		entityType: 'character',
		path: 'public.speechStyle',
		label: 'Speech style',
		valueType: 'string',
		suggestedOps: ['set', 'unset'],
	},
	{
		entityType: 'character',
		path: 'public.appearance',
		label: 'Appearance',
		valueType: 'string',
		suggestedOps: ['set', 'unset'],
	},
	{
		entityType: 'character',
		path: 'public.clothing',
		label: 'Clothing',
		valueType: 'string',
		suggestedOps: ['set', 'unset'],
	},
	{
		entityType: 'character',
		path: 'public.reputation',
		label: 'Reputation',
		valueType: 'string',
		suggestedOps: ['set', 'unset'],
	},
	{
		entityType: 'character',
		path: 'private.fears',
		label: 'Fears',
		valueType: 'string_array',
		suggestedOps: ['add', 'remove'],
	},
	{
		entityType: 'character',
		path: 'private.trueMotives',
		label: 'True motives',
		valueType: 'string',
		suggestedOps: ['set', 'unset'],
	},
	{
		entityType: 'character',
		path: 'private.hiddenEmotionalState',
		label: 'Hidden emotional state',
		valueType: 'string',
		suggestedOps: ['set', 'unset'],
	},
	{
		entityType: 'character',
		path: 'private.moralLimits',
		label: 'Moral limits',
		valueType: 'string',
		suggestedOps: ['set', 'unset'],
	},
	{
		entityType: 'character',
		path: 'private.privateKnowledge',
		label: 'Private knowledge',
		valueType: 'string_array',
		suggestedOps: ['add', 'remove'],
	},
	// Location fields
	{
		entityType: 'location',
		path: 'atmosphere',
		label: 'Atmosphere',
		valueType: 'string',
		suggestedOps: ['set', 'unset'],
	},
	{
		entityType: 'location',
		path: 'lighting',
		label: 'Lighting',
		valueType: 'string',
		suggestedOps: ['set', 'unset'],
	},
	{
		entityType: 'location',
		path: 'soundscape',
		label: 'Soundscape',
		valueType: 'string',
		suggestedOps: ['set', 'unset'],
	},
	{
		entityType: 'location',
		path: 'description',
		label: 'Description',
		valueType: 'string',
		suggestedOps: ['set', 'unset'],
	},
	{
		entityType: 'location',
		path: 'smells',
		label: 'Smells',
		valueType: 'string',
		suggestedOps: ['set', 'unset'],
	},
];

export async function seedDefaultFieldDefs(storyId: string): Promise<void> {
	const existing = await field_defs_store.list({ storyId });
	if (existing.length > 0) return;

	const t = now();
	for (const def of DEFAULT_DEFS) {
		await field_defs_store.add({
			storyId,
			entityType: def.entityType,
			path: def.path,
			label: def.label,
			valueType: def.valueType,
			suggestedOps: def.suggestedOps,
			createdAt: t,
			updatedAt: t,
		});
	}
}
