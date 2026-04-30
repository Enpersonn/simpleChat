import type { Tool } from "../../register-tool";
import { type StreamOptions, streamOptionsSchema } from "./schema";
import { streamChat } from "./stream-chat";

export const streamChatTool: Tool<StreamOptions, string> = {
  name: "stream-chat",
  description: "Handle dynamic text streaming to channel",
  schema: streamOptionsSchema,
  execute: streamChat,
};
