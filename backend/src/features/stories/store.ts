import { StorySchema } from '@simplechat/types';
import { BaseStorageObject } from '../../storage/base.js';

export const stories_store = new BaseStorageObject('stories', StorySchema);
