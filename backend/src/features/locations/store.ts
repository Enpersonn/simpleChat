import { LocationSchema } from '@simplechat/types';
import { BaseStorageObject } from '../../storage/base.js';

export const locations_store = new BaseStorageObject(
	'locations',
	LocationSchema,
);
