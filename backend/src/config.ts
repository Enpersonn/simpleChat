import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type AppSettings,
  AppSettingsSchema,
  DEFAULT_SETTINGS,
} from "@simplechat/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

export const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

let _settings: AppSettings | null = null;
let _writeQueue: Promise<void> = Promise.resolve();

function settingsPath(): string {
  return resolve(ROOT, "data", "settings.json");
}

export async function getSettings(): Promise<AppSettings> {
  if (_settings) return _settings;
  try {
    const raw = await readFile(settingsPath(), "utf-8");
    _settings = AppSettingsSchema.parse(JSON.parse(raw));
  } catch {
    _settings = { ...DEFAULT_SETTINGS };
    await saveSettings(_settings);
  }
  return _settings;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  _settings = settings;
  _writeQueue = _writeQueue.then(async () => {
    const path = settingsPath();
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(settings, null, 2));
  });
  await _writeQueue;
}

export async function dataDir(): Promise<string> {
  const s = await getSettings();
  return resolve(ROOT, s.dataDir);
}

export const PORT = 3001;
export const HOST = "127.0.0.1";
