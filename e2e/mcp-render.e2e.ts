import { test, expect, _electron as electron, Page } from "@playwright/test";
import path from "path";
import fs from "fs";

type McpResult = {
  content?: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
};

type ElementSummary = {
  id: string;
  type: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  text?: string;
};

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForClients(minClients: number) {
  for (let i = 0; i < 60; i++) {
    const res = await fetch("http://localhost:3100/health");
    const data = (await res.json()) as { clients: number };
    if (data.clients >= minClients) return;
    await sleep(500);
  }
  throw new Error("Canvas client did not connect in time");
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch("http://localhost:3100/health");
      if (res.ok) return;
    } catch {
      // ignore until server comes up
    }
    await sleep(500);
  }
  throw new Error("Canvas server did not start in time");
}

async function callMcp(name: string, args: Record<string, unknown> = {}, id = 1): Promise<McpResult> {
  const payload = {
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name, arguments: args },
  };
  const res = await fetch("http://localhost:3100/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  const dataLine = text.split("\n").find((line) => line.startsWith("data: "));
  if (!dataLine) throw new Error(`Unexpected MCP response: ${text.slice(0, 200)}`);
  const payloadJson = JSON.parse(dataLine.slice(6)) as { result?: McpResult; error?: { message: string } };
  if (payloadJson.error) throw new Error(payloadJson.error.message);
  return payloadJson.result ?? {};
}

async function listElements(): Promise<ElementSummary[]> {
  const res = await fetch("http://localhost:3100/api/elements");
  const data = (await res.json()) as { elements: ElementSummary[] };
  return data.elements ?? [];
}

async function findElement(match: Partial<ElementSummary>) {
  const elements = await listElements();
  return elements.find((el) =>
    Object.entries(match).every(([key, value]) => (el as Record<string, unknown>)[key] === value)
  );
}

async function ensureElements(count: number) {
  for (let i = 0; i < 40; i++) {
    const elements = await listElements();
    if (elements.length >= count) return elements;
    await sleep(250);
  }
  throw new Error(`Expected at least ${count} elements`);
}

