# excalidesk

**Excalidraw desktop app ported to Electron with MCP server integration**

## プロジェクト概要

excalidesk は、Tauri ベースの excalidrauri を Electron に移植し、MCP (Model Context Protocol) サーバー統合により AI エージェントからキャンバスを制御可能にしたデスクトップアプリケーションです。

### 技術スタック

**Frontend:**
- React 18.3.1 + TypeScript
- Excalidraw 0.17.6
- Lucide React (アイコン)
- Vite 6.0.3 (ビルドツール)
- Vitest (テスト)

**Backend:**
- Electron 35.1.5
- Node.js (メインプロセス)
- IPC通信 (renderer ⇔ main)

**開発ツール:**
- electron-vite (統合開発環境)
- TypeScript 5.6.2
- ESLint, Prettier

---

## ディレクトリ構造

```
excalidesk/
├── package.json                    # プロジェクト定義
├── electron.vite.config.ts         # Electron + Vite 統合設定
├── tsconfig*.json                  # TypeScript 設定 (main/preload/renderer)
├── vitest.main.config.ts           # メインプロセステスト設定
├── .gitignore
├── src/
│   ├── main/                       # Electron メインプロセス (Node.js)
│   │   ├── index.ts                # アプリエントリポイント
│   │   ├── fs-commands.ts          # ファイルシステム操作 (commands.rs 移植)
│   │   ├── fs-commands.test.ts     # FS コマンドテスト (49 tests)
│   │   └── ipc-handlers.ts         # IPC ハンドラー登録
│   ├── preload/                    # Preload スクリプト
│   │   └── index.ts                # contextBridge で API 公開
│   └── renderer/                   # React フロントエンド
│       ├── index.html              # HTML エントリ
│       └── src/
│           ├── main.tsx            # React エントリポイント
│           ├── App.tsx             # ルートコンポーネント
│           ├── types/
│           │   ├── index.ts        # 共有型定義
│           │   └── electron.d.ts   # window.electronAPI 型定義
│           ├── hooks/
│           │   └── useElectronFS.ts # FS 操作 hook
│           ├── components/
│           │   ├── ExcalidrawCanvas.tsx # キャンバスエディタ
│           │   ├── Sidebar.tsx          # ファイルツリー + ゴミ箱
│           │   ├── Dialog.tsx           # モーダルダイアログ
│           │   └── IconPicker.tsx       # アイコン選択 UI
│           ├── utils/
│           │   └── fileTree.ts     # ファイル検索ユーティリティ
│           ├── styles/
│           │   └── globals.css     # Catppuccin テーマ
│           └── test/
│               └── setup.ts        # テスト環境セットアップ
└── resources/                      # アプリアイコン等
```

---

## 開発コマンド

```bash
# 依存関係インストール
npm install

# 開発モード起動 (ホットリロード)
npm run dev

# プロダクションビルド
npm run build

# テスト実行
npm run test              # レンダラーテスト
npm run test:main         # メインプロセステスト
npm run test:watch        # ウォッチモード
npm run test:coverage     # カバレッジ計測
```

---

## 主要機能

### ファイルシステム操作 (16 コマンド)

| コマンド | 機能 |
|---------|------|
| `listDir` | ディレクトリ一覧取得 (再帰、.excalidraw のみ) |
| `createFolder` | フォルダ作成 |
| `createCanvas` | 新規キャンバス作成 (デフォルトJSON) |
| `deleteItem` | ファイル/フォルダ削除 |
| `renameItem` | リネーム/移動 |
| `readCanvas` | キャンバス読み込み |
| `saveCanvas` | キャンバス保存 (デバウンス 1秒) |
| `copyCanvas` | キャンバスコピー |
| `getBaseDirectory` | ベースディレクトリパス取得 |
| `trashItem` | ゴミ箱へ移動 |
| `listTrash` | ゴミ箱一覧 |
| `restoreItem` | ゴミ箱から復元 |
| `deletePermanently` | 完全削除 |
| `emptyTrash` | ゴミ箱を空に |
| `setItemIcon` | カスタムアイコン設定 |
| `showOpenDialog` | フォルダ選択ダイアログ |

