import { StorySchema } from "@simplechat/types";
import { BaseStorageObject } from "../base";

export const stories_store = new BaseStorageObject("stories", StorySchema);