test.describe.serial("MCP render patterns (Electron)", () => {
  test.setTimeout(120_000);

  let app: Awaited<ReturnType<typeof electron.launch>>;
  let page: Page;

  test.beforeAll(async () => {
    app = await electron.launch({
      args: [path.join(__dirname, "..", "out", "main", "index.js")],
    });
    page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await page.getByTitle("MCPサーバー").click();
    const panel = page.locator(".mcp-panel");
    await expect(panel).toBeVisible();
    const statusText = panel.locator(".mcp-status-text");
    for (let i = 0; i < 20; i++) {
      const statusValue = await statusText.textContent();
      if ((statusValue ?? "").includes("稼働")) break;
      await panel.getByRole("button", { name: "起動" }).click();
      await sleep(500);
    }
    await page.getByLabel("閉じる").click();

    const canvasName = "e2e-canvas";
    const canvasLabel = page.locator(".tree-node-label", { hasText: canvasName });
    if ((await canvasLabel.count()) === 0) {
      await page.getByTitle("新規キャンバス").click();
      const input = page.getByPlaceholder("キャンバス名を入力");
      await input.fill(canvasName);
      await input.press("Enter");
    }
    await page.locator(".tree-node-label", { hasText: canvasName }).first().click();
    await page.waitForSelector("canvas", { timeout: 30_000 });
    await waitForServer();
    await waitForClients(1);
  });

  test.afterAll(async () => {
    await app.close();
  });

  test("clear_canvas", async () => {
    const res = await callMcp("clear_canvas", {}, 1);
    expect(res.content?.[0]?.text ?? "").toContain("Canvas cleared");
  });

  const createCases = [
    { name: "create_rectangle", args: { type: "rectangle", x: 40, y: 40, width: 140, height: 80 } },
    { name: "create_ellipse", args: { type: "ellipse", x: 220, y: 40, width: 120, height: 80 } },
    { name: "create_diamond", args: { type: "diamond", x: 400, y: 40, width: 120, height: 90 } },
    { name: "create_text", args: { type: "text", x: 60, y: 150, text: "Hello", fontSize: 24 } },
    { name: "create_line", args: { type: "line", x: 100, y: 220, points: [[0, 0], [120, 0]] } },
    { name: "create_arrow", args: { type: "arrow", x: 100, y: 260, points: [[0, 0], [140, 0]] } },
    { name: "create_freedraw", args: { type: "freedraw", x: 100, y: 300, points: [[0, 0], [10, 10], [20, 5]] } },
  ];

  createCases.forEach((item, idx) => {
    test(`create: ${item.name}`, async () => {
      await callMcp("create_element", item.args, 10 + idx);
      const element = await findElement({ type: item.args.type as string, x: item.args.x as number });
      expect(element?.id).toBeTruthy();
    });
  });

  test("query_elements by type", async () => {
    const res = await callMcp("query_elements", { type: "rectangle" }, 30);
    expect(res.content?.[0]?.text ?? "").toContain("rectangle");
  });

  test("query_elements with filter", async () => {
    const res = await callMcp("query_elements", { filter: { x: 40 } }, 30_1);
    expect(res.content?.[0]?.text ?? "").toContain("\"x\": 40");
  });

  test("get_element", async () => {
    const rect = await findElement({ type: "rectangle" });
    expect(rect?.id).toBeTruthy();
    const res = await callMcp("get_element", { id: rect?.id }, 31);
    expect(res.content?.[0]?.text ?? "").toContain(rect?.id ?? "");
  });

  const updateCases = [
    { name: "update_position", args: { x: 80, y: 60 } },
    { name: "update_size", args: { width: 160, height: 90 } },
    { name: "update_stroke", args: { strokeColor: "#ff0000", strokeWidth: 3 } },
    { name: "update_fill", args: { backgroundColor: "#ffee58", fillStyle: "solid" } },
    { name: "update_roughness", args: { roughness: 2 } },
    { name: "update_opacity", args: { opacity: 50 } },
  ];

  updateCases.forEach((item, idx) => {
    test(`update_element: ${item.name}`, async () => {
      const rect = await findElement({ type: "rectangle" });
      expect(rect?.id).toBeTruthy();
      const res = await callMcp("update_element", { id: rect?.id, ...item.args }, 40 + idx);
      expect(res.content?.[0]?.text ?? "").toContain("Element updated");
    });
  });

  test("update_element text content", async () => {
    const textEl = await findElement({ type: "text" });
    expect(textEl?.id).toBeTruthy();
    const res = await callMcp("update_element", { id: textEl?.id, text: "Updated" }, 46);
    expect(res.content?.[0]?.text ?? "").toContain("Element updated");
  });

  test("update_element text font", async () => {
    const textEl = await findElement({ type: "text" });
    expect(textEl?.id).toBeTruthy();
    const res = await callMcp("update_element", { id: textEl?.id, fontSize: 30, fontFamily: "2" }, 47);
    expect(res.content?.[0]?.text ?? "").toContain("Element updated");
  });

  test("batch_create_elements with binding", async () => {
    await callMcp(
      "batch_create_elements",
      {
        elements: [
          { id: "nodeA", type: "rectangle", x: 80, y: 360, width: 120, height: 60 },
          { id: "nodeB", type: "diamond", x: 260, y: 360, width: 120, height: 70 },
          { type: "arrow", x: 0, y: 0, startElementId: "nodeA", endElementId: "nodeB" },
        ],
      },
      70
    );
    const elements = await ensureElements(3);
    expect(elements.length).toBeGreaterThan(2);
  });

  test("group_elements", async () => {
    const elements = await ensureElements(2);
    const ids = elements.slice(0, 2).map((el) => el.id);
    const res = await callMcp("group_elements", { elementIds: ids }, 71);
    expect(res.content?.[0]?.text ?? "").toContain("groupId");
  });

  test("ungroup_elements", async () => {
    const elements = await ensureElements(1);
    const lookup = await fetch(`http://localhost:3100/api/elements/${elements[0].id}`);
    const data = (await lookup.json()) as { element?: { groupIds?: string[] } };
    const groupId = data.element?.groupIds?.[0];
    if (groupId) {
      const res = await callMcp("ungroup_elements", { groupId }, 72);
      expect(res.content?.[0]?.text ?? "").toContain("ungrouped");
    } else {
      test.skip(true, "no groupId");
    }
  });

  test("lock_elements", async () => {
    const elements = await ensureElements(2);
    const ids = elements.slice(0, 2).map((el) => el.id);
    const res = await callMcp("lock_elements", { elementIds: ids }, 73);
    expect(res.content?.[0]?.text ?? "").toContain("locked");
  });

  test("unlock_elements", async () => {
    const elements = await ensureElements(1);
    const res = await callMcp("unlock_elements", { elementIds: [elements[0].id] }, 74);
    expect(res.content?.[0]?.text ?? "").toContain("unlocked");
  });

  test("align_elements left", async () => {
    const elements = await ensureElements(2);
    const ids = elements.slice(0, 2).map((el) => el.id);
    const res = await callMcp("align_elements", { elementIds: ids, alignment: "left" }, 75);
    expect(res.content?.[0]?.text ?? "").toContain("aligned");
  });

  test("align_elements middle", async () => {
    const elements = await ensureElements(2);
    const ids = elements.slice(0, 2).map((el) => el.id);
    const res = await callMcp("align_elements", { elementIds: ids, alignment: "middle" }, 76);
    expect(res.content?.[0]?.text ?? "").toContain("aligned");
  });

  test("distribute_elements horizontal", async () => {
    const elements = await ensureElements(3);
    const ids = elements.slice(0, 3).map((el) => el.id);
    const res = await callMcp("distribute_elements", { elementIds: ids, direction: "horizontal" }, 77);
    expect(res.content?.[0]?.text ?? "").toContain("distributed");
  });

  test("distribute_elements vertical", async () => {
    const elements = await ensureElements(3);
    const ids = elements.slice(0, 3).map((el) => el.id);
    const res = await callMcp("distribute_elements", { elementIds: ids, direction: "vertical" }, 78);
    expect(res.content?.[0]?.text ?? "").toContain("distributed");
  });

  test("duplicate_elements", async () => {
    const elements = await ensureElements(1);
    const res = await callMcp("duplicate_elements", { elementIds: [elements[0].id], offsetX: 20, offsetY: 20 }, 79);
    expect(res.content?.[0]?.text ?? "").toContain("Duplicated");
  });

  test("snapshot_scene", async () => {
    const res = await callMcp("snapshot_scene", { name: "snap-e2e" }, 80);
    expect(res.content?.[0]?.text ?? "").toContain("Snapshot");
  });

  test("restore_snapshot", async () => {
    const res = await callMcp("restore_snapshot", { name: "snap-e2e" }, 81);
    expect(res.content?.[0]?.text ?? "").toContain("restored");
  });

  test("describe_scene", async () => {
    const res = await callMcp("describe_scene", {}, 82);
    expect(res.content?.[0]?.text ?? "").toContain("Canvas Description");
  });

  test("export_scene", async () => {
    const res = await callMcp("export_scene", {}, 83);
    expect(res.content?.[0]?.text ?? "").toContain("\"excalidraw\"");
  });

  test("export_scene to file", async () => {
    const outPath = path.join(process.cwd(), "out", "e2e-export.excalidraw");
    const res = await callMcp("export_scene", { filePath: outPath }, 83_1);
    expect(res.content?.[0]?.text ?? "").toContain("Scene exported");
    expect(fs.existsSync(outPath)).toBe(true);
  });

  test("import_scene merge", async () => {
    const scene = {
      type: "excalidraw",
      version: 2,
      elements: [
        { type: "ellipse", x: 600, y: 100, width: 80, height: 80, backgroundColor: "#f8bbd0", strokeColor: "#880e4f" },
      ],
      appState: { viewBackgroundColor: "#ffffff", gridSize: null },
    };
    const res = await callMcp("import_scene", { data: JSON.stringify(scene), mode: "merge" }, 84);
    expect(res.content?.[0]?.text ?? "").toContain("Imported");
  });

  test("import_scene replace", async () => {
    const scene = {
      type: "excalidraw",
      version: 2,
      elements: [
        { type: "rectangle", x: 650, y: 160, width: 80, height: 60, backgroundColor: "#c5cae9", strokeColor: "#1a237e" },
      ],
      appState: { viewBackgroundColor: "#ffffff", gridSize: null },
    };
    const res = await callMcp("import_scene", { data: JSON.stringify(scene), mode: "replace" }, 84_1);
    expect(res.content?.[0]?.text ?? "").toContain("Imported");
  });

  test("get_resource scene", async () => {
    const res = await callMcp("get_resource", { resource: "scene" }, 85);
    expect(res.content?.[0]?.text ?? "").toContain("\"theme\"");
  });

  test("get_resource library", async () => {
    const res = await callMcp("get_resource", { resource: "library" }, 85_1);
    expect(res.content?.[0]?.text ?? "").toContain("\"elements\"");
  });

  test("get_resource elements", async () => {
    const res = await callMcp("get_resource", { resource: "elements" }, 86);
    expect(res.content?.[0]?.text ?? "").toContain("\"elements\"");
  });

  test("get_resource theme", async () => {
    const res = await callMcp("get_resource", { resource: "theme" }, 87);
    expect(res.content?.[0]?.text ?? "").toContain("\"theme\"");
  });

  test("read_diagram_guide", async () => {
    const res = await callMcp("read_diagram_guide", {}, 88);
    expect(res.content?.[0]?.text ?? "").toContain("Excalidraw Diagram Design Guide");
  });

  test("delete_element", async () => {
    const elements = await ensureElements(1);
    const res = await callMcp("delete_element", { id: elements[0].id }, 89);
    expect(res.content?.[0]?.text ?? "").toContain("deleted");
  });

  test("create_from_mermaid", async () => {
    const res = await callMcp(
      "create_from_mermaid",
      {
        mermaidDiagram: "graph TD; A[Start]-->B{OK?}; B--Yes-->C[Done]; B--No-->D[Retry]",
        config: { themeVariables: { fontSize: "16" } },
      },
      90
    );
    expect(res.content?.[0]?.text ?? "").toContain("Mermaid diagram converted successfully");
  });

  test("set_viewport scrollToContent", async () => {
    const res = await callMcp("set_viewport", { scrollToContent: true }, 91);
    expect(res.content?.[0]?.text ?? "").toContain("Viewport updated");
  });

  test("set_viewport zoom/offset", async () => {
    const res = await callMcp("set_viewport", { zoom: 1.2, offsetX: -50, offsetY: -30 }, 91_1);
    expect(res.content?.[0]?.text ?? "").toContain("Viewport updated");
  });

  test("set_viewport scrollToElementId", async () => {
    let rect = await findElement({ type: "rectangle" });
    if (!rect?.id) {
      await callMcp("create_element", { type: "rectangle", x: 120, y: 420, width: 120, height: 70 }, 91_20);
      rect = await findElement({ type: "rectangle", x: 120, y: 420 });
    }
    expect(rect?.id).toBeTruthy();
    const res = await callMcp("set_viewport", { scrollToElementId: rect?.id }, 91_2);
    expect(res.content?.[0]?.text ?? "").toContain("Viewport updated");
  });

  test("export_to_image png", async () => {
    const res = await callMcp("export_to_image", { format: "png", background: true }, 92);
    expect(res.content?.[0]?.text ?? "").toContain("Base64 png data");
  });

  test("export_to_image svg", async () => {
    const res = await callMcp("export_to_image", { format: "svg", background: true }, 92_1);
    const text = res.content?.[0]?.text ?? "";
    expect(text.includes("<svg") || text.includes("Base64")).toBe(true);
  });

  test("export_to_image png filePath", async () => {
    const outPath = path.join(process.cwd(), "out", "e2e-export.png");
    const res = await callMcp("export_to_image", { format: "png", background: true, filePath: outPath }, 92_2);
    expect(res.content?.[0]?.text ?? "").toContain("Image exported");
    expect(fs.existsSync(outPath)).toBe(true);
  });

  test("get_canvas_screenshot", async () => {
    const res = await callMcp("get_canvas_screenshot", { background: true }, 93);
    const image = res.content?.[0];
    expect(image?.type).toBe("image");
    expect((image?.data ?? "").length).toBeGreaterThan(100);
  });

  test("export_to_excalidraw_url", async () => {
    const res = await callMcp("export_to_excalidraw_url", {}, 94);
    const text = res.content?.[0]?.text ?? "";
    expect(text).toContain("https://excalidraw.com/#json=");
  });
});
