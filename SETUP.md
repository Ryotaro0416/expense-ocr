# expense-ocr セットアップガイド

> **このドキュメントは Claude / Claude Code に読ませてセットアップを進める前提で書かれています。**
> Claude Code に「このプロジェクトをセットアップして」と頼めば、このドキュメントを読んで対話的に案内してくれます。

---

## 0. このプロジェクトは何か

Google Drive にアップした **領収書(レシート)** と **請求書(invoice)** を、Gemini AI で自動的にデータ化して Google スプレッドシートに転記するツールです。

- **領収書**: 日付 / 金額 / 店名 を抽出してシートに記入
- **請求書**: 請求日 / 支払期限 / 請求元 / 宛先 / 小計 / 消費税 / 合計 / 請求書番号 / 品目 を抽出してシートに記入
- **実行**: GitHub Actions で毎日 23:00 JST に自動実行
- **重複処理防止**: 各シート内 `_processed` タブで処理済み file ID を記録

---

## 1. 事前に必要なもの

ユーザーに以下を確認してください。揃っていなければ取得方法を案内すること。

| | 説明 | 取得方法 |
|---|---|---|
| Google アカウント | Drive / Sheets / GCP 用 | 既に持っているはず |
| GitHub アカウント | 自動実行のため | https://github.com/signup |
| クレジットカード | GCP 登録に必要(無料枠内なら課金されない) | — |

---

## 2. セットアップ手順(全体像)

ユーザーには以下のように説明してください:

> セットアップは 7 ステップあります。だいたい 30〜45 分かかります。
> 1. Google Cloud プロジェクトを作る
> 2. Drive と Sheets の API を有効化する
> 3. サービスアカウント(SA)を作って鍵をダウンロード
> 4. Gemini API キーを取得
> 5. Drive にフォルダ・スプレッドシートを作って SA に共有
> 6. GitHub にリポジトリを作って秘密情報を登録
> 7. 動作確認

各ステップは順番にやってください。途中でわからなくなったら、Claude に聞いてください。

---

## 3. ステップ詳細

### Step 1: Google Cloud プロジェクト作成

ユーザーへ案内:

1. https://console.cloud.google.com/projectcreate を開く
2. プロジェクト名を入力(例: `expense-ocr-自分の名前`)
3. 「作成」をクリック
4. 作成後、画面上部のプロジェクト選択でその新規プロジェクトに切り替える
5. **プロジェクトID をメモしておく**(プロジェクト名と異なる場合があります)

> 💡 初回は「請求先アカウント」の作成も求められます。クレジットカードを登録しますが、無料枠内で済むためほぼ課金されません。

### Step 2: API 有効化

以下の2つの API を有効化:

1. https://console.cloud.google.com/apis/library/drive.googleapis.com → 「有効にする」
2. https://console.cloud.google.com/apis/library/sheets.googleapis.com → 「有効にする」

> ⚠️ 必ず Step 1 で作成したプロジェクトが選択されていることを確認してください(画面上部のプロジェクト名)。

### Step 3: サービスアカウント作成と鍵ダウンロード

1. https://console.cloud.google.com/iam-admin/serviceaccounts を開く
2. 「サービスアカウントを作成」をクリック
3. 名前を入力(例: `expense-ocr-sa`)→「作成して続行」
4. 「ロールを選択」はスキップ(SA がアクセスするのは Drive/Sheet 共有経由のため不要)→「完了」
5. 作成された SA をクリック → 上部「キー」タブ → 「鍵を追加」 → 「新しい鍵を作成」 → JSON 選択 → 「作成」
6. JSON ファイルがダウンロードされる → **この内容を Claude には貼らないように注意!**(GitHub の secrets に直接登録します)
7. **SA のメールアドレス(`xxx@xxx.iam.gserviceaccount.com`)をメモ**

### Step 4: Gemini API キー取得