### UI機能

- **ファイルツリー**: 再帰的フォルダ展開、D&D移動、インライン編集
- **検索**: リアルタイムフィルタリング
- **コンテキストメニュー**: 右クリックで操作
- **キーボードショートカット**: Ctrl+C (コピー), Ctrl+V (ペースト), Delete (ゴミ箱)
- **カスタムアイコン**: 50+ アイコン × 7色
- **自動保存**: 1秒デバウンス
- **ゴミ箱**: タイムスタンプ付き、復元可能

---

## データ保存場所

- **ベースディレクトリ**: `~/.config/excalidesk/` (Linux)
  - `canvases/` - キャンバスファイル (.excalidraw)
  - `trash/` - ゴミ箱
  - `.meta/` - アイコンメタデータ

---

## セキュリティ

### パストラバーサル対策

`safeRelativePath()` 関数で全ての相対パスを検証:
- `..` を含むパスを拒否
- 絶対パスを拒否
- 正規化前にチェック

### CSP (Content Security Policy)

現在無効化 (開発用) - 本番環境では有効化推奨

---

## テスト

### メインプロセステスト (49 tests)

- `safeRelativePath`: パストラバーサル検証 (8 tests)
- `collectItems`: ファイル収集・ソート (12 tests)
- `loadItemIcon`: アイコンメタデータ (3 tests)
- コマンド統合テスト (26 tests)

**カバレッジ**: `npm run test:coverage`

---

## Phase 進捗管理

### ✅ Phase 1: プロジェクト基盤
- [x] package.json 作成
- [x] electron.vite.config.ts
- [x] tsconfig 群 (main/preload/renderer)
- [x] vitest.main.config.ts
- [x] .gitignore
- [x] index.html
- [x] npm install

### ✅ Phase 2: 変更なしファイルコピー (7ファイル)
- [x] types/index.ts
- [x] utils/fileTree.ts
- [x] styles/globals.css
- [x] components/Dialog.tsx
- [x] components/IconPicker.tsx
- [x] test/setup.ts
- [x] main.tsx

### ✅ Phase 3: バックエンド実装
- [x] fs-commands.ts (commands.rs 移植、715行)
- [x] fs-commands.test.ts (Rust テスト 49個 移植)
- [x] ipc-handlers.ts (16コマンド登録)
- [x] main/index.ts (Electron メインプロセス)
- [x] preload/index.ts (contextBridge)

### ✅ Phase 4: フロントエンド適応
- [x] useElectronFS.ts (useTauriFS → Electron 版)
- [x] electron.d.ts (window.electronAPI 型定義)
- [x] App.tsx (タイトル "excalidesk")
- [x] ExcalidrawCanvas.tsx (useElectronFS)
- [x] Sidebar.tsx (dialog API → window.electronAPI)

### ✅ Phase 5: MCP サーバー統合

**MCP 統合アーキテクチャ実装完了:**
- ✅ Canvas Server (Express + WebSocket): Element CRUD, 同期
- ✅ MCP Process Manager: child process 管理 (スタブ実装)
- ✅ Renderer WebSocket クライアント: useCanvasSync hook
- ✅ Settings 管理システム: 設定の読み込み・保存

**追加依存:**
- ✅ express ^4.21.2
- ✅ ws ^8.18.0
- ✅ cors ^2.8.5
- ✅ @modelcontextprotocol/sdk ^1.0.4
- ✅ zod ^3.24.1
- ✅ @excalidraw/mermaid-to-excalidraw ^1.1.3

**実装ファイル:**
- ✅ `src/main/mcp/canvas-server.ts` (304行) - REST API + WebSocket
- ✅ `src/main/mcp/mcp-process.ts` (82行) - MCP プロセス管理
- ✅ `src/main/mcp/types.ts` - MCP型定義
- ✅ `src/main/settings.ts` - 設定管理
- ✅ `src/renderer/src/hooks/useCanvasSync.ts` - WebSocket同期hook
- ✅ IPC handlers: settings:load, settings:save

