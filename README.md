# 工大祭ポスター配布管理システム

## プロジェクト概要

### システム概要

工大祭実行委員会のポスター配布業務をデジタル化するWebアプリケーション

### システムの目的

- ポスター配布状況のリアルタイム管理
- 工大祭実行委員会メンバー間での情報共有の効率化
- 配布作業の重複防止
- 年度を跨いだデータ管理と履歴参照
- 統計情報による来年度の改善案策立

## 起動方法

### 必要なもの

- `.env`（リポジトリ直下）
- ローカル起動
  - Node.js 24以上
  - npm
- Docker 起動
  - Docker Desktop

### `.env` の準備

1. `.env.example` をコピーして `.env` を作成します。

```bash
cp .env.example .env
```

2. `.env` の値を実際の Firebase 設定に合わせて編集します。

### ローカル起動

初回はローカル用設定を準備します（Node.js 24以上・Java 21以上が必要です）。

```bash
make init
```

Firebase Auth／Firestore Emulator とアプリをまとめて起動します。

```bash
make dev
```

アプリは `http://localhost:3000`、Emulator UI は `http://localhost:4000` です。
ローカル管理者は `developer@kanazawa-it.ac.jp` / `local-password` で自動作成されます。

### Docker 起動

1. Docker Desktop を起動します。
2. コンテナを起動します。

```bash
docker compose up --build
```

3. ブラウザで `http://localhost:3000` を開きます。

### 停止

```bash
Ctrl + C
```

Docker の場合は必要に応じて以下も実行します。

```bash
docker compose down
```

### 対象ユーザー・配布範囲

- **ユーザー**: 工大祭実行委員会所属メンバー
- **配布対象**: 大学周辺の店舗（Google My Mapsで指定された範囲）
- **配布方法**: 各班に分かれて徒歩で回る
- **数年にわたる運用**: 年度別データ管理と履歴参照機能を備えている

## 機能要件

### 0. 年度管理機能

#### イベント管理

- 年度別の配布イベント作成・管理
- アクティブイベントの切り替え
- 年度別データ管理と過去データ参照

#### 統計機能

- 年度別配布実績の記録・参照
- チームパフォーマンスの分析・比較
- 年次統計レポートと最高パフォーマンスチームの記録

### 1. 店舗情報管理

#### 店舗登録方式

現地で以下の情報を手動入力する

#### 入力項目

- 店名（必須）
- 配布状況（配布済み/配布不可/保留/要再訪問）
- 配布枚数
- 配布不可理由（不在/断られた/閉店/その他）
- 住所（手動入力）
- 配布区域管理番号（ログイン認証から自動設定）
- 備考（自由記述欄）

### 2. 認証・ユーザー管理

#### 班認証システム

- 各班用ログインコード（管理者事前発行）
- ログインコードに紐づく情報：
  - 班名
  - 担当配布区域
  - 配布枠キー（`YYYY-MM-DD_am` / `YYYY-MM-DD_pm`）

#### 参加者管理

**アンケートフォーム**

- 1年度1フォームで運用
- 項目: 名前、学年、所属セクション、参加可能日時
- 配布期間に基づく午前/午後の複数選択
- `参加不可` / `全て可能` も選択可能
- フォーム作成・編集・削除機能
- 回答データの管理・確認機能

### 3. 配布区域管理

#### 区域設定

- 区域管理番号: 午前1、午後1、午前2、午後2...
- 各区域の担当店舗リスト管理

#### 班・区域割り当て

- 各班の担当区域設定
- 午前/午後の時間帯設定

### 4. 店舗リスト・検索機能

- **インテリジェント店舗表示**: 担当区域＋周辺区域の自動フィルタリング
- **五十音順ソート**: 店名→住所の順でソート（常時適用）
- **多段階フィルタ機能**:
  - 配布区域（自動＋手動選択）
  - 配布状況（未配布/配布済み/配布不可/要再訪問）
  - 店名・住所検索（部分一致）

### 5. 管理者機能（Adminページ）

#### イベント管理

- 年度別イベント作成・編集・削除
- 配布期間と配布枠の設定
- アクティブイベント切り替え
- 年度別データ管理と過去データ参照

#### チーム管理

- チーム作成・編集・削除（ログインコード発行）
- 配布枠キー（`YYYY-MM-DD_am` / `YYYY-MM-DD_pm`）で管理
- 担当区域は配布区域側で設定し、チームへ自動反映
- チーム別詳細情報と配布実績

#### 参加者管理

