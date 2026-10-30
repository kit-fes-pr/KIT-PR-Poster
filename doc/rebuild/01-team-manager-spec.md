# KIT Team Manager — 再構築仕様書
版: 1.0 / 2026-10-31 / ステータス: 実装前の提案仕様

## 1. システムの目的・責務
工大祭の学外ポスター配布に参加するメンバーを募集し、参加可能日時・所属・学年・運転可否から班を編成する独立したWebアプリケーション。参加者、日時、班、配属、出力履歴だけを管理する。店舗データ、配布枚数、地図上の店舗更新は持たない。

### 想定業務
年度作成→配布日時登録→フォーム公開→回答収集→班・必要人数・区域の設定→自動編成→手動修正→確定→PDF/CSV出力→別システムへ必要最小限の班情報を連携。

### 非対象
店舗登録・地図・配布可否・ポスター回収・店舗別年度履歴。これらはKIT Poster Managerの責任。

## 2. ユーザー・権限
| ロール | 権限 |
| --- | --- |
| system_admin | Clerk招待、年度作成・削除、監査閲覧、全データ管理 |
| coordinator | 指定年度のフォーム管理、回答閲覧、班編成、確定、出力 |
| team_leader | 確定した自班の割当と日時のみ閲覧 |
| participant | 自分の回答提出・訂正、割当確認（公開設定による） |
| public | 公開された回答フォームのみアクセス可能 |

Clerkで本人確認。役割と年度スコープはサーバー側PostgreSQLのmembershipsテーブルで管理し、UI非表示のみで権限を代用しない。個人メールは本人認証用とし、管理操作は招待されたアカウントに限定。一般回答フォームはURLでアクセス可能とするが、bot対策・レート制限・重複対策を行う。参加者自身にClerk登録を必須にするかはフォーム利用障壁を踏まえた運用オプションとし、管理者ログインには必須。

## 3. 機能要件
| ID | 優先 | 機能 | 受入条件 |
| --- | --- | --- | --- |
| T-01 | P0 | 年度・イベント管理 | 年度、名称、開始終了日、JSTの午前午後枠を設定でき、年度ごとに完全分離される |
| T-02 | P0 | フォーム作成・公開 | 氏名（姓・名）、ふりがな、学年、セクション、参加枠、運転可否、備考を受付 |
| T-03 | P0 | 回答管理 | 一覧・検索・重複候補表示・管理者修正・CSVダウンロードができる |
| T-04 | P0 | チーム管理 | 班名、配布枠、区域識別子、定員、必要運転者数、学年優先条件を設定 |
| T-05 | P0 | 自動割当 | 参加可能枠、重複禁止、班定員、運転者要件を満たす割当を生成 |
| T-06 | P0 | 手動割当 | ドラッグまたは選択で再配置、希望外日時は警告し権限付き例外承認を要求 |
| T-07 | P0 | 班長・運転者 | 班長候補・運転者候補を表示し管理者が確定、未配置班は赤色警告 |
| T-08 | P0 | 確定・出力 | 班一覧、配布日・時間、班長・運転者を含むPDF/CSV。1班をPDFページ間で分割しない |
| T-09 | P0 | 永続化 | 保存結果をサーバーで確認するまで完了表示しない。失敗時に編集内容を保持 |
| T-10 | P1 | 履歴・統計 | 年度間の参加人数、班数、配置率、運転者充足率を比較 |
| T-11 | P1 | 連携出力 | Poster Managerへ班ID・班名・枠・区域・担当者の必要最小限のみ出力 |
| T-12 | P1 | 監査 | 割当変更・確定・CSV出力の操作者、日時、対象、理由を記録 |

## 4. 自動割当仕様
入力: 参加者集合、参加可能枠、各班の対象枠・定員・必要運転者数・学年指定、確定済み割当。
ハード制約: 利用可能枠一致、定員上限、同一時刻での二重割当禁止、無効・辞退者除外。運転必須班は運転可能な人を少なくとも必要人数確保できなければ確定不可。
ソフト制約: 班ごとの学年・所属バランス、参加可能枠の少ない人を優先、上級生配置、担当希望。ソフト制約の未達は理由付き警告とし、ハード制約未達を黙って許容しない。
初期MVPは再現可能な決定的貪欲法（同点は安定ID順）。割当の品質評価指標と未割当理由を返す。最適化ソルバー導入は計測後に検討。
班長候補: 既存仕様の「PR所属3年生を優先、それ以外は最上級生」を初期設定にし、年度ごとに管理者がルール変更可能。自動選出と最終確定は分離。
手動で複数枠に同一人物を配置する場合は時間重複しないことをサーバー検証。自動割当は既定で1人1枠。