**Canvas Server REST API エンドポイント:**
- GET `/health` - ヘルスチェック
- GET `/canvas` - キャンバス全体取得
- POST `/canvas` - キャンバス全体更新
- GET `/elements` - 全要素取得
- POST `/elements` - 要素作成
- GET `/elements/:id` - 要素取得
- PUT `/elements/:id` - 要素更新
- DELETE `/elements/:id` - 要素削除
- POST `/clear` - キャンバスクリア
- GET `/snapshot` - スナップショット取得

**WebSocket イベント:**
- `canvas_sync` - キャンバス全体同期
- `element_created` - 要素作成通知
- `element_updated` - 要素更新通知
- `element_deleted` - 要素削除通知

**設定:**
- ✅ MCP サーバー ON/OFF切り替え
- ✅ ポート設定 (デフォルト 3100)
- ✅ 設定ファイル: `{userData}/settings.json`

**TODO (Phase 5 拡張):**
- [ ] 完全な MCP Server 実装 (26ツール)
- [ ] Mermaid → Excalidraw 変換
- [ ] ExcalidrawCanvas への WebSocket 統合
- [ ] Settings UI の追加

### ✅ Phase 6: テスト & 検証
- [x] メインプロセステスト実行 (49/49 passed)
- [x] ビルド検証 (electron-vite build)
- [ ] レンダラーテスト実行
- [ ] 手動検証チェックリスト

### 🔲 Phase 7: ガチオブガチの包括的テスト (TODO)

**作成予定のテストスイート:**

1. **MCP Canvas Server テスト** (Task #8)
   - REST API全エンドポイントの検証
   - WebSocket接続・メッセージング・再接続
   - ブロードキャスト機能
   - エラーハンドリング
   - 使用技術: vitest + supertest + ws

2. **Settings 管理テスト** (Task #9)
   - 設定の読み込み・保存・デフォルト値
   - MCP有効/無効切り替え
   - ポート番号設定
   - 不正なJSON/権限エラー処理
   - 使用技術: vitest

3. **useCanvasSync hook テスト** (Task #10)
   - WebSocket接続確立・切断
   - イベント送受信 (canvas_sync, element_*)
   - 自動再接続 (5秒)
   - enabled フラグ制御
   - cleanup処理
   - 使用技術: @testing-library/react-hooks

4. **E2E 統合テスト** (Task #11)
   - アプリ起動・終了フロー
   - ファイル作成→編集→保存の一連の操作
   - MCP Server起動確認
   - WebSocket同期動作
   - AI エージェントシミュレーション
   - 使用技術: Playwright or Spectron

5. **パフォーマンス＆ストレステスト** (Task #12)
   - 大量要素 (1000+) 描画性能
   - WebSocket同時接続 (10+ clients)
   - REST API連続リクエスト (100 req/sec)
   - メモリリーク検証
   - ファイルツリー1000+ファイル性能
   - 使用技術: k6 or Artillery

---

## トラブルシューティング

### ビルドエラー

```bash
# キャッシュクリア
rm -rf node_modules out dist
npm install
npm run build
```

### テスト失敗

```bash
# 個別テスト実行
npm run test:main -- fs-commands.test.ts
```

### 開発サーバーが起動しない

```bash
# ポート確認
lsof -i :5173
kill -9 <PID>
```

---

## ライセンス

Apache-2.0

---

## リファレンス

- **元プロジェクト**: [nnao45/excalidrauri](https://github.com/nnao45/excalidrauri) (Tauri版)
- **MCP サーバー**: [yctimlin/mcp_excalidraw](https://github.com/yctimlin/mcp_excalidraw)
- **Excalidraw**: [excalidraw/excalidraw](https://github.com/excalidraw/excalidraw)
- **Electron**: [electron/electron](https://github.com/electron/electron)