- アンケートフォーム作成・管理
- メンバー情報の一覧・検索・絞り込み
- チーム割り当て状況の管理

#### 統計・レポート機能

- **リアルタイム統計**: 配布状況・完了率・進捗監視
- **年次統計レポート**: チームパフォーマンス分析とランキング
- **CSVエクスポート**: 統計データの出力
- **トレンド分析**: 配布推移と累積データ

---

## 技術仕様

### アーキテクチャ概要

- **フレームワーク**: Next.js (React)
- **データベース**: Firebase Firestore
- **認証**: Firebase Authentication
- **ホスティング**: Vercel
- **完全無料構成**: 外部API不要、すべて無料サービスで構築

### 技術スタック

#### フロントエンド

| 技術                | 用途                |
| ------------------- | ------------------- |
| **Next.js**         | Reactフレームワーク |
| **Tailwind CSS**    | UIスタイリング      |
| **React Hook Form** | フォーム管理        |
| **SWR**             | データフェッチング  |

#### バックエンド・データベース

| 技術                        | 用途              |
| --------------------------- | ----------------- |
| **Firebase Firestore**      | NoSQLデータベース |
| **Firebase Authentication** | 認証システム      |
| **Next.js API Routes**      | サーバーサイドAPI |

#### 開発・デプロイ

| 技術                  | 用途                |
| --------------------- | ------------------- |
| **TypeScript**        | 型安全な開発        |
| **ESLint + Prettier** | コード品質管理      |
| **Vercel**            | ホスティング・CI/CD |

### 認証・セキュリティ

- **Firebase Authentication** + カスタムクレーム
- **管理者認証**: sub.kanazawa-it.ac.jp ドメイン限定
- **班認証**: ログインコード方式（例：AM1-2025）
- **セキュリティ要件**:
  - ログインコード有効期限: 学外配布日のみ
  - 同一ログインコードでの複数人同時ログイン許可
  - 認証必須（未認証時はアクセス不可）

### ページ構成・ルーティング

| パス                                | 画面名                                           | 認証要件   |
| ----------------------------------- | ------------------------------------------------ | ---------- |
| `/admin`                            | 管理者ダッシュボード                             | 管理者認証 |
| `/admin/login`                      | 管理者ログイン                                   | なし       |
| `/admin/invite`                     | ユーザー招待                                     | 管理者認証 |
| `/admin/event`                      | イベント管理（年度一覧）                         | 管理者認証 |
| `/admin/event/[year]`               | 年度別イベント管理                               | 管理者認証 |
| `/admin/event/[year]/team`          | チーム管理                                       | 管理者認証 |
| `/admin/event/[year]/team/[teamId]` | チーム詳細管理                                   | 管理者認証 |
| `/admin/event/[year]/setting`       | イベント設定                                     | 管理者認証 |
| `/admin/event/[year]/form`          | アンケートフォーム管理（作成・内容・回答・設定） | 管理者認証 |
| `/admin/event/[year]/stats`         | 年次統計・レポート                               | 管理者認証 |
| `/dashboard`                        | 配布管理画面（班認証）                           | 班認証     |
| `/dashboard/all`                    | 全体ダッシュボード（班認証）                     | 班認証     |
| `/form/[id]`                        | アンケート回答フォーム                           | なし       |
| `/`                                 | ログインコード入力（最新年度へリダイレクト）     | なし       |

---

## データ構造設計

### Firestore コレクション設計

#### 主要エンティティ

##### 1. 配布イベント (`/distributionEvents/{eventId}`)

```typescript
interface DistributionEvent {
  eventId: string; // "kodai2025"
  eventName: string; // "工大祭2025"
  distributionStartDate: Date; // 配布期間の開始日
  distributionEndDate: Date; // 配布期間の終了日
  distributionAvailabilitySlots: string[]; // 配布枠キー一覧
  distributionTimeZone: string;
  year: number; // 2025
  isActive: boolean; // 現在アクティブなイベントか
  createdAt: Date;
  updatedAt: Date;
}
```

##### 2. 班・チーム管理 (`/teams/{teamId}`)

```typescript
interface Team {
  teamId: string; // "AM1-2025"
  teamCode: string; // "AM1-2025"
  teamName: string; // "午前1班"
  timeSlot: string; // "2026-06-01_am" などの配布枠キー
  assignedArea: string; // "午前1"
  adjacentAreas: string[]; // ["午前2", "午後1"] 周辺区域
  eventId: string; // "kodai2025"
  year?: number; // 2025
  isActive: boolean;
  createdAt: Date;
  updatedAt?: Date;
}
```

