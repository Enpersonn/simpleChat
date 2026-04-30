import { LLMAgent } from "../../LLM/generate";

export const storyLocationsParseAgent = new LLMAgent({
  role: "location extractor",
  instructions: [
    "Extract all distinct locations and settings from the story text. Use the story premise as context.",
    "Identify spatial containment: if one location is physically inside another, set parentLocationName to the containing location's name.",
    "Root locations (realms, cities, buildings) have parentLocationName: null.",
    "Sub-locations (rooms, corridors, stages) have the name of their containing location.",
    "Only create a child location if it is clearly distinct from its parent.",
    "connectedLocationNames lists locations reachable via a path, door, or portal (non-hierarchical connections).",
  ].join(" "),
  outputShape: [
    "{",
    '  "locations": [',
    "    {",
    '      "name": "string",',
    '      "description": "string",',
    '      "layout": "string",',
    '      "lighting": "string",',
    '      "atmosphere": "string",',
    '      "soundscape": "string",',
    '      "smells": "string",',
    '      "notes": "string",',
    '      "tags": ["string"],',
    '      "parentLocationName": "string or null",',
    '      "connectedLocationNames": ["string"]',
    "    }",
    "  ]",
    "}",
  ].join("\n"),
  temperature: 0.1,
  num_ctx: 8192,
});
