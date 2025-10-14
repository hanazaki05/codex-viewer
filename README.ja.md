[English](./README.md) | **Japanese**

# Codex Viewer

Codex Viewer は Codex プロジェクトをブラウザから操作できるフル機能の Web クライアントです。新規セッションの開始、既存会話の再開、タスクの監視、履歴ログの確認をすべてブラウザで完結できます。`~/.codex/sessions/` と `~/.codex/history.jsonl` をリアルタイムに監視し、最新の Codex 活動を即座に UI に反映します。

> **注記**: 本プロジェクトは d-kimuson 氏による [claude-code-viewer](https://github.com/d-kimuson/claude-code-viewer) を Codex 向けに派生させたものです。

![Projects view](./docs/assets/images/img001.png)

![Session list](./docs/assets/images/img002.png)

![Session detail](./docs/assets/images/img003.png)

## 主な機能

### プロジェクト一覧
- プロジェクト名やパスでフィルタリング、最終更新／名前／メッセージ数でソートが可能。
- グリッド表示とテーブル表示を切り替えて、一覧性と詳細性を用途に合わせて選択。
- `history.jsonl` のタイムスタンプも取り込み、最新アクティビティを「最終更新」に反映。

### セッション管理
- ヘッダーで `sessionId` をコピーしやすく表示（UUID があれば併記）。
- 実行中／待機中タスクの状態をバッジで可視化し、その場で中断や再開が可能。
- SSE により JSONL 更新や Codex コマンド結果が即座に反映され、手動リロード不要。

### 自動ブラウザ起動
- CLI 起動後、サーバーが立ち上がると既定ブラウザを自動で開く（Windows / Linux / macOS 対応）。
- `CC_VIEWER_NO_AUTO_OPEN=1` または `NO_AUTO_OPEN=1` を設定すると自動起動を無効化。

## クイックスタート

インストールなしで実行:

```bash
PORT=5656 npx @nogataka/codex-viewer@latest
```

サーバー（既定ポート 5656）が起動し、到達可能になると `http://localhost:5656` がブラウザで自動的に開きます。自動起動を止めたい場合は `CC_VIEWER_NO_AUTO_OPEN=1` をセットしてください。

### グローバルインストール

```bash
npm install -g @nogataka/codex-viewer
codex-viewer
```

### ソースからセットアップ

```bash
git clone https://github.com/nogataka/codex-viewer.git
cd codex-viewer
pnpm install
pnpm build
pnpm start
```

## 利用ガイド

### 1. プロジェクトページ
- 検索ボックスでプロジェクト名／パスをフィルタ。
- ソートセレクタで「最終更新」「名前」「メッセージ数」を選択し、隣の矢印で昇順／降順を切り替え。
- グリッド表示はカード型で直感的、テーブル表示は詳細列とナビゲーションを重視。

### 2. セッションページ
- タイトル部の `sessionId:` バッジにコピーアイコンを配置、UUID を含む ID をワンクリックでコピー。
- Codex タスクの進行状況をバナーで表示し、`Abort` ボタンで即停止。
- Diff ビューアやコマンドログを備え、SSE により新しいログが到着した時点でタイムラインに反映。Tool Use ログが連続する場合は親アコーディオンに畳み込まれ、長い自動化フローでも視認性を維持。

### 3. リアルタイム同期
- `~/.codex/sessions/` の JSONL 変更と `~/.codex/history.jsonl` の追記を両方監視。
- 更新が発生すると SSE (`/api/events/state_changes`) で `project_changed` / `session_changed` を配信し、画面が自動更新。

## 設定

- **ポート変更**: `PORT=8080 npx @nogataka/codex-viewer@latest`
- **ブラウザ自動起動の無効化**: `CC_VIEWER_NO_AUTO_OPEN=1`（または `NO_AUTO_OPEN=1`, `NO_AUTO_BROWSER=1`）
- **データディレクトリ**: 既定で `~/.codex/sessions/` および `~/.codex/history.jsonl` を利用します。

## 開発コマンド

- `pnpm dev` – Turbopack + Hono API を同時起動（ポート 5656）
- `pnpm lint` / `pnpm fix` – Biome によるフォーマット・Lint（自動修正込み）
- `pnpm typecheck` – TypeScript 厳格チェック
- `pnpm test` – Vitest によるテスト
- `pnpm build` – `.next/standalone` と CLI (`dist/index.js`) を生成

## 紹介記事

- [Qiita: Codexプロジェクト管理を加速するCodex Viewerガイド](https://qiita.com/nogataka/items/28d04db421663a4a46fd) – UI 構成とユースケースを詳細に解説
- [Zenn: Codex ViewerでCodexセッションを俯瞰する](https://zenn.dev/taka000/articles/74a60c37fae5bb) – 実運用での活用ポイントを紹介

## ライセンス / コントリビュート

MIT License。詳細は [LICENSE](./LICENSE) を参照。開発の流れは [docs/dev.md](docs/dev.md) にまとめています。

## 注意事項

- `dist/index.js` は CLI の実行エントリーポイントです。削除やリネームを行うと `npx @nogataka/codex-viewer` / グローバルインストールが動作しなくなるため、ビルド時・リリース時も必ず残してください。