##### 3. 店舗情報 (`/stores/{storeId}`)

```typescript
interface Store {
  storeId: string;
  storeName: string;
  storeNameKana: string; // 店名カナ（ソート用）
  address: string;
  addressKana: string; // 住所カナ（ソート用）
  areaCode: string; // 配布区域管理番号
  distributionStatus: 'pending' | 'completed' | 'failed' | 'revisit';
  failureReason?: 'absent' | 'refused' | 'closed' | 'other';
  distributedCount: number; // 配布枚数
  distributedBy: string; // 配布者（teamCode）
  createdByTeamCode?: string; // 登録者（手動登録時）
  distributedAt?: Date;
  notes?: string; // 備考欄
  registrationMethod: 'preset' | 'manual';
  eventId: string;
  createdAt: Date;
  updatedAt: Date;
}
```

#### 補助エンティティ

##### 4. 配布区域 (`/areas/{areaId}`)

```typescript
interface Area {
  areaId: string; // "morning-1"
  areaCode: string; // "午前1"
  areaName: string; // "午前1区域"
  description?: string; // 区域の説明
  createdAt: Date;
}
```

##### 5. 参加者管理 (`/members/{memberId}`)

```typescript
interface Member {
  memberId: string;
  name: string;
  section: string; // 所属セクション
  grade: number; // 学年
  availableSlots: string[];
  year: number; // 参加年度
  teamId?: string; // 割り当て班ID
  source: 'form'; // 登録元
  createdAt: Date;
}
```

---

## 認証システム

### 認証方式概要

#### 1. 班認証（ログインコード方式）

**一時的なメール/パスワード変換方式を採用**

**認証フロー:**

1. ユーザーがログインコード（例：AM1-2025）を入力
2. システムがログインコードを一時的なメール/パスワードに変換
   ```
   Email: {teamCode}@temp.kodai-poster.local
   Password: システム生成のランダムパスワード
   ```
3. Firebase Authenticationで一時アカウント作成
4. Custom Claimsでチーム情報を設定
5. 24時間後に一時アカウントを自動削除

**メリット:**

- Firebase Authenticationの標準機能を活用
- 自動セッション管理
- 実装の簡素化

#### 2. 管理者認証（Firebase Authentication）

- **Firebase Auth**: `signInWithEmailAndPassword` を使用
- **招待制**: 管理者が admin 画面からユーザー招待を作成します
- **招待メール**: メールアドレスを入力すると Firebase のパスワード再設定メールを送信します
- **初期作成**: `make admin` でローカル作成できます
- **認証フロー**:
  1. 管理者が admin 画面で招待を作成
  2. Firebase からパスワード再設定メールが送信される
  3. 対象ユーザーがメール内リンクから初回パスワードを設定する
  4. 管理者ログイン画面からログインする
  5. Custom Claims で管理者権限を付与
- **セキュリティ**: 管理者以外は admin ページにアクセスできない

#### Firebase Authentication実装方法

**必要な依存関係**

```bash
npm install firebase firebase-admin
```

**環境変数設定**
`.env.local` ファイルに以下を追加:

```
# Firebase設定
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abcdef

# Firebase Admin SDK（サーバーサイド）
FIREBASE_ADMIN_PRIVATE_KEY=your-private-key
FIREBASE_ADMIN_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
FIREBASE_ADMIN_PROJECT_ID=your-project-id
```

**実装するファイル構成**

Firebase設定:

- `lib/firebase.ts` - Firebase クライアント設定
- `lib/firebase-admin.ts` - Firebase Admin SDK設定

API Routes:

- `app/api/admin/invites/route.ts` - 管理者招待の作成

Pages/Components:

- `app/admin/page.tsx` - 管理者ダッシュボード
- `app/admin/login/page.tsx` - 管理者ログインフォーム
- `app/admin/invite/page.tsx` - ユーザー招待フォーム
- `app/admin/event/page.tsx` - 年度選択

### セキュリティ仕様

- **セッション制限**: 24時間で自動ログアウト
- **複数ログイン**: 同一ログインコードでの複数人同時利用を許可
- **アクセス制御**: 未認証時は認証画面に自動リダイレクト
- **管理者招待**: `app/admin/register/page.tsx` と `app/api/auth/admin-register/route.ts` は削除済みで、管理者招待は `app/api/admin/invites/route.ts` に一本化されています

### エラーハンドリング

