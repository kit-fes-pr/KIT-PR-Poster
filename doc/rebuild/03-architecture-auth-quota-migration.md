# 共通アーキテクチャ・Clerk認証・Firestore上限対策・移行計画
版: 1.0 / 2026-10-31 / ステータス: 再構築の提案

## A. 障害の事実と未確定点
ユーザーから「2026年度、Firebaseの読み取りまたは書き込み上限に達したようで、途中からデータを入力できなくなった」との申告がある。Firestoreの無料枠（Standard Edition）は読み取り50,000件/日、書き込み20,000件/日、削除20,000件/日、保存1GiB。日次枠は太平洋時間の午前0時頃にリセット。利用上限到達は有力仮説だが、当日のFirestore使用量・エラーログ未確認のため断定しない。
確認先: Firebase Console > Firestore Database > Usage、Google Cloud Console > Quotas / Metrics、Vercel Functions Logs。異常時刻の読み取り数・書き込み数・429/RESOURCE_EXHAUSTED/403/500・発生APIを照合。課金設定やルール変更も併せて確認。
公式資料: https://firebase.google.com/docs/firestore/quotas

### 旧実装で確認した要因と影響
1. GitHub Issue #72「フォーム管理ページで常時保存と保存中を繰り返す」2026-06-30クローズ。初期不具合は修正されたが、類似の保存ループを自動テストで回帰防止すべき。#71ではプレビュー操作による不要な保存も報告されていた。
2. `lib/hooks/useRealtimeData.ts` は画面レンダー時に新規生成した filters/swrKeys 配列をeffect依存にする構成で、同じ内容でも再購読が発生し得る。Firestore onSnapshotの初回スナップショット・再購読がリードを増やす可能性がある。
3. `app/api/stores/route.ts` は年度や条件ごとにFirestoreのstoresを一括取得し、年次履歴の追加照会も行う。閲覧件数が増えるほど読み取り量が増加する。
4. `app/api/stores/route.ts` POSTが geocodeAddress(外部Nominatim) を待ってから Firestore に保存。住所検索側の遅延/失敗が保存体験を妨げる可能性がある。
5. APIでFirestore例外を一般的な500エラーに丸めるため、利用者が上限超過・認証・ネットワークエラーを区別しにくい。
上記はコードに基づくリスクであって、本番で上限到達した原因の確定ではない。

## B. アーキテクチャ・独立性
二つの独立したアプリ・独立したDB・独立したデプロイ。
```text
team.example.jp                     poster.example.jp
 KIT Team Manager                    KIT Poster Manager
 Next.js / Clerk auth                 Next.js / Clerk auth
  └─ Team PostgreSQL (Neon)           └─ Poster PostgreSQL (Neon)
          |                                      ^
          +-- CSV/JSON版付きエクスポート ---------+
                   署名付きAPIは第2段階
```
例示ドメインは仮名。二つのアプリが同じClerk Application / Production Instanceと配下ドメインを使い、Clerk上の同一userIdを識別する。各アプリは自分のmemberships/roleテーブルを使って認可する。Clerkにログインできる=両アプリの業務権限がある、ではない。
サブドメイン間セッション共有はClerkの本番ルートドメイン設定に依存するため、セットアップ時に本番ドメイン・許可サブドメイン・CSRF対策・Authorized Partiesを確認する。別ルートドメインはsatellite設定が必要。
Clerk参考: https://clerk.com/docs/nextjs/getting-started/quickstart
共有ドメイン: https://clerk.com/docs/guides/development/deployment/production

