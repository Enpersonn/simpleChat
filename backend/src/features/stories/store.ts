import { StorySchema } from "@simplechat/types";
import { BaseStorageObject } from "../../storage/base";

export const stories_store = new BaseStorageObject("stories", StorySchema);
