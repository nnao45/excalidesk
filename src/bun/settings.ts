import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

export interface Settings {
  mcp?: {
    enabled: boolean;
    port: number;
  };
}

const SETTINGS_FILE = "settings.json";

function getUserDataDir(): string {
  const home = os.homedir();
  if (process.platform === "linux") {
    const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
    return path.join(xdgConfig, "excalidesk");
  } else if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "excalidesk");
  } else {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    return path.join(appData, "excalidesk");
  }
}

export async function getSettingsPath(): Promise<string> {
  return path.join(getUserDataDir(), SETTINGS_FILE);
}

export async function loadSettings(): Promise<Settings> {
  const settingsPath = await getSettingsPath();

  try {
    const data = await fs.readFile(settingsPath, "utf-8");
    return JSON.parse(data);
  } catch {
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
  const dir = path.dirname(settingsPath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
}