| エラー条件           | メッセージ                                                |
| -------------------- | --------------------------------------------------------- |
| 無効なログインコード | "入力されたログインコードが見つかりません"                |
| 配布日以外のアクセス | "本日は配布日ではありません。イベント: {dateまたはrange}" |
| 権限不足             | 自動的に適切な認証画面にリダイレクト                      |
| セッション期限切れ   | "セッションが期限切れです。再度ログインしてください"      |

##### 6. 管理者 (`/admins/{adminId}`)

```typescript
interface Admin {
  adminId: string;
  email: string; // sub.kanazawa-it.ac.jp ドメイン限定
  name: string;
  isActive: boolean;
  createdAt: Date;
}
```

##### 7. 一時アカウント (`/tempAccounts/{accountId}`)

```typescript
interface TempAccount {
  accountId: string;
  teamCode: string; // 元のログインコード
  tempEmail: string; // 一時メールアドレス
  createdAt: Date;
  expiresAt: Date; // 24時間後
  isActive: boolean;
}
```

##### 8. 年次統計 (`/yearlyStats/{year}`)

```typescript
interface YearlyStats {
  year: number;
  eventName: string;
  totalEvents: number;
  totalStores: number;
  totalTeams: number;
  totalMembers: number;
  averageCompletionRate: number;
  bestPerformingTeam: {
    teamCode: string;
    teamName: string;
    completionRate: number;
  };
  distributionTrends: {
    date: Date;
    completedStores: number;
    totalStores: number;
  }[];
}
```

---

## API設計

### REST APIエンドポイント

#### 認証関連

| メソッド | エンドポイント         | 説明               |
| -------- | ---------------------- | ------------------ |
| `POST`   | `/api/auth/team-login` | ログインコード認証 |
| `POST`   | `/api/auth/logout`     | ログアウト         |
| `GET`    | `/api/auth/verify`     | 認証状態確認       |

#### 店舗管理