1. https://aistudio.google.com/app/apikey を開く
2. 「Create API Key」 → Step 1 で作ったプロジェクトを選択 → 「Create API key in existing project」
3. 表示された API キーをコピーしてメモ
4. **無料枠**: 1日あたりかなりの回数が無料で使えます。領収書・請求書の処理量なら通常コスト 0 円のままです

### Step 5: Drive フォルダとスプレッドシート作成

ユーザーが両方使う場合(領収書 + 請求書)は以下を **2セット**作成:

#### 領収書用

1. https://drive.google.com で新規フォルダ作成(名前: `領収書` など)
2. フォルダを開いて「共有」 → Step 3 でメモした **SA のメールアドレス** を入力
3. 権限を **閲覧者** に設定 → 「送信」(通知メールはオフでOK)
4. URL をコピー: `https://drive.google.com/drive/folders/XXXXXXXX` の `XXXXXXXX` がフォルダID
5. https://sheets.new で新規スプレッドシート作成(名前: `経費` など)
6. 「共有」 → SA メアドを **編集者** で追加
7. URL から シートID を抜き出す: `https://docs.google.com/spreadsheets/d/YYYYYYYY/edit`

#### 請求書用(必要なら)

同じ手順をもう1セット(フォルダ名: `請求書`、シート名: `請求書台帳` など)。

### Step 6: GitHub リポジトリ作成と secrets 登録

#### 6-1: リポジトリ作成

1. https://github.com/new で新規リポジトリ作成(名前: `expense-ocr`、Private 推奨)
2. 「Create repository」

#### 6-2: コードをプッシュ

ローカルの zip を解凍したディレクトリで、Claude Code に頼んでください:

```bash
cd <展開したディレクトリ>
git init
git add -A
git commit -m "Initial commit"
git remote add origin https://github.com/<ユーザー名>/expense-ocr.git
git branch -M main
git push -u origin main
```

#### 6-3: clients.yml を自分の情報に書き換え

`clients.yml` を開いて、Step 5 で取得した folder_id / sheet_id に置き換えます。
領収書しか使わない場合は `invoices:` ブロックを削除、請求書しか使わない場合は `receipts:` ブロックを削除して構いません。

例:
```yaml
clients:
  - name: myself
    receipts:
      folder_id: <Step 5 で取得した領収書フォルダID>
      sheet_id: <Step 5 で取得した経費シートID>
    invoices:
      folder_id: <Step 5 で取得した請求書フォルダID>
      sheet_id: <Step 5 で取得した請求書シートID>
```

書き換えたらコミット&プッシュ:
```bash
git add clients.yml
git commit -m "Configure my client"
git push
```

#### 6-4: GitHub secrets 登録

GitHub リポの画面で **Settings → Secrets and variables → Actions → New repository secret** から、以下の2つを登録:

| Name | Value |
|---|---|
| `GCP_SA_KEY` | Step 3 でダウンロードした JSON ファイルの **全文** をそのまま貼り付け |
| `GEMINI_API_KEY` | Step 4 で取得した API キー |

(任意)Discord 通知が欲しい場合は `DISCORD_WEBHOOK_URL` も追加。

### Step 7: 動作確認

1. テスト用に **領収書 or 請求書を1枚** Drive のフォルダにアップロード(JPG/PNG/PDF どれでもOK)
2. GitHub リポの **Actions** タブを開く
3. 左メニューの「Daily expense OCR」 → 右上の「Run workflow」 → 「Run workflow」 をクリック
4. 緑のチェックがついたら、Google スプレッドシートを開いて行が追加されているか確認
5. うまくいかない場合は Actions のログを Claude に見せて相談

---

## 4. 運用情報

### 自動実行
- 毎日 **23:00 JST** に自動実行(`.github/workflows/daily.yml` の cron)
- 既に処理済みのファイルはスキップされる(`_processed` タブで管理)

### 新しい領収書/請求書を追加したいとき
Drive のフォルダにアップするだけ。翌 23:00 JST に自動処理されます。すぐ処理したいなら GitHub Actions から手動実行(Step 7 の手順)。

