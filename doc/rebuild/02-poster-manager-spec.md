# KIT Poster Manager — 再構築仕様書
版: 1.0 / 2026-10-31 / ステータス: 実装前の提案仕様

## 1. システムの目的・責務
工大祭のポスターを大学周辺店舗へ配布する現場業務に特化した、スマートフォン優先の独立したWebアプリケーション。店舗マスタ、区域、年度別訪問/配布実績、地図、進捗、回収、統計を所有する。参加可否アンケート、自動班編成、名簿管理は持たない。

### 典型フロー
年度作成→配布区域・店舗を登録/CSV取込→班情報をTeam Managerから取込（または手動作成）→Clerkログイン→担当区域で訪問記録→進捗共有→未処理・回収案件を追跡→年度別の履歴を確認。

## 2. 権限
| ロール | 可能な操作 |
| --- | --- |
| system_admin | 年度、店舗、区域、班アクセス、データ移行、監査、削除 |
| distribution_manager | 指定年度の配布区域、配布班、店舗、統計、CSV管理 |
| team_member | 所属班の担当・周辺区域の閲覧と許可範囲内の店舗登録・配布状況更新 |
| viewer | 許可された年度の集計、店舗閲覧のみ |

ログインは全内部利用者がClerkアカウントを使用。旧「同一班コード共有・一時Firebaseユーザー発行」は廃止し、招待URL→Clerkログイン→サーバーDB上のチーム紐付け方式に変更。共有端末ではサインアウトを明示しセッション有効期限を運用管理。クライアントの任意のteamIdだけで権限を認めない。

## 3. 店舗と配布のデータ設計
店舗そのものと年度ごとの配布記録を分離する。2025と2026で同じ店舗に配布した場合は「店舗1件 + 年度配布記録2件」とする。複数店舗の同名重複も住所・位置・管理者レビューで解決。

| テーブル | 主な項目・制約 |
| --- | --- |
| events | id(UUID), year(UNIQUE), name, starts_at, ends_at, status |
| stores | id(UUID), name, name_kana, address, latitude?, longitude?, normalized_address, active, created_at, updated_at |
| areas | id, event_id, code, name, geometry_json?, UNIQUE(event_id,code) |
| event_stores | id, event_id, store_id, area_id?, status, distributed_count, failure_reason?, requires_pickup, notes, version, UNIQUE(event_id,store_id) |
| teams | id, event_id, external_team_id?, name, slot_key, area_id?, status, import_revision |
| team_memberships | id, team_id, clerk_user_id, role, UNIQUE(team_id,clerk_user_id) |
| distribution_logs | id, event_store_id, team_id, actor_clerk_user_id, before_json, after_json, recorded_at, request_id UNIQUE |
| pickup_tasks | id, event_store_id, status, assignee_team_id?, due_at? |
| import_jobs | id, event_id, source, checksum, processed, failed, status, created_at |
| audit_logs | id, actor_clerk_user_id, action, subject_id, request_id, created_at |
| outbox_receipts | id, client_mutation_id UNIQUE, operation, payload_hash, response_json, created_at |

列挙値: 配布status = pending（未配布）/ completed（配布済）/ failed（配布不可）/ revisit（再訪問）。回収が必要かどうかはrequires_pickupで別管理し、配布済みでも回収待ちを表現可能にする。
失敗理由: absent / refused / closed / other。配布枚数は整数0以上、completedは原則1以上。イベント中の重複配布防止のためUNIQUE(event_id,store_id)を実装。

## 4. 機能要件
| ID | 優先 | 要件 | 受入条件 |
| --- | --- | --- | --- |
| P-01 | P0 | 年度・配布枠 | 年度切替でも他年度を変更しない。過去年度は既定で読み取り専用 |
| P-02 | P0 | 店舗マスタ管理 | 店名・住所・位置情報・カナ検索・重複候補・修正 |
| P-03 | P0 | 店舗配布状況 | 配布日時、枚数、対応した班、備考、不可理由を記録 |
| P-04 | P0 | 区域・班管理 | 配布区域と班の割当。Team Managerが使えないとき手動登録可能 |
| P-05 | P0 | 地図 | MapLibre GL JS、OpenFreeMap、現在地、状態色分け、店舗検索 |
| P-06 | P0 | 一覧・検索 | 五十音順、区域・状態・班・店舗名/住所でフィルター |
| P-07 | P0 | 重複防止 | 同一店舗の年度内重複記録を防ぎ、競合時に変更内容を確認できる |
| P-08 | P0 | オフライン耐性 | 電波断で未送信操作をデバイスに保持し、再接続後に再送・確認できる |
| P-09 | P0 | 可視化 | 班別進捗、完了率、再訪問、回収必要件数を表示 |
| P-10 | P0 | CSV | 事前検証・重複プレビュー付き店舗取込と年度別データ出力 |
| P-11 | P0 | 操作履歴 | 誰がいつ何を変更したか確認、履歴は追記専用 |
| P-12 | P1 | 回収タスク | 必要店舗からのポスター回収ステータスを管理 |
| P-13 | P1 | 年度横断閲覧 | 同一店舗の過去の訪問・配布履歴をタイムライン表示 |
| P-14 | P1 | PDF | 班別配布マニュアル・地図URLのQRと日時を出力 |