| メソッド | エンドポイント          | 説明                                                                                                             |
| -------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/stores`           | インテリジェント店舗一覧取得<br>・担当区域＋周辺区域の自動フィルタ<br>・五十音順ソート機能<br>・配布状況フィルタ |
| `POST`   | `/api/stores`           | 店舗登録（手動追加・カナ自動生成）                                                                               |
| `PUT`    | `/api/stores/{storeId}` | 店舗配布状況更新                                                                                                 |
| `GET`    | `/api/stores/search`    | 高度検索（クエリパラメータ：q, area, status）                                                                    |

#### 管理機能

| メソッド | エンドポイント                     | 説明                                               |
| -------- | ---------------------------------- | -------------------------------------------------- |
| `GET`    | `/api/admin/stats`                 | 配布統計データ（年度指定可能）                     |
| `GET`    | `/api/admin/events`                | イベント一覧取得                                   |
| `POST`   | `/api/admin/events`                | イベント作成                                       |
| `PATCH`  | `/api/admin/events`                | イベント更新                                       |
| `DELETE` | `/api/admin/events`                | イベント削除                                       |
| `GET`    | `/api/admin/teams`                 | チーム一覧取得（年度指定可能、配布枠キー）         |
| `POST`   | `/api/admin/teams`                 | チーム作成                                         |
| `GET`    | `/api/admin/teams/{teamId}`        | チーム詳細取得                                     |
| `PATCH`  | `/api/admin/teams/{teamId}`        | チーム更新                                         |
| `DELETE` | `/api/admin/teams/{teamId}`        | チーム削除                                         |
| `GET`    | `/api/admin/teams/{teamId}/stores` | チーム別店舗情報取得                               |
| `GET`    | `/api/admin/assignments`           | 通常割り当て一覧取得（year / formId 指定可）       |
| `GET`    | `/api/admin/members`               | フォーム回答由来のメンバー一覧取得（年度指定可能） |
| `GET`    | `/api/admin/current-year-total`    | 当年度店舗履歴取得                                 |

#### アンケートフォーム関連

| メソッド | エンドポイント                  | 説明                                         |
| -------- | ------------------------------- | -------------------------------------------- |
| `GET`    | `/api/forms`                    | フォーム一覧取得（管理者用、1年度1フォーム） |
| `POST`   | `/api/forms`                    | フォーム作成                                 |
| `GET`    | `/api/forms/{formId}`           | フォーム詳細取得                             |
| `PATCH`  | `/api/forms/{formId}`           | フォーム更新                                 |
| `DELETE` | `/api/forms/{formId}`           | フォーム削除                                 |
| `GET`    | `/api/forms/{formId}/responses` | 回答一覧取得（管理者用）                     |
| `POST`   | `/api/forms/{formId}/responses` | 回答送信（availableSlots）                   |

---

## UI/UX 設計概要

### 一般ユーザー画面

1. **ログインコード入力画面** (`/`)
   - ログインコード入力フィールド
   - 注意事項表示

2. **配布管理ダッシュボード** (`/dashboard`)
   - **インテリジェント店舗リスト**: 担当＋周辺区域の自動表示
   - **五十音順ソート**: 店名→住所の常時ソート適用
   - **多段階フィルタ**: 区域・配布状況・キーワード検索
   - **配布状況更新**: ワンタップで状況変更
   - **手動店舗追加**: カナ自動生成機能付き
   - **リアルタイム進捗**: 完了率・残り件数表示

3. **全体ダッシュボード** (`/dashboard/all`)
   - **全区域表示**: すべての班の配布状況確認
   - **他班配布状況**: 班を跨いだ配布状況の確認

### 管理者画面

1. **管理者ログイン** (`/admin`)
   - Firebase認証（sub.kanazawa-it.ac.jp ドメイン限定）

2. **年度一覧** (`/admin/event`)
   - 年度別イベント管理・作成・編集・削除
   - 過去年度へのアクセス

3. **年度別管理画面** (`/admin/event/[year]`)
   - 全体統計表示（班別進捗・完了率）
   - チーム管理（作成・ログインコード発行）
   - リアルタイム進捗監視

4. **専門管理画面**
   - **チーム管理** (`/admin/event/[year]/team`) - チーム一覧・作成
   - **チーム詳細** (`/admin/event/[year]/team/[teamId]`) - 個別チーム管理
   - **フォーム管理** (`/admin/event/[year]/form`) - アンケート作成・管理
   - **統計レポート** (`/admin/event/[year]/stats`) - 年次統計・チーム分析
   - **配布ダッシュボード** (`/admin/event/[year]/dashboard`) - 班認証での配布管理

---

## 開発・デプロイ

### Makefile による開発コマンド

このリポジトリでは、よく使う開発コマンドを `Makefile` にまとめています。`make <target>` で実行できます。

#### 使える target

- `make up`: Docker Compose で起動します
- `make dev`: npm で開発サーバーを起動します
- `make build`: Next.js の本番ビルドを実行します
- `make fmt`: Prettier でコード整形を行います
- `make lint`: ESLint を実行します
- `make test`: 現状は build による検証を行います
- `make ci`: `format:check -> lint -> test` をまとめて実行します
- `make admin`: Firebase Admin SDK を使って管理者ユーザーを作成します。パスワードは対話入力です

#### admin の使い方

`admin` は API サーバーを起動していなくても使えます。`FIREBASE_ADMIN_PROJECT_ID` / `FIREBASE_ADMIN_CLIENT_EMAIL` / `FIREBASE_ADMIN_PRIVATE_KEY` が `.env` に入っている前提です。  
`ADMIN_EMAIL` は環境変数か `make` の引数で渡し、`ADMIN_PASSWORD` は入力プロンプトで渡します。

```bash
make admin ADMIN_EMAIL=admin@sub.kanazawa-it.ac.jp
```

#### 補足

`make -n <target>` を付けると、実行せずに展開されるコマンドだけを確認できます。

```bash
make -n ci
make -n admin ADMIN_EMAIL=admin@sub.kanazawa-it.ac.jp
```

### インフラ

| 項目           | サービス                |
| -------------- | ----------------------- |
| フロントエンド | Next.js + React         |
| データベース   | Firebase Firestore      |
| 認証           | Firebase Authentication |
| ホスティング   | Vercel                  |
| 検索・ソート   | フロントエンド実装      |

### 開発環境セットアップ

#### 必要なアカウント・設定

1. **Google Cloud Console**
   - プロジェクト作成
   - APIキー発行・制限設定

2. **Firebase Console**
   - プロジェクト作成
   - Authentication設定
   - Firestore設定

3. **Vercel Account**
   - GitHub連携設定
   - 環境変数設定

### データプライバシー

**収集データ**

- 店舗情報（名称、住所、位置情報）
- 配布状況・統計データ
- 参加者情報（名前、学年、所属セクション）

**データ保護**

- Firebase セキュリティルールによるアクセス制御
- 学外配布日のみデータアクセス可能
- 個人情報の最小限収集

---

## 文書情報

**最終更新**: 2026年6月20日  
**作成者**: 工大祭実行委員会  
**文書バージョン**: 1.2
