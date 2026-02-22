# excalidesk

Excalidraw をベースにしたデスクトップアプリ。ローカルキャンバスの操作に加えて、MCP (Model Context Protocol) 経由でキャンバスを操作できます。

## セットアップ

```bash
npm install
```

## 開発

```bash
npm run dev
```

## MCP (Canvas Server)

### 起動

アプリ起動後、右上の `MCP` ボタンからパネルを開き、`起動` を押してください。  
起動すると `http://localhost:3100/mcp` に MCP エンドポイントが立ち上がります。

### 代表的な利用方法

MCP JSON-RPC を `POST /mcp` に送信します。`Accept: application/json, text/event-stream` が必要です。

```bash
curl -s http://localhost:3100/mcp \\
  -H 'content-type: application/json' \\
  -H 'accept: application/json, text/event-stream' \\
  -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}'
```

例: 要素作成

```bash
curl -s http://localhost:3100/mcp \\
  -H 'content-type: application/json' \\
  -H 'accept: application/json, text/event-stream' \\
  -d '{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"create_element\",\"arguments\":{\"type\":\"rectangle\",\"x\":50,\"y\":50,\"width\":120,\"height\":80}}}'
```

### MCPツール一覧

`tools/list` で全ツールを取得できます。  
主な分類:

- 作成/更新/削除: `create_element`, `update_element`, `delete_element`, `batch_create_elements`
- 取得/検索: `get_element`, `query_elements`, `describe_scene`, `get_resource`
- 配置/操作: `align_elements`, `distribute_elements`, `group_elements`, `ungroup_elements`, `lock_elements`, `unlock_elements`, `duplicate_elements`
- インポート/エクスポート: `import_scene`, `export_scene`, `export_to_image`, `export_to_excalidraw_url`
- フロント依存: `create_from_mermaid`, `get_canvas_screenshot`, `set_viewport`

## テスト

### 単体テスト

```bash
npm run test:main
```

### E2E (Playwright + Electron)

```bash
npm run test:e2e
```

E2E では以下を検証します:

- 代表的な描画パターン（図形・テキスト・矢印）
- MCPツール全般の実行
- フロント依存ツール（Mermaid変換 / 画像エクスポート / スクリーンショット / Viewport）

## ビルド

```bash
npm run build
```

MCPサーバ単体ビルド:

```bash
npm run build:mcp
```