## 5. 配布記録の保存保証 — 最重要要件
店舗登録APIは店舗名・住所・状態など最低限の必須項目をDBトランザクションで保存し、住所ジオコーディング/地図読み込み/外部サービス応答を待たない。緯度経度の補完はキューまたは個別APIで非同期実行。外部検索障害が配布記録の保存を止めてはならない。
フロントは保存要求ごとにUUID clientMutationIdを生成し、IndexedDBに先に操作内容と送信状態を書き込む。状態は「未送信」「送信中」「サーバー保存済み」「要確認」「失敗」。保存済み表示はサーバーがコミットし、返答を受けたときのみ。
ネットワーク断・503・タイムアウトでは指数バックオフ（ジッター付き）。同じclientMutationIdで再送し、DB側UNIQUEにより二重処理防止。401/403/422/409は無限再試行せず操作を要確認へ。
更新はIf-Match/versionで競合検出し409を返す。二人が同一店舗を同時編集した際、上書きせず差分・管理者承認を表示する。オフラインの端末ローカル保存には個人情報を必要以上に残さず、共有端末でのクリア、保持期限、暗号化・OS保護の適用可否を検討する。
管理画面には未送信件数・最終同期日時・障害状態・CSV緊急退避を表示。緊急退避データにはチームと日時・操作IDを含め、復旧後インポートできるようにする。

## 6. UI/ルート
- /sign-in : Clerkログイン
- /events : 年度切替
- /events/[year]/dashboard : 全区域の集計と進捗
- /events/[year]/stores : 店舗一覧/検索/登録・編集
- /events/[year]/map : 地図/現在地/ピン/フィルター
- /events/[year]/areas : 区域・班の割当
- /events/[year]/teams/[teamId] : 班の配布対象・履歴
- /events/[year]/history : 年度別・店舗別配布履歴
- /events/[year]/imports : CSV取込、連携スナップショット
- /events/[year]/reports : CSV/PDF/統計
- /sync : 未送信キューの確認・再送・CSV退避（オフライン時も開ける）

## 7. API仕様
- GET/POST /api/events
- GET/POST /api/events/:eventId/stores?cursor=&area=&status=&q=
- GET/PATCH /api/events/:eventId/stores/:storeId
- POST /api/events/:eventId/distributions : {storeId, status, count, failureReason, requiresPickup, expectedVersion, clientMutationId}
- GET /api/events/:eventId/distributions/:id/logs
- GET/POST /api/events/:eventId/teams
- POST /api/events/:eventId/team-imports : 署名検証済みsnapshot
- POST /api/events/:eventId/imports/stores : CSVファイル解析ジョブ
- GET /api/events/:eventId/metrics
- POST /api/geocoding/jobs : 保存と独立、負荷制限
- GET /api/health : DB ping (非機密)

読み取りはカーソル式ページング・適切なDBインデックスを使用し、全店舗全年度の毎回取得を避ける。全書込APIでClerk本人確認、年度・班単位認可、Zod検証、DBトランザクション、冪等記録、監査を一括実行。

## 8. 技術・構成
Next.js 16 / TypeScript / Tailwind CSS / Clerk / PostgreSQL（Neon第一候補、Team Managerと別DB）/ Drizzle / Zod / MapLibre GL JS / OpenFreeMap / IndexedDB（idbなど）/ PWA Service Worker / Vercel / GitHub Actions。
バックグラウンド同期APIは端末/OSによって利用できない場合があるため、再起動時・再接続時・画面復帰時の明示的な送信再開も実装する。位置情報許可を拒否しても店舗手入力ができる。不要な位置追跡は行わない。
書き込み監視: HTTP status、DBエラー分類、requestId、処理時間、未同期キュー件数、429/503率、運用アラート。DBの上限/料金も監視し、月次利用料の上限を設定。バックアップの日次取得と復元テストを行う。
テスト: 単体・契約・API・Playwright（PC/スマホ）・DB統合・複数端末競合・オフライン/復帰・負荷・災害復旧。

## 9. Team Managerとの連携
依存なしで手動班作成可。基本はTeam Managerから {schemaVersion, eventYear, exportId, revision, generatedAt, teams:[{externalTeamId,name,slotKey,areaCode,members:[{clerkUserId?,displayName?,role?}]}]} をCSV/JSONで取得。初期はCSVファイル手動取込、第二段階でサーバー間署名付きAPI。連携データの目的外利用禁止、必要最小限の個人情報のみ。重複importはchecksumとrevisionで防ぎ、班IDはexternalTeamIdで突合。連携不能でも既存班と配布作業を維持する。

## 10. 受入テスト
1. 配布中に住所検索APIが30秒応答しなくても店舗保存は成功する。
2. ネットワーク遮断中に店舗を3件登録し、再接続後にちょうど3件がサーバーに保存される。
3. 同じclientMutationIdを10回送っても履歴は1回分のみ。
4. 2人の競合更新は409で差分確認でき、黙った上書きは発生しない。
5. 年度2025/2026の同一店舗が1つの店舗カードにまとまり、履歴は2年分残る。
6. Team Manager停止中もClerk認証済みの班員は店舗の閲覧と記録ができる。
7. 地図が読み込めず現在地が許可されなくても一覧・入力が使える。
8. APIが一時的に503でも、入力中の内容が消えず、利用者に未同期が明示される。

## 11. MVP順序
認証/RBAC→PostgreSQL店舗・年度モデル→登録・更新の冪等化→現場一覧→IndexedDB送信キュー→地図→CSV/履歴→監査・負荷試験→班連携。現場での保存保証を地図機能より先に完成させる。
