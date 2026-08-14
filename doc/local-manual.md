# ローカル開発マニュアル

このページは、初めてこのシステムを起動する人向けの手順です。

ローカル環境では本番 Firebase は使用せず、Firebase Emulator を使用します。各自のPCにデータが保存されるため、他の開発者のデータには影響しません。

## 1. 最初に準備するもの

必要なものは次のとおりです。

- macOS: Docker Desktop、Node.js、npm、npx
- WSL: Docker が利用できる WSL、Node.js、npm、npx

ツールがない場合は、OS に合わせて次を実行します。

macOS:

```bash
make init/mac
```

WSL/Linux:

```bash
make init
```

macOS で Docker Desktop がインストールされた場合は、インストール後に Docker Desktop を起動してください。WSL で Docker Desktop を使用する場合は、Docker Desktop の Settings → Resources → WSL Integration で対象の WSL を有効にしてください。

## ２. 起動方法

### 方法A: Docker だけで起動する（推奨）

アプリと Firebase Emulator をまとめて Docker で起動します。

```bash
make up
```

初回起動時は Docker イメージや Emulator のファイルをダウンロードするため、時間がかかることがあります。次の表示が出れば Firebase Emulator は起動しています。

```text
All emulators ready! It is now safe to connect your app.
```

### 方法B: Firebase は Docker、Next.js はローカルで起動する

Next.js のコードをローカルで確認したい場合は、次を実行します。

```bash
make dev
```

`make dev` は、Firebase Emulator だけを Docker で起動したあと、ローカルの Node.js で Next.js を起動します。内部で `npm run dev` 相当の処理を行います。

Firebase Emulator だけを先に起動したい場合は、次を実行します。

```bash
make updb
```

その後、別のターミナルで `make dev` を実行します。通常は `make dev` だけで問題ありません。

## 3. ブラウザでアクセスする URL

アプリを起動したら、ブラウザで次の URL を開きます。

| 用途                          | URL                               |
| ----------------------------- | --------------------------------- |
| アプリ                        | http://localhost:3000             |
| 管理者ログイン                | http://localhost:3000/admin/login |
| Firebase Emulator 管理画面    | http://localhost:4000             |
| Auth Emulator の管理画面      | http://localhost:4000/auth        |
| Firestore Emulator の管理画面 | http://localhost:4000/firestore   |

Firebase Emulator 管理画面では、作成したユーザーや Firestore のデータを確認できます。

## 4. 管理者ユーザーを作成する

初回は、アプリへログインするための管理者ユーザーを作成します。アプリまたは Emulator が起動している状態で、別のターミナルから次を実行してください。

```bash
make admin
```

画面の指示に従って、次の順番で入力します。

1. メールアドレス
2. パスワード
3. 管理者名

パスワードは入力中に画面へ表示されません。

メールアドレスは、学校のメールアドレス（`*@*.kanazawa-it.ac.jp` のドメイン）を使用してください。例えば次のような形式です。

```text
c1234567@st.kanazawa-it.ac.jp
```

開発環境では本番 Firebase の認証情報がないため、自動的に Emulator へユーザーが作成されます。作成後、次のページからログインしてください。

```text
http://localhost:3000/admin/login
```

`.env` などの環境ファイルが存在する場合は、Firebase への接続先確認が表示されます。開発用 Emulator を使用することを確認して `y` を入力してください。空入力や `y` 以外を入力すると処理は中止されます。

## 5. ローカル環境での利用について

ローカル環境は各自専用の環境です。テストデータの登録、編集、削除などは基本的に自由に行えます。他の開発者のローカル環境には影響しません。

## 6. データを残して停止・再起動する

アプリを停止する場合は、起動中のターミナルで `Ctrl + C` を押すか、別のターミナルで次を実行します。

```bash
make down
```

`make down` では Docker volume を削除しないため、ユーザーや Firestore のデータは残ります。

## 7. ローカル環境を初期化する

依存関係や生成物だけを削除し、Firebase のデータを残す場合:

```bash
make clean
make install
```

Firebase Emulator のユーザーや Firestore のデータも含め、すべて最初からやり直す場合:

```bash
make clean/all
make install
```

`make clean/all` は Docker の名前付き volume を削除します。作成した管理者ユーザー、Firestore のデータ、Emulator のデータは復元できないため、必要な場合だけ実行してください。

## 8. よくある問題

### `localhost:3000` にアクセスできない

次を確認してください。

1. `make up` または `make dev` を実行しているか
2. ターミナルに `Ready` と表示されているか
3. Docker Desktop が起動しているか

### `localhost:4000` にアクセスできない

Firebase Emulator が起動していない可能性があります。次を実行してください。

```bash
make updb
```

その後、http://localhost:4000 を開きます。

### 管理者ログインができない

`make admin` をもう一度実行し、学校メールアドレスでユーザーを作成してください。それでも動かない場合は、データを初期化してから再作成します。

```bash
make clean/all
make install
make up
make admin
```

## 9. 本番環境について

本番 Firebase の設定や本番用管理者の作成は、このローカル開発手順では行いません。本番環境を操作する必要がある場合は、リポジトリの `.env.example` と通常の `MANUAL.md` を確認してください。

## 10. make コマンド一覧

| コマンド       | 機能                                                              |
| -------------- | ----------------------------------------------------------------- |
| make help      | makeの使えるコマンドを表示する                                    |
| make init      | WSLの開発環境を整える。（Node.js, npm, npxをインストールする）    |
| make init/mac  | macの開発環境を整える。（Node.js, npm, npxをインストールする）    |
| make install   | 依存関係をインストールする。                                      |
| make up        | web環境とFirebase Emulatorをdockerを用いてまとめて起動する。      |
| make updb      | Firebase Emulatorのみを起動する。                                 |
| make down      | 起動したアプリを停止する。                                        |
| make dev       | make updbでFirebase Emulatorを起動した後に、npmを用いて起動する。 |
| make build     | Next.jsのプロダクションビルドを実行する。                         |
| make fmt       | Prettierのフォーマットを実行する。                                |
| make lint      | ESLintの実行する。                                                |
| make test      | ビルド検証を実行する。                                            |
| make ci        | フォーマットチェック、lint、テストを実行する。                    |
| make admin     | 管理者ユーザーを作成する。                                        |
| make clean     | ローカルの依存関係・ビルド・テスト生成物を削除する。              |
| make clean/all | make clean に加えて Docker volume を削除する。                    |
