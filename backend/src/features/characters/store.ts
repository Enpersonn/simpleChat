import { CharacterSchema } from '@simplechat/types';
import { BaseStorageObject } from '../../storage/base.js';

export const characters_store = new BaseStorageObject(
	'characters',
	CharacterSchema,
);
