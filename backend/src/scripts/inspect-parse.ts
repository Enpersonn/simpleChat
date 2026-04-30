#!/usr/bin/env tsx
/**
 * Generation inspection script.
 *
 * Runs the multi-pass parse pipeline against a text file and prints a
 * human-readable quality report. Use this to compare output before/after
 * prompt or pipeline changes.
 *
 * Usage:
 *   npx tsx backend/src/scripts/inspect-parse.ts path/to/story.txt
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getSettings } from "../config.js";
import { parseStoryMultiPass } from "../LLM/parsing/pipeline.js";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";

function header(text: string) {
  console.log(`\n${BOLD}${CYAN}── ${text} ──${RESET}`);
}

function ok(text: string) {
  console.log(`  ${GREEN}✓${RESET} ${text}`);
}

function warn(text: string) {
  console.log(`  ${YELLOW}⚠${RESET} ${text}`);
}

function bad(text: string) {
  console.log(`  ${RED}✗${RESET} ${text}`);
}

function dim(text: string) {
  return `${DIM}${text}${RESET}`;
}

function pct(filled: number, total: number): string {
  if (total === 0) return "–";
  const p = Math.round((filled / total) * 100);
  const colour = p >= 70 ? GREEN : p >= 40 ? YELLOW : RED;
  return `${colour}${p}%${RESET}`;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error(
      "Usage: npx tsx backend/scripts/inspect-parse.ts <story-file>",
    );
    process.exit(1);
  }

  const absPath = resolve(process.cwd(), filePath);
  let text: string;
  try {
    text = await readFile(absPath, "utf-8");
  } catch {
    console.error(`Cannot read file: ${absPath}`);
    process.exit(1);
  }

  // Ensure settings are loaded so the Ollama client picks up the right endpoint/model.
  const settings = await getSettings();

  console.log(`\n${BOLD}SimpleChat — Generation Inspection Report${RESET}`);
  console.log(`File   : ${filePath} (${text.length.toLocaleString()} chars)`);
  console.log(`Model  : ${settings.activeModel || "(not set)"}`);
  console.log(`Endpoint: ${settings.ollamaEndpoint}`);
  console.log(`Running multi-pass pipeline…`);

  const startMs = Date.now();
  const result = await parseStoryMultiPass(text);
  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);

  console.log(`Completed in ${elapsed}s`);

  // ── Story Core ──────────────────────────────────────────────────────────────
  header(`Story Core`);
  const sc = result.storyCore;
  console.log(`  Title    : ${sc.title || dim("(empty)")}`);
  console.log(
    `  Premise  : ${sc.premise ? sc.premise.slice(0, 120) + (sc.premise.length > 120 ? "…" : "") : dim("(empty)")}`,
  );
  console.log(
    `  Genres   : ${sc.genres.length ? sc.genres.join(", ") : dim("(none)")}`,
  );
  console.log(
    `  Tone     : ${sc.tone.length ? sc.tone.join(", ") : dim("(none)")}`,
  );
  console.log(
    `  Themes   : ${sc.themes.length ? sc.themes.join(", ") : dim("(none)")}`,
  );

  const ws = sc.writingStyle;
  const wsFields: [string, string][] = [
    ["prose", ws.prose],
    ["interiority", ws.interiority],
    ["dialogue", ws.dialogue],
    ["pacing", ws.pacing],
    ["sensory", ws.sensory],
  ];
  const wsFilled = wsFields.filter(([, v]) => v.trim()).length;
  console.log(`  Writing style (${wsFilled}/5 fields):`);
  for (const [name, val] of wsFields) {
    console.log(`    ${name.padEnd(12)}: ${val.trim() || dim("(empty)")}`);
  }

  const rules = sc.rules;
  const totalRules =
    rules.worldRules.length +
    rules.storyRules.length +
    rules.characterRules.length;
  console.log(
    `  Rules    : ${totalRules} total (world: ${rules.worldRules.length}, story: ${rules.storyRules.length}, character: ${rules.characterRules.length})`,
  );

  // ── Characters ──────────────────────────────────────────────────────────────
  header(`Characters (${result.characters.length} found)`);

  const charFields = ["appearance", "speechStyle", "trueMotives"] as const;
  type CharFieldKey = (typeof charFields)[number];
  let totalCharFieldsFilled = 0;
  let totalCharFields = 0;

  for (const c of result.characters) {
    const emptyCount = charFields.filter((f) => {
      const val = c[f as CharFieldKey] as string;
      return !val || val.toLowerCase().includes("unknown");
    }).length;
    const fearCount = c.fears.length;
    const personalityCount = c.personality.length;
    const identityCount = c.identities.length;

    const filled = charFields.filter((f) => {
      const val = c[f as CharFieldKey] as string;
      return val && !val.toLowerCase().includes("unknown");
    }).length;
    totalCharFieldsFilled +=
      filled + (fearCount > 0 ? 1 : 0) + (personalityCount > 0 ? 1 : 0);
    totalCharFields += charFields.length + 2; // appearance, speechStyle, trueMotives, fears, personality

    const quality = emptyCount >= 2 ? RED : emptyCount === 1 ? YELLOW : GREEN;
    const linked = c.linkedCharacterNames.length
      ? ` ${dim(`→ ${c.linkedCharacterNames.join(", ")}`)}`
      : "";
    console.log(
      `  ${quality}●${RESET} ${BOLD}${c.name}${RESET} ${dim(`(${c.species || "?"})`)}${linked}`,
    );
    console.log(
      `     appearance: ${c.appearance ? c.appearance.slice(0, 60) : dim("(empty)")}`,
    );
    console.log(
      `     speech    : ${c.speechStyle ? c.speechStyle.slice(0, 60) : dim("(empty)")}`,
    );
    console.log(
      `     motives   : ${c.trueMotives ? c.trueMotives.slice(0, 60) : dim("(empty)")}`,
    );
    console.log(
      `     fears     : ${fearCount} | personality: ${personalityCount} | identities: ${identityCount}`,
    );
  }

  // ── Locations ───────────────────────────────────────────────────────────────
  header(`Locations (${result.locations.length} found)`);

  const locationNames = result.locations.map((l) => l.name);
  const duplicateWarnings: string[] = [];

  for (let i = 0; i < locationNames.length; i++) {
    for (let j = i + 1; j < locationNames.length; j++) {
      const a = locationNames[i].toLowerCase();
      const b = locationNames[j].toLowerCase();
      // Warn if one name contains the other, or they share 3+ consecutive words
      if (a.includes(b) || b.includes(a)) {
        duplicateWarnings.push(
          `"${locationNames[i]}" vs "${locationNames[j]}"`,
        );
      }
    }
  }

  for (const l of result.locations) {
    const isDupe = duplicateWarnings.some((w) => w.includes(`"${l.name}"`));
    const marker = isDupe ? `${YELLOW}⚠${RESET}` : `${GREEN}✓${RESET}`;
    console.log(`  ${marker} ${l.name}`);
  }

  if (duplicateWarnings.length > 0) {
    console.log();
    for (const w of duplicateWarnings) {
      warn(`Possible duplicate: ${w}`);
    }
  }

  // ── Memories ────────────────────────────────────────────────────────────────
  header(`Memories (${result.memories.length} found)`);

  let genesis = 0,
    characterDefining = 0,
    plotEvent = 0,
    incidental = 0;
  let withDeltas = 0;

  for (const m of result.memories) {
    if (m.importance >= 0.9) genesis++;
    else if (m.importance >= 0.7) characterDefining++;
    else if (m.importance >= 0.4) plotEvent++;
    else incidental++;
    if (m.deltas.effects.length > 0) withDeltas++;
  }

  console.log(`  Tiers:`);
  console.log(`    Genesis (0.9–1.0)         : ${genesis}`);
  console.log(`    Character-defining (0.7–0.89): ${characterDefining}`);
  console.log(`    Plot event (0.4–0.69)      : ${plotEvent}`);
  console.log(`    Incidental (0–0.39)        : ${incidental}`);
  console.log(`  With deltas: ${withDeltas}/${result.memories.length}`);

  if (result.memories.length > 0) {
    console.log(`\n  Sample (first 5):`);
    for (const m of result.memories.slice(0, 5)) {
      const imp = m.importance.toFixed(2);
      const deltaTag =
        m.deltas.effects.length > 0
          ? ` ${dim(`[${m.deltas.effects.length} deltas]`)}`
          : "";
      console.log(
        `    [${imp}] ${m.characterName}: ${m.summary.slice(0, 80)}${m.summary.length > 80 ? "…" : ""}${deltaTag}`,
      );
    }
  }

  // ── Quality Summary ─────────────────────────────────────────────────────────
  header(`Quality Summary`);
  console.log(
    `  Character field fill rate : ${pct(totalCharFieldsFilled, totalCharFields)}`,
  );
  console.log(`  Writing style fill rate   : ${pct(wsFilled, 5)}`);
  console.log(
    `  Locations / likely scenes : ${result.locations.length} locations (aim for 8–12)`,
  );
  console.log(`  Duplicate location warnings: ${duplicateWarnings.length}`);
  console.log(
    `  Memories with deltas      : ${pct(withDeltas, result.memories.length)}`,
  );

  if (result.locations.length > 20) {
    bad(
      `${result.locations.length} locations is likely too many — check for duplicates`,
    );
  } else if (result.locations.length > 12) {
    warn(`${result.locations.length} locations is on the high side`);
  } else {
    ok(`Location count looks reasonable`);
  }

  if (wsFilled < 3) {
    bad(
      `Writing style is mostly empty — prompt may not be producing sub-fields`,
    );
  } else if (wsFilled < 5) {
    warn(`Writing style is partially filled (${wsFilled}/5 fields)`);
  } else {
    ok(`All writing style sub-fields filled`);
  }

  if (withDeltas === 0 && result.memories.length > 0) {
    bad(`No memory deltas — applyMemoryChain has nothing to replay`);
  } else if (result.memories.length > 0) {
    ok(`${withDeltas} memories carry character deltas`);
  }

  console.log();
}

main().catch((err) => {
  console.error(`Error: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
