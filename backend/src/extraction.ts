import type {
  ChatEntityState,
  LocationOverride,
  Story,
  StoryLocation,
  Turn,
} from "@simplechat/types";
import { z } from "zod";
import { streamChat } from "./ollama.js";
import { extractJson } from "./utils.js";

const LocationExtractionSchema = z.object({
  currentLocationId: z.union([z.string(), z.null()]).optional(),
  newLocationName: z.string().optional(),
  stateChanges: z.record(z.string(), z.string()).optional(),
});

export interface ExtractionContext {
  recentTurns: Turn[];
  story: Story;
  locations: StoryLocation[];
  currentState: ChatEntityState;
}

interface ExtractionResult {
  currentLocationId?: string | null;
  locationOverrides?: Record<string, LocationOverride>;
  newLocationName?: string;
}

interface EntityExtractor {
  type: string;
  extract(ctx: ExtractionContext): Promise<Partial<ExtractionResult>>;
}

// ─── Location extractor ───────────────────────────────────────────────────────

const locationExtractor: EntityExtractor = {
  type: "location",
  async extract(ctx) {
    if (ctx.locations.length === 0) return {};

    const recentText = ctx.recentTurns
      .slice(-4)
      .map((t) => `${t.role}: ${t.text}`)
      .join("\n");

    const locationList = ctx.locations
      .map((l) => `{"id":"${l.id}","name":${JSON.stringify(l.name)}}`)
      .join(", ");

    const currentId = ctx.currentState.currentLocationId;

    let raw = "";
    try {
      await streamChat({
        messages: [
          {
            role: "system",
            content: [
              "You are a scene-state tracker. Return ONLY valid JSON.",
              "Analyze the messages and detect scene changes.",
              "Return this shape:",
              "{",
              '  "currentLocationId": "<id from list, \\"unchanged\\" if same as before, or null if no location>",',
              '  "newLocationName": "<name of the new place if characters explicitly moved somewhere NOT in the location list, otherwise omit>",',
              '  "stateChanges": { "<field>": "<new value>" }',
              "  // stateChanges applies to the current location. Fields: lighting, atmosphere, soundscape, smells, description",
              "  // Only include fields that explicitly changed in the messages.",
              "  // If newLocationName is set, set currentLocationId to null.",
              "}",
            ].join("\n"),
          },
          {
            role: "user",
            content: [
              `Available locations: [${locationList}]`,
              `Current location id: ${currentId ?? "none"}`,
              `\nRecent messages:\n${recentText}`,
            ].join("\n"),
          },
        ],
        temperature: 0.1,
        onChunk: (chunk) => {
          raw += chunk;
        },
      });

      const parsed = LocationExtractionSchema.safeParse(extractJson(raw));
      if (!parsed.success) return {};
      const data = parsed.data;

      const result: Partial<ExtractionResult> = {};

      if (data.newLocationName?.trim()) {
        result.newLocationName = data.newLocationName.trim();
        result.currentLocationId = null;
      } else if (
        data.currentLocationId !== undefined &&
        data.currentLocationId !== "unchanged"
      ) {
        result.currentLocationId =
          data.currentLocationId === null ||
          data.currentLocationId === "null" ||
          data.currentLocationId === ""
            ? null
            : data.currentLocationId;
      }

      const targetId =
        result.currentLocationId !== undefined
          ? result.currentLocationId
          : currentId;

      if (targetId && data.stateChanges) {
        const changes = data.stateChanges;
        const override: LocationOverride = {};
        if (changes.lighting) override.lighting = changes.lighting;
        if (changes.atmosphere) override.atmosphere = changes.atmosphere;
        if (changes.soundscape) override.soundscape = changes.soundscape;
        if (changes.smells) override.smells = changes.smells;
        if (changes.description) override.description = changes.description;
        if (Object.keys(override).length > 0) {
          result.locationOverrides = {
            ...ctx.currentState.locationOverrides,
            [targetId]: {
              ...(ctx.currentState.locationOverrides[targetId] ?? {}),
              ...override,
            },
          };
        }
      }

      return result;
    } catch {
      return {};
    }
  },
};

// ─── Registry + runner ────────────────────────────────────────────────────────

const extractors: EntityExtractor[] = [locationExtractor];

export type ExtractionOutput = ChatEntityState & { newLocationName?: string };

export async function runExtraction(
  ctx: ExtractionContext,
): Promise<ExtractionOutput> {
  const results = await Promise.all(extractors.map((e) => e.extract(ctx)));

  const output: ExtractionOutput = { ...ctx.currentState };
  for (const result of results) {
    if (result.currentLocationId !== undefined) {
      output.currentLocationId = result.currentLocationId;
    }
    if (result.locationOverrides) {
      output.locationOverrides = result.locationOverrides;
    }
    if (result.newLocationName) {
      output.newLocationName = result.newLocationName;
    }
  }

  return output;
}