## 5. UI/ルート
- /sign-in, /sign-up : Clerk認証（招待制管理者、必要に応じ参加者）
- /events : 年度イベント一覧
- /events/[year]/overview : 参加・割当統計
- /events/[year]/forms : フォーム作成・公開・回答一覧
- /events/[year]/participants : 参加者検索・編集
- /events/[year]/teams : 班設定、定員、日時、区域
- /events/[year]/assignments : 自動割当、手動修正、警告、未割当
- /events/[year]/exports : PDF/CSVと連携用スナップショット

## 6. データモデル（PostgreSQL、UUIDを主キー）
- events(id, year UNIQUE, name, start_at, end_at, status, version, created_at)
- event_slots(id, event_id FK, local_date, period ENUM(am,pm), starts_at, ends_at, UNIQUE(event_id,local_date,period))
- forms(id, event_id FK, title, schema_json, public_token_hash, status, version)
- participants(id, event_id FK, name, name_kana, grade, section, can_drive, contact_optional, status)
- availability(id, participant_id FK, slot_id FK, UNIQUE(participant_id,slot_id))
- teams(id, event_id FK, slot_id FK, team_code, name, area_external_key, max_members, required_drivers, version, UNIQUE(event_id,team_code))
- assignments(id, participant_id FK, team_id FK, slot_id FK, source, override_reason, status, version)
- team_roles(id, team_id FK, participant_id FK, role ENUM(leader,driver))
- memberships(id, clerk_user_id, event_id nullable, role, UNIQUE(clerk_user_id,event_id,role))
- export_snapshots(id, event_id, schema_version, revision, checksum, created_by, created_at)
- audit_logs(id, actor_clerk_user_id, event_id, action, subject_type, subject_id, before_json, after_json, created_at)

DB制約・トランザクションで班定員と時間衝突を検査する。確定時にassignmentsをロックし、版番号を更新する。PIIはエクスポート先・保管期限を制限。バックアップ・復元を定期検証。

## 7. API契約（Route Handlers）
- GET/POST /api/events
- GET/PATCH /api/events/:eventId
- GET/POST /api/events/:eventId/forms
- POST /api/public/forms/:token/responses（公開、レート制限と重複対策）
- GET/PATCH /api/events/:eventId/participants/:id
- GET/POST/PATCH /api/events/:eventId/teams
- POST /api/events/:eventId/assignments/preview（副作用なし）
- POST /api/events/:eventId/assignments/commit（If-Match / version、冪等キー必須）
- PATCH /api/events/:eventId/assignments/:id
- POST /api/events/:eventId/finalize
- GET /api/events/:eventId/exports?type=pdf|csv|integration

全書込API: Clerkセッション→DBロール→入力検証(Zod)→DBトランザクション→監査→応答。422入力不正、401未認証、403権限不足、409バージョン衝突、429制限、503一時障害。例外のスタックトレースをクライアントへ返さずrequestIdを付与。

## 8. 技術・非機能
Next.js 16 App Router / TypeScript / Tailwind CSS / Clerk / PostgreSQL（Neonを第一候補、管理分離）/ Drizzle ORM / Zod / pdf-lib / VitestまたはNode test / Playwright / Vercel。Clerkのproxy.tsとサーバー側auth()を利用する。Next.js 16ではmiddleware.tsではなくproxy.ts。
管理画面P95表示3秒以内（平常時・目安）、DB書込成功時2秒以内（外部住所検索なし）、操作の二重送信防止、WCAG 2.2 AAを目標、日本語UI、スマホ対応、JSTとUTC保存を区別。
毎操作の自動保存を禁止。変更検出・明示保存またはデバウンスを使用し、同一内容を繰り返し送信しない。

## 9. 受入テスト
- 70回答/11班のモックで自動編成し、希望日時外・定員超過・同時刻重複が0件。
- 運転必須班に運転可能者がいない場合、未確定の理由を明示。
- 複数管理者が同じ班を変更したとき409を返し、一方の変更を消さない。
- 送信を2回押しても同じ回答/割当を二重作成しない。
- 権限のないClerkアカウントから全変更APIに403。
- PDFに班と配布日時が表示され、年度をまたいで情報混在なし。
- 他方のPoster Managerが停止しても募集・編成・CSV出力を継続できる。

## 10. MVP実装順
認証とRBAC→DBマイグレーション→イベント/フォーム→班管理→自動・手動割当→エクスポート→監査・負荷試験。連携はまずCSVで独立稼働を検証し、次段階でサーバー間の署名付きAPIに拡張。
