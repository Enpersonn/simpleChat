import type {
  Character,
  Chat,
  ChatEntityState,
  MemoryItem,
  OllamaMessage,
  SendMessage,
  Story,
  StoryLocation,
  Turn,
} from "@simplechat/types";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { MemoryReason } from "../../LLM/memory-retrieval";
import type { createGenerationStream } from "./services/generation/generation-stream";

export type GenerationKind = "message" | "regenerate" | "opener";

export type GenerationInput = {
  kind: GenerationKind;
  storyId: string;
  chatId: string;
  params: Partial<SendMessage>;
  req: FastifyRequest;
  reply: FastifyReply;
};

export type GenerationStream = ReturnType<typeof createGenerationStream>;

export type GenerationContext = GenerationInput & {
  stream: GenerationStream;

  story: Story;
  chat: Chat;
  characters: Character[];
  locations: StoryLocation[];
  chatState: ChatEntityState;

  originalTurns: Turn[];
  turns: Turn[];

  activeSpeaker: string;
  characterChains: MemoryItem[][];
  effectiveCharacters: Character[];

  accessibleMemories: MemoryItem[];
  relevantMemories: MemoryItem[];
  memoryReasons: Record<string, MemoryReason>;

  messages: OllamaMessage[];
  systemPromptText: string;
  resolvedModel: string;

  assistantText: string;
};