## C. Clerkの導入（新アプリ）
1. 二つの独立したNext.js 16プロジェクトを用意。いずれもClerk公式CLIの`npx -y clerk@latest init`で導入。既存のFirebase Authは元リポジトリでは維持し、並行移行とする。新アプリではFirebase SDKは使わない。
2. Clerk publishable keyとsecret keyは環境変数、`CLERK_SECRET_KEY`をGitHubにコミットしない。
3. `proxy.ts`に`clerkMiddleware()`。保護対象は明示設定し、Route Handlerでは`await auth()`でユーザーID確認後、PostgreSQLのロールと年度・班権限を検証。サーバーだけがデータを書き込む。
4. サインイン/サインアウト/招待/退会/セッション失効、Clerk webhook署名検証と冪等処理を実装。
5. 管理者は招待制。一般フォーム回答は業務要件に応じ公開、フォーム送信時はCAPTCHA・rate limit・匿名/本人紐付けを別設計。
6. 班員に共有班コードだけを配る仕組みをやめ、個別Clerkログイン→招待リンク→承認済みteamMembership。招待リンクは期限・再利用制限を持ち、ログイン中のメールと一致確認。班ログインコードを平文でURL/QRに埋め込まない。
7. 旧Firebase Authのパスワードは取得/移行しない。管理者と配布班利用者へ招待し直す。イベント直前は既存サービスと新サービスを同時運用し、移行検証後切替。

## D. 保存・読み取りを減らす仕様
- フォームの「表示」「プレビュー」「変更なしの再レンダー」では絶対に書き込みなし。
- 入力欄は`isDirty`と差分判定し、明示保存優先。オートセーブならデバウンス+保存中ロック+同一内容抑止。
- 店舗一覧の更新は無条件のFirestore `onSnapshot`再購読ではなく、PostgreSQLの条件付きGET・カーソルページング・ETag・短い再検証間隔。必要な最小限の件数/列だけ返す。
- 更新系は1操作1トランザクション、 idempotency-key で再送重複防止。成功時のみSWRキャッシュを更新する。
- 地図の住所検索・全件ジオコーディングは保存APIから分離し、レート制限/負荷分離を実装。
- 開発・テストは本番データベースにつなげない。stagingデータと本番データを分離。パフォーマンス・read/write回数の監視を用意。
- 429/503/ネットワーク障害のとき入力内容を失わない。保存待ちをIndexedDBに保持し、オンライン復帰・アプリ再表示後に再送する。
- DBクエリ・接続数・料金のアラートを設定。ただし予算アラートは自動停止を保証しない。プロバイダのハード制限/従量制条件を確認。

## E. 移行計画・データ保護
1. Firebaseから **読取専用** エクスポート（events, teams, forms, responses, assignments, stores, areas）、既存データ件数とchecksum記録。元データのバックアップを確保。
2. Team Managerにparticipant/form/team/assignments等を取り込み。個人情報は必要最小限にし、閲覧制御。
3. Poster Managerにstoreと各年度の配布記録を取り込み。店舗名＋住所の同一性候補を提示し、人間が確認して店舗を統合。自動名寄せだけで誤結合しない。
4. 旧teamCodeを外部参照IDとして保存し、Clerk上のユーザーIDと本人の配布班を再紐付けする。
5. 一時的に二重管理すると更新競合が起こるため、正式な切替時刻を決め、新システムへの切替後は旧システムを読み取り専用に変更。
6. 同一件数・重要レコード・年度ごとの配布枚数・統計値を突合、PDF/CSVの比較、監査。
7. 復旧手順: 新システム不調時は手元の同期済CSV/未送信キューと旧読み取り専用情報を使う。未同期の手入力データを破棄して切替しない。
8. 2026年度データに対する任意の削除Actions/コマンドは実行せず、保存・参照を優先。

## F. 作業手順
Phase 0: Firestore使用量とエラーログで原因診断、ループ/クエリ計測。
Phase 1: 2仕様書を確定、2つの新リポジトリ（または独立appsを持つmonorepo）作成。
Phase 2: Clerk/DB/CI/権限を構築、接続確認。
Phase 3: Team Managerを実装、過去データの移行と70回答/11班テスト。
Phase 4: Poster Managerを実装、オフライン保存/再送/重複防止/競合検証。
Phase 5: テスト/運用引継ぎ/段階切替/監視。
本PRは仕様書と限定的な既存コードの保全改善のみ。新アプリの認証・DBデプロイ・フル実装・本番切替は別作業。
