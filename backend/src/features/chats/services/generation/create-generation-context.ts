import type {
  GenerationContext,
  GenerationInput,
  GenerationStream,
} from "../../types";
import { loadGenerationData } from "./load-generation-data";

export async function createGenerationContext(
  input: GenerationInput,
  stream: GenerationStream,
): Promise<GenerationContext> {
  const data = await loadGenerationData(input.storyId, input.chatId);

  return {
    ...input,

    stream,

    story: data.story,
    chat: data.chat,
    characters: data.characters,
    locations: data.locations,
    chatState: data.chatState,

    originalTurns: data.turns,
    turns: [],

    characterChains: [],
    effectiveCharacters: [],

    activeSpeaker: "",
    accessibleMemories: [],
    relevantMemories: [],
    memoryReasons: {},

    messages: [],
    systemPromptText: "",
    resolvedModel: "",

    assistantText: "",
  };
}
