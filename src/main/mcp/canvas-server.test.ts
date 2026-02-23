import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { WebSocket } from "ws";
import { CanvasServer } from "./canvas-server";

// ── テスト用ポート ────────────────────────────────────────────────────────
const TEST_PORT = 3199;
const BASE_URL = `http://localhost:${TEST_PORT}`;

// ── WS ユーティリティ ─────────────────────────────────────────────────────
/**
 * WS に接続し、接続後に届く全メッセージをバッファリングしながら返す。
 * 初期メッセージのタイミング問題を回避するためにバッファを使う。
 */
function wsConnect(): Promise<{ ws: WebSocket; buffer: Record<string, unknown>[] }> {
  return new Promise((resolve, reject) => {
    const buffer: Record<string, unknown>[] = [];
    const ws = new WebSocket(`ws://localhost:${TEST_PORT}`);

    ws.on("message", (data) => {
      try {
        buffer.push(JSON.parse(data.toString()));
      } catch {
        // ignore parse errors
      }
    });

    ws.once("open", () => resolve({ ws, buffer }));
    ws.once("error", reject);
    setTimeout(() => reject(new Error("WS connect timeout")), 5000);
  });
}

/**
 * バッファまたは新着メッセージから指定 type を待つ。
 */
function waitForType(
  ws: WebSocket,
  buffer: Record<string, unknown>[],
  type: string,
  timeoutMs = 5000
): Promise<Record<string, unknown>> {
  // まずバッファに既にある場合
  const found = buffer.find((m) => m.type === type);
  if (found) {
    return Promise.resolve(found);
  }
  // なければ新着を待つ
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout waiting for WS message type: ${type}`)),
      timeoutMs
    );
    const handler = (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString()) as Record<string, unknown>;
        buffer.push(msg);
        if (msg.type === type) {
          clearTimeout(timer);
          ws.off("message", handler);
          resolve(msg);
        }
      } catch {
        // ignore
      }
    };
    ws.on("message", handler);
  });
}

// ── テストスイート ────────────────────────────────────────────────────────
describe("CanvasServer", () => {
  let server: CanvasServer;
  // テスト中に開いた WS を追跡してリークを防ぐ
  const openSockets: WebSocket[] = [];

  function trackWs(ws: WebSocket): void {
    openSockets.push(ws);
  }

  async function closeAllWs(): Promise<void> {
    for (const ws of openSockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    }
    openSockets.length = 0;
    // WS close が完全に処理されるのを少し待つ
    await new Promise((r) => setTimeout(r, 150));
  }

  beforeAll(async () => {
    server = new CanvasServer(TEST_PORT);
    await server.start();
  });

  afterAll(async () => {
    await closeAllWs();
    await server.stop();
  });

  beforeEach(async () => {
    // WS クライアントをすべて閉じてクリーンな状態に
    await closeAllWs();
    // キャンバスをクリア
    await request(BASE_URL).delete("/api/elements/clear");
  });

  afterEach(async () => {
    await closeAllWs();
  });

  // ────────────────────────────────────────────────────────────────────────
  // Health check
  // ────────────────────────────────────────────────────────────────────────
  describe("GET /health", () => {
    it("status ok を返す", async () => {
      const res = await request(BASE_URL).get("/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(typeof res.body.clients).toBe("number");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Legacy Canvas API
  // ────────────────────────────────────────────────────────────────────────
  describe("GET /canvas", () => {
    it("キャンバス全体状態を返す", async () => {
      const res = await request(BASE_URL).get("/canvas");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("elements");
      expect(Array.isArray(res.body.elements)).toBe(true);
    });
  });

  describe("POST /canvas", () => {
    it("キャンバス全体を更新する", async () => {
      const res = await request(BASE_URL)
        .post("/canvas")
        .send({ elements: [], appState: { viewBackgroundColor: "#000000", gridSize: null } });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe("POST /clear", () => {
    it("キャンバスをクリアする", async () => {
      await request(BASE_URL)
        .post("/elements")
        .send({ type: "rectangle", x: 0, y: 0, width: 100, height: 50 });
      const res = await request(BASE_URL).post("/clear");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const elements = await request(BASE_URL).get("/elements");
      expect(elements.body.elements).toHaveLength(0);
    });
  });

  describe("GET /snapshot", () => {
    it("スナップショットを返す", async () => {
      const res = await request(BASE_URL).get("/snapshot");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("timestamp");
      expect(res.body).toHaveProperty("canvas");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Legacy Elements CRUD
  // ────────────────────────────────────────────────────────────────────────
  describe("Legacy /elements CRUD", () => {
    it("POST → GET → PUT → DELETE の一連の操作", async () => {
      const create = await request(BASE_URL)
        .post("/elements")
        .send({ type: "rectangle", x: 10, y: 20, width: 100, height: 50 });
      expect(create.status).toBe(200);
      const elementId: string = create.body.element.id;

      const read = await request(BASE_URL).get(`/elements/${elementId}`);
      expect(read.status).toBe(200);
      expect(read.body.element.id).toBe(elementId);

      const update = await request(BASE_URL)
        .put(`/elements/${elementId}`)
        .send({ x: 99 });
      expect(update.status).toBe(200);
      expect(update.body.element.x).toBe(99);

      const del = await request(BASE_URL).delete(`/elements/${elementId}`);
      expect(del.status).toBe(200);

      const missing = await request(BASE_URL).get(`/elements/${elementId}`);
      expect(missing.status).toBe(404);
    });

    it("存在しない要素の GET は 404", async () => {
      const res = await request(BASE_URL).get("/elements/nonexistent");
      expect(res.status).toBe(404);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // API Elements CRUD
  // ────────────────────────────────────────────────────────────────────────
  describe("POST /api/elements", () => {
    it("矩形要素を作成できる", async () => {
      const res = await request(BASE_URL)
        .post("/api/elements")
        .send({ type: "rectangle", x: 100, y: 200, width: 150, height: 80, strokeColor: "#ff0000" });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.element.type).toBe("rectangle");
      expect(res.body.element.strokeColor).toBe("#ff0000");
    });

    it("不正な type は 400", async () => {
      const res = await request(BASE_URL)
        .post("/api/elements")
        .send({ type: "invalid_type", x: 0, y: 0 });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it("必須フィールド欠如は 400", async () => {
      const res = await request(BASE_URL)
        .post("/api/elements")
        .send({ type: "rectangle" }); // x, y がない
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/elements", () => {
    it("全要素リストを返す", async () => {
      await request(BASE_URL)
        .post("/api/elements")
        .send({ type: "ellipse", x: 0, y: 0 });
      const res = await request(BASE_URL).get("/api/elements");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.elements.length).toBeGreaterThan(0);
    });
  });

  describe("PUT /api/elements/:id", () => {
    it("要素を更新できる", async () => {
      const create = await request(BASE_URL)
        .post("/api/elements")
        .send({ type: "rectangle", x: 0, y: 0, width: 100, height: 50 });
      const id: string = create.body.element.id;

      const update = await request(BASE_URL)
        .put(`/api/elements/${id}`)
        .send({ x: 200, backgroundColor: "#aabbcc" });
      expect(update.status).toBe(200);
      expect(update.body.element.x).toBe(200);
      expect(update.body.element.backgroundColor).toBe("#aabbcc");
    });

    it("存在しない要素の更新は 404", async () => {
      const res = await request(BASE_URL)
        .put("/api/elements/ghost_id")
        .send({ x: 0 });
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/elements/:id", () => {
    it("要素を削除できる", async () => {
      const create = await request(BASE_URL)
        .post("/api/elements")
        .send({ type: "diamond", x: 0, y: 0 });
      const id: string = create.body.element.id;

      const del = await request(BASE_URL).delete(`/api/elements/${id}`);
      expect(del.status).toBe(200);
      expect(del.body.success).toBe(true);
    });

    it("存在しない要素の削除は 404", async () => {
      const res = await request(BASE_URL).delete("/api/elements/ghost_id");
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/elements/clear", () => {
    it("全要素を削除する", async () => {
      await request(BASE_URL)
        .post("/api/elements")
        .send({ type: "rectangle", x: 0, y: 0 });
      const del = await request(BASE_URL).delete("/api/elements/clear");
      expect(del.status).toBe(200);
      const list = await request(BASE_URL).get("/api/elements");
      expect(list.body.elements).toHaveLength(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Batch Create
  // ────────────────────────────────────────────────────────────────────────
  describe("POST /api/elements/batch", () => {
    it("複数要素を一括作成できる", async () => {
      const res = await request(BASE_URL)
        .post("/api/elements/batch")
        .send({
          elements: [
            { type: "rectangle", x: 0, y: 0, width: 100, height: 50 },
            { type: "ellipse", x: 200, y: 0, width: 80, height: 80 },
            { type: "text", x: 0, y: 100 },
          ],
        });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.elements).toHaveLength(3);
      expect(res.body.count).toBe(3);
    });

    it("配列でない elements は 400", async () => {
      const res = await request(BASE_URL)
        .post("/api/elements/batch")
        .send({ elements: "not an array" });
      expect(res.status).toBe(400);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Search (Task #3: 複合フィルタ)
  // ────────────────────────────────────────────────────────────────────────
  describe("GET /api/elements/search (複合フィルタ)", () => {
    beforeEach(async () => {
      await request(BASE_URL)
        .post("/api/elements/batch")
        .send({
          elements: [
            { type: "rectangle", x: 0,   y: 0,   width: 200, height: 100, strokeColor: "#ff0000", backgroundColor: "#ffc9c9" },
            { type: "ellipse",   x: 300, y: 0,   width: 80,  height: 80,  strokeColor: "#1971c2", backgroundColor: "#a5d8ff" },
            { type: "diamond",   x: 0,   y: 200, width: 60,  height: 60,  strokeColor: "#ff0000" },
            { type: "text",      x: 200, y: 200, text: "Hello World" },
            { type: "rectangle", x: 400, y: 400, width: 500, height: 300 },
          ],
        });
    });

    it("単一 type フィルタ", async () => {
      const res = await request(BASE_URL).get("/api/elements/search?type=ellipse");
      expect(res.status).toBe(200);
      expect(res.body.elements.every((e: any) => e.type === "ellipse")).toBe(true);
      expect(res.body.count).toBe(1);
    });

    it("複数 types フィルタ (カンマ区切り)", async () => {
      const res = await request(BASE_URL).get("/api/elements/search?types=rectangle,diamond");
      expect(res.status).toBe(200);
      const types = res.body.elements.map((e: any) => e.type);
      expect(types.every((t: string) => ["rectangle", "diamond"].includes(t))).toBe(true);
      expect(res.body.count).toBe(3);
    });

    it("strokeColor フィルタ", async () => {
      const res = await request(BASE_URL).get("/api/elements/search?strokeColor=%23ff0000");
      expect(res.status).toBe(200);
      expect(res.body.elements.every((e: any) => e.strokeColor === "#ff0000")).toBe(true);
      expect(res.body.count).toBe(2);
    });

    it("backgroundColor フィルタ", async () => {
      const res = await request(BASE_URL).get("/api/elements/search?backgroundColor=%23a5d8ff");
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
      expect(res.body.elements[0].type).toBe("ellipse");
    });

    it("minWidth / maxWidth 範囲フィルタ", async () => {
      const res = await request(BASE_URL).get("/api/elements/search?minWidth=100&maxWidth=300");
      expect(res.status).toBe(200);
      expect(
        res.body.elements.every((e: any) => (e.width ?? 0) >= 100 && (e.width ?? 0) <= 300)
      ).toBe(true);
    });

    it("minHeight / maxHeight 範囲フィルタ", async () => {
      const res = await request(BASE_URL).get("/api/elements/search?minHeight=90&maxHeight=150");
      expect(res.status).toBe(200);
      expect(
        res.body.elements.every((e: any) => (e.height ?? 0) >= 90 && (e.height ?? 0) <= 150)
      ).toBe(true);
    });

    it("textContains 部分一致フィルタ", async () => {
      const res = await request(BASE_URL).get("/api/elements/search?textContains=hello");
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
      expect(res.body.elements[0].type).toBe("text");
    });

    it("textContains 大文字小文字を区別しない", async () => {
      const res = await request(BASE_URL).get("/api/elements/search?textContains=WORLD");
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
    });

    it("複合フィルタ: type + strokeColor + minWidth", async () => {
      const res = await request(BASE_URL).get(
        "/api/elements/search?type=rectangle&strokeColor=%23ff0000&minWidth=100"
      );
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
      expect(res.body.elements[0].strokeColor).toBe("#ff0000");
      expect(res.body.elements[0].type).toBe("rectangle");
    });

    it("マッチなし → 空配列", async () => {
      const res = await request(BASE_URL).get("/api/elements/search?type=arrow");
      expect(res.status).toBe(200);
      expect(res.body.elements).toHaveLength(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // From-Mermaid: Task #1 フロント未接続チェック
  // ────────────────────────────────────────────────────────────────────────
  describe("POST /api/elements/from-mermaid (Task #1: フロント未接続)", () => {
    it("WS クライアントが 0 の場合は 503 を返す", async () => {
      // WS 接続なしの状態で実行
      expect(server.getClientCount()).toBe(0);
      const res = await request(BASE_URL)
        .post("/api/elements/from-mermaid")
        .send({ mermaidDiagram: "graph TD; A-->B;" });
      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain("フロントエンドが接続されていません");
    });

    it("mermaidDiagram がない場合は 400", async () => {
      const res = await request(BASE_URL)
        .post("/api/elements/from-mermaid")
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // From-Mermaid: Task #2 ポーリング
  // ────────────────────────────────────────────────────────────────────────
  describe("Mermaid 変換ポーリング (Task #2)", () => {
    it("WS クライアント接続 → mermaid_convert 受信 → result POST で解決", async () => {
      // 1. WS クライアントを接続 (フロントエンドのシミュレーション)
      const { ws, buffer } = await wsConnect();
      trackWs(ws);
      await new Promise((r) => setTimeout(r, 200));

      const fakeElements = [
        { id: "test-el-1", type: "rectangle", x: 0, y: 0, width: 100, height: 50 },
      ];

      // 2. mermaid_convert を受信したら自動的に result を POST するハンドラーを先に登録
      //    (supertest は await しないとリクエストが飛ばないため、並行処理が必要)
      const autoRespondPromise = waitForType(ws, buffer, "mermaid_convert", 5000).then(
        async (convertMsg) => {
          const requestId = convertMsg.requestId as string;
          await request(BASE_URL)
            .post("/api/elements/from-mermaid/result")
            .send({ requestId, elements: fakeElements });
          return convertMsg;
        }
      );

      // 3. from-mermaid を送信 (result が届くまでサーバーがブロック)
      const fromMermaidRes = await request(BASE_URL)
        .post("/api/elements/from-mermaid")
        .send({ mermaidDiagram: "graph TD; A-->B;" })
        .timeout(8000);

      // 4. ハンドラーの完了を待って convertMsg を検証
      const convertMsg = await autoRespondPromise;
      expect(convertMsg.requestId).toBeTruthy();
      expect(convertMsg.mermaidDiagram).toBe("graph TD; A-->B;");

      // 5. 元のリクエストが要素付きで解決
      expect(fromMermaidRes.status).toBe(200);
      expect(fromMermaidRes.body.success).toBe(true);
      expect(fromMermaidRes.body.elements).toHaveLength(1);
      expect(fromMermaidRes.body.count).toBe(1);
    }, 12000);

    it("result POST でエラーを送ると 500 で返る", async () => {
      const { ws, buffer } = await wsConnect();
      trackWs(ws);
      await new Promise((r) => setTimeout(r, 200));

      // エラーで自動応答するハンドラーを先に登録
      const autoRespondPromise = waitForType(ws, buffer, "mermaid_convert", 5000).then(
        async (convertMsg) => {
          const requestId = convertMsg.requestId as string;
          await request(BASE_URL)
            .post("/api/elements/from-mermaid/result")
            .send({ requestId, error: "変換失敗: unsupported syntax" });
          return convertMsg;
        }
      );

      const res = await request(BASE_URL)
        .post("/api/elements/from-mermaid")
        .send({ mermaidDiagram: "graph TD; X-->Y;" })
        .timeout(8000);

      await autoRespondPromise;

      expect(res.status).toBe(500);
      expect(res.body.error).toContain("変換失敗");
    }, 12000);

    it("存在しない requestId への result は 200 (タイムアウト済み扱い)", async () => {
      const res = await request(BASE_URL)
        .post("/api/elements/from-mermaid/result")
        .send({ requestId: "nonexistent-id", elements: [] });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("result に requestId がない場合は 400", async () => {
      const res = await request(BASE_URL)
        .post("/api/elements/from-mermaid/result")
        .send({ elements: [] });
      expect(res.status).toBe(400);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Export Image
  // ────────────────────────────────────────────────────────────────────────
  describe("POST /api/export/image", () => {
    it("フロントエンド未接続時は 503", async () => {
      expect(server.getClientCount()).toBe(0);
      const res = await request(BASE_URL)
        .post("/api/export/image")
        .send({ format: "png" });
      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
    });

    it("不正な format は 400", async () => {
      const res = await request(BASE_URL)
        .post("/api/export/image")
        .send({ format: "gif" });
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/export/image/result", () => {
    it("requestId なし は 400", async () => {
      const res = await request(BASE_URL)
        .post("/api/export/image/result")
        .send({ format: "png", data: "base64data" });
      expect(res.status).toBe(400);
    });

    it("存在しない requestId は 200 (タイムアウト済み扱い)", async () => {
      const res = await request(BASE_URL)
        .post("/api/export/image/result")
        .send({ requestId: "ghost", format: "png", data: "base64" });
      expect(res.status).toBe(200);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Viewport
  // ────────────────────────────────────────────────────────────────────────
  describe("POST /api/viewport", () => {
    it("フロントエンド未接続時は 503", async () => {
      expect(server.getClientCount()).toBe(0);
      const res = await request(BASE_URL)
        .post("/api/viewport")
        .send({ scrollToContent: true });
      expect(res.status).toBe(503);
    });
  });

  describe("POST /api/viewport/result", () => {
    it("requestId なし は 400", async () => {
      const res = await request(BASE_URL)
        .post("/api/viewport/result")
        .send({ success: true });
      expect(res.status).toBe(400);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Snapshots
  // ────────────────────────────────────────────────────────────────────────
  describe("Snapshots API", () => {
    it("スナップショットの作成・一覧・取得", async () => {
      await request(BASE_URL)
        .post("/api/elements")
        .send({ type: "rectangle", x: 0, y: 0, width: 100, height: 50 });

      const snap = await request(BASE_URL)
        .post("/api/snapshots")
        .send({ name: "test-snap" });
      expect(snap.status).toBe(200);
      expect(snap.body.name).toBe("test-snap");
      expect(snap.body.elementCount).toBe(1);

      const list = await request(BASE_URL).get("/api/snapshots");
      expect(list.status).toBe(200);
      expect(list.body.snapshots.some((s: any) => s.name === "test-snap")).toBe(true);

      const get = await request(BASE_URL).get("/api/snapshots/test-snap");
      expect(get.status).toBe(200);
      expect(get.body.snapshot.name).toBe("test-snap");
      expect(get.body.snapshot.elements).toHaveLength(1);
    });

    it("name なしのスナップショット作成は 400", async () => {
      const res = await request(BASE_URL)
        .post("/api/snapshots")
        .send({});
      expect(res.status).toBe(400);
    });

    it("存在しないスナップショットの取得は 404", async () => {
      const res = await request(BASE_URL).get("/api/snapshots/ghost-snap");
      expect(res.status).toBe(404);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Sync
  // ────────────────────────────────────────────────────────────────────────
  describe("POST /api/elements/sync", () => {
    it("フロントエンドから要素を同期できる", async () => {
      const elements = [
        { id: "sync-1", type: "rectangle", x: 0, y: 0, width: 100, height: 50 },
        { id: "sync-2", type: "ellipse",   x: 200, y: 0, width: 80,  height: 80 },
      ];
      const res = await request(BASE_URL)
        .post("/api/elements/sync")
        .send({ elements, timestamp: Date.now() });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.afterCount).toBe(2);
    });

    it("配列でない elements は 400", async () => {
      const res = await request(BASE_URL)
        .post("/api/elements/sync")
        .send({ elements: "bad" });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/sync/status", () => {
    it("同期ステータスを返す", async () => {
      const res = await request(BASE_URL).get("/api/sync/status");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.elementCount).toBe("number");
      expect(typeof res.body.timestamp).toBe("string");
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // WebSocket
  // ────────────────────────────────────────────────────────────────────────
  describe("WebSocket", () => {
    it("接続時に initial_elements / sync_status / canvas_sync を受け取る", async () => {
      const { ws, buffer } = await wsConnect();
      trackWs(ws);
      // 初期メッセージが全部届くまで待つ
      await new Promise((r) => setTimeout(r, 500));

      const types = buffer.map((m) => m.type as string);
      expect(types).toContain("initial_elements");
      expect(types).toContain("sync_status");
      expect(types).toContain("canvas_sync");
    });

    it("要素追加時に canvas_sync ブロードキャストが届く", async () => {
      const { ws, buffer } = await wsConnect();
      trackWs(ws);
      await new Promise((r) => setTimeout(r, 150));

      // canvas_sync をバッファからクリア (初期分)
      buffer.length = 0;

      // 要素を追加してブロードキャストが来るか確認
      await request(BASE_URL)
        .post("/api/elements")
        .send({ type: "text", x: 0, y: 0 });

      const msg = await waitForType(ws, buffer, "canvas_sync", 3000);
      expect(msg.type).toBe("canvas_sync");
      expect(msg.data).toBeTruthy();
    });

    it("接続クライアント数が health に反映される", async () => {
      // 接続前は 0
      expect(server.getClientCount()).toBe(0);

      const { ws } = await wsConnect();
      trackWs(ws);
      await new Promise((r) => setTimeout(r, 100));

      const health = await request(BASE_URL).get("/health");
      expect(health.body.clients).toBeGreaterThanOrEqual(1);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Arrow Binding
  // ────────────────────────────────────────────────────────────────────────
  describe("Arrow Binding (resolveArrowBindings)", () => {
    it("batch create で start/end が startBinding/endBinding に解決される", async () => {
      const res = await request(BASE_URL)
        .post("/api/elements/batch")
        .send({
          elements: [
            { id: "box-a", type: "rectangle", x: 0,   y: 0, width: 100, height: 50 },
            { id: "box-b", type: "rectangle", x: 300, y: 0, width: 100, height: 50 },
            { type: "arrow", x: 0, y: 0, start: { id: "box-a" }, end: { id: "box-b" } },
          ],
        });
      expect(res.status).toBe(200);
      const arrow = res.body.elements.find((e: any) => e.type === "arrow");
      expect(arrow).toBeDefined();
      expect(arrow.startBinding?.elementId).toBe("box-a");
      expect(arrow.endBinding?.elementId).toBe("box-b");
    });

    // P0 バグ修正: points: undefined クラッシュ防止テスト
    it("POST /api/elements で points なし arrow を作成すると必ず points が設定される", async () => {
      const res = await request(BASE_URL)
        .post("/api/elements")
        .send({ type: "arrow", x: 10, y: 20 });
      expect(res.status).toBe(200);
      const el = res.body.element;
      expect(el.points).toBeDefined();
      expect(Array.isArray(el.points)).toBe(true);
      expect(el.points.length).toBeGreaterThanOrEqual(2);
    });

    it("POST /api/elements で points なし line を作成すると必ず points が設定される", async () => {
      const res = await request(BASE_URL)
        .post("/api/elements")
        .send({ type: "line", x: 50, y: 60 });
      expect(res.status).toBe(200);
      const el = res.body.element;
      expect(el.points).toBeDefined();
      expect(Array.isArray(el.points)).toBe(true);
      expect(el.points.length).toBeGreaterThanOrEqual(2);
    });

    it("POST /api/elements/batch で start/end なし arrow/line も必ず points が設定される", async () => {
      const res = await request(BASE_URL)
        .post("/api/elements/batch")
        .send({
          elements: [
            { type: "arrow", x: 10, y: 10 },
            { type: "line",  x: 50, y: 50 },
          ],
        });
      expect(res.status).toBe(200);
      for (const el of res.body.elements) {
        expect(el.points).toBeDefined();
        expect(Array.isArray(el.points)).toBe(true);
        expect(el.points.length).toBeGreaterThanOrEqual(2);
      }
    });

    it("POST /api/elements で arrow に明示的 points を渡すとそのまま使われる", async () => {
      const customPoints = [[0, 0], [200, 100], [400, 0]];
      const res = await request(BASE_URL)
        .post("/api/elements")
        .send({ type: "arrow", x: 0, y: 0, points: customPoints });
      expect(res.status).toBe(200);
      expect(res.body.element.points).toEqual(customPoints);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 要素正規化 (normalizeElementForExcalidraw) 回帰テスト
  // angle などの必須フィールドが欠如すると Excalidraw が要素を描画しないバグを防ぐ
  // ────────────────────────────────────────────────────────────────────────
  describe("要素正規化 (normalizeElementForExcalidraw)", () => {
    it("POST /api/elements で作成した rectangle が angle: 0 を持つ", async () => {
      const res = await request(BASE_URL)
        .post("/api/elements")
        .send({ type: "rectangle", x: 100, y: 100, width: 200, height: 100 });
      expect(res.status).toBe(200);
      const el = res.body.element;
      expect(el.angle).toBe(0);
    });

    it("POST /api/elements で作成した要素が isDeleted=false, groupIds=[], boundElements=null を持つ", async () => {
      const res = await request(BASE_URL)
        .post("/api/elements")
        .send({ type: "ellipse", x: 0, y: 0 });
      expect(res.status).toBe(200);
      const el = res.body.element;
      expect(el.isDeleted).toBe(false);
      expect(Array.isArray(el.groupIds)).toBe(true);
      expect(el.groupIds).toHaveLength(0);
      expect(el.boundElements).toBeNull();
    });

    it("POST /api/elements/batch で全要素が angle, isDeleted, groupIds を持つ", async () => {
      const res = await request(BASE_URL)
        .post("/api/elements/batch")
        .send({
          elements: [
            { type: "rectangle", x: 0, y: 0, width: 100, height: 50 },
            { type: "ellipse", x: 200, y: 0, width: 80, height: 80 },
            { type: "diamond", x: 400, y: 0, width: 60, height: 60 },
          ],
        });
      expect(res.status).toBe(200);
      for (const el of res.body.elements) {
        expect(typeof el.angle).toBe("number");
        expect(el.angle).toBe(0);
        expect(el.isDeleted).toBe(false);
        expect(Array.isArray(el.groupIds)).toBe(true);
      }
    });

    it("PUT /api/elements/:id では既存の angle が上書きされない (0 が保持される)", async () => {
      const create = await request(BASE_URL)
        .post("/api/elements")
        .send({ type: "rectangle", x: 0, y: 0, width: 100, height: 50 });
      const id: string = create.body.element.id;
      expect(create.body.element.angle).toBe(0);

      const update = await request(BASE_URL)
        .put(`/api/elements/${id}`)
        .send({ x: 200 }); // angle を渡さない — 既存の値が保持されるべき
      expect(update.status).toBe(200);
      expect(update.body.element.angle).toBe(0);
    });

    it("POST /api/elements で明示的に angle を渡すとその値が使われる", async () => {
      const res = await request(BASE_URL)
        .post("/api/elements")
        .send({ type: "rectangle", x: 0, y: 0, width: 100, height: 50, angle: 1.5708 });
      expect(res.status).toBe(200);
      expect(res.body.element.angle).toBeCloseTo(1.5708);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Public API
  // ────────────────────────────────────────────────────────────────────────
  describe("CanvasServer public API", () => {
    it("getPort() が正しいポートを返す", () => {
      expect(server.getPort()).toBe(TEST_PORT);
    });

    it("WS 接続なしの場合 getClientCount() は 0", () => {
      // beforeEach / afterEach で WS をクリーンアップしているので 0 のはず
      expect(server.getClientCount()).toBe(0);
    });
  });
});
