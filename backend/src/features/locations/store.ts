import { LocationSchema } from '@simplechat/types';
import { BaseStorageObject } from '../../storage/base';

export const locations_store = new BaseStorageObject(
	'locations',
	LocationSchema,
);
