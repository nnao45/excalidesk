import { test, expect, _electron as electron, Page } from "@playwright/test";
import path from "path";

type McpResult = {
  content?: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
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

async function listElements() {
  const res = await fetch("http://localhost:3100/api/elements");
  const data = (await res.json()) as { elements: Array<{ id: string; type: string }> };
  return data.elements ?? [];
}

async function findFirstIdByType(type: string) {
  const elements = await listElements();
  const found = elements.find((el) => el.type === type);
  return found?.id;
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

  test("basic shapes, text, query/get/update", async () => {
    await callMcp("clear_canvas", {}, 1);

    await callMcp(
      "create_element",
      { type: "rectangle", x: 40, y: 40, width: 140, height: 80, backgroundColor: "#bbdefb", strokeColor: "#0d47a1" },
      2
    );
    const rectId = await findFirstIdByType("rectangle");
    expect(rectId).toBeTruthy();

    await callMcp(
      "create_element",
      { type: "ellipse", x: 220, y: 40, width: 120, height: 80, backgroundColor: "#c8e6c9", strokeColor: "#1b5e20" },
      3
    );
    await callMcp(
      "create_element",
      { type: "diamond", x: 400, y: 40, width: 120, height: 90, backgroundColor: "#ffe0b2", strokeColor: "#e65100" },
      4
    );
    await callMcp(
      "create_element",
      { type: "text", x: 60, y: 150, text: "MCP OK", fontSize: 24, strokeColor: "#1a237e" },
      5
    );

    await sleep(800);
    const elements = await listElements();
    expect(elements.length).toBeGreaterThan(3);

    const query = await callMcp("query_elements", { type: "rectangle" }, 6);
    expect(query.content?.[0]?.text ?? "").toContain("rectangle");

    const getEl = await callMcp("get_element", { id: rectId }, 7);
    expect(getEl.content?.[0]?.text ?? "").toContain(rectId ?? "");

    const updateEl = await callMcp("update_element", { id: rectId, x: 80, y: 60 }, 8);
    expect(updateEl.content?.[0]?.text ?? "").toContain("Element updated");
  });

  test("batch, binding, grouping, alignment", async () => {
    await callMcp(
      "batch_create_elements",
      {
        elements: [
          { id: "nodeA", type: "rectangle", x: 80, y: 240, width: 120, height: 60, backgroundColor: "#e3f2fd", strokeColor: "#0d47a1" },
          { id: "nodeB", type: "diamond", x: 260, y: 240, width: 120, height: 70, backgroundColor: "#f8bbd0", strokeColor: "#880e4f" },
          { type: "arrow", x: 0, y: 0, startElementId: "nodeA", endElementId: "nodeB" },
        ],
      },
      20
    );

    const elements = await listElements();
    const ids = elements.map((el) => el.id);
    expect(ids.length).toBeGreaterThan(2);

    const targetIds = ids.slice(0, 2);
    const groupRes = await callMcp("group_elements", { elementIds: targetIds }, 21);
    expect(groupRes.content?.[0]?.text ?? "").toContain("groupId");

    const groupLookup = await fetch(`http://localhost:3100/api/elements/${targetIds[0]}`);
    const groupData = (await groupLookup.json()) as { element?: { groupIds?: string[] } };
    const groupId = groupData.element?.groupIds?.[0];
    expect(groupId).toBeTruthy();

    await callMcp("ungroup_elements", { groupId }, 22);
    await callMcp("lock_elements", { elementIds: targetIds }, 23);
    await callMcp("unlock_elements", { elementIds: [targetIds[0]] }, 24);
    await callMcp("align_elements", { elementIds: targetIds, alignment: "left" }, 25);

    const idsForDist = ids.slice(0, 3);
    await callMcp("distribute_elements", { elementIds: idsForDist, direction: "horizontal" }, 26);
  });

  test("snapshot, duplicate, delete", async () => {
    const elements = await listElements();
    expect(elements.length).toBeGreaterThan(0);
    const id = elements[0].id;

    await callMcp("snapshot_scene", { name: "snap-e2e" }, 40);
    await callMcp("duplicate_elements", { elementIds: [id], offsetX: 20, offsetY: 20 }, 41);
    await callMcp("restore_snapshot", { name: "snap-e2e" }, 42);
    await callMcp("delete_element", { id }, 43);
  });

  test("export/import/describe/resources/guide", async () => {
    const scene = {
      type: "excalidraw",
      version: 2,
      elements: [
        { type: "ellipse", x: 600, y: 100, width: 80, height: 80, backgroundColor: "#f8bbd0", strokeColor: "#880e4f" },
      ],
      appState: { viewBackgroundColor: "#ffffff", gridSize: null },
    };

    await callMcp("import_scene", { data: JSON.stringify(scene), mode: "merge" }, 60);

    const exported = await callMcp("export_scene", {}, 61);
    expect(exported.content?.[0]?.text ?? "").toContain("\"excalidraw\"");

    const described = await callMcp("describe_scene", {}, 62);
    expect(described.content?.[0]?.text ?? "").toContain("Canvas Description");

    const resScene = await callMcp("get_resource", { resource: "scene" }, 63);
    expect(resScene.content?.[0]?.text ?? "").toContain("\"theme\"");

    const resElements = await callMcp("get_resource", { resource: "elements" }, 64);
    expect(resElements.content?.[0]?.text ?? "").toContain("\"elements\"");

    const resTheme = await callMcp("get_resource", { resource: "theme" }, 65);
    expect(resTheme.content?.[0]?.text ?? "").toContain("\"theme\"");

    const guide = await callMcp("read_diagram_guide", {}, 66);
    expect(guide.content?.[0]?.text ?? "").toContain("Excalidraw Diagram Design Guide");
  });

  test("frontend-dependent tools", async () => {
    await callMcp(
      "create_from_mermaid",
      {
        mermaidDiagram: "graph TD; A[Start]-->B{OK?}; B--Yes-->C[Done]; B--No-->D[Retry]",
        config: { themeVariables: { fontSize: "16" } },
      },
      80
    );

    await callMcp("set_viewport", { scrollToContent: true }, 81);

    const exportResult = await callMcp("export_to_image", { format: "png", background: true }, 82);
    const exportText = exportResult.content?.[0]?.text ?? "";
    expect(exportText).toContain("Base64 png data");

    const screenshotResult = await callMcp("get_canvas_screenshot", { background: true }, 83);
    const screenshotContent = screenshotResult.content?.[0];
    expect(screenshotContent?.type).toBe("image");
    expect((screenshotContent?.data ?? "").length).toBeGreaterThan(100);
  });

  test("export_to_excalidraw_url", async () => {
    const res = await callMcp("export_to_excalidraw_url", {}, 100);
    const text = res.content?.[0]?.text ?? "";
    expect(text).toContain("https://excalidraw.com/#json=");
  });
});
