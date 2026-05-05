import { CharacterSchema } from '@simplechat/types';
import { BaseStorageObject } from '../../storage/base';

export const characters_store = new BaseStorageObject(
	'characters',
	CharacterSchema,
);
