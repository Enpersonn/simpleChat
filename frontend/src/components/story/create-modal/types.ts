import type { CharacterCreate, LocationCreate } from '@simplechat/types';
import type { LivePreview } from './live-preview-panel';

export interface PendingLocation extends LocationCreate {
	_localId: string;
}
export interface PendingMemory {
	_localId: string;
	characterName: string;
	summary: string;
	tags: string[];
	importance: number;
	deltas?: Record<string, unknown>;
	relationshipEffects?: RawRelation[];
}

export type RawRelation = {
	otherCharacterName: string;
	emotion: string;
	publicAttitude: string;
	privateAttitude: string;
	trustLevel: number;
};
export interface PendingChar extends CharacterCreate {
	_localId: string;
	_rawRelationships?: RawRelation[];
}