### 手動実行(コマンドライン)
GitHub CLI (`gh`) が入っていれば:
```bash
gh workflow run daily.yml -R <ユーザー名>/expense-ocr
```

### コスト
- **GCP**: Drive/Sheets API は無料枠内で済む(0円)
- **Gemini**: 領収書1枚あたり約0.1〜0.3円、請求書1枚あたり約0.5〜1.5円。月に数百枚処理しても数百円
- **GitHub Actions**: Public リポなら無料、Private でも月2000分の無料枠で十分

---

## 5. トラブルシューティング

### Actions が失敗する

- **`KeyError: 'GCP_SA_KEY'` 等**: secrets が登録されてない、または名前が違う(大文字小文字含めて完全一致)
- **`HttpError 403`**: SA に Drive フォルダ or シートが共有されていない、もしくは Drive/Sheets API が有効化されていない
- **`HttpError 404`**: clients.yml の folder_id / sheet_id が間違っている
- **`No main tab found`**: シートのタブが `_processed` だけになっている。タブを1つ追加すれば直る

### Discord に通知が来ない

- `DISCORD_WEBHOOK_URL` が secrets に登録されているか確認
- 「処理0件・失敗0件」の日は通知しない仕様(変更可)

### 古いファイルを再処理したい

`_processed` タブの該当行を削除すれば、次回実行時に再処理される。

---

## 6. Claude Code 用メモ

このセットアップを進める時は:

- ステップを **1つずつ確認しながら**進める。一気に全部やらない
- ユーザーが GCP コンソールに不慣れな前提で、URL は具体的にクリックできる形で提示する
- SA の JSON 鍵は **絶対に Claude のチャットに貼らせない**(secrets 直登録のみ)
- `clients.yml` の編集は実際にユーザーが取得した ID を貼り付けるだけ。間違えても致命的ではないので恐れず進める

---

## 7. 登録ポータル (Cloudflare Pages + D1)

クライアントが自分で登録できるWebフォームを `web/` に用意している。`BACKEND_URL` / `BACKEND_TOKEN` を GitHub Actions secrets にセットすると、バッチは `clients.yml` ではなくポータル経由で取得する。

### デプロイ手順

```bash
cd web
npm install
npx wrangler login              # 初回のみ

# D1作成
npx wrangler d1 create expense-ocr
# 出力の database_id を wrangler.toml に貼る

# スキーマ適用
npm run db:init

# シークレット設定 (Pages 環境変数)
npx wrangler pages secret put REGISTER_PASSCODE --project-name=expense-ocr-portal
npx wrangler pages secret put ADMIN_KEY --project-name=expense-ocr-portal
npx wrangler pages secret put BACKEND_TOKEN --project-name=expense-ocr-portal
npx wrangler pages secret put SA_EMAIL --project-name=expense-ocr-portal
# SA_EMAIL は keihi-426@keihi-494805.iam.gserviceaccount.com

# デプロイ
npm run deploy
```

Pages のダッシュボードで D1 binding (`DB` → `expense-ocr`) を Production / Preview に紐付ける。

### GitHub Actions 側

リポジトリの Settings → Secrets に追加:
- `BACKEND_URL`: `https://expense-ocr-portal.pages.dev` (デプロイ後のURL)
- `BACKEND_TOKEN`: 上で設定した値

両方セットされていればポータルから取得、未設定なら `clients.yml` を使う。

### 運用

- 登録URL: `https://<pages-url>/` (パスコード必須)
- 管理URL: `https://<pages-url>/admin.html` (ADMIN_KEY 入力)

### ローカル開発

```bash
cd web
npm run db:init:local
npm run dev
# .dev.vars に REGISTER_PASSCODE/ADMIN_KEY/BACKEND_TOKEN/SA_EMAIL を書いておく
```
- 詰まったら GitHub Actions のログを見て原因を特定する
