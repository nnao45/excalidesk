import { app } from "electron";
import * as fs from "fs/promises";
import * as path from "path";
import type { Settings } from "./mcp/types";

const SETTINGS_FILE = "settings.json";

export async function getSettingsPath(): Promise<string> {
  return path.join(app.getPath("userData"), SETTINGS_FILE);
}

export async function loadSettings(): Promise<Settings> {
  const settingsPath = await getSettingsPath();

  try {
    const data = await fs.readFile(settingsPath, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    // Return default settings if file doesn't exist
    return {
      mcp: {
        enabled: false,
        port: 3100,
      },
    };
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  const settingsPath = await getSettingsPath();
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
}
