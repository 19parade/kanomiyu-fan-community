# かのうみゆファンコミュニティ 開発仕様書

- ドキュメント種別: 開発仕様書（実装者向け）
- ステータス: Draft v1.25
- 対象読者: Claude Code（実装担当）、ChatGPT（企画・設計担当）

---

## 1. プロジェクト概要

### 1.1 プロジェクト名
かのうみゆファンコミュニティ（非公式）

### 1.2 目的
かのうみゆの非公式ファンコミュニティサイトを構築する。

単に公式発表・ニュース・LIVE情報などを集約する「まとめサイト」ではなく、

> 「かのうみゆを知る場所」から「かのうみゆを好きな人と出会える場所」へ

というコンセプトを軸に、ファン同士が交流し、つながりを持てる場を提供することを目的とする。

### 1.3 コンセプトが実装判断に与える影響
機能やUIの優先度を判断する際は、以下を基準にする。

- 情報を「見る」機能より、ファン同士が「関わる」機能（投稿・コメント・いいね・参加表明）を優先する。
- 一方向の情報発信（ニュース等）は必要最小限にとどめ、コミュニティ機能に開発リソースを割く。
- 安心して交流できる場を維持するため、通報・ブロック・管理者機能などの安全機構をMVPから組み込む（後回しにしない）。

---

## 2. 開発方針

- MVPを小さく完成させる。機能を一度に大量実装しない。
- DB変更は必ずマイグレーションで管理する（直接本番DBを手で変更しない）。
- RLS（Row Level Security）は全テーブルで必ず設定する。
- 進め方は「実装 → テスト → 確認 → コミット」の単位を徹底し、都度確認を挟む。
- 大規模な変更を勝手に行わない。仕様変更や大きな設計判断が必要な場合は着手前に確認する。
- 既存コードを変更する場合は、変更理由をコミットメッセージ・PR説明で明確にする。
- 将来の拡張（第4章参照）を意識した設計にしつつ、MVPでは過剰な作り込みをしない（YAGNI）。

### 開発分担

| 担当 | 役割 |
|---|---|
| ChatGPT | 企画、要件定義、DB設計、UX設計、セキュリティ方針、レビュー |
| Claude Code | 実装、ファイル変更、テスト、バグ修正、リファクタリング |

---

## 3. MVPで実装する主要機能

| # | 機能 | 概要 |
|---|---|---|
| 1 | トップページ | サイトの入口。コンセプト訴求、最新ニュース・LIVE・注目投稿の導線を配置。 |
| 2 | 会員登録・ログイン | Supabase Authによるメール等での認証。 |
| 3 | ファンプロフィール | ニックネーム、アバター、自己紹介などを設定できるプロフィール。 |
| 4 | ファン同士の投稿 | コミュニティ内でのテキスト・画像投稿。 |
| 5 | コメント | 投稿へのコメント機能。 |
| 6 | いいね | 投稿への「いいね」機能。 |
| 7 | ファン一覧 | 登録ファンの一覧・簡易プロフィール表示。 |
| 8 | LIVE一覧 | LIVE（ライブ）情報の一覧表示。 |
| 9 | LIVE詳細 | 個別LIVEの詳細情報表示。 |
| 10 | LIVE参加表明 | 会員がLIVEへの参加意思を表明できる機能。 |
| 11 | LIVEレポート | LIVE参加後の感想・レポート投稿（投稿機能の一種として実装）。 |
| 12 | ニュース | 運営（管理者）が発信する公式・非公式ニュース。 |
| 13 | 通報 | 不適切な投稿・コメント・ユーザーの通報機能。 |
| 14 | ブロック | 他ユーザーをブロックする機能。 |
| 15 | 管理者機能 | ユーザー・投稿・コメント・通報等の管理画面。 |
| 16 | 利用規約 | 静的ページ。 |
| 17 | プライバシーポリシー | 静的ページ。 |
| 18 | コミュニティガイドライン | 静的ページ（第6章の禁止事項を反映）。 |
| 19 | 楽曲一覧・楽曲詳細 | かのうみゆの楽曲情報を一覧・詳細表示する機能（`songs`テーブル、`/music`・`/music/[id]`・管理画面`/admin/music`）。 |

---

## 4. 将来実装する機能（MVPスコープ外）

以下はMVPには含めないが、将来の拡張候補として設計時に意識する。

- DM（ダイレクトメッセージ）
- チャット
- フォロー機能
- 通知機能
- ポイント制度
- バッジ
- ランキング
- アンケート
- グッズコレクション
- ファンギャラリー
- 同行者募集（LIVEへの同行者マッチング）
- ファン主催イベント
- PWA対応
- メール配信（メルマガ等）
- 有料会員
- 広告
- 寄付機能
- 公式情報との連携（API連携等）

> 設計方針: 上記機能を見越して、`profiles` や `posts` など主要テーブルに将来の拡張カラムを先回りして大量に用意することはしない。必要になった時点でマイグレーションを追加する。ただし主キーにUUIDを採用する、`status`カラムでソフトデリート的な状態管理を可能にするなど、拡張しやすい最低限の設計は行う。

---

## 5. ページ構成（ルーティング）

Next.js App Router構成を前提とする。

### 5.1 公開ページ（未ログインでも閲覧可）

```
/                    トップページ
/news                ニュース一覧
/live                LIVE一覧
/live/[id]           LIVE詳細
/music               楽曲一覧
/music/[id]          楽曲詳細
/fans                ファン一覧
/fans/[username]     ファン公開プロフィール（profiles.usernameを使用。UUIDは使用しない）
/about               サイトについて
/guidelines          コミュニティガイドライン
/terms               利用規約
/privacy             プライバシーポリシー
```

### 5.2 会員向けページ（要ログイン）

```
/community            コミュニティトップ
/community/posts      投稿一覧
/community/posts/[id] 投稿詳細（コメント表示含む）
/community/new        新規投稿作成
/me                   自分のマイページ
/me/edit              プロフィール編集（usernameは変更不可）
/me/events            自分のLIVE参加表明一覧
/me/posts             自分の投稿一覧
```

### 5.3 認証ページ

```
/login             ログイン
/signup            会員登録
/forgot-password   パスワード再設定
```

### 5.4 管理者ページ（要admin権限）

```
/admin             管理ダッシュボード
/admin/users       ユーザー管理
/admin/posts       投稿管理
/admin/comments    コメント管理
/admin/reports     通報対応
/admin/events      LIVE管理（DBの契約: 一覧=`get_admin_events`、詳細・編集データの取得=`get_admin_event`、作成=`create_event`、内容の保存=`update_event`、status変更=`set_event_status`。6.5参照。画面は未実装）
/admin/news        ニュース管理
/admin/music       楽曲管理
/admin/logs        管理者操作ログ
```

### 5.5 アクセス制御の基本方針

- 会員向けページは未ログイン時 `/login` へリダイレクト。
- 管理者ページは `profiles.role = 'admin'` 以外のユーザーを `/` へリダイレクト（またはアクセス拒否）。
- `banned`状態のユーザーが会員向けページ等のアクセス制限対象ページへアクセスした場合、可能な限り `/restricted`（5.6参照）へ誘導する。
- ページ側の制御に加え、DB側のRLSでも同様の制御を行う（後述）。画面での非表示のみに依存しない。
- 認可判定（未ログイン／banned／suspended等）をどこで行うかについては、8章「Next.js 16における認可設計（確定）」を参照。

### 5.6 アクセス制限時の誘導ページ（確定）

```
/restricted    bannedユーザー向けの案内ページ
```

- `/restricted` は `banned` 状態のユーザー専用のページとする。`/banned`・`/account/restricted`等の命名は採用しない（既存の`/about`・`/guidelines`等と同じフラットな命名規則に合わせ、処分内容を直接的に示す単語もURLに含めない）。
- 未ログインユーザーが `/restricted` に直接アクセスした場合は、他の会員向けページと同様に `/login` へリダイレクトする。
- `active` または `suspended` のユーザーが `/restricted` に直接アクセスした場合は、通常のページ（例: `/`）へリダイレクトする（このページは banned ユーザー以外には意味を持たないため）。
- `/restricted` は検索エンジンにインデックスさせない（`noindex`）。
- `suspended`専用の全画面誘導ページは作らない（6.1.1参照）。

---

## 6. データベース設計（Supabase PostgreSQL）

前提: Supabase Authの `auth.users` を認証の正とし、`profiles` テーブルで公開プロフィール情報を管理する（`profiles.id = auth.users.id`）。

命名規則: テーブル名はスネークケース複数形、主キーは `id uuid`、作成日時は `created_at`、更新日時は `updated_at` で統一する。

**UUID主キーの生成方針（確定）**: UUID型の主キーを持つテーブルでは、原則としてDB側で`DEFAULT gen_random_uuid()`を使用する。ただし`profiles.id`は例外とし、`auth.users.id`をそのまま使用するため、独自のDEFAULT UUID生成は設定しない（6.1参照）。`gen_random_uuid()`が対象Supabase環境で標準利用可能かはmigration実装時に確認し、利用可能な場合は不要な拡張機能の有効化を追加しない。明示的な`pgcrypto`有効化が必要な場合のみ、Supabaseの現行推奨方法に従って有効化する。

**updated_atの自動更新（確定）**: `updated_at`列を持つテーブル（`app_settings`を含む。6.13参照）では、INSERT時は`DEFAULT now()`、UPDATE時は共通の`BEFORE UPDATE`トリガー関数によって`updated_at = now()`を自動設定する。クライアントに`updated_at`の値を指定・管理させない。この共通トリガー関数は`NEW.updated_at`を書き換えるだけの単純な用途であり、`SECURITY DEFINER`にする必要は原則ない。対象テーブルごとに同じ関数を再利用する。具体的なSQLはmigration実装時に決定する。

**アカウント削除について（確定）**: MVPでは、ユーザー自身または管理者によるアカウントの完全削除（退会）機能は実装しない。これに伴い、`profiles`を参照する各テーブルのFK（`posts.author_id`、`comments.author_id`等）のON DELETEは、原則として`RESTRICT`（または`NO ACTION`）とする。`profiles.id → auth.users.id`のFKについても同様にON DELETE RESTRICT（またはNO ACTION）とする。`profiles.id`と`auth.users.id`は1対1で対応し、`profiles.id`に独自のUUIDを生成することはしない（上記UUID主キーの生成方針、6.1参照）。このクロススキーマFKがSupabase実環境で正常に作成・機能するかは、migration実装時の検証項目とする。アカウント削除機能を将来実装する場合は、その時点で関連コンテンツの扱い（削除・匿名化・保持等）を含めて別途設計し、必要なFK制約を見直すものとする。

**その他のFKのON DELETE方針（確定）**: `posts.event_id → events.id`、`comments.post_id → posts.id`、`likes.post_id → posts.id`、`event_participants.event_id → events.id`の4つのFKについても、`ON DELETE RESTRICT`を明示する（確定）。MVPではこれらの関連データを親レコード削除時にCASCADEで物理削除しない。上記の`profiles`参照FKにおける`ON DELETE RESTRICT`（またはNO ACTION）方針と整合させる。

### 6.1 profiles

**目的**: 会員の公開プロフィール情報、ロール、アカウント状態を管理する。

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid (PK, FK → auth.users.id) | `auth.users.id`を参照する1対1のFK。`profiles.id`には独自のUUIDを生成しない |
| username | text | 公開プロフィールURL(`/fans/[username]`)に使用する一意な識別子 |
| display_name | text | 表示名 |
| avatar_url | text (nullable) | Storage `avatars` バケット内のobject key（完全URLではない。9章参照） |
| bio | text (nullable) | 自己紹介 |
| fan_since | date (nullable) | ファン歴（任意入力） |
| role | text | `member` \| `admin`（デフォルト `member`） |
| status | text | `active` \| `suspended` \| `banned`（デフォルト `active`。挙動の詳細は6.1.1参照） |
| terms_version | text | 同意した利用規約のバージョン識別子（必須） |
| terms_agreed_at | timestamptz | 利用規約に同意した日時（NOT NULL。確定。6.1.3参照） |
| privacy_policy_version | text | 同意したプライバシーポリシーのバージョン識別子（必須） |
| privacy_policy_agreed_at | timestamptz | プライバシーポリシーに同意した日時（NOT NULL。確定。6.1.3参照） |
| created_at | timestamptz | 作成日時 |
| updated_at | timestamptz | 更新日時 |

**リレーション**: `posts.author_id`, `comments.author_id`, `likes.user_id`, `event_participants.user_id`, `reports.reporter_id`, `blocks.blocker_id/blocked_id` などから参照される親テーブル。

**ユニーク制約**: `username` に UNIQUE。

**username の形式制約**:
- 公開プロフィールURL `/fans/[username]` にそのまま使用するため、URLで安全に使える文字のみ許可する（例: 半角英数字・アンダースコア・ハイフン、`^[a-z0-9_-]{3,20}$` 相当）。
- UUID等の内部IDを公開プロフィールURLとして使用しない。
- DB側でもCHECK制約により形式を強制し、アプリ側バリデーションのみに依存しない。

**username変更について（MVPでは確定・非対応）**:
- MVPでは、ユーザー自身による`username`の変更を許可しない（サインアップ時に決定した`username`は固定とする）。
- 理由: `username`を公開プロフィールURL(`/fans/[username]`)にそのまま使用しているため、変更を許可するとURLが変わりリンク切れ（他ユーザーが貼った/ブックマークしたリンクが無効になる）を引き起こすため。
- `/me/edit`（プロフィール編集）では`username`を編集不可（読み取り専用）項目として扱う。DB側では、`username`を6.1.3の保護対象カラムに含め、列単位のアクセス制御によって本人による直接UPDATEを禁止することで、アプリ側・DB側の両方で変更不可を保証する（6.1.3参照）。
- 将来的にusername変更機能を追加する場合は、旧usernameから新usernameへのリダイレクト、旧URLの扱い、変更頻度制限などを含めて別途設計するものとし、MVPのスコープには含めない。

#### 6.1.1 profiles.status の挙動（確定）

| status | ログイン | サイト閲覧 | 投稿・コメント・いいね・LIVE参加表明等のコミュニティ操作 | 主要ページへのアクセス |
|---|---|---|---|---|
| active | 可 | 可 | 可 | 制限なし |
| suspended | 可 | 可 | 不可（作成系操作をすべて禁止） | 制限なし（コミュニティ機能以外は通常利用可能） |
| banned | 可（認証自体は可能） | 不可 | 不可 | コミュニティ機能および主要ページへのアクセスを制限し、`/restricted`（5.6参照）へ誘導する |

- **suspended**: ログイン・サイト閲覧は可能。投稿・コメント・いいね・LIVE参加表明等のコミュニティ操作（作成系操作）は禁止する。これらの操作を行おうとした場合は、アプリ側で「利用制限中のため実行できません」といった、現在利用制限中であることを伝える汎用メッセージを**操作時にインラインで**表示する。全画面での誘導ページ（`/restricted`等）への遷移は行わない。
- **banned**: 認証自体は可能だが、コミュニティ機能および主要ページ（`/community`配下、`/me`配下、LIVE参加表明等）へのアクセスを制限し、専用の案内ページ`/restricted`（5.6参照）へ誘導する。投稿・コメント・いいね・LIVE参加表明等の作成系操作も禁止する。
- 案内文言はいずれも簡潔な汎用メッセージとし、通報内容・通報理由・処分理由の詳細等、個別の判断根拠は表示しない。
- 上記はRLS（DB側）とアプリ側の両方で二重に制御する。RLS側は「作成系操作(INSERT)は `status='active'` のユーザーのみ許可」という形でINSERTポリシーに反映する。
- banned/suspendedの判定はアプリ側のData Access Layer（DAL）で行う。Proxy（旧Middleware）では`profiles.status`をDBに問い合わせて判定しない（8章「Next.js 16における認可設計（確定）」参照）。コミュニティ系テーブルへのINSERT/UPDATEはRLSでも遮断する。

#### 6.1.2 アカウント状態とコンテンツ公開状態の独立性（確定）

`profiles.status`（アカウントの利用状態: active/suspended/banned）と、`posts.status`/`comments.status`（コンテンツの公開状態: published/hidden/deleted）は、それぞれ独立した状態管理とする。一方の値の変化が他方の値を自動的に変化させることはない。

- `suspended`/`banned`になったことだけを理由に、そのユーザーの過去の`published`な投稿・コメントを自動的に非表示・削除しない。`posts.status`/`comments.status`は、6.2/6.3で定義された基準（投稿者本人の削除操作、または管理者による個別のモデレーション判断）によってのみ変更される。
- ユーザーを`banned`にする際、管理者は当該ユーザーの過去の投稿・コメントを確認する運用とする。規約違反等に該当するコンテンツがあれば、`moderate_post()`/`moderate_comment()`経由で個別に`hidden`とし、`admin_logs`に記録する（この考え方は、6.7 reportsで既に確立している「通報のみでは自動非表示にせず、管理者が確認した上で個別に対応する」という方針と同一である）。管理者がこの確認作業を通じて対象を`deleted`にすることはできない（`deleted`は投稿者本人のself-delete専用のterminal状態。6.2/6.3参照）。
- ただし、上記の確認には見落とし（確認漏れ）が生じうる。その保証されない確認作業を補う目的で「`profiles.status = 'banned'`であること」自体をSELECT時の自動非表示条件にはしない。非表示化は、あくまで管理者が個別に確認・判断した結果として`posts.status`/`comments.status`に反映されたものだけを根拠とする。
- `suspended`が解除された場合、および将来`banned`から復旧する仕組みが実装された場合も、コンテンツ側の`status`は自動的には変更されない。個別に`hidden`/`deleted`とされたコンテンツは、その判断が別途取り消されない限りそのまま維持される。

#### 6.1.3 profilesの保護カラムとアクセス制御（確定）

`username`・`role`・`status`・`terms_version`・`terms_agreed_at`・`privacy_policy_version`・`privacy_policy_agreed_at`は、本人であっても通常の更新経路から直接変更できないよう保護する。

- 本人による`UPDATE`は、上記の保護対象カラムを除いた編集可能なカラム（`display_name`・`avatar_url`・`bio`・`fan_since`等）のみに限定する。RLSの行ポリシー（8章「本人 or admin」）に加えて、列単位のアクセス制御（例: PostgreSQLの列単位GRANT/REVOKE等）を用いて、保護対象カラムへの直接UPDATEをDB側で拒否する。
- 管理者による`role`の変更は`admin_set_user_role(target_user_id, new_role)`、`status`の変更は`admin_set_user_status(target_user_id, new_status)`という、それぞれ独立したSECURITY DEFINER RPCを経由して行う（確定）。いずれもRPC内部で`is_admin()`（8章「管理者判定とRLSの循環参照回避」参照）を必ず確認し、admin以外からの呼び出しを拒否する。対象ユーザーへの変更には、DB側の`role`/`status`のCHECK制約（6.1参照）も適用される。通常のUPDATE経路に対する列単位の保護（上記）を維持したまま、管理者操作を可能にするための仕組みである。
- 利用規約・プライバシーポリシーへの再同意は、`record_policy_consent()`という専用のSECURITY DEFINER RPCを経由して行う（確定。7章参照）。このRPCは以下の値を使用する：対象ユーザー→`auth.uid()`、`terms_version`→`app_settings`（6.13参照）に保存された現行の利用規約バージョン、`privacy_policy_version`→`app_settings`に保存された現行のプライバシーポリシーバージョン、`terms_agreed_at`→DB側の`now()`、`privacy_policy_agreed_at`→DB側の`now()`。クライアントから`user_id`・`terms_version`・`privacy_policy_version`・`terms_agreed_at`・`privacy_policy_agreed_at`のいずれも信頼して受け取らない（確定。Q45）。現行の規約バージョンは、アプリ側の定数ではなくDB側の`app_settings`を正本とする。
- 同意そのもの（利用規約・プライバシーポリシーへの同意）は必須とする。本プロジェクトは新規構築であり、MVPでは会員登録時に利用規約・プライバシーポリシーへの同意を必須とするため、`terms_version`・`terms_agreed_at`・`privacy_policy_version`・`privacy_policy_agreed_at`はいずれも`profiles`の必須情報として扱う。特に`terms_agreed_at`・`privacy_policy_agreed_at`はNOT NULLとする（確定）。「同意日時が存在しない状態」の通常会員プロフィールは許容しない。
- `role`・`status`にはDB CHECK制約を設け、値の範囲をそれぞれ`member`/`admin`、`active`/`suspended`/`banned`（6.1参照）に強制する。新しい値を追加することはしない。
- `username`はMVPでは変更不可（6.1「username変更について」参照）のため、`role`・`status`・`terms_*`・`privacy_policy_*`のような変更用RPCは用意しない。`/me/edit`では読み取り専用項目として扱い、アプリ側だけでなくDB側でも変更不可を保証する。既存のusername形式（`^[a-z0-9_-]{3,20}$`）およびUNIQUE制約の方針は維持する。
- 上記の具体的な実装方法（列単位GRANT/REVOKEの文法、RPC関数の名称・引数等）は、本バージョンでは方針レベルの確定に留め、実装時に設計する。

#### 6.1.4 公開プロフィールの取得（`get_public_profiles()` / `get_public_profile()`。確定・実装済み）

一般ユーザーが他ユーザーのプロフィールを取得する際、`profiles`本体を直接の取得元としない。RLSは行単位の制御であり、「同じ行の一部カラムだけを一般公開する」要件、および閲覧者ごとに結果が変わる要件（block・banned・存在の隠蔽）をRLSだけで実現することはできないため、公開プロフィール用の2つのSECURITY DEFINER RPCを用いる。**公開プロフィール用のVIEW（`public_profiles`）は実装されておらず、存在しない**（v1.12の記述はVIEWを予定していたが、実装はRPCを採用した）。

一般ユーザーによる他ユーザーの`profiles`本体への直接SELECTは禁止する（確定）。責務分離は以下のとおりとする。

- 他人の公開プロフィール取得: `get_public_profiles(search, after_username, after_id, page_size)`（一覧・検索。`/fans`）および`get_public_profile(target_username)`（1件。`/fans/[username]`）経由。
- 本人: 自分自身の`profiles`行のみSELECT可能。
- admin: 管理上必要な`profiles`行をSELECT可能。
- 他ユーザーの`role`・`status`・利用規約/プライバシーポリシー同意情報等: 一般ユーザーからは取得不可。

- 返却する列（2つのRPCとも6列のみ）: `id`・`username`・`display_name`・`avatar_url`・`bio`・`fan_since`。返さない項目（内部・保護情報）: `role`・`status`・`terms_version`・`terms_agreed_at`・`privacy_policy_version`・`privacy_policy_agreed_at`（`status`は絞り込みにのみ使用し、返却しない）。
- 両RPCは`SECURITY DEFINER`・`search_path=''`で、EXECUTEはanonとauthenticatedに付与している。`status`が`active`または`suspended`のprofileのみが対象で、`banned`は返さない。authenticatedの呼び出しでは、呼び出し元が利用制限で閲覧できない状態（banned・profile不在）の場合は0行、対象との間に双方向のblockがある場合は対象を除外する（anonの呼び出しではblock判定を行わない）。`get_public_profile()`は、username不存在・対象がbanned・block関係あり・呼び出し元がbannedをいずれも同じ0行とし、理由を外部から区別させない。
- `get_public_profiles()`は`username`昇順・`id`昇順のkeyset paginationで、`after_username`と`after_id`は両方NULL（先頭ページ）か両方指定のみ有効とし、片方のみの指定は`INVALID_PROFILE_CURSOR`とする。`page_size`はNULLなら20、範囲外は1〜100に丸める。`search`は前後の空白を除いて`username`・`display_name`の部分一致（大文字小文字を区別しない）で、空なら検索条件なしとして扱う。
- 他ユーザーのプロフィール取得（`/fans`、`/fans/[username]`等）は上記RPCを使用する。自分自身の情報取得・管理者による管理処理等では`profiles`本体を使用する、という責務分離を基本方針とする。

---

### 6.2 posts

**目的**: ファン同士の投稿、およびLIVEレポートを保持する。

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid (PK) | |
| author_id | uuid (FK → profiles.id) | 投稿者 |
| post_type | text | `normal` \| `live_report`（デフォルト `normal`） |
| event_id | uuid (FK → events.id, nullable) | `live_report` の場合、対象LIVE |
| content | text | 本文 |
| image_url | text (nullable) | Storage `post-images` バケット内のobject key（完全URLではない。9章参照） |
| status | text | `published` \| `hidden` \| `deleted`（デフォルト `published`。論理削除を基本とし、物理削除は行わない） |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**リレーション**: `author_id → profiles.id`、`event_id → events.id`（任意。ON DELETE RESTRICT。6章冒頭「その他のFKのON DELETE方針（確定）」参照）。`comments.post_id`, `likes.post_id` から参照される。

**ユニーク制約**: なし。

**備考**: LIVEレポートを独立テーブルにせず `posts` の一種として実装することで、コメント・いいね・通報の仕組みをそのまま流用できる。

**status / 表示制御の方針**（コメント6.3にも同様に適用）:
- `status` による削除・非表示は論理削除を基本とし、レコード自体はDB上に保持する。
- 一般ユーザー（投稿者以外）には `status='published'` の投稿のみ表示する。
- 投稿者本人には、自分の投稿は `status` の値に関係なく（`hidden`/`deleted`でも）閲覧できる。`deleted`の場合はUI上で「削除済み」であることが分かる表示にする。
- 投稿が`deleted`（または`hidden`）の場合、紐づく`comments`・`likes`はDB上には保持したまま、一般ユーザーへは表示しない。投稿者本人が自分の投稿を見る場合、投稿本体は`status`に関わらず閲覧できるが、紐づくコメント・いいねの閲覧可否は投稿者本人であることによって自動的に拡大されるわけではなく、それぞれ6.3・6.4の定め（コメント作成者本人・いいねをした本人自身の閲覧経路等）に従う。
- ログイン中のユーザーに対しては、上記に加えて自分がブロックしたユーザーの投稿もSELECT結果から除外する（6.8 blocksの方針を参照）。
- 投稿者の`profiles.status`（suspended/banned等）は、投稿自体の`status`に影響しない（アカウント状態とコンテンツ公開状態の関係は6.1.2を参照）。

**`status`変更経路の分離（確定）**: `posts.status`への直接UPDATEはクライアント（管理者を含む）に一切許可しない。`status`の変更は以下2つの専用SECURITY DEFINER RPCのいずれか経由に限定する。
- 投稿者本人によるlogical delete: `delete_own_post()`。`published`→`deleted`・`hidden`→`deleted`のみを許可し、`deleted`は本人操作専用のterminal状態とする（`deleted`から`published`/`hidden`への復帰経路はいずれの経路にも存在しない）。`profiles.status`がactive/suspended/bannedのいずれであっても本人は利用できる。
- 管理者によるモデレーション: `moderate_post()`。`published`↔`hidden`の双方向のみを許可し、`deleted`への変更・`deleted`からの復帰はRPC内部で拒否する（管理者であっても`deleted`を生成・復元できない）。呼び出し元が`is_admin()`（`role='admin'`かつ`status='active'`）であることをRPC内部で必ず確認する。
- 両RPCとも対象行を`SELECT ... FOR UPDATE`でロックしてから現在の`status`を確定し、不正な遷移（同一状態への変更を含む）を拒否する。`moderate_post()`は、`status`変更と`admin_logs`への記録（6.11参照）を同一トランザクション内でatomicに実行し、一方だけが成立する状態を作らない。

**DB制約（確定）**:
- `post_type`・`status`にはDB CHECK制約を設け、値の範囲をそれぞれ`normal`/`live_report`、`published`/`hidden`/`deleted`に強制する。
- `post_type='live_report'`の場合は`event_id`を必須とするDB制約（CHECK等）を設ける。

**`hidden` と `deleted` の使い分け（確定）**:

| status | 意味 | 主な発生契機 | 再公開の可能性 |
|---|---|---|---|
| `hidden` | 運営による一時的な非表示 | 規約違反の疑いがある投稿を、管理者が調査目的で一時的に見えなくする | あり（調査の結果、問題なしと判断すれば`published`に戻す） |
| `deleted` | 投稿者本人による削除（terminal） | 投稿者自身の削除操作（`delete_own_post()`） | なし（禁止。管理者を含め復元する経路は存在しない。DB上のレコードは論理削除として保持する） |

- `hidden`は「一時停止」、`deleted`は「恒久的な削除」という位置づけの違いであり、いずれも物理削除は行わない。

---

### 6.3 comments

**目的**: 投稿へのコメント。

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid (PK) | |
| post_id | uuid (FK → posts.id) | 対象投稿 |
| author_id | uuid (FK → profiles.id) | コメント投稿者 |
| content | text | 本文 |
| status | text | `published` \| `hidden` \| `deleted`（デフォルト `published`。論理削除を基本とする） |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**リレーション**: `post_id → posts.id`（ON DELETE RESTRICT。6章冒頭「その他のFKのON DELETE方針（確定）」参照）、`author_id → profiles.id`。

**ユニーク制約**: なし。

**表示制御の方針**: 6.2 posts の「status / 表示制御の方針」および「`hidden`と`deleted`の使い分け」と同様。コメント作成者本人は自分のコメントを`status`に関わらず閲覧でき、`deleted`の場合は「削除済み」と分かる表示にする。加えて、親投稿(`posts`)が一般ユーザーに非表示（`hidden`/`deleted`）の場合は、コメント自体の`status`が`published`であっても一般ユーザーには表示しない。この非表示化は親投稿側の可視性判定のみによるものであり、`comments.status`自体は変更しない。ログイン中のユーザーに対しては、コメント投稿者を自分がブロックしている場合、そのコメントもSELECT結果から除外する。また、コメント投稿者の`profiles.status`もコメント自体の`status`に影響しない（6.1.2参照）。

**`status`変更経路の分離（確定）**: 6.2 postsと同様に、`comments.status`への直接UPDATEはクライアント（管理者を含む）に一切許可しない。投稿者本人によるlogical deleteは`delete_own_comment()`（`published`/`hidden`→`deleted`のみ、terminal）、管理者によるモデレーションは`moderate_comment()`（`published`↔`hidden`のみ、`deleted`への変更・復元は不可）という専用SECURITY DEFINER RPC経由に限定する。`moderate_comment()`は親投稿(`posts`)の`status`を参照・変更しない（コメント自身の`status`のみを対象とする）。

**DB制約（確定）**: `status`にはDB CHECK制約を設け、値の範囲を`published`/`hidden`/`deleted`に強制する。

---

### 6.4 likes

**目的**: 投稿への「いいね」。

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid (PK) | |
| post_id | uuid (FK → posts.id) | 対象投稿 |
| user_id | uuid (FK → profiles.id) | いいねしたユーザー |
| created_at | timestamptz | |

**リレーション**: `post_id → posts.id`（ON DELETE RESTRICT。6章冒頭「その他のFKのON DELETE方針（確定）」参照）、`user_id → profiles.id`。

**ユニーク制約**: `(post_id, user_id)` に UNIQUE（多重いいね防止）。

**表示制御の方針（確定）**: `likes`自体に`status`は持たない。fan-facing visibilityとown-like visibilityの2つの経路を明確に分ける。

- **fan-facing表示**: 一般ユーザー（他人を含む）がlikesを見る場合は、親投稿(`posts`)のfan-facing visibilityに従う。親投稿が`published`かつviewerから閲覧可能な場合のみ、そのpostに紐づくlikesを表示する。親投稿が一般ユーザーに非表示（`hidden`/`deleted`）の場合、そのいいね件数・いいね一覧も一般ユーザーには表示しない。likes rowはDB上に保持し、削除しない。
- **own-like表示（確定）**: 上記のfan-facing visibilityとは独立して、`likes.user_id = auth.uid()`である本人には、自分自身のlike rowを常に確認できる経路を設ける。この経路は親投稿の`status`・visibility（`published`/`hidden`/`deleted`、viewer→post-author blockの有無）、および本人の`profiles.status`（active/suspended/banned）のいずれにも依存しない。いいねをした本人は、親投稿が非公開になった後・自分がsuspended/bannedになった後でも、自分のlikeを確認できる。
- **unlike（確定）**: いいねの取り消しは`DELETE FROM likes`による物理DELETEとし、logical deleteは行わない。削除できるのは`user_id = auth.uid()`である本人のlikeのみ。unlikeもown-like表示と同様、親投稿の`status`・visibility、本人の`profiles.status`のいずれにも依存しない。
- **post authorの特別権限なし**: own-like表示は「いいねをした本人」のみが対象であり、「そのいいねが紐づいている投稿の投稿者本人」に他人のlikesを閲覧する特別な権限は付与しない。post authorが自分のpostへself-likeしている場合は、そのself-likeだけが本人のown-like経路で見える。
- own-like表示・unlikeは`likes`行そのもの（`id`・`post_id`・`user_id`・`created_at`）へのアクセスを可能にするだけであり、これを理由に非公開の親投稿本文やその他の情報へのSELECT権限を拡大するものではない（`posts`のRLSはそのまま維持する）。
- **新規いいね（確定）**: 上記のown-like表示・unlikeとは意図的に非対称に、新規いいねはactive本人（`is_active_user()`）が、現在fan-facingで閲覧可能な`published`投稿に対してのみ行える。suspended/bannedは新規いいね不可。block判定は6.8のposts fan-facing semanticsと同一で、viewer→post-author blockのみを制約とし、reverse-onlyや第三者間のblockは影響しない。

---

### 6.5 events

**目的**: LIVE情報の管理。

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid (PK) | |
| title | text | LIVEタイトル |
| venue | text | 会場名 |
| event_date | timestamptz | 開催日時 |
| description | text (nullable) | 詳細説明 |
| image_url | text (nullable) | Storage `event-images` バケット内のobject key（完全URLではない。9章参照） |
| ticket_url | text (nullable) | チケット関連の外部リンク（転売防止のため公式リンクのみ想定） |
| status | text | `draft` \| `public` \| `cancelled`（デフォルト `draft`）。開催済みかどうかはstatusでは表さない（下記「statusと開催日の責務」参照） |
| created_by | uuid (FK → profiles.id, ON DELETE RESTRICT) | 作成した管理者 |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| first_published_at | timestamptz (nullable) | そのeventが初めて`public`になった日時。DBが設定し、クライアント・adminから指定・変更できない（下記「first_published_atとlifecycle」参照） |

**リレーション**: `posts.event_id`, `event_participants.event_id` から参照される（いずれもON DELETE RESTRICT）。

**ユニーク制約**: なし。

**DB制約（確定・実装済み）**:
- `status`にはDB CHECK制約`events_status_check`を設け、値の範囲を`draft`/`public`/`cancelled`に強制する。
- `events_draft_requires_no_first_published_at_check`: `status <> 'draft'`または`first_published_at IS NULL`（`draft`のeventは`first_published_at`を持たない）。
- `title`・`venue`の空文字禁止、長さ上限、`ticket_url`・`image_url`の形式検証はDB制約として存在しない（追加のvalidationは未確定。下記「未決定事項」参照）。

**statusと開催日の責務（確定）**: `ended`（開催済み）というstatusは存在しない。過去のLIVEか将来のLIVEかは`event_date`と現在時刻の比較で判断する。したがって`status='public'`で`event_date`が過去のeventも、DB上は引き続き`public`である。`status`は「公開状態」を表し、開催日の前後関係を表さない。

**first_published_atとlifecycle（確定・実装済み。DBのtrigger `events_guard_publish_state`）**:
- INSERT: eventは必ず`draft`として作成される。`draft`以外を指定したINSERTは`EVENTS_MUST_BE_CREATED_AS_DRAFT`で拒否される。INSERT時の`first_published_at`はクライアントの指定値にかかわらずNULLに固定される。
- 初回`public`: まだ一度も公開されていないeventが初めて`public`になったとき、DBが`first_published_at = now()`を設定する（クライアントの指定値は無視される）。
- 不変: 一度設定された`first_published_at`は、別の値への変更・NULLへの戻しができない（`EVENTS_FIRST_PUBLISHED_AT_IMMUTABLE`）。UPDATEに既存値と同じ値が含まれているだけの場合はエラーにならない。
- draftへの復帰不可: 一度`public`になったeventは`draft`へ戻せない（`EVENTS_CANNOT_REVERT_TO_DRAFT`）。
- `updated_at`は共通の`BEFORE UPDATE`triggerで更新される。

**DBのtriggerが受理するstatus遷移（事実。adminのRPC `set_event_status`が許可する正式な遷移は、下記「status変更」の表のとおり、これより限定されている）**: 上記triggerとCHECKの結果として、現在のDBは次の遷移を受理する: `draft → public`、`draft → cancelled`、`public → cancelled`、`cancelled → public`（一度も公開されていないeventの初回公開、および公開済みeventの再公開を含む）、`cancelled → draft`（一度も公開されていないeventのみ）。`public → draft`は拒否される。adminの管理操作として正式に許可する遷移は`set_event_status`（M17）で確定しており、triggerが受理することとは同一視しない（例: `cancelled（未公開） → public`はtriggerは受理するが、`set_event_status`では許可しない）。

**公開の読み取り境界（確定・実装済み。M11・M12）**: `events`はRLS有効（FORCEなし）で、公開の読み取りは「行の境界」と「列の境界」を分離して実装している。

*行の境界（RLS。policy `events_select_public`、`FOR SELECT TO anon, authenticated`。M11）*: 公開されるのは次の条件を満たすeventのみ。
```sql
status = 'public'
OR (status = 'cancelled' AND first_published_at IS NOT NULL)
```
- `public`: 公開。
- `cancelled`かつ`first_published_at IS NOT NULL`: 一度公開されたLIVEは、中止後もLIVE DB上の記録として公開を継続する。
- `cancelled`かつ`first_published_at IS NULL`: 一度も公開されていないeventなので公開しない。
- `draft`: 公開しない。
- 公開・非公開は`status`と`first_published_at`で決まり、`event_date`（過去か未来か）は公開条件に使用しない。過去の`public`のLIVEも公開対象である。
- 利用者の状態（active / suspended / banned / profile不在 / `auth.uid()`がNULL）やadminかどうかによって、公開rowの見え方は変えない（ログアウトすれば閲覧できるpublic contentのため）。
- draft・一度も公開されていない`cancelled`・不存在のidは、いずれも0行となり区別できない。

*列の境界（列単位のSELECT権限。M12）*: `anon`・`authenticated`にはtable単位のSELECT権限がなく、次の公開8列のみに列単位のSELECT権限がある。
- 公開する8列: `id`・`title`・`venue`・`event_date`・`description`・`image_url`・`ticket_url`・`status`。
- 公開しない4列: `created_by`・`created_at`・`updated_at`・`first_published_at`。
  - `created_by`: 管理上の作成者情報でありpublic UIに不要。公開すると、作成者として現れるaccountがadminであることを特定でき、`profiles.role`をpublic APIで返さない設計（6.1.4）と整合しないため公開しない。
  - `created_at`・`updated_at`: MVPのpublic APIでは公開しない。将来、公開UI上の明確な要件が生じた場合に、明示的な列GRANTの追加を検討できる。
  - `first_published_at`: MVPのpublic APIでは公開しない。ただしRLS policyの内部では、公開済みの`cancelled`か一度も公開されていない`cancelled`かの判定に使用する。RLS内部で参照することと、clientへSELECTできることは別であり、この列のSELECT権限がなくてもpolicyは正常に評価される（実DBで確認済み）。
- 行の境界（RLS）と列の境界（列単位のSELECT権限）は独立している。列の境界を狭めても行の公開条件は変わらない。

*クライアントの契約*: `anon`・`authenticated`は`SELECT *`および非公開列を1つでも含むSELECT（WHERE・ORDER BYでの参照を含む）ができない（permission denied）。Next.js / Supabase clientは、公開8列を明示して取得する。これは意図したleast privilegeの設計である。DBのprivilegeとしては確認済みだが、PostgREST経由の挙動は未検証であり、PostgRESTを含む統合テストはNext.jsの実装時に行う。将来`events`に列を追加しても自動的には公開されず、公開する場合は明示的な列GRANTが必要である（opt-in）。

*クライアントからの書き込み*: `anon`・`authenticated`にはINSERT/UPDATE/DELETE等のwrite権限（列単位を含む）を付与しておらず、クライアントからの直接のwriteはすべて不可。postgres・service_roleのACLは変更していない。

*adminの読み取り境界（確定・実装済み。M13・M14）*: active adminも`authenticated`ロールのため、base tableから取得できるのは、公開行の公開8列のみである（draft・一度も公開されていない`cancelled`・非公開の4列はbase tableからは取得できない）。列権限はロール単位で、adminだけに内部列をGRANTすることはできないため、adminだけにbase tableの内部列をGRANTする方式は採用していない。adminの読み取りは、次の2つの専用SECURITY DEFINER RPC（admin trusted boundary）で行う。
- 公開の読み取りは「base tableのRLS + 列単位のSELECT権限」、adminの読み取りは「SECURITY DEFINER RPC」であり、両者は別の境界である。base table = 公開境界、admin RPC = trustedなadmin境界。active adminであっても、base tableからdraftや非公開の4列を直接取得することはできない。
- 認可: 両RPCとも関数の最初に`public.is_admin()`（`role='admin'`かつ`status='active'`）を評価し、満たさなければ`EVENT_MANAGEMENT_NOT_AUTHORIZED`とする。一般ユーザー・suspended admin・banned admin・profile不在・`auth.uid()`がNULLはすべて拒否される。認可は引数のvalidation・対象eventの検索より先に行うため、未認可の呼び出しにeventの存在やstatusを漏らさない。
- EXECUTE: `postgres`と`authenticated`のみ（`anon`・PUBLIC・`service_role`は不可）。`authenticated`の中で`is_admin()`によりactive adminだけが許可される。
- 両RPCの共通の性質: owner=postgres・`SECURITY DEFINER`・`STABLE`・`search_path=''`で、dynamic SQLは使わない。RLSをbypassして全eventを読むが、公開の可視性の条件（`events_select_public`の述語）はRPC内に複製しない。読み取りのみで`admin_logs`には記録しない。
- `EVENT_MANAGEMENT_NOT_AUTHORIZED`は、events管理のadmin read（M13・M14）とadmin write（M15〜M17）のRPCに共通の認可エラーとして実装済み（他のresourceのRPCのエラーコードとは別）。adminの読み取りをRPCに統一するのはeventsについての判断（M12の列単位の権限との関係による）であり、news・songs等の他のresourceのadmin readを一律にRPCにする、という一般化はしない（個別に設計する）。

*admin一覧: `get_admin_events(search text DEFAULT NULL, status_filter text DEFAULT NULL, after_event_date timestamptz DEFAULT NULL, after_id uuid DEFAULT NULL, page_size integer DEFAULT 20)`（`/admin/events`の一覧用）*
- 返却列は次の7列のみ: `id`・`title`・`venue`・`event_date`・`status`・`first_published_at`・`updated_at`。`description`・`image_url`・`ticket_url`・`created_by`・`created_at`は一覧では返さない。
- 行の範囲: 全status（`draft`・`public`・`cancelled`）。一度も公開されていない`cancelled`と、公開済みの`cancelled`の両方を取得できる。公開のRLS条件には依存しない。
- 並び順: `event_date DESC, id DESC`（決定的）。公開の`/live`の並び順とは別の契約である。
- pagination: keyset。cursorは`after_event_date`と`after_id`で、両方NULLなら先頭ページ、両方非NULLなら次ページ、片方のみは`INVALID_EVENT_CURSOR`。次ページの条件は`(event_date, id) < (after_event_date, after_id)`。cursorが実在するeventである必要はない。
- `page_size`: 既定20。NULLは20、0・負数は1、101以上は100に丸める（エラーにしない）。
- `search`: `title`または`venue`の部分一致（大文字小文字を区別しない）。前後の空白を除き、空ならfilterなし。`%`・`_`・`\`はLIKEのwildcardではなく通常の文字として扱う。trim後の長さは最大100文字で、101文字以上は`EVENT_SEARCH_TOO_LONG`。
- `status_filter`: NULLなら全status。`draft`・`public`・`cancelled`の完全一致のみ有効で、それ以外（空文字・大文字小文字違い・前後の空白を含む）は`INVALID_EVENT_STATUS_FILTER`。
- 意図的に未実装: 過去/未来のfilter、総件数、ページ番号によるpagination（offset）、任意のsort。これらは現在の契約に含まれない。

*admin詳細: `get_admin_event(target_event_id uuid)`（`/admin/events`の詳細・編集データ用）*
- 返却列はeventsの全12列: `id`・`title`・`venue`・`event_date`・`description`・`image_url`・`ticket_url`・`status`・`created_by`・`created_at`・`updated_at`・`first_published_at`（型はbase tableと同一）。`profiles`とのjoinはせず、`created_by`はuuidのみで、作成者名は返さない。
- 行の範囲: statusに関係なく1件を返す。`draft`・`public`・一度も公開されていない`cancelled`・公開済みの`cancelled`のいずれも取得できる。
- 存在しないUUID、およびactive adminが`NULL`を渡した場合は0行（専用のnot-foundエラー・validationエラーはない）。未認可の呼び出しは、`NULL`を含めどの入力でも`EVENT_MANAGEMENT_NOT_AUTHORIZED`が先に返る。不正なUUID文字列はPostgreSQLの型変換で拒否され、独自のエラーには変換しない。
- 内部列の扱い: `created_by`・`created_at`はadmin詳細のみで返す（一覧・公開では返さない）。`updated_at`は一覧・詳細で返す（optimistic concurrencyは現在未実装で、将来のwrite設計の候補）。`first_published_at`は一覧・詳細で返し、`draft`と一度も公開されていない`cancelled`ではNULL、`public`と公開済み`cancelled`では非NULLである（公開APIでは引き続き非公開）。

*adminの書き込み境界（確定・実装済み。M15・M16・M17）*: eventsの管理者の書き込みは、SECURITY DEFINER RPC 3本のみで行う。これにより、eventsの構造は次の3層になる。
- 公開の読み取り = base tableのRLS + 列単位のSELECT権限（M11・M12）
- adminの読み取り = SECURITY DEFINER RPC `get_admin_events`・`get_admin_event`（M13・M14）
- adminの書き込み = SECURITY DEFINER RPC `create_event`・`update_event`・`set_event_status`（M15・M16・M17）

共通の原則:
- `authenticated`を含めadminにも、events base tableへの直接のINSERT/UPDATE/DELETEは許可しない。`admin_logs`への直接のwriteもできない。書き込みは上記RPCだけが行う。
- 認可: 3つのRPCとも関数の最初に`public.is_admin()`（active adminのみ）を評価し、満たさなければ`EVENT_MANAGEMENT_NOT_AUTHORIZED`とする（suspended/bannedのadmin・一般ユーザー・profile不在・`auth.uid()`がNULLは拒否）。認可はvalidationや対象eventの検索より先に行うため、未認可の呼び出しにeventの存在・status・入力のvalidation結果を漏らさない。
- EXECUTE: `postgres`と`authenticated`のみ（`anon`・PUBLIC・`service_role`は不可。`service_role`は明示的にREVOKE）。`authenticated`の中で`is_admin()`によりactive adminだけが許可される。
- 性質: owner=postgres・`SECURITY DEFINER`・`VOLATILE`・`search_path=''`で、dynamic SQLは使わない。
- 成功したwriteとその`admin_logs`へのINSERTは同一transactionでatomicに行われ、どちらかが失敗すれば全体がrollbackされる（下記「audit」）。
- 公開の読み取りの境界（M11・M12）とadminの読み取りの契約（M13・M14）は変更されていない。
- 戻り値: `create_event`は作成したeventのUUIDのみ、`update_event`・`set_event_status`は`void`。成功後の最新の状態は`get_admin_event`で再取得する。
- 既存のlifecycle trigger（`events_guard_publish_state`）と`updated_at`のtrigger（`events_set_updated_at`）は最後の防衛線として残るが、それらが投げる内部の例外（`EVENTS_CANNOT_REVERT_TO_DRAFT`等）は、admin RPCの通常のAPI契約としては呼び出し側に現れない（RPCが事前に検証する）。

*作成: `create_event(title text, venue text, event_date timestamptz, description text DEFAULT NULL, image_url text DEFAULT NULL, ticket_url text DEFAULT NULL) RETURNS uuid`（M15）*
- 呼び出し側から受け取るのは上記6項目のみ。次はサーバー側が管理し、clientから受け取らない: `id`（DB default）、`status`（DB default、常に`draft`）、`created_by`（`auth.uid()`）、`created_at`・`updated_at`（DB default・trigger）、`first_published_at`（既存trigger。draft作成時はNULL）。
- 作成したeventのUUIDのみを返す。作成後の詳細は`get_admin_event`で取得する。

*共通のnormalization / validation: `internal.normalize_event_content`（M15）*
- `create_event`と`update_event`が共有する、内容6項目の入力のnormalizationとvalidationだけを担う内部helper。`internal` schemaに置き、EXECUTEは`postgres`のみでclientから直接実行できない。status遷移や同時実行制御は担当しない。
- 前後のtrim対象は U+0020・tab・LF・CR・U+3000。長さはcharacter数で数える。複数の項目が不正な場合は、title → venue → event_date → description → ticket_url → image_url の順で最初の違反が返る。
- `title`: NULL・空白のみは不可。trim後1〜100文字。違反は`INVALID_EVENT_TITLE`。
- `venue`: NULL・空白のみは不可。trim後1〜100文字。会場名の形式は制限しない（オンライン配信等の自由な表記を許す）。違反は`INVALID_EVENT_VENUE`。
- `description`: nullable。trim後に空ならNULL。最大5000文字。違反は`INVALID_EVENT_DESCRIPTION`。
- `event_date`: NOT NULL。有限の`timestamptz`のみ。過去・未来とも許可し、年代の範囲制限は設けない。`infinity`・`-infinity`（と、NULL）は`INVALID_EVENT_DATE`。
- `ticket_url`（現在の実装をそのまま記載する。RFCに完全に準拠した検証ではない）: nullable。trim後に空ならNULL。最大2048文字。小文字の`https://`で始まるもののみ許可（`http`・`javascript:`・`data:`・`ftp:`・scheme省略等は不可。大文字の`HTTPS://`も現在は拒否）。hostが必須（先頭が`:`・`.`・`/`・`?`・`#`・`@`・空白でないこと）、userinfo（`user@`・`user:pass@`）は不可、空白・制御文字（U+3000を含む）を含まない。path・query・fragmentは可。raw表記のIDNとIPv6リテラルは現在受理される。「公式サイトのみ」といった制約は実装していない。違反は`INVALID_EVENT_TICKET_URL`。
- `image_url`（Storage `event-images`バケット内のobject key。完全URLではない）: nullable。trim後に空ならNULL。形式は`{uuid}.{ext}`で、extは`jpg`・`jpeg`・`png`・`webp`のみ。UUIDと拡張子は大文字小文字を区別せずに受理し、保存時にlowercaseへnormalizeする。bucket名のprefix・入れ子のpath・URL・`../`等のpath traversal・query・その他の拡張子は不可。objectの実在は確認しない。違反は`INVALID_EVENT_IMAGE_KEY`。Storage（bucket・upload・Storage RLS）自体は未実装のままである。

*内容の更新: `update_event(target_event_id uuid, expected_updated_at timestamptz, title text, venue text, event_date timestamptz, description text, image_url text, ticket_url text) RETURNS void`（M16）*
- 引数は全て必須（DEFAULTなし）。内容6項目（`title`・`venue`・`event_date`・`description`・`image_url`・`ticket_url`）の全置換で、nullableの項目（`description`・`image_url`・`ticket_url`）のNULLは「クリア」を意味する（引数の省略と区別が付かない形にはしない）。normalization / validationは上記のhelperを再利用し、独自の規則は持たない。
- `status`は変更しない（statusの変更は`set_event_status`）。`id`・`created_by`・`created_at`・`first_published_at`も変更しない。`updated_at`はRPCが直接設定せず、triggerに任せる。draft・public・未公開の`cancelled`・公開済みの`cancelled`のいずれでも内容を更新できる。
- 対象のeventが存在しない場合、および`target_event_id`がNULLの場合は`EVENT_NOT_FOUND`（readのRPCの「0行」とは異なり、writeでは明示的なエラーとする）。
- no-op: normalization後の6項目が全て現在値と同じ（NULL同士も同一）なら、成功（void）とするが、UPDATEせず、`updated_at`も変わらず、`admin_logs`も追加しない。ただし、versionが古い場合はno-opの判定より先に`EVENT_CONFLICT`とする。

*status変更: `set_event_status(target_event_id uuid, new_status text, expected_updated_at timestamptz) RETURNS void`（M17）*
- 引数は全て必須（DEFAULTなし）。`new_status`は`draft`・`public`・`cancelled`の完全一致のみ有効で（trim・大文字小文字の補正なし）、NULLを含むそれ以外は`INVALID_EVENT_STATUS`。status以外の項目は変更しない。
- 対象のeventが存在しない場合、および`target_event_id`がNULLの場合は`EVENT_NOT_FOUND`。
- 遷移の規則（確定）。許可されない遷移（同じstatusへの遷移を含む）は`INVALID_EVENT_TRANSITION`:

| 現在の状態 \ 新しいstatus | draft | public | cancelled |
|---|---|---|---|
| draft | 拒否 | 許可 | 許可 |
| public | 拒否 | 拒否 | 許可 |
| cancelled（一度も公開されていない: `first_published_at`がNULL） | 許可 | 拒否 | 拒否 |
| cancelled（一度公開された: `first_published_at`が非NULL） | 拒否 | 許可 | 拒否 |

- lifecycleの解釈: 初回の公開の入口は`draft → public`のみ。`draft → cancelled`は破棄したdraftの退避で、公開されない。一度も公開されていない`cancelled`から直接`public`にはできず、`cancelled（未公開） → draft → public`の2操作を要する。`public → cancelled`は中止で、公開の履歴としてpublicの読み取りには残る（M11）。`cancelled（公開済み） → public`は中止の撤回。一度公開されたeventは`draft`へ戻せない。
- 同じstatusへの遷移（no-op）は`INVALID_EVENT_TRANSITION`とし、UPDATEも`updated_at`の変更も`admin_logs`の追加もしない。
- `first_published_at`はRPCが設定せず、既存のlifecycle triggerが管理する: `draft → public`でNULLからtimestampが設定され、`draft → cancelled`と`cancelled（未公開） → draft`ではNULLのまま、`public → cancelled`と`cancelled（公開済み） → public`では元のtimestampが保持される。一度設定された`first_published_at`は、中止や再公開でも上書きされない（実時間を挟んだ検証で確認済み）。

*楽観的同時実行制御（`update_event`・`set_event_status`共通）*
- `expected_updated_at`は必須で、NULLは`INVALID_EVENT_VERSION`。対象のeventを`SELECT ... FOR UPDATE`でlockし、同じlock下で取得した現在の`updated_at`とマイクロ秒まで完全に一致する場合だけ更新できる。不一致は`EVENT_CONFLICT`（UPDATEも`admin_logs`もなし。遷移の検証・no-opの判定より先）。`date_trunc`・ミリ秒への丸め・許容幅・新旧の大小比較は使わない。
- 内容の更新とstatus変更は同じversion token（`updated_at`）を共有するため、一方の更新の後に古いversionでもう一方を呼ぶと`EVENT_CONFLICT`になる（DBで確認済み）。同時に呼ばれた場合は、対象行のlockで直列化され、後続は先行のcommit後に`EVENT_CONFLICT`となる（2 sessionで確認済み）。
- `updated_at`は、`update_event`の実変更と`set_event_status`の有効な遷移でだけ、既存のtriggerにより更新される。no-op・許可されない遷移・conflict・validationエラー・not-found・未認可・transactionのrollbackでは変わらない。
- **クライアントの注意（integrationのTODO）**: PostgreSQLの`updated_at`はマイクロ秒精度で、JavaScriptの`Date`を経由するとミリ秒精度に丸められ、完全一致の比較が常に失敗する可能性がある。Next.js / Supabase clientでは、取得した`updated_at`の文字列を加工せずにversion tokenとしてRPCへ返すことを基本方針とする。ただしPostgREST / Supabase / Next.js経由のintegrationはまだ実施しておらず、この動作は未確認（将来の確認事項。「統合確認済み」ではない）。

*audit（`admin_logs`。成功したwriteごとにちょうど1行。1 RPC = 1 action。`target_type='event'`、`target_id`=対象のevent id、`admin_id`=呼び出したadmin）*
- `create_event`: `action='create_event'`、`detail={"to_status":"draft"}`。
- `update_event`: `action='update_event'`、`detail={"changed_fields":[...]}`。実際に変更された項目名のみを、固定順（`title`・`venue`・`event_date`・`description`・`image_url`・`ticket_url`）で並べる。
- `set_event_status`: `action='set_event_status'`、`detail={"from_status":"...","to_status":"..."}`。
- 内容の値（新旧とも）・URL・image key等は記録しない。失敗した呼び出し（未認可・validationエラー・not-found・conflict・許可されない遷移・no-op）では記録しない。readのRPCは`admin_logs`に書かない。
- atomicity: eventのUPDATE/INSERTと`admin_logs`のINSERTは同一transactionで、`admin_logs`のINSERTが失敗した場合はevent側の変更もrollbackされる（例: `draft → public`でauditが失敗すれば、`status`はdraft、`first_published_at`はNULL、`updated_at`は元の値のままになる。故意に失敗させて確認済み）。

*エラーコード（events管理。trigger内部の例外はadmin RPCの通常のAPI契約に含めない）*
- 読み取り（M13・M14）: `EVENT_MANAGEMENT_NOT_AUTHORIZED`・`INVALID_EVENT_CURSOR`・`EVENT_SEARCH_TOO_LONG`・`INVALID_EVENT_STATUS_FILTER`。
- 書き込み（M15〜M17）: `EVENT_MANAGEMENT_NOT_AUTHORIZED`・`INVALID_EVENT_TITLE`・`INVALID_EVENT_VENUE`・`INVALID_EVENT_DESCRIPTION`・`INVALID_EVENT_DATE`・`INVALID_EVENT_TICKET_URL`・`INVALID_EVENT_IMAGE_KEY`・`INVALID_EVENT_VERSION`・`EVENT_NOT_FOUND`・`EVENT_CONFLICT`・`INVALID_EVENT_STATUS`・`INVALID_EVENT_TRANSITION`。

*実装状況*: eventsについて、公開の行境界・公開の列境界（M11・M12）、admin一覧・詳細の読み取り（M13・M14）、admin作成・内容更新・status変更（M15〜M17）はDBレベルで実装・検証済みで、base tableへの直接のwriteは拒否される。`/admin/events`のDB契約は、一覧=`get_admin_events`、詳細・編集データの取得=`get_admin_event`、作成=`create_event`、内容の保存=`update_event`、status変更=`set_event_status`である。`/admin/events`の画面（Next.js）およびSupabase client/PostgREST経由のintegrationは未実装で、UIからの動作確認は未実施である。

**未実装・既知の課題**:
- 物理DELETE: adminの削除RPCは存在せず、クライアントからの直接のDELETEもできない（不要なdraftは`draft → cancelled`で退避できる）。将来も物理DELETEを禁止するかは未決定（下記）。
- 既知のfuture issue: `posts`の`live_report`作成時に、`event_id`が公開可能なeventかを検証していない（`posts`のINSERT policyは`event_id`の状態を検査しない）。今後の対応対象であり、現時点では変更していない。
- Storageの`event-images`バケットは未作成で、Storage RLSも未実装（9章参照）。

**未決定事項（PM判断待ち。確定仕様ではない）**:
- 公開の`/live`（LIVE一覧）の並び順・pagination（primaryの並び順、同一`event_date`のeventを決定的に並べるtie-breakの列、cursor方式かoffset方式か。実DBのテストで、同一`event_date`のeventの並びが一意でないと結果が不定になることを確認済みであり、本番では決定的な並び順が必要）。`/admin/events`のadmin一覧の並び順・paginationは`get_admin_events`で確定済みであり、公開の`/live`とは別の契約である。
- クライアントからの物理DELETEを将来も禁止するか（現在はadminの削除RPCがなく、直接のDELETEもできないという事実のみが確定している）。
- `posts`の`live_report`作成時に、`event_id`が公開可能なeventだけを参照できるようにする方法。現在の`posts`のINSERTの契約では、UUIDを知っていれば、draftや一度も公開されていない`cancelled`のeventを参照する`live_report`を作成できる可能性がある（既知の未解決の課題）。
- Storageのobject lifecycle（アップロード・差し替え・削除・孤児objectの掃除）。DBは`image_url`のobject keyの形式のみを検証しており、objectの実在確認・Storage RLS・bucketは未実装。
- Next.js / Supabase client / PostgREST経由での`expected_updated_at`（version token）のintegrationの確認（取得した`updated_at`文字列を加工せずに返す方針の検証）。

（解消済み: 公開済み`cancelled`は公開を継続する〔M11で確定〕。公開する列は上記8列で、`created_by`・`created_at`・`updated_at`・`first_published_at`は公開しない〔M12で確定〕。adminの読み取り境界は、SECURITY DEFINER RPC `get_admin_events`（一覧）・`get_admin_event`（詳細）として、方式・signature・返却列・並び順・pagination・search/status filter・認可の契約を含めて確定・実装済み〔M13・M14〕。adminの書き込みは、SECURITY DEFINER RPC `create_event`・`update_event`・`set_event_status`として、RPCの分割・入力・validationの上限・status遷移の規則・楽観的同時実行制御（`expected_updated_at`の完全一致）・`admin_logs`へのatomicな記録・エラーコードを含めて確定・実装済み〔M15・M16・M17〕。）

---

### 6.6 event_participants

**目的**: LIVEへの参加表明を管理する。

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid (PK) | |
| event_id | uuid (FK → events.id) | 対象LIVE |
| user_id | uuid (FK → profiles.id) | 参加表明したユーザー |
| status | text | `going` \| `attended` \| `cancelled`（デフォルト `going`） |
| visibility | text | `public` \| `private` \| `attended`（デフォルト `public`） |
| created_at | timestamptz | |

**リレーション**: `event_id → events.id`（ON DELETE RESTRICT。6章冒頭「その他のFKのON DELETE方針（確定）」参照）、`user_id → profiles.id`。

**ユニーク制約**: `(event_id, user_id)` に UNIQUE（1ユーザー1LIVEにつき1レコード、状態変更はUPDATEで行う）。

**visibility（公開設定）の方針**:
- `public`: 他ユーザーにも参加表明として公開する（デフォルト）。
- `private`: 本人のみ確認可能。他ユーザー・LIVE詳細ページの参加者一覧には表示しない。
- `attended`: 参加済みであることを公開してよい状態（LIVE後の実績表示等を想定）。
- LIVE詳細ページの参加者一覧には `visibility='public'` または `'attended'` のレコードのみ表示する。`private`は本人がマイページ（`/me/events`）で確認する分にのみ表示する。

**DB制約（確定・実装済み）**: `status`・`visibility`にはDB CHECK制約（`event_participants_status_check`・`event_participants_visibility_check`）を設け、値の範囲をそれぞれ`going`/`attended`/`cancelled`、`public`/`private`/`attended`に強制する（`interested`は廃止。statusの`attended`とvisibilityの`attended`は別概念）。`(event_id, user_id)`のUNIQUE、`event_id → events.id`・`user_id → profiles.id`のFK（いずれもON DELETE RESTRICT）は実装済み。

**現在のセキュリティ状態（実装済み。M9）**: deny-by-default（RLS有効・FORCEなし・policy 0件・anon/authenticatedのtable権限なし）で、クライアントからの直接アクセスはすべて不可。visibilityを考慮した読み取りと、本人による書き込みは**未実装**。

**未決定事項（PM判断待ち。確定仕様ではない）**: anon（未ログイン）に参加者一覧のどの範囲（`visibility`）を公開するか、および参加表明のwriteをbase tableのRLSで行うか専用RPCで行うか。参加対象となるeventの条件（公開状態等）も`events`の最終RLS/RPCの確定後に決める。

---

### 6.7 reports

**目的**: 投稿・コメント・ユーザーに対する通報を管理する。

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid (PK) | |
| reporter_id | uuid (FK → profiles.id) | 通報者 |
| target_type | text | `post` \| `comment` \| `profile`（DB CHECK制約の実値。ユーザー通報は`profile`として保存する） |
| target_id | uuid | 対象レコードのID（`target_type`に応じて `posts`/`comments`/`profiles` を参照。ポリモーフィックのためDB外部キー制約は付与しない。実在確認は新規通報時の検証経路で行う。下記「通報の作成・閲覧・処理（確定）」参照） |
| reason | text | 通報理由（カテゴリ。DB CHECK制約で16種類に限定。下記「reasonコードの一覧（確定）」参照） |
| detail | text (nullable) | 選択した`reason`の補足説明を記載する自由記述欄（`create_report()`が両端の空白類をtrimし、空白のみはNULLとして保存する。trim後最大2000文字。DBには`reports_detail_length_check`（`detail IS NULL`または1〜2000文字。文字数で判定）が実装済み。空白のみ文字列のNULL化はこのCHECKではなく`create_report()`の責務。詳細は下記「通報の作成」参照） |
| status | text | `pending` \| `reviewing` \| `resolved` \| `rejected`（デフォルト `pending`） |
| handled_by | uuid (FK → profiles.id, nullable) | 最終判断（`resolved`/`rejected`）を行った管理者。`reviewing`へ変更した管理者ではない。terminalへの遷移時に`auth.uid()`からサーバー側で設定され、クライアントから指定できない。`pending`/`reviewing`ではNULL |
| handled_at | timestamptz (nullable) | 最終判断が完了した日時（`handled_by`が「誰が」最終判断したかを示すのに対し、`handled_at`は「いつ」完了したかを示す。`reviewing`開始日時ではない）。terminalへの遷移時に`now()`で設定される。`pending`/`reviewing`ではNULL |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**リレーション**: `reporter_id → profiles.id`、`handled_by → profiles.id`（いずれもON DELETE RESTRICT）。`target_id` は`target_type`に応じて`posts`/`comments`/`profiles`を指すが、DB外部キーは持たない。

**ユニーク制約**: `(reporter_id, target_type, target_id)` に UNIQUE。同一ユーザーによる同一対象への重複通報は原則禁止とし、DB側で防止する。アプリ側は重複INSERT時に「既に通報済みです」等のエラーとしてハンドリングする。

**通報時の挙動（確定）**:
- 通報されたことを対象ユーザー（`target_id`が指すユーザー、または投稿・コメントの作成者）へ通知しない。
- 通報者（`reporter_id`）の身元を対象ユーザーへ公開しない。`reports`の内容を閲覧できるのは通報者本人（専用RPC経由。下記参照）とadmin(`is_admin()`)のみとし、対象ユーザー・第三者は一切閲覧できない（`reporter_id`・`reason`・`detail`・`status`を含む）。
- 通報された投稿・コメントは、管理者が対応を判断するまでは通常どおり表示する（通報のみを理由に自動で`hidden`化はしない）。
- 管理者が内容を確認した上で、必要に応じて対象の投稿・コメントを`moderate_post()`/`moderate_comment()`経由で`hidden`に変更する等の対応を行う（管理者は`deleted`へ変更できない。6.2/6.3参照）。この対応は`admin_logs`に記録する。

**DB制約（確定）**:
- `target_type`・`status`にはDB CHECK制約を設け、値の範囲をそれぞれ`profile`/`post`/`comment`、`pending`/`reviewing`/`resolved`/`rejected`に強制する（`status`のデフォルトは`pending`）。
- `detail`には`reports_detail_length_check`（`detail IS NULL`または`char_length(detail)`が1〜2000）を設ける（実装済み）。多層防御であり、空白のみの文字列のNULL化・trimは`create_report()`が行う（このCHECK単体では空白のみの文字列は通る。空文字`''`は拒否される）。
- `reports`には次のtriggerが存在する: `reports_enforce_rate_limit`（BEFORE INSERT FOR EACH ROW。同一`reporter_id`につき直近10分（rolling）に5件以上の既存行があれば、6件目のINSERTを`REPORT_RATE_LIMITED`で拒否。件数は`created_at >= now() - interval '10 minutes'`で数え、`status`は問わない。`internal.enforce_report_rate_limit()`はSECURITY DEFINER・owner=postgres・`search_path=''`で、EXECUTEはpostgresのみ）と、`reports_set_updated_at`（`updated_at`の更新）。`reports_enforce_rate_limit`は`reporter_id`単位の`pg_advisory_xact_lock`でINSERTを直列化してからCOUNTするため、同一reporterの並行INSERTでも5件を超えず、別reporterは不要に直列化されない。table-levelのtriggerであるため、`create_report()`だけでなくtrusted/directなINSERT経路でも発火する最終防衛線となる（SECURITY DEFINERなので、RLSがCOUNTに影響しない）。
- `reports`のRLS/table ACLは下記「閲覧」を参照。

**通報の作成・閲覧・処理（確定）**:

*実装状況*
- 実装済み（reportsについて）: `detail`長さCHECK、`status`と`handled_by`/`handled_at`の整合CHECK、レート制限trigger（5件/10分）、RLS/table ACL、admin SELECT policy、`create_report()`（作成）、`get_my_reports()`（reporter本人の履歴）、`process_report()`（管理者の通報処理。`admin_logs`とatomic）。
- 一連の流れ: ユーザーが`create_report()`で通報 → `get_my_reports()`で自分の履歴を確認 → active adminが`process_report()`で処理 → `admin_logs`へ監査記録 → reporterの`get_my_reports()`に`status`/`handled_at`が反映される。
- 未実装（将来）: 終端（`resolved`/`rejected`）を戻す監査ログ付きの専用reopen RPC、`reviewing`の担当者・開始日時を保持する専用field。MVPでは持たない。
- 上記の実装済み範囲はreportsに限る。posts/comments/likes等の他テーブルのレート制限triggerは、本項の実装状況とは別に扱う（8章参照）。

*新規通報（作成）*
- 作成経路は`public.create_report(target_type text, target_id uuid, reason text, detail text DEFAULT NULL) RETURNS uuid`のみ（`SECURITY DEFINER`、owner=postgres、`search_path=''`）。EXECUTEは`authenticated`のみ（anon/PUBLICなし）。`reporter_id`は呼び出し側から受け取らず、常に`auth.uid()`とする。呼び出し側が指定できるのは`target_type`・`target_id`・`reason`・`detail`のみで、`id`・`status`（`pending`）・`handled_by`（NULL）・`handled_at`（NULL）・`created_at`・`updated_at`はDB defaultで、指定・偽装できない。成功時は作成された`reports.id`（uuid）のみを返し、行全体は返さない。
- `target_type`は`profile`/`post`/`comment`の完全一致のみ。`reason`は上記16種類の完全一致のみ。いずれもtrim/lower等の自動補正はしない（不正値はそれぞれ`INVALID_REPORT_TARGET_TYPE`/`INVALID_REPORT_REASON`）。
- `detail`は両端の空白類（ASCII space U+0020・tab・LF・CR・全角space U+3000）をtrimし、その結果が空ならNULLとして保存する。内部の空白・改行は保持する。trim後2000文字（文字数）を超える場合は`REPORT_DETAIL_TOO_LONG`。常にtrim後の値をINSERTする。
- `target_id`がNULLの場合は`REPORT_TARGET_NOT_AVAILABLE`。
- 新規通報できるのは、ログイン済みで`is_active_user()`がtrueの本人（`reporter_id = auth.uid()`）のみ。anon・suspended・banned・profile不在は新規通報不可（`REPORT_NOT_AUTHORIZED`。anonはEXECUTE権限自体がない）。この認可判定はtargetの存否確認や入力検証より先に行う。active adminも通常ユーザーと同じ規則で作成し、target検証等をbypassしない。
- 自分自身への通報（自分の投稿・コメント・プロフィール）は禁止する（`SELF_REPORT_NOT_ALLOWED`）。ただし通報対象として利用可能な自分のpost/commentに対してのみ返し、hidden/deleted等の利用不可な自分のpost/commentは`REPORT_TARGET_NOT_AVAILABLE`とする（存在を漏らさない）。profileはUUID比較のみで判定する。
- 存在しない`target_id`は受理しない。新規通報時に`target_type`に応じて`posts`/`comments`/`profiles`の実在を検証する（外部キーは追加せず、`create_report()`内の検証で保証する）。
- post通報は、通報者から現在fan-facingで閲覧可能な`published`の投稿のみ対象とする。comment通報は、通報者から現在fan-facingで閲覧可能な`published`のコメントかつ親投稿が`published`のもののみ対象とする。hidden/deletedの投稿・コメントおよび親投稿がhidden/deletedのコメントへの新規通報は不可。`create_report()`はSECURITY DEFINERでRLSをbypassするため、この可視性を関数内で明示的に再現している（既存のfan-facing SELECTと同じ結果になることを確認済み）。
- block判定は6.2/6.3のfan-facing visibilityに従う。post通報は通報者→投稿者のblockがあれば不可。comment通報は通報者→親投稿の作成者、および通報者→コメント作成者のいずれかのblockがあれば不可。対象の作成者から通報者へのreverse-only blockや第三者間のblockは新規通報を妨げない。block前に提出済みの通報は保持する。
- profile通報はMVP対象とする。対象profileの`status`が`active`または`suspended`の場合のみ新規通報でき、`banned`・不存在は不可。block判定はPublic Profile RPC（`get_public_profile()`）と同じ双方向とし、通報者→対象、対象→通報者のどちらかにblockがあれば新規通報不可（第三者間のblockは無関係）。
- 上記の「利用不可」（post/comment/profileの不存在・hidden/deleted・親投稿のhidden/deleted・banned・block等）は、対象の存在有無を漏らさないよう外部から区別せず、一律`REPORT_TARGET_NOT_AVAILABLE`とする。
- 同一reporterによる同一対象への重複通報は禁止（`reason`を変えた再通報も不可。resolved/rejected後の再通報も不可）。既存の通報を編集して再利用する仕様は設けない。最終保証は`UNIQUE (reporter_id, target_type, target_id)`で、当該制約のunique違反のみを`REPORT_ALREADY_EXISTS`として返す。事前のduplicate SELECTは行わない。
- 通報作成は`reports`へのクライアント直接INSERTでは行えない（`authenticated`にINSERT権限を与えない。active adminも不可）。作成は`create_report()`のみで行う。
- レート制限（8章。通報5回/10分）はreportsのBEFORE INSERT triggerで実装済み。`create_report()`内部では独自のCOUNTを行わない。BEFORE INSERT triggerはUNIQUE制約の判定より先に実行されるため、直近10分に既に5件ある状態で重複通報を行った場合は、`REPORT_ALREADY_EXISTS`ではなく`REPORT_RATE_LIMITED`が先に返る（rate-limit防御を優先する仕様）。
- `create_report()`の正式なエラーコードは次の8種類のみ: `REPORT_NOT_AUTHORIZED`、`INVALID_REPORT_TARGET_TYPE`、`INVALID_REPORT_REASON`、`REPORT_DETAIL_TOO_LONG`、`REPORT_TARGET_NOT_AVAILABLE`、`SELF_REPORT_NOT_ALLOWED`、`REPORT_ALREADY_EXISTS`、`REPORT_RATE_LIMITED`。エラー文言はコードのみで、内部情報（対象の状態・block関係等）を含めない。失敗時に`reports`の行は残らない。

*閲覧*
- `reports`はRLS有効（FORCEなし）。policyは`reports_select_admin`（`FOR SELECT TO authenticated USING (public.is_admin())`）の1件のみで、reporter本人向けのpolicyは存在しない。table ACLは、anonは権限なし、`authenticated`はSELECTのみ（INSERT/UPDATE/DELETE/TRUNCATE等なし。列単位のwrite権限もなし）。postgres/service_roleのACLは変更していない。一般ユーザーは、SELECT権限があってもRLSにより`reports`本体では常に0行となる。
- 通報者本人は、`reports`本体では自分の通報を見られない。自分の通報履歴・状態は`public.get_my_reports(after_created_at timestamptz DEFAULT NULL, after_id uuid DEFAULT NULL, page_size integer DEFAULT 20)`（`SECURITY DEFINER`、owner=postgres、`search_path=''`。EXECUTEは`authenticated`のみ）で確認する。返却列は`id`・`target_type`・`target_id`・`reason`・`detail`・`status`・`created_at`・`updated_at`・`handled_at`のみで、`reporter_id = auth.uid()`の行のみを返す。`reporter_id`と、対応した管理者を示す`handled_by`は戻り値の型に含まず、返さない（`handled_at`は返す）。`status`（`pending`/`reviewing`/`resolved`/`rejected`）による絞り込みはしない。
- `get_my_reports()`の認可は、`auth.uid()`が存在し、対応する`profiles`の行が存在することのみ（profileの`status`は問わない）。したがってactive・suspended・bannedのいずれのreporterも、既存の自分の通報を確認できる（新規通報は不可）。`auth.uid()`がNULL、またはprofileが存在しない異常状態は`REPORT_NOT_AUTHORIZED`でfail closedとする。`is_active_user()`は要求しない。
- `get_my_reports()`はadmin（active/suspended/bannedを問わず）が呼んでも自分の通報のみを返し、adminだから全件を返す分岐はない。adminの全件閲覧は`reports_select_admin`によるbase-table SELECTの別責務。
- `get_my_reports()`は`posts`/`comments`/`profiles`/`blocks`へJOINしない。したがって、通報作成後に対象がhidden/deleted/suspended/banned/物理削除された場合、blockが成立した場合、通報者自身がsuspended/bannedになった場合でも、`reports`の行が存在する限り履歴は返る。
- 並び順は`created_at DESC, id DESC`。keyset paginationで、次ページは`(created_at, id) < (after_created_at, after_id)`。`after_created_at`と`after_id`は両方NULL（先頭ページ）か両方非NULL（次ページ）とし、片方のみ非NULLは`INVALID_REPORT_CURSOR`。cursorが実在する通報行である必要はなく、存在確認は行わない。`page_size`はNULL→20、1未満→1、100超→100にclampし（エラーにしない）、0件は正常系（0行）。
- active admin（`is_admin()`）のみ、moderation用途として`reports`本体をSELECTでき、`reporter_id`・`reason`・`detail`・`status`・`handled_by`・`handled_at`を含む全体を閲覧できる。suspended/bannedのadminは不可（0行）。
- 対象ユーザー（投稿者・コメント投稿者・被通報プロフィール本人）・第三者・anonは、`reports`を閲覧できない。

*更新・取消*
- 通報者は、提出後の`reason`・`detail`・`target_type`・`target_id`・`status`・`handled_by`・`handled_at`のいずれも変更できない。通報の取消・削除もMVPでは行えない（誤通報も含めmoderation queue上の記録として保持する）。`authenticated`にはUPDATE/DELETE権限を与えていないため、active adminを含めクライアントからの`reports`直接UPDATE/DELETEはできない。
- 管理者による通報の処理（`status`・`handled_by`・`handled_at`の変更）は、`reports`へのdirect UPDATEではなく専用のSECURITY DEFINER RPC `process_report()`（下記「通報の処理」）経由に限定し、active adminのみ実行できる。`handled_by`は`auth.uid()`からサーバー側で設定し、`handled_by`・`handled_at`をクライアントから指定させない。通常運用では物理DELETEは行わず、`status`で管理する。

*通報の処理（`process_report()`。実装済み）*
- signature: `public.process_report(target_report_id uuid, new_status text, note text DEFAULT NULL) RETURNS void`。`SECURITY DEFINER`、owner=postgres、`search_path=''`。EXECUTEは`authenticated`のみ（anon/PUBLICなし）。`authenticated`から呼べるが、関数内で最初に`public.is_admin()`を評価し、active adminのみ処理できる（一般ユーザー・suspended/bannedのadmin・profile不在・`auth.uid()`がNULLはすべて拒否）。この認可判定は他のどの検証より先に行うため、未認可の呼び出しにreportの存在を漏らさない。
- 検証と処理の順序: 認可 → `new_status`の検証 → `note`の正規化・長さ検証 → 対象reportのlookup（`SELECT ... FOR UPDATE`）→ 遷移の検証 → `reports`のUPDATE → `admin_logs`のINSERT。
- `new_status`の正規値は`pending`/`reviewing`/`resolved`/`rejected`の完全一致のみ。NULL・空文字・前後の空白・大文字小文字違い・未知の値は`INVALID_REPORT_STATUS`（trim/case補正はしない）。`pending`自体は正規値なので、`new_status='pending'`は`INVALID_REPORT_STATUS`ではなく、遷移の検証で`INVALID_REPORT_TRANSITION`となる。
- 遷移規則（確定）: 成功するのは次の5通りのみ。`pending → reviewing`、`pending → resolved`、`pending → rejected`、`reviewing → resolved`、`reviewing → rejected`。それ以外の11通りは`INVALID_REPORT_TRANSITION`。`pending → resolved/rejected`の直接遷移は許可し、`reviewing`は必須のステップではない。`pending → pending`・`reviewing → reviewing`・`resolved → resolved`・`rejected → rejected`のno-opも成功扱いにせず`INVALID_REPORT_TRANSITION`とし、`admin_logs`も作らない。
- `resolved`/`rejected`はterminalで、MVPではreopenしない。`reviewing`は「管理者による確認作業中」を示す非terminalのstatusであり、担当者のlockではない。MVPでは`reviewing`の担当者・開始日時を`reports`に保存せず、誰が`reviewing`へ変更したかは`admin_logs`に残る。将来必要になれば、監査ログ付きの専用reopen RPCを別途設計する。
- 更新内容: `reviewing`へは`status`のみを更新し、`handled_by`/`handled_at`はNULLのまま。`resolved`/`rejected`へは`status`を更新するとともに、`handled_by = auth.uid()`、`handled_at = now()`を設定する（`handled_by`は最終判断を行ったadmin、`handled_at`は最終判断の完了日時）。これは`reports_handled_fields_consistency_check`（下記）を満たす。`updated_at`は既存の`reports_set_updated_at`triggerで更新され、RPCからは直接設定しない。
- 同時実行: 対象reportを`SELECT ... FOR UPDATE`でlockし、lock取得後の最新の`status`に対して遷移を検証する。`expected_current_status`のような引数はMVPでは持たない。したがって、adminAが`pending → reviewing`を確定した直後に、`pending`の古い画面を見ていたadminBが`rejected`を送信した場合、Bはlock取得後に`reviewing → rejected`として検証され、合法なので成功する（同じreportを2人が`resolved`にする等、terminalへの二重確定は後続側が`INVALID_REPORT_TRANSITION`となる）。UIはmutation後に最新状態を再取得する。
- 対象reportがNULLまたは存在しない場合は同一の`REPORT_NOT_AVAILABLE`（`create_report()`の`REPORT_TARGET_NOT_AVAILABLE`＝通報対象が利用不可、とは別の概念）。
- `note`（任意）: `reports`には保存せず、`admin_logs.detail`にのみ保存する。両端の空白類（U+0020・tab・LF・CR・U+3000）をtrimし、空白のみならNULLとして扱う。内部の空白・改行・U+3000は保持する。正規化後1000文字（character数）を超える場合は`REPORT_PROCESSING_NOTE_TOO_LONG`。rejected時も必須にはしない。
- `admin_logs`への記録（6.11参照）: 成功した遷移ごとにちょうど1行を、`admin_id = auth.uid()`、`action = 'process_report'`、`target_type = 'report'`、`target_id = reports.id`で記録する。`detail`は`{"from_status": "...", "to_status": "..."}`で、正規化後の`note`がある場合のみ`"note"`を追加する（NULLならkeyごと省略）。reporter・`reports.reason`/`detail`・通報対象の本文・プロフィール情報等は`admin_logs`に複製しない。
- atomicity: `reports`のUPDATEと`admin_logs`のINSERTは同一トランザクションでatomicに行う。どちらかが失敗すれば全体がrollbackされ、片方だけが成立する状態は作らない。
- 自分が作成した通報をactive adminが自分で処理することは禁止しない（MVPでは自己処理の制限を設けない）。
- `process_report()`のエラーコードは次の5種類のみ: `REPORT_PROCESSING_NOT_AUTHORIZED`、`INVALID_REPORT_STATUS`、`REPORT_PROCESSING_NOTE_TOO_LONG`、`REPORT_NOT_AVAILABLE`、`INVALID_REPORT_TRANSITION`。エラー文言はコードのみ。`create_report()`のエラーコード（上記「新規通報（作成）」）・`get_my_reports()`のエラーコード（`REPORT_NOT_AUTHORIZED`/`INVALID_REPORT_CURSOR`）とは別のセットとして扱う。
- レート制限は、通報の作成（5回/10分）のみが対象で、`process_report()`にはレート制限を設けない。

*`status`とhandled系列の整合（DB制約）*
- `reports_handled_fields_consistency_check`（実装済み）: `status IN ('pending','reviewing')`のとき`handled_by IS NULL AND handled_at IS NULL`、`status IN ('resolved','rejected')`のとき`handled_by IS NOT NULL AND handled_at IS NOT NULL`。`postgres`/`service_role`等のtrustedな経路からも不整合な組み合わせは入らない（defense-in-depth）。`reviewing`の担当者は`handled_by`に持たせない。

*対象のmoderationとの分離*
- 通報の処理（`process_report()`による`status`の変更）だけでは、対象の投稿・コメントを自動的に`hidden`/`deleted`にしない。`process_report()`は通報レコードの処理のみを行い、`moderate_post()`/`moderate_comment()`を呼び出さない。対象のmoderationが必要な場合は、既存の`moderate_post()`/`moderate_comment()`を別操作として使用する（これらは変更しない）。逆に、`moderate_post()`/`moderate_comment()`を実行しても、関連する通報の`status`は自動では変更されない。通報の処理と対象のmoderationは完全に別操作である。
- profile通報を処理しただけでは、対象ユーザーの`profiles.status`（suspended/banned）を自動変更しない。ユーザーstatusの変更は通報workflowとは別責務（6.1.3の管理者用RPC等で別途設計する）。
- 通報作成後に、対象の投稿・コメント・プロフィールの状態が変化しても、または通報者が`suspended`/`banned`になっても、通報の記録は保持する（自動削除しない）。
- `reason`にもDB CHECK制約を設け、値の範囲を下記「reasonコードの一覧（確定）」に記載する16種類に限定する。

**reasonコードの一覧（確定）**:

`reason`はDB CHECK制約により、以下16種類の値に限定する。1〜15は第10章の禁止事項15項目にそれぞれ対応し、16番目の`other`はいずれにも適切に分類できない場合の受け皿とする。

| No. | 第10章の禁止事項 | reasonコード |
|---|---|---|
| 1 | 誹謗中傷 | `defamation` |
| 2 | 脅迫 | `threats` |
| 3 | 差別 | `discrimination` |
| 4 | 嫌がらせ | `harassment` |
| 5 | 個人情報の投稿 | `personal_info_exposure` |
| 6 | なりすまし | `impersonation` |
| 7 | 詐欺 | `fraud` |
| 8 | チケット転売 | `ticket_scalping` |
| 9 | 違法行為 | `illegal_activity` |
| 10 | 無断転載 | `unauthorized_repost` |
| 11 | 著作権侵害 | `copyright_infringement` |
| 12 | 歌詞全文の掲載 | `full_lyrics_posting` |
| 13 | 無断画像・動画の掲載 | `unauthorized_media_posting` |
| 14 | スパム | `spam` |
| 15 | 出会い目的のみの利用 | `dating_solicitation` |
| 16 | （15項目に分類できない場合） | `other` |

- `unauthorized_repost`（無断転載）・`copyright_infringement`（著作権侵害）・`unauthorized_media_posting`（無断画像・動画の掲載）は、実際の通報では重複して該当しうるが、第10章の構成をそのまま維持するため統合せず、独立したコードとして扱う。
- `detail`は、選択した`reason`の補足説明を記載する自由記述欄として使用する。
- `reason`はユーザーが通報時に選択する分類であり、法的な判断（例: 実際に著作権侵害・詐欺・違法行為等に該当するかどうかの法的評価）を意味するものではない。あくまで通報者による分類であり、最終的な事実確認・対応判断は管理者が行う。

---

### 6.8 blocks

**目的**: ユーザー間のブロック関係を管理する。

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid (PK) | |
| blocker_id | uuid (FK → profiles.id) | ブロックした側 |
| blocked_id | uuid (FK → profiles.id) | ブロックされた側 |
| created_at | timestamptz | |

**リレーション**: `blocker_id → profiles.id`、`blocked_id → profiles.id`。

**ユニーク制約**: `(blocker_id, blocked_id)` に UNIQUE。加えて `blocker_id <> blocked_id` のCHECK制約を設ける（確定。自己ブロック防止）。

**ブロック時の挙動（確定）**:
- ブロックした側（`blocker_id`）には、ブロックしたユーザー（`blocked_id`）の投稿・コメントを表示しない。この非表示はブロックした本人から見た場合にのみ適用する一方向の制御であり、`posts`/`comments`のSELECT側で`blocks`テーブルを参照して除外する（6.2 posts、6.3 comments参照）。
- ブロックされた側（`blocked_id`）には、自分がブロックされたことを通知しない。ブロックされた側から見た場合、相手の投稿・コメントは通常どおり表示されてよい（本仕様では相手側の閲覧制限までは行わない）。
- 上記以外の細かなブロックUX（例: ブロック済みユーザーからのコメント個別非表示の粒度、ブロック一覧のUI等）はMVPでは最小限とし、将来拡張可能な設計とする。

---

### 6.9 news

**目的**: 運営が発信するニュース記事。

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid (PK) | |
| title | text | タイトル |
| content | text | 本文 |
| image_url | text (nullable) | Storage `news-images` バケット内のobject key（完全URLではない。9章参照） |
| source_url | text (nullable) | 公式情報源へのリンク（任意） |
| status | text | `draft` \| `published`（デフォルト `draft`） |
| published_at | timestamptz (nullable。`status='draft'` の場合のみ) | 公開日時（未来日時を設定した場合は、その日時が到来するまで一般ユーザーには公開しない）。`status='draft'`の場合はNULLを許容し、`status='published'`の場合は必須とする |
| created_by | uuid (FK → profiles.id) | 作成した管理者 |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**リレーション**: `created_by → profiles.id`。

**ユニーク制約**: なし。

**表示制御の方針**:
- 一般ユーザーには `status='published'` かつ `published_at <= 現在時刻` の記事のみ表示する。
- 管理者は `status='draft'` の記事、および `published_at` が未来の記事も `/admin/news` で閲覧・編集できる。

**DB制約（確定）**:
- `status`にはDB CHECK制約を設け、値の範囲を`draft`/`published`に強制する。
- `status`と`published_at`の整合性（`draft`ならNULL許容、`published`なら必須）をDB制約（CHECK等）で担保する方針とする。

---

### 6.10 songs

**目的**: 楽曲情報の管理（`/music` ページ用）。

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid (PK) | |
| title | text | 楽曲名 |
| release_date | date (nullable) | リリース日 |
| cover_image_url | text (nullable) | Storage `song-images` バケット内のobject key（完全URLではない。9章参照） |
| description | text (nullable) | 楽曲説明 |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**リレーション**: なし（独立マスタ）。

**ユニーク制約**: なし。

**備考（コミュニティルール反映）**: 歌詞全文の掲載は禁止事項のため、`lyrics` 等の全文格納カラムは設けない。引用する場合も短い抜粋のみを想定し、専用カラムは用意せず `description` 内での短文引用に留める運用とする。

**備考（作成者の記録について・確定）**: `events`/`news`とは異なり、`created_by`（作成した管理者）列は持たない（意図的な設計。楽曲マスタの作成・変更操作は`admin_logs`の記録で十分と判断し、追跡用の列は追加しない）。

---

### 6.11 admin_logs

**目的**: 管理者操作の監査ログ。

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid (PK) | |
| admin_id | uuid (FK → profiles.id) | 操作した管理者 |
| action | text | 操作種別（実装済み: `moderate_post`, `moderate_comment`, `process_report`, `create_event`, `update_event`, `set_event_status`。将来の専用RPCの例として`ban_user`等。`ban_user`は現時点で存在しない） |
| target_type | text | 操作対象の種別（例: `post`, `comment`, `report`, `event`, `user`。`report`は`process_report`が、`event`は`create_event`・`update_event`・`set_event_status`が記録する） |
| target_id | uuid | 操作対象のID |
| detail | jsonb (nullable) | 操作の詳細（変更前後の値など） |
| created_at | timestamptz | |

**リレーション**: `admin_id → profiles.id`。

**ユニーク制約**: なし。

**書き込み経路の方針（確定）**:
- `admin_logs`へのINSERTをクライアントから直接許可するRLSポリシーは作成しない。active admin自身であっても、`admin_logs`への直接INSERT/UPDATE/DELETEは許可しない（追記のみ・改ざん不可の監査ログとする。UPDATE/DELETEのpolicy自体を作成しない）。
- 投稿・コメントのモデレーションに伴う`admin_logs`への記録は、`moderate_post()`/`moderate_comment()`という、それぞれ`owner=postgres`のSECURITY DEFINER RPC内部でのみ行う（6.2/6.3参照）。これらのRPCは、呼び出し元が`is_admin()`（`role='admin'`かつ`status='active'`）であることを確認したうえで、対象の`posts.status`/`comments.status`変更と`admin_logs`へのINSERTを同一トランザクション内でatomicに実行する。ログ記録が失敗した場合はstatus変更もロールバックされ、status変更が失敗した場合はログも残らない（片方だけが成立する状態を作らない）。
- eventsの管理者のwrite（`create_event()`・`update_event()`・`set_event_status()`。実装済み）も、それぞれSECURITY DEFINER RPC（owner=postgres）の内部で、eventの変更とatomicに`admin_logs`へ記録する（`action`は`create_event`・`update_event`・`set_event_status`、`target_type='event'`、`target_id`=event id。`detail`は`{"to_status":"draft"}`・`{"changed_fields":[...]}`・`{"from_status":"...","to_status":"..."}`で、内容の値は記録しない。6.5参照）。events のread RPC（`get_admin_events`・`get_admin_event`）は`admin_logs`に記録しない。
- 通報（`reports`）の処理に伴う`admin_logs`への記録も同様に、SECURITY DEFINER RPC `process_report()`（owner=postgres）内部で、`reports`の`status`/`handled_by`/`handled_at`の変更とatomicに行う（実装済み）。`process_report()`は成功した遷移ごとにちょうど1行を、`action='process_report'`、`target_type='report'`、`target_id=reports.id`、`detail={from_status, to_status[, note]}`（`note`は任意で、NULLならkeyごと省略）として記録する。reporter情報・`reports.reason`/`detail`・通報対象の本文等は記録しない（6.7参照）。
- 将来実装するServer Action / Route Handler等のアプリケーション層は、`admin_logs`へ直接INSERTしない。これらはモデレーション要求を受け付け、`moderate_post()`/`moderate_comment()`を呼び出す経路としてのみ機能する（最終的なauthorizationとatomicityの強制はDB側RPCが担い、アプリケーション層はこれを代替しない）。
- `detail`には`from_status`・`to_status`・任意の`reason`（前後空白をtrimし、空文字/空白のみはNULLとして省略、最大500文字）等、必要最小限の情報のみを記録する。投稿・コメントの本文全文、`email`、IPアドレス、認証token、secret、passwordその他不要な個人情報は記録しない。
- 管理者操作の監査ログであるため、一般ユーザー（管理者を含む）によるクライアント経由の改ざん・偽装記録を防止することを目的とする。

**DB制約（確定）**: `action`・`target_type`はfree textとし、DB CHECK制約による固定enum化は行わない（確定。将来増える運用アクションを都度スキーマ変更せずに記録できるようにするため）。

---

### 6.12 login_attempts

**目的**: ログイン失敗を記録し、アカウント単位のレート制限（8章「レート制限の実装方式（確定）」参照）に用いる。

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid (PK) | |
| email | text | 試行対象のメールアドレス（正規化済みの値を保存する。8章「ログイン失敗（アプリ側で制御）」参照） |
| ip_address | inet (nullable) | 参考情報として記録するIPアドレス |
| attempted_at | timestamptz | 失敗が発生した日時 |

**リレーション**: なし。`profiles`/`auth.users`へのFKは意図的に持たせない（存在しないメールアドレスへの試行も同様に記録し、メールアドレスの存在有無を推測させないため）。

**ユニーク制約**: なし。

**記録方式・RLS方針**: 8章「レート制限の実装方式（確定）」の「ログイン失敗（アプリ側で制御）」を参照。

**現在のDB実装状態（実装済み。M9・M10）**:
- RLS有効（FORCEなし）。policyは`login_attempts_select_admin`（`FOR SELECT TO authenticated USING (public.is_admin())`）の1件のみ。table ACLは、anonは権限なし、`authenticated`はSELECTのみ（INSERT/UPDATE/DELETE/TRUNCATE等なし）。postgres・service_roleのACLは変更していない。
- active admin（`is_admin()`）のみ全行をSELECTできる（`email`・`ip_address`を含むため管理目的以外の公開経路は設けない）。一般ユーザー（active/suspended/banned）・suspended/bannedのadmin・profile不在・`auth.uid()`がNULLの場合は0行。adminを含むauthenticatedのクライアントからのINSERT/UPDATE/DELETEはできない（read-only）。anonはSELECTを含めて一切アクセスできない。
- **書き込み経路は未実装**: ログイン失敗の記録、5回/15分のlockout判定、ログイン成功時の履歴クリアはまだ動作しない。Next.jsのログイン処理（IPの取得方法・失敗判定の位置・lockout判定の位置・trusted serverの境界）と合わせて設計する。将来の記録経路はtrusted server（service_role等）側から行い、anon・authenticatedが呼び出せて任意のemailに失敗履歴を注入できるRPCは作らない（具体的なRPCのsignatureは未確定）。

---

### 6.13 app_settings

**目的**: 現行の利用規約バージョン・現行のプライバシーポリシーバージョンをはじめとする、アプリケーション全体の設定値をDB側で一元管理する（確定。Q45）。アプリケーション側の定数を正本とせず、本テーブルを正本とする。

**構造（確定。Q47）**: `app_settings`はkey-value方式ではなく、固定カラム・単一行方式とする。

| カラム | 型 | 説明 |
|---|---|---|
| id | 固定値方式 | 単一行であることをDB制約で保証するための識別列。具体的なSQL表現（例: 固定値のPRIMARY KEY等）はmigration実装時に決定してよいが、複数行を作成できる設計にはしない |
| current_terms_version | text | NOT NULL。現在の利用規約バージョン。初期値`'1.0'`（確定。Q49） |
| current_privacy_policy_version | text | NOT NULL。現在のプライバシーポリシーバージョン。初期値`'1.0'`（確定。Q49） |
| updated_at | timestamptz | NOT NULL DEFAULT `now()`。6章冒頭の共通`BEFORE UPDATE`トリガー（確定。Q37）の対象とする |

- `app_settings`は1行のみ存在する設定テーブルとする（確定）。DB制約によって1行しか存在できないことを保証する。
- `current_terms_version`・`current_privacy_policy_version`はいずれも`text`型とし、数値型ではなく文字列として扱う（確定）。
- 利用規約とプライバシーポリシーのバージョンは、それぞれ独立して変更可能とする（確定）。例: termsが`1.0`→`1.1`、privacyが`1.0`→`1.1`→`1.2`のように、両方を同時に更新する必要はない。
- 初回migrationで作成する単一レコードの初期値は、`current_terms_version = '1.0'`・`current_privacy_policy_version = '1.0'`とする（確定。Q49）。

**リレーション**: なし（独立した設定用テーブル）。

**ユニーク制約**: なし（1行のみという制約自体は、上記の単一行保証の仕組みで担保する。具体的なSQL表現はmigration実装時に決定する）。

**アクセス制御方針（確定）**:
- `app_settings`はDB内部の信頼できる設定値の正本として扱い、一般クライアントから直接読み取らせない（確定。Q46）。
- anonによる`app_settings`の直接SELECTは禁止する（確定。Q46）。
- authenticated一般ユーザーによる`app_settings`の直接SELECTも禁止する（確定。Q46）。
- 一般ユーザー（anon・authenticatedいずれも）によるINSERT/UPDATE/DELETEも禁止する（確定。Q45／Q46）。DB権限/RLS等で保証する。
- adminについても、MVPで直接SELECTする必要がない限り、広い直接SELECT権限を付与しない（確定。Q46）。service roleや、必要なDB内部処理（下記のtrigger・RPC等）など、明確に必要な経路のみアクセス可能とする。
- 現行バージョンの参照は、`profiles`自動作成trigger（7章「profilesの自動作成（確定）」参照）および`record_policy_consent()`（6.1.3参照）が、いずれもDB内部から（クライアント経由の直接SELECTではなく）行う。signupと再同意の双方が、同じ`app_settings`上の現行バージョンを参照する。これらの処理で`SECURITY DEFINER`を使用する場合は、既存仕様（`is_admin()`等）と同様に`search_path`を固定し、必要最小限の権限とする。
- 将来、現行規約バージョンをクライアント画面へ表示する必要が生じた場合でも、`app_settings`テーブル全体を直接公開しない（確定。Q46）。その場合は、必要な値だけを返す安全なサーバー側処理または専用の読み取り手段を別途設計するものとし、MVP時点ではそのための新しいRPC/APIは追加しない。
- **実装状況（実装済み。M9）**: `app_settings`はRLS有効（FORCEなし）・policy 0件で、anon・authenticatedのtable権限はなく、クライアントからのSELECT/INSERT/UPDATE/DELETEはすべて不可。postgres・service_roleのACLは変更していない。`handle_new_user()`（SECURITY DEFINER・owner=postgres）は引き続き`app_settings`を読み取れるため、signupはM9後も正常に動作する。既存の1行（`id=1`、両バージョンとも`'1.0'`）は変更していない。
- 現行バージョンを将来変更する具体的な運用方法（migrationによる更新か、別の安全な管理経路か）は、本バージョンでは確定しない。新たな管理者用RPCや管理画面は今回追加しない。

---

## 7. 認証（Supabase Auth）

- Supabase Authを用いた認証を行う（メールアドレス＋パスワードを基本とする）。
- サインアップ時に `auth.users` レコード作成を起点として、DBトリガーで対応する `profiles` レコードを自動作成する（確定。詳細は下記「profilesの自動作成（確定）」参照）。
- パスワード再設定は `/forgot-password` からSupabase Authの機能を利用する。
- セッション管理はSupabaseのSSR/クライアントSDKに準拠する。

### profilesの自動作成（確定）

会員登録時の`profiles`作成方式は、Supabase Authによる`auth.users`作成を起点とするDBトリガー方式に確定する。

- サインアップ時に必要なプロフィール情報・同意情報（少なくとも`username`・`display_name`）は、Authのユーザーメタデータ等、トリガーから参照可能な方法でクライアントから渡し、トリガーが`profiles`レコード作成時にNOT NULL項目を満たせるようにする。
- クライアントから渡されたメタデータを無条件に信頼しない。特に`role`・`status`のような権限・アカウント状態情報は、クライアントメタデータからは設定せず、DB側で安全な初期値（`role='member'`・`status='active'`）を設定する。
- `terms_version`・`privacy_policy_version`についても、クライアントから渡された値を現行バージョンの正本として信用しない（確定。Q45）。`app_settings`（6.13参照）に保存された現行の利用規約バージョン・現行のプライバシーポリシーバージョンを基準とし、トリガーは`profiles.terms_version`・`profiles.privacy_policy_version`に`app_settings`側の値を記録する。クライアントには、ユーザーが現在の規約・プライバシーポリシーへ同意したことの確認（同意チェックボックス等）のみを求める。
- username形式（6.1参照）、username UNIQUE制約、必須値の充足については、DB/サーバー側でも必要な検証を行う。
- 上記の目的は、`auth.users`は存在するが`profiles`が存在しない不整合状態を極力作らないことである。
- 具体的なトリガー関数のSQL・メタデータの受け渡し方法は、本バージョンでは確定せず、migration設計時に決定する。

### 利用規約・プライバシーポリシーへの同意記録（確定）

- サインアップ時に、利用規約への同意を `profiles.terms_version`（同意したバージョン）と `profiles.terms_agreed_at`（同意日時）として記録する。
- 同様に、プライバシーポリシーへの同意を `profiles.privacy_policy_version` と `profiles.privacy_policy_agreed_at` として記録する。
- 「現行の利用規約バージョン」「現行のプライバシーポリシーバージョン」は、アプリケーション側の定数を正本とせず、DB側の`app_settings`テーブル（6.13参照）で一元管理する（確定。Q45）。ログイン中のユーザーの各バージョンがそれと一致しない場合に比較できるデータ構造をMVPの時点で用意しておく。
- 規約またはプライバシーポリシーを改定した場合に、既存ユーザーへ再同意を求めるかどうか（および求める場合のフロー）は、その改定が発生した時点で判断する。MVP時点ではバージョンを記録・比較できる状態にしておくことのみを必須要件とする。
- 同意記録の更新（再同意処理）は、本人による直接UPDATEではなく、`record_policy_consent()`という専用のRPC（6.1.3参照）を経由して行う。

---

## 8. セキュリティ方針

- **RLS必須**: 全テーブルでRow Level Securityを有効化する（現在のDBでは全13テーブルでRLSが有効。policyが未作成のテーブルはクライアントから全拒否。下記「現在のDB実装状況」参照）。画面上でボタンを非表示にする・APIレスポンスを絞るなどのアプリケーション層の制御だけに頼らず、DB側でも権限を制御する。
- **サービスロールキーの非公開**: `SUPABASE_SERVICE_ROLE_KEY` はサーバーサイド専用とし、クライアントに一切露出させない（環境変数はサーバー専用の変数名で管理し、`NEXT_PUBLIC_` プレフィックスを付けない）。
- **入力値バリデーション**: フォーム入力（投稿・コメント・プロフィール等）はクライアント側・サーバー側の両方でバリデーションを行う。
- **画像アップロード制限（確定）**: 許可する形式は JPEG / PNG / WebP、最大ファイルサイズは 5MB とする。クライアント側での事前チェックに加え、サーバー側（アップロード処理・Storageポリシー）でもMIMEタイプとサイズを必ず検証し、クライアント側チェックのみに依存しない。
- **スパム・レート制限**: 投稿・コメント・いいね・通報・ログイン試行の連続実行に対するレート制限を設ける（対象範囲・初期閾値・実装方式ともに確定。詳細は本章「レート制限の対象範囲・初期閾値（確定）」および「レート制限の実装方式（確定）」を参照）。
- **値の整合性（確定）**: `role`/`status`/`post_type`等、列挙値を持つカラムには6章の各テーブル節に記載の通りDB CHECK制約を設け、アプリ側バリデーションのみに依存しない。
- **秘密情報の管理**: `.env.local` 等の秘密情報はGitにコミットしない。`.gitignore` で除外を徹底する。

### セキュリティbaseline（実装済み。M9）

- 対象6テーブル（`events`・`event_participants`・`news`・`songs`・`login_attempts`・`app_settings`）は、RLS無効かつanon/authenticatedにtableの全権限が付与された状態だったため、M9でdeny-by-defaultにした。M9直後の状態は、6テーブルとも RLS有効（FORCEなし）・policy 0件・anonとauthenticatedのtable権限なし・列単位のACLなし。postgres・service_roleの既存ACLは変更していない。
- 続いて、M10で`login_attempts`のactive adminのSELECT境界（6.12参照）を、M11・M12で`events`の公開の読み取り境界（行はRLS policy `events_select_public`、列は公開8列のみの列単位のSELECT権限。6.5参照）を、M13・M14で`events`のadmin読み取り境界（SECURITY DEFINER RPC `get_admin_events`・`get_admin_event`。6.5参照）を、M15〜M17で`events`のadmin書き込み境界（SECURITY DEFINER RPC `create_event`・`update_event`・`set_event_status`。6.5参照）を追加した。したがって現在は、`event_participants`・`news`・`songs`・`app_settings`の4テーブルがM9のdeny-by-defaultのままである（`app_settings`はクライアント全拒否が最終形）。
- default privilege: `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public`により、postgresが今後`public`スキーマに作成するtableへのanon/authenticatedの自動的なtable権限付与を除去した。service_roleのdefault privilege、sequence・function・typeのdefault privilege、schema権限は変更していない。今後もschemaの変更はmigration経由で行う方針を維持する。`supabase_admin`が作成するtableのdefault privilegeは変更していない。
- 公開読み取り（news・songs）や本人のwrite（event_participants）が必要な機能は、各tableの最終RLS/RPCが実装されるまでクライアントから利用できない。`events`は、公開の読み取り（公開8列を明示して取得する）と、adminの読み取り（`get_admin_events`・`get_admin_event`のRPC）、adminの書き込み（`create_event`・`update_event`・`set_event_status`のRPC）が利用できる（いずれもDBレベル。画面とNext.jsの統合は未実装）。

### 現在のDB実装状況と最終要件の区別（events / event_participants / news / songs / login_attempts / app_settings）

次の表は「MVPの最終要件（方針）」であり、現在のDB実装ではない。現在のDB実装は上記baselineのとおり、`login_attempts`はM10でactive adminのSELECTのみ実装済み、`app_settings`はM9でクライアント全拒否（最終形として実装済み）、`events`はM11・M12で公開の読み取り境界（行はRLS、列は公開8列）、M13・M14でadminの読み取り境界（SECURITY DEFINER RPC）、M15〜M17でadminの書き込み境界（SECURITY DEFINER RPC）が実装済み、`event_participants`・`news`・`songs`は全拒否で最終RLS/RPCは未実装である。`events`の現在の実装と最終要件は6.5、`event_participants`は6.6を参照。

### RLSポリシーの基本方針（テーブル別）

| テーブル | 参照(SELECT) | 作成(INSERT) | 更新/削除(UPDATE/DELETE) |
|---|---|---|---|
| profiles | 本人は自分自身の行のみSELECT可、adminは管理上必要な行をSELECT可。一般ユーザーによる他ユーザーの`profiles`本体への直接SELECTは禁止し、公開情報の取得は`get_public_profiles()`/`get_public_profile()`（SECURITY DEFINER RPC。6.1.4参照）経由に限定する | 本人（サインアップ時） | 本人（保護対象カラムを除く。6.1.3参照） or admin(`is_admin()`)（role/status等の保護対象カラムの変更は専用RPC経由。6.1.3参照） |
| posts | `status='published'`は全員（ただしログイン中は自分がブロックした投稿者の投稿を除く）、`hidden`/`deleted`は投稿者本人 or admin(`is_admin()`)のみ | ログイン済み本人（`status='active'`のユーザーのみ） | 通常編集（`content`/`image_url`のみ）は投稿者本人・`status='published'`の場合に限る。物理DELETEは不可。`status`の変更は直接UPDATE不可で、本人の`delete_own_post()`（logical delete、terminal）または管理者の`moderate_post()`（`published`↔`hidden`のみ、`deleted`の生成・復元は不可）という専用RPC経由に限定する |
| comments | `status='published'`かつ親投稿が公開範囲内なら全員（ただしログイン中は自分がブロックした投稿者のコメントを除く）、それ以外はコメント投稿者本人 or admin(`is_admin()`)のみ | ログイン済み本人（`status='active'`のユーザーのみ） | 通常編集（`content`のみ）はコメント投稿者本人・`status='published'`の場合に限る。物理DELETEは不可。`status`の変更は直接UPDATE不可で、本人の`delete_own_comment()`（logical delete、terminal）または管理者の`moderate_comment()`（`published`↔`hidden`のみ、`deleted`の生成・復元は不可）という専用RPC経由に限定する |
| likes | fan-facingでは親投稿が公開範囲内の場合のみ全員が閲覧可。それとは独立して、いいねをした本人（`user_id=auth.uid()`）は親投稿の`status`/visibilityや自身の`profiles.status`に関わらず自分のlike行のみ常にSELECT可（6.4参照。投稿者本人への他人likes閲覧の特別権限はなし） | ログイン済みactive本人（`status='active'`のユーザーのみ、`user_id=auth.uid()`、親投稿がfan-facingで閲覧可能な`published`の場合のみ） | 本人（自分の分のみ、`user_id=auth.uid()`）が物理DELETE可。親投稿の`status`/visibilityや本人の`profiles.status`に関わらず削除可（unlike）。他人のlikeは本人以外（adminを含め）削除不可。UPDATE不可 |
| events | 公開の読み取り（実装済み。M11・M12）: `status='public'`、または`status='cancelled'`かつ`first_published_at IS NOT NULL`のeventを、anon・authenticatedの全員がSELECTできる（RLS policy `events_select_public`。`event_date`・利用者の状態には依存しない）。取得できる列は公開8列（`id`・`title`・`venue`・`event_date`・`description`・`image_url`・`ticket_url`・`status`）のみで、`SELECT *`は不可（列単位のSELECT権限）。`created_by`・`created_at`・`updated_at`・`first_published_at`は公開しない。draft・一度も公開されていない`cancelled`は公開しない。adminの全件（draft・一度も公開されていない`cancelled`を含む）と非公開列の読み取りは、base tableではなく専用のSECURITY DEFINER RPC（一覧`get_admin_events`・詳細`get_admin_event`。active adminのみ。実装済み。M13・M14）で行う（6.5参照） | admin(`is_admin()`) のみ。クライアントからのbase tableへの直接INSERTは不可（admin含む）。作成は専用SECURITY DEFINER RPC `create_event`（active adminのみ・`admin_logs`とatomic。実装済み。M15）のみ | admin(`is_admin()`) のみ。クライアントからのbase tableへの直接UPDATE/DELETEは不可（admin含む）。内容の更新は`update_event`（M16）、status変更は`set_event_status`（M17）というSECURITY DEFINER RPC（いずれもactive adminのみ・`expected_updated_at`の完全一致による楽観的同時実行制御・`admin_logs`とatomic。実装済み）のみ。物理DELETEを行うRPCは存在せず、将来も禁止するかは未決定。`first_published_at`はDB triggerが管理しクライアントから指定できない |
| event_participants | `visibility in ('public','attended')`は全員、`private`は本人のみ、いずれも本人は常に自分の分を閲覧可（最終要件。anon（未ログイン）へ公開するvisibilityの範囲と、writeをbase RLSか専用RPCで行うかは未確定。現在はM9により全拒否で未実装。6.6参照） | ログイン済み本人（自分の分のみ、`status='active'`のユーザーのみ） | 本人 or admin(`is_admin()`) |
| reports | admin(`is_admin()`)のみ`reports`本体をSELECT可（moderation用途）。通報者本人は本体へ直接SELECTせず、専用RPCで自分の通報のみ確認（`handled_by`は返さない）。対象ユーザー・第三者・anonは不可（RLS有効・policyは`reports_select_admin`の1件のみ。anonは権限なし、authenticatedはtable SELECTのみで一般ユーザーはRLSにより0行。通報者本人の閲覧は`get_my_reports()`のみ。6.7参照。実装済み） | ログイン済みactive本人のみ（`reporter_id=auth.uid()`、自己通報不可、fan-facingで閲覧可能な対象のみ、存在確認あり）。クライアントからの`reports`直接INSERTは不可（admin含む）。作成は`create_report()`（SECURITY DEFINER RPC）のみ。レート制限（5回/10分）はreportsのBEFORE INSERT triggerで実装済み（6.7参照） | クライアントからの直接UPDATE/DELETEは不可（通報者・adminとも）。adminによる処理は専用SECURITY DEFINER RPC `process_report()`（active adminのみ。`admin_logs`とatomic）経由のみ（実装済み）。`status`と`handled_by`/`handled_at`の整合はDB CHECK（`reports_handled_fields_consistency_check`）で保証。物理DELETEは行わない（6.7参照。実装済み） |
| blocks | 本人のみ（自分がブロックした一覧） | ログイン済み本人 | 本人のみ |
| news | `status='published'`かつ`published_at<=now()`は全員、`draft`または未来の`published_at`はadmin(`is_admin()`)のみ（最終要件。現在はM9により全拒否で最終RLS/RPCは未実装） | admin(`is_admin()`) のみ | admin(`is_admin()`) のみ |
| songs | 全員（最終要件。現在はM9により全拒否で最終RLS/RPCは未実装） | admin(`is_admin()`) のみ | admin(`is_admin()`) のみ |
| admin_logs | admin(`is_admin()`) のみ | クライアントからの直接INSERTは不可（active admin自身も不可）。`moderate_post()`/`moderate_comment()`/`process_report()`等のSECURITY DEFINER RPCが、対象のstatus変更とatomicに記録する。将来のServer Action/Route HandlerはこれらのRPCを呼び出すのみで、`admin_logs`へ直接INSERTしない | 不可（追記のみ、更新・削除禁止。active admin自身も不可） |
| login_attempts | admin(`is_admin()`) のみ（実装済み。M10。RLS policy `login_attempts_select_admin`、authenticatedはtable SELECTのみ、anonは権限なし） | クライアントからのINSERTは不可（実装済み）。サーバーサイド処理からのみ記録する設計だが、**記録経路は未実装** | 不可（クライアント直接操作不可。実装済み）。成功時の失敗履歴クリアもサーバーサイド処理のみ（**未実装**） |
| app_settings | anon/authenticated（adminを含む）いずれも不可（確定。Q46）。参照はsignup trigger・`record_policy_consent()`等のDB内部処理・service roleに限定（6.13参照。クライアントからの直接アクセス拒否は実装済み。M9） | anon/authenticatedいずれも不可（確定。Q45。実装済み。M9） | anon/authenticatedいずれも不可（確定。Q45。実装済み。M9） |

> 上記は方針レベルの整理であり、実装時に具体的なSQLポリシーとしてマイグレーションに落とし込む。`status='active'`の判定は`is_active_user()`（下記参照）を経由する。

### 管理者判定とRLSの循環参照回避

`profiles.role` を各テーブルのRLSポリシーから直接参照すると、`profiles`自体のRLSポリシー評価と絡んで循環参照（無限再帰）を起こす可能性がある。これを避けるため、以下の設計とする。

- 管理者判定用のヘルパー関数 `is_admin() returns boolean`（内部で`auth.uid()`を用いて呼び出し元自身のロールのみを判定する）を用意し、各テーブルのRLSポリシーはこの関数経由で判定する（`profiles.role`を直接SELECTするサブクエリをポリシー内に書かない）。
- この関数は `SECURITY DEFINER` として定義し、関数所有者の権限で実行することでRLSの再帰評価を回避する。
- `SECURITY DEFINER`関数は`search_path`を明示的に固定する（例: `SET search_path = public, pg_temp`）。固定しない場合、呼び出し側が`search_path`を操作して意図しないオブジェクトを参照させる「search_path経由の権限昇格」のリスクがあるため、必ず設定する。
- 関数の実行権限は必要最小限（`authenticated`ロール等）に絞る。
- `is_admin()`は原則として引数なしで呼び出し元の認証ユーザー（`auth.uid()`）自身の管理者権限を判定する用途に限定する。任意の`uid`を指定して他ユーザーの管理者権限を判定する用途では使用しない（他者のロールを調べる機能が必要な場合は、別途admin専用の関数・APIとして設計する）。この制約により、RLSポリシーから安全に（＝呼び出し元が任意のユーザーの権限情報を引き出す手段にならない形で）利用できる設計とする。

### is_active_user()関数（確定）

RLSポリシーから`profiles.status='active'`かどうかを判定する専用の関数`is_active_user() returns boolean`を設ける。

- 引数なし。`auth.uid()`を用いて呼び出し元自身の`profiles.status`のみを判定する。
- `profiles.status='active'`の場合のみtrueを返す。`suspended`/`banned`はfalseを返す。
- `is_admin()`と同様に`SECURITY DEFINER`として定義し、`search_path`を明示的に固定する。
- 関数の実行権限は必要最小限（`authenticated`ロール等）に絞る。
- 各テーブルのINSERTポリシー（「ログイン済み本人（`status='active'`のユーザーのみ）」等）は、`profiles`への直接サブクエリではなく、この関数経由で判定する。目的は、各RLSポリシーから`profiles`を直接繰り返し参照することによる循環参照や複雑化を避けることである。
- 状態を書き換える機能は持たない（読み取り専用の判定関数）。

### Next.js 16における認可設計（確定）

`banned`/`suspended`等、`profiles.status`に基づくアプリ側の認可判定（5.5・6.1.1参照）は、以下の方針で実装する。

- **Proxy（旧Middleware, `proxy.ts`）の役割は限定する**: Proxyは全リクエスト（プリフェッチを含む）で実行されるため、低速なデータ取得（DBへの問い合わせ）を避けるべきとされている。本プロジェクトでもこれに従い、**Proxyでは`profiles.status`を判定しない**。Proxyが行うのは「未ログインなら`/login`へ」といったCookieベースの軽量な一次チェックのみとする。
- **banned/suspendedの判定はData Access Layer（DAL）で行う**: `profiles.status`を取得・判定する認可関数を共通化し、保護対象の各`page`・各Server Action・各Route Handlerの先頭で個別に呼び出す。
- **layoutだけに認可チェックを置いて保護を完結させない**: App RouterのPartial Renderingの仕組み上、共有`layout`だけにチェックを置いても、Server Actionやネストしたルートセグメントが個別に呼び出されることを防げない。認可チェックは各pageおよび各Server Action/Route Handler側でも個別に行う。
- **Server Action/Route Handlerは公開APIエンドポイントと同等に扱う**: UIから辿れない直接呼び出し（直接POST等）に対しても、必ず共通の認可関数を経由して`profiles.status`を検証する。
- **「すべてのURLをProxyで強制的に`/restricted`へ送る」ことは仕様上の保証にしない**: 上記の理由により、Proxy単体でのURL網羅的な保証は行わない。代わりに、保護対象のエントリーポイント（`/community`配下・`/me`配下の各page、および投稿・コメント・いいね・LIVE参加表明等を行う各Server Action）を明示し、それぞれでDAL認可チェックを漏れなく実施する設計とする。
- 上記の認可関数・DALの具体的な実装、および対象エントリーポイントの網羅的なリストアップは、実装着手時に行う。

### レート制限の対象範囲・初期閾値（確定）

以下のユーザー操作をレート制限の対象とし、MVPの初期値は次の通りとする。

| 対象操作 | 初期閾値 |
|---|---|
| 投稿の作成 | 10回 / 10分 |
| コメントの作成 | 30回 / 10分 |
| いいねの作成 | 100回 / 10分 |
| 通報の作成 | 5回 / 10分 |
| ログイン失敗 | 5回 / 15分 |

- 上記の閾値は初期値であり、運用開始後の実態に応じて調整可能なものとする（ハードコードではなく調整しやすい形で実装することが望ましい）。

### レート制限の実装方式（確定）

対象操作の性質により、実装方式を2つに分ける。

#### 投稿・コメント・いいね・通報（DB側で制御）

- PostgreSQLの`BEFORE INSERT`トリガーで制御する。Next.js側のミドルウェア（Proxy）やRoute Handler等では制御しない。
- トリガー関数内で`pg_advisory_xact_lock`を用い、「同一ユーザー×同一操作種別」単位でロックを取得し、並行リクエストを直列化する。
- ロック取得後、当該テーブル自身の既存カラム（`author_id`/`user_id`/`reporter_id`と`created_at`）から直近ウィンドウの件数をCOUNTし、上限を超えている場合は`RAISE EXCEPTION`で拒否する。
- レート制限専用のカウンターテーブルは新設しない（既存テーブルの行を数えるのみとし、別途のクリーンアップ処理も不要とする）。
- トリガー関数は`SECURITY DEFINER`とし、`is_admin()`（8章「管理者判定とRLSの循環参照回避」参照）と同様に`search_path`を明示的に固定する（`search_path`経由の権限昇格を防止するため）。
- この制御はPostgreSQLのトリガーとして実装するため、Supabaseクライアントからの通常アクセスだけでなく、PostgRESTへの直接アクセスや将来的なservice_role経由の書き込みでも同様に適用される。RLSポリシーと異なりトリガーは呼び出し経路・ロールに関わらず発火するため、Next.jsを経由しないアクセスによる制限のバイパスを防止できる。
- 既存のRLS INSERTポリシー（`status='active'`のユーザーのみ許可等）とは独立した別レイヤーの制御として共存させる。
- 実装状況: 上記のうち、`reports`（通報5回/10分）のtrigger（`reports_enforce_rate_limit`）のみ実装済み。投稿・コメント・いいねのレート制限triggerは未実装。

#### ログイン失敗（アプリ側で制御）

- アカウント単位（メールアドレス）で5回/15分の独自レート制限を設ける。IPアドレス単位の独自制限は現時点では追加しない。
- 独自制限はNext.jsのRoute Handler/Server Functionが`supabase.auth.signInWithPassword`呼び出しの前後で判定・記録する、アプリケーション層の処理として実装する。
- 同一メールアドレスへの並行リクエストによるレート制限のすり抜けを防止するため、正規化したメールアドレス単位で処理を直列化する。投稿・コメント・いいね・通報と同様に`pg_advisory_xact_lock`等のDBロックを利用する方針とする（確定）。
- 基本フローは、(1) Supabase Authでログインを試行、(2) Auth失敗を確認、(3) 正規化したメールアドレス単位でDBロックを取得、(4) ロック取得後に直近15分の失敗回数を確認、(5) 制限条件に従って失敗記録・cooldown判定を行う、という順序とする。
- メールアドレスの正規化は、前後の空白除去（trim）と全体の小文字化（lower）のみとする（`trim(lower(email))`相当）。失敗回数のCOUNT・`login_attempts`への保存・`pg_advisory_xact_lock`のロックキー生成のいずれも、この同一の正規化ルールを使用する。Gmailの`.`除去、`+tag`除去、`gmail.com`/`googlemail.com`の同一視等、プロバイダ固有の変換は行わない（確定）。
- 記録は`login_attempts`（6.12参照）に対して行い、Supabase Authで認証を実行した後、認証失敗を確認してから記録する（事後記録方式）。認証実行前に`login_attempts`へ「予約」のレコードを作成する方式は採用しない。
- ログイン成功時には、それ以前の失敗履歴（`login_attempts`の該当メールアドレスのレコード）をクリアする。
- `login_attempts`の古いレコードに対する定期的なクリーンアップ処理は、MVPでは実装しない。
- 独自制限は時間経過で自動的に解除される一時的なクールダウンとし、`profiles.status`の`suspended`/`banned`（6.1.1参照。運営の判断を要する恒久的な利用制限）とは完全に分離する。第三者が特定のメールアドレスを狙って連続ログイン失敗させても、それによって対象アカウントの`profiles.status`が変化することはない。
- 上記の独自制限に加えて、Supabase Authが標準で提供するIPベースのレート制限を併用する。IP単位の防御はSupabase Auth標準機能に委ね、独自実装は行わない。
- Supabase Authからレート制限超過（HTTP 429）が返却された場合は、アプリ側で適切にハンドリングし、独自制限に該当した場合と同様の汎用的な案内を表示する。
- いずれの制限（独自のアカウント単位制限／Supabase Auth側のIPベース制限）に該当した場合も、エラーメッセージはそのメールアドレスが登録されているかどうかを推測できない汎用的な文言とする（6.1.1のsuspended/banned案内文言の方針と同様）。

> 上記は方式レベルの確定であり、具体的なSQL実装（トリガー関数・ロック取得処理等）およびアプリケーションコード（Route Handler/Server Function）は別途実装時に作成する。

---

## 9. ストレージ（Supabase Storage）

想定バケット:

| バケット名 | 用途 | 備考 |
|---|---|---|
| avatars | プロフィールアバター画像 | 本人のみアップロード・更新可、公開読み取り可 |
| post-images | 投稿添付画像 | 投稿者本人のみアップロード可、公開読み取り可（`posts.status`に連動して非表示制御） |
| event-images | LIVE告知画像 | admin のみアップロード可、公開読み取り可 |
| news-images | ニュース記事添付画像 | admin のみアップロード可。一般ユーザーの読み取り可否はニュース本文と同じ条件（`news.status='published'`かつ`published_at<=現在時刻`）に連動。adminはdraft・予約公開・公開済みのいずれも閲覧・管理可能 |
| song-images | 楽曲ジャケット画像 | admin のみアップロード可、公開読み取り可 |

- 各バケットで許可するのは JPEG / PNG / WebP のみとし、最大ファイルサイズは 5MB とする（8章「画像アップロード制限」参照）。
- バケットごとにStorage RLSポリシーを設定し、アップロード権限を上記の通り制限する。
- 上記5バケットはmigrationで管理する（確定）。原則としてmigration SQLでバケットを作成し、Storage policyと合わせてバージョン管理する。具体的な作成方法（SQL文の形式等）は、実装時点のSupabase公式仕様を確認して決定する。公式推奨方法や実環境上の制約と衝突する場合は、独自に仕様変更せず報告するものとする。
- 各バケットに対応するDBカラム（`profiles.avatar_url`、`posts.image_url`、`events.image_url`、`news.image_url`、`songs.cover_image_url`）には、Storageのobject key（バケット内の相対パス）を保存し、完全なURLは保存しない（確定。6.1/6.2/6.5/6.9/6.10参照）。表示時はアプリ側の共通処理でURLを解決する。
- `post-images`の読み取り制御は`posts.status`と連動させ、`hidden`/`deleted`の投稿に紐づく画像を一般ユーザーが直接読み取れないようにする（確定。Storage側のアクセス制御で実現する方針）。object keyに`post_id`を含める（下記「ファイルパスの命名規則」参照）ことで、Storage policyがパスから対応する`posts`行を特定し`posts.status`を参照できるようにする。具体的なStorage RLSポリシーのSQLは本バージョンでは決定せず、実装時に設計する。`avatars`・`event-images`・`song-images`にはこの連動要件は無い（`profiles`/`events`/`songs`には`posts`のような非表示状態が存在しないため）。
- `news-images`の読み取り制御は、ニュース本文（6.9「表示制御の方針」）と同一の条件に連動させる（確定）。一般ユーザーが画像を閲覧できるのは`news.status='published'`**かつ**`published_at<=現在時刻`の場合のみとし、`draft`の場合、および`status='published'`でも`published_at`が未来（予約公開）の場合は、一般ユーザーは閲覧不可でadminのみ閲覧可能とする。これは`post-images`の`posts.status`連動と同じ考え方であり、画像のobject key（または画像URL）を直接知っている一般ユーザーによる、公開前・予約公開前コンテンツの画像への事前アクセスを防ぐことを目的とする。管理者はdraft・予約公開・公開済みのいずれの状態でも画像を閲覧・管理できる。object keyに`news_id`を含める（下記「ファイルパスの命名規則」参照）ことで、Storage policyがパスから対応する`news`行を特定し`news.status`・`published_at`を参照できるようにする。具体的なStorage RLSポリシーのSQLは本バージョンでは決定せず、実装時に設計する。

### ファイルパスの命名規則（確定）

Storage RLSでアップロード先を制御できるよう、ファイルパスは以下の規則に統一する。

```
avatars/{user_id}/{uuid}.{ext}
post-images/{user_id}/{post_id}/{uuid}.{ext}
event-images/{uuid}.{ext}
news-images/{news_id}/{uuid}.{ext}
song-images/{uuid}.{ext}
```

- `post-images`・`news-images`のobject keyには、それぞれ対応する`posts.id`（`post_id`）・`news.id`（`news_id`）を含める（確定）。これにより、Storage policyがオブジェクトパスから親レコードを特定し、`posts.status`（post-images）、`news.status`・`published_at`（news-images）を参照して読み取り可否を判定できるようになる。`post-images`では`user_id`もパスに残し、投稿者本人との整合確認に利用できる構造とする。MVPでは、画像アップロード前に対象の`posts`/`news`レコードのIDを確保しておくフローを前提とする。
- `avatars`・`event-images`・`song-images`のobject key規則は変更しない。
- `avatars`・`post-images` は先頭フォルダを `user_id`（`auth.uid()`と一致する値）とし、Storage RLSポリシーで `storage.foldername(name)[1] = auth.uid()::text` 相当の条件を用いて、他ユーザーの領域へのアップロードを禁止する。
- `event-images`・`news-images`・`song-images` はユーザーフォルダを持たず、INSERTをadmin(`is_admin()`)のみに制限することでアクセス制御する（`events`/`news`/`songs`がいずれも管理者のみによる作成・更新であるため。8章のRLS方針表参照）。
- `{ext}` はアップロード制限で許可したMIMEタイプに対応する拡張子のみを許可する。

---

## 10. コミュニティガイドライン（禁止事項）

`/guidelines` ページおよび通報理由の選択肢に反映する、禁止事項の一覧。

- 誹謗中傷
- 脅迫
- 差別
- 嫌がらせ
- 個人情報の投稿
- なりすまし
- 詐欺
- チケット転売
- 違法行為
- 無断転載
- 著作権侵害
- 歌詞全文の掲載
- 無断画像・動画の掲載
- スパム
- 出会い目的のみの利用

これらは `reports.reason` の選択肢設計、および管理者による投稿・コメント・ユーザー対応（`admin_logs` に記録）の判断基準として用いる。banned処分の際に管理者が過去の投稿・コメントを確認する運用（6.1.2参照）においても、上記の禁止事項を判断基準として用いる。

---

## 11. 技術スタック

| 領域 | 技術 |
|---|---|
| フレームワーク | Next.js |
| 言語 | TypeScript |
| UIライブラリ | React |
| スタイリング | Tailwind CSS |
| バックエンド/DB/認証/ストレージ | Supabase（PostgreSQL / Auth / Storage） |
| バージョン管理 | GitHub |
| ホスティング | Vercel |

---

## 12. 未確定事項・要確認事項

実装着手前にChatGPT側での確定、または双方合意が必要な論点。

v1.16時点のMVP仕様の未確定事項はすべて確定済みだが、その後の実装で、`events`・`event_participants`について次の設計判断が必要な論点が生じた（PM判断待ち。詳細は6.5・6.6参照）。確定するまでは仕様として扱わない。新たな論点が生じた場合は本章に追記する。

- 公開の`/live`（LIVE一覧）の並び順・pagination（primaryの並び順、tie-breakの列、cursor方式かoffset方式か。本番では決定的な並び順が必要）。
- `events`のクライアントからの物理DELETEを将来も禁止するか。
- `posts`の`live_report`作成時の、`event_id`が公開可能なeventだけを参照できるようにする方法。
- Storageのobject lifecycle（アップロード・差し替え・削除・孤児objectの掃除）。
- Next.js / Supabase client / PostgREST経由での`expected_updated_at`（version token）のintegrationの確認。
- `event_participants`のanonへの公開範囲（`visibility`）。
- `event_participants`のwriteをbase tableのRLSで行うか専用RPCで行うか。

---

## 13. 変更履歴

| バージョン | 日付 | 内容 |
|---|---|---|
| v1.0 | 2026-09-19 | 初版作成 |
| v1.1 | 2026-09-19 | レビュー結果を反映。投稿・コメントの論理削除と表示制御を明確化／newsにstatus(draft/published)を追加／`/fans/[username]`へURL方針を変更し username 形式制約を追加／管理者判定のRLS循環参照回避策(`is_admin()`関数とsearch_path固定)を追加／Storageファイルパス規則を追加／profiles.statusの挙動(active/suspended/banned)を明文化／reportsに重複通報防止のUNIQUE制約を追加／利用規約同意記録(terms_version, terms_agreed_at)を追加／レート制限の対象範囲を確定／event_participantsに参加表明の公開設定(visibility)を追加 |
| v1.2 | 2026-09-19 | admin_logsへのクライアント直接INSERT禁止（サーバーサイド処理からのみ記録）を明記／`is_admin()`の用途を呼び出し元自身(`auth.uid()`)の判定に限定し、任意uid指定での他者判定を禁止する方針を明記／likesのRLSにおける「投稿者本人」が「いいねしたユーザー」ではなく「そのいいねが紐づく投稿の投稿者」を指すことを明確化／MVPではusername変更を非対応とする方針を確定（`/me/edit`はusername読み取り専用） |
| v1.3 | 2026-09-19 | posts/commentsの`hidden`(一時非表示・再公開の可能性あり)と`deleted`(原則恒久的な論理削除)の使い分けを確定／通報時の非通知・通報者非公開・管理者判断まで通常表示する方針を確定／ブロック時の一方向非表示(ブロックした本人視点でのみ非表示)・非通知を確定しRLSに反映／レート制限の初期閾値(投稿10回/10分等)を確定(実装方式は引き続き未確定)／画像アップロードをJPEG/PNG/WebP・最大5MB・サーバー側検証必須で確定／profilesに`privacy_policy_version`・`privacy_policy_agreed_at`を追加／suspended・bannedの挙動と案内文言方針(汎用メッセージ、詳細非表示)を確定 |
| v1.4 | 2026-09-19 | レート制限の実装方式を確定。投稿・コメント・いいね・通報はPostgreSQLの`BEFORE INSERT`トリガー＋`pg_advisory_xact_lock`によるユーザー×操作単位の直列化＋既存テーブル自身の列からのCOUNTで制御し、新規カウンターテーブルは作成しない方針を明記（RLSと異なりトリガーは呼び出し経路・ロールに関わらず発火するため、PostgREST直接アクセスや将来のservice_role経由の書き込みでもバイパスできない構造とする）／`SECURITY DEFINER`関数の`search_path`固定を明記／ログイン失敗はアカウント単位5回/15分の独自レート制限(`profiles.status`のsuspended/bannedとは分離した一時的なクールダウン)とし、IP単位の独自制限は追加せずSupabase Auth標準のIPベースレート制限(429ハンドリングを含む)を併用する方針を明記／8章に「レート制限の実装方式（確定）」を新設し、12章の未確定事項からレート制限実装方式の項目を解消 |
| v1.5 | 2026-09-19 | `banned`ユーザー向け案内ページのルートを`/restricted`に確定し、5章に「5.6 アクセス制限時の誘導ページ（確定）」を新設（未ログイン時は`/login`へ、active/suspendedは通常ページへリダイレクト、`noindex`とする方針を含む）／`/banned`・`/account/restricted`等は不採用と明記／suspendedは全画面誘導ページを持たず、操作時のインライン汎用メッセージのみとする方針を6.1.1に明記／Next.js 16のProxy（旧Middleware）では`profiles.status`をDBに問い合わせて判定せず、banned/suspendedの判定はData Access Layer（DAL）で各page・Server Action・Route Handlerごとに行う方針を8章に「Next.js 16における認可設計（確定）」として新設／「すべてのURLをProxyで`/restricted`へ強制送致すること」は仕様上の保証にしないことを明記／12章の未確定事項からbanned案内ページのルートに関する項目を解消 |
| v1.6 | 2026-09-19 | `profiles.status`（アカウント利用状態）と`posts.status`/`comments.status`（コンテンツ公開状態）が独立した状態管理であることを確定し、6章に「6.1.2 アカウント状態とコンテンツ公開状態の独立性（確定）」を新設。suspended/bannedになったことだけを理由に過去の投稿・コメントを自動的に非表示・削除しない方針を確定／banned処分時には管理者が過去投稿・コメントを確認し、該当があれば既存のhidden/deleted運用（admin_logs記録を含む）に従って個別対応する運用を明記／確認漏れの可能性を踏まえ、`profiles.status = 'banned'`であること自体をSELECT時の自動非表示条件にはしない設計思想を明記／suspended解除・将来のbanned復旧時もコンテンツ側のstatusは自動変更されないことを明記／6.2 posts・6.3 commentsに、投稿者・コメント投稿者の`profiles.status`が各コンテンツの`status`に影響しないことを追記／10章に、banned処分時の過去コンテンツ確認でも禁止事項を判断基準として用いる旨を追記／12章の未確定事項を解消（残存項目なし） |
| v1.7 | 2026-09-20 | DB設計レビューQ1〜Q25の確定事項を反映。6章に「6.1.3 profilesの保護カラムとアクセス制御（確定）」を新設し、role/status/terms_*/privacy_policy_*等の保護対象カラムへの本人による直接UPDATEを禁止し、管理者操作・再同意処理は専用RPC等の安全なサーバー側経路を経由する方針を確定／アカウント完全削除（退会）をMVP対象外と明記し、profilesを参照する各FKのON DELETEは原則RESTRICT（NO ACTION）とする方針を6章冒頭に追記／6章に「6.12 login_attempts」を新設（email/ip_address/attempted_at、profilesへのFKは持たせない）し、8章のログイン失敗節に事後記録方式（予約方式は不採用）・成功時の失敗履歴クリア・クリーンアップ処理は実装しない旨を追記／role・status・post_type・events.status・event_participants.status・visibility・reports.target_type・status・news.statusにDB CHECK制約を設ける方針を各テーブル節に追記（許容値は既存v1.6の記載値のまま変更なし）／reports.reasonにもCHECK制約を設ける方針としつつ具体的なコード値は未確定として12章に記載／posts.post_type='live_report'時にevent_idを必須とする制約、blocksの自己ブロック禁止CHECK（推奨から確定へ）、news.published_atのdraft時NULL許容・published時必須の整合性制約を追記／reports.handled_at（対応完了日時）を追加、songs.created_byは追加しないことを明記／likesのRLS方針にadmin(`is_admin()`)による削除権限を追加／avatar_url・posts.image_url・events.image_urlがStorageのobject key（完全URLではない）を保存することを明記し、9章にpost-imagesの読み取り制御をposts.statusと連動させる方針（具体的なRLS実装方法は実装時に検証）を追記／profiles.discovery_source・favorite_song・prefecture、events.city・official_url、reports.descriptionは追加しないことを確認（12章の新たな未確定事項として、reports.reasonのコード値、news/songsの画像用Storageバケット未定義、terms_agreed_at等のNOT NULL/nullable最終判断を追記） |
| v1.8 | 2026-09-20 | `reports.reason`のDB CHECK制約に用いる具体的なコード値を確定し、6.7に「reasonコードの一覧（確定）」を新設。第10章の禁止事項15項目に対応する15コード（`defamation`/`threats`/`discrimination`/`harassment`/`personal_info_exposure`/`impersonation`/`fraud`/`ticket_scalping`/`illegal_activity`/`unauthorized_repost`/`copyright_infringement`/`full_lyrics_posting`/`unauthorized_media_posting`/`spam`/`dating_solicitation`）に加え、15項目に分類できない場合の受け皿として16番目のコード`other`を追加し、計16種類にreasonを限定する方針を確定／`unauthorized_repost`・`copyright_infringement`・`unauthorized_media_posting`（無断転載・著作権侵害・無断画像動画の掲載）は実際の通報では重複しうるが、第10章の構成を維持し統合せず独立コードとして扱うことを明記／`reports.detail`はreasonの補足説明を記載する自由記述欄であることを明記／`reason`はユーザーによる通報時の分類であり法的判断を意味しないことを明記／12章の未確定事項から`reports.reason`のコード値未確定の項目を解消 |
| v1.9 | 2026-09-20 | Q27：Storage専用バケット`news-images`・`song-images`の追加を確定。9章のバケット一覧に両バケットを追加し、いずれもadminのみアップロード可・ユーザーフォルダを持たない（`event-images`と同じパターン）ことを明記／ファイルパス命名規則に`news-images/{uuid}.{ext}`・`song-images/{uuid}.{ext}`を追加／6.9 news.image_url・6.10 songs.cover_image_urlを、それぞれ`news-images`・`song-images`バケット内のobject key（完全URLではない）を保存する旨に更新／`song-images`は`songs`に非公開状態が存在しないため`avatars`/`event-images`と同様に公開読み取り可と確定したが、`news-images`は`news`にdraft/published状態が存在するため読み取り方針（`news.status`と連動させるか無条件で公開とするか）を現行仕様からは判断できず、12章の未確定事項として新たに記載／12章から「news/songsの画像用Storageバケット未定義」の項目を解消（news-imagesの読み取り方針という、より具体的な論点に置き換え） |
| v1.10 | 2026-09-20 | Q28：`news-images`の読み取り可否を`news.status`と連動させる方針を確定。`news.status='published'`では一般ユーザーも画像を閲覧可能、`news.status='draft'`では一般ユーザーは閲覧不可でadminのみ閲覧可能とすることを9章のバケット一覧・読み取り制御の記述に反映（`post-images`の`posts.status`連動と同じ考え方で、公開前コンテンツの画像漏洩を防ぐことが目的）／具体的なStorage RLSの実装方法は本バージョンでは決定せず、実装時に検証する旨を明記／12章の未確定事項から`news-images`の読み取り方針の項目を解消 |
| v1.11 | 2026-09-20 | Q29：`profiles.terms_agreed_at`・`privacy_policy_agreed_at`をNOT NULLとする方針を確定。本プロジェクトが新規構築であり、MVPでは会員登録時に利用規約・プライバシーポリシーへの同意を必須とするため、「同意日時が存在しない状態」の通常会員プロフィールを許容しないことを6.1・6.1.3に反映／`terms_version`・`terms_agreed_at`・`privacy_policy_version`・`privacy_policy_agreed_at`をprofilesの必須情報として明記／再同意は専用RPC経由、本人による直接UPDATE禁止という既存方針（6.1.3）は変更なし／12章の未確定事項を解消（残存項目なし） |
| v1.12 | 2026-09-20 | 最終整合性レビューのA-1〜A-2・B-1〜B-4を踏まえ、Q30〜Q35を反映。Q30：6.1に「6.1.4 公開プロフィールVIEW（確定）」を新設し、一般ユーザー向けの他者プロフィール取得は`public_profiles`VIEW（公開情報のみ）経由とし、`profiles`本体への直接SELECTは本人・adminに限定する方針を確定、8章RLS方針表のprofiles行を更新／Q31：`news-images`の一般読み取り条件をニュース本文と完全に一致させ（`news.status='published'`かつ`published_at<=現在時刻`）、予約公開中の画像事前漏洩を防止する記述に9章を更新／Q32：会員登録時の`profiles`作成をDBトリガー方式に確定し、7章に「profilesの自動作成（確定）」を新設。ユーザーメタデータ経由での必須情報受け渡し、role/statusをクライアントメタデータから設定しない方針、各種検証方針を明記／Q33：`login_attempts`の判定・記録にも`pg_advisory_xact_lock`等によるメールアドレス単位の並行処理対策を導入する方針を8章に追記／Q34：`username`を6.1.3の保護対象カラムに統合し、username変更用RPCは作成しない方針を明記／Q35：3章のMVP機能一覧に「楽曲一覧・楽曲詳細」を追加し18項目→19項目に更新／12章の未確定事項は引き続き0件を維持 |
| v1.13 | 2026-09-20 | DB migration実装計画レビューで確定したQ36〜Q44を反映。Q36：`profiles.id → auth.users.id`が1対1のFKであり独自UUIDを生成しないことを6.1・6章冒頭に明記／Q37：`updated_at`はINSERT時`DEFAULT now()`、UPDATE時は共通の`BEFORE UPDATE`トリガーで自動更新する方針（SECURITY DEFINER不要）を6章冒頭に新設／Q38：8章に「is_active_user()関数（確定）」を新設し、RLSのINSERTポリシーが`profiles.status='active'`をこの関数経由で判定する方針を明記／Q39：一般ユーザーによる`profiles`本体への直接SELECT禁止を明確化し、本人/admin/一般ユーザーの責務分離を6.1.4・8章RLS方針表に反映／Q40：管理者用RPCを`admin_set_user_role`・`admin_set_user_status`の2つに分離し、再同意RPCを`record_policy_consent()`と命名。現行規約バージョンの保存場所は既存の7章方針（アプリ側管理）のまま変更しないことを明記／Q41：`login_attempts`のメールアドレス正規化を`trim(lower(email))`相当に確定し、プロバイダ固有変換は行わない方針を8章・6.12に明記／Q42：`post-images`・`news-images`のobject keyにそれぞれ`post_id`・`news_id`を含める規則に変更し、Storage policyが親レコードのstatusを参照できるようにする方針を9章に反映／Q43：Storage5バケットをmigrationで管理する方針を9章に明記／Q44：UUID主キーは原則`DEFAULT gen_random_uuid()`とし、`profiles.id`のみ例外とする方針を6章冒頭に明記／12章の未確定事項は引き続き0件を維持 |
| v1.14 | 2026-09-20 | Q45：現行の利用規約バージョン・現行のプライバシーポリシーバージョンをDB側の`app_settings`テーブルで一元管理する方針を確定し、6章に「6.13 app_settings」を新設（13テーブル目）。`app_settings`は一般ユーザー（anon/authenticated）による直接INSERT/UPDATE/DELETEを禁止することを確定し、8章RLS方針表に行を追加／7章「profilesの自動作成（確定）」を更新し、signup trigger時に`terms_version`・`privacy_policy_version`をクライアント申告値ではなく`app_settings`の現行バージョンから記録する方針に修正／7章「利用規約・プライバシーポリシーへの同意記録（確定）」の「アプリ側で定数・設定値として管理する」という記述を、DB側の`app_settings`を正本とする記述に修正／6.1.3の`record_policy_consent()`の説明を更新し、対象ユーザー・terms_version・privacy_policy_version・terms_agreed_at・privacy_policy_agreed_atのそれぞれの値の出典（`auth.uid()`／`app_settings`／DB側の`now()`）とクライアント非信頼の対象を明記／12章に`app_settings`のSELECT方針が未確定である旨を新たな未確定事項として追記 |
| v1.15 | 2026-09-20 | Q46：`app_settings`はDB内部の信頼できる設定値の正本として扱い、一般クライアントから直接読み取らせない方針を確定。6.13のアクセス制御方針を更新し、anon・authenticated（adminを含む）いずれによる直接SELECTも禁止し、参照はsignup trigger・`record_policy_consent()`等のDB内部処理・service roleに限定することを明記／これらの処理で`SECURITY DEFINER`を使用する場合は既存仕様どおり`search_path`固定・必要最小限の権限とすることを明記／将来クライアント画面へ現行バージョンを表示する必要が生じても`app_settings`テーブル全体は公開せず、必要な値のみを返す安全な手段を別途設計するものとし、MVP時点では新規RPC/APIを追加しないことを明記／8章RLS方針表のapp_settings行のSELECT列を「anon/authenticated（adminを含む）いずれも不可」に更新／12章に残っていた`app_settings`のSELECT方針の未確定事項を解消し、PROJECT_SPEC.md全体を確認したうえで「現時点でMVP仕様の未確定事項はない」に更新 |
| v1.16 | 2026-09-20 | Q47：`app_settings`をkey-value方式ではなく固定カラム・単一行方式に確定し、6.13に`id`（単一行保証用）・`current_terms_version`（text NOT NULL）・`current_privacy_policy_version`（text NOT NULL）・`updated_at`（Q37の共通トリガー対象）の構造を明記。バージョン値はtext型とし、利用規約とプライバシーポリシーは独立して変更可能であることを明記／Q48：`posts.event_id`・`comments.post_id`・`likes.post_id`・`event_participants.event_id`の4つのFKについて`ON DELETE RESTRICT`を確定し、6章冒頭に「その他のFKのON DELETE方針（確定）」を新設。各テーブルのリレーション説明にも反映し、profiles参照FKのRESTRICT方針と整合させる／Q49：`app_settings`の初期値を`current_terms_version='1.0'`・`current_privacy_policy_version='1.0'`（いずれもtext値）に確定し、6.13に反映／6章冒頭のupdated_at自動更新方針の説明に`app_settings`が対象テーブルに含まれることを明記／12章の未確定事項は引き続き0件を維持 |
| v1.17 | 2026-09-26 | posts/comments moderationの確定実装（`delete_own_post()`/`delete_own_comment()`・`moderate_post()`/`moderate_comment()`という2種類のSECURITY DEFINER RPC）とPROJECT_SPEC.mdを同期。6.2・6.3に「`status`変更経路の分離（確定）」を新設し、`posts.status`/`comments.status`への直接UPDATEをクライアント（管理者を含む）へ一切許可しないこと、投稿者本人のlogical deleteと管理者のモデレーションをそれぞれ専用RPCへ分離すること、`deleted`は投稿者本人のself-delete専用のterminal状態であり管理者を含め生成・復元できないことを明記／6.2の「`hidden`と`deleted`の使い分け」表の`deleted`行を、管理者が生成できないことが分かる記述に修正／6.1.2・6.7に残っていた「管理者が`hidden`または`deleted`に変更する」という記述を、確定実装（`moderate_post()`/`moderate_comment()`は`published`↔`hidden`のみを許可し`deleted`を拒否する）に合わせて、管理者が変更できるのは`hidden`のみである旨に修正／6.11の「書き込み経路の方針」を、`admin_logs`へのINSERTがServer Action/Route Handler等のサーバーサイド処理から直接行われるという記述から、`moderate_post()`/`moderate_comment()`というSECURITY DEFINER RPCが対象のstatus変更と同一トランザクション内でatomicに記録するという記述へ修正。将来のServer Action/Route HandlerはこれらのRPCを呼び出す経路としてのみ機能し、`admin_logs`へ直接INSERTしないことを明記／`admin_logs.detail`へ記録する情報を`from_status`・`to_status`・任意の`reason`（trim後最大500文字）に限定し、本文全文・email・IPアドレス・token等を記録しない方針を明記／8章RLS方針表のposts・comments（UPDATE/DELETE列）・admin_logs（INSERT/UPDATE・DELETE列）を上記の確定実装に合わせて更新。DB migrationは今回作成せず、既存の確定済み実装（immutable）に文書を合わせる変更のみを行った |
| v1.18 | 2026-09-26 | likesのown reaction visibility・unlike仕様を確定（旧仕様の廃止）。旧6.4は「hidden/deleted投稿に紐づくいいねは投稿者本人のみ閲覧可能で、いいねをした本人には見せない」としていたが、これを廃止し、fan-facing visibility（親投稿のvisibilityに従う）とown-like visibility（いいねをした本人＝`user_id=auth.uid()`が、親投稿の`status`/visibilityや自身の`profiles.status`（active/suspended/banned）に関わらず、常に自分のlike行を確認できる、独立した経路）を明確に分離する記述へ6.4を更新／unlike（`DELETE FROM likes`による物理DELETE、`user_id=auth.uid()`のみ）も同様に親投稿の`status`/visibilityおよび本人の`profiles.status`から独立することを明記／post authorに、自分の投稿に紐づく他人のlikesを閲覧する特別権限を付与しないことを明記（post authorが同時にlike ownerである場合は、そのself-likeのみown経路で見える）／own-like表示・unlikeが`likes`行自体の閲覧・削除のみを可能にし、非公開の親投稿本文等へのSELECT権限を拡大しないことを明記／新規いいね（INSERT）はactive本人・fan-facingで閲覧可能な`published`投稿のみという既存の非対称なeligibilityを維持し、own-like/unlikeの独立性とは意図的に異なる設計であることを明記／6.2の投稿者本人によるコメント・いいねの閲覧に関する記述を、投稿者本人であることによって他人のコメント・いいねへの閲覧範囲が自動的に拡大されるわけではない旨に修正／8章RLS方針表のlikes行を上記の確定仕様に合わせて更新（admin専用の削除権限も、今回のPM決定により設けないことに修正）。likes RLSのDB migrationは今回作成せず、既存の確定済み実装（posts/comments/admin_logs/moderation RPC、いずれもimmutable）には影響しない、ドキュメントのみの変更である |
| v1.19 | 2026-09-26 | reportsの作成・閲覧・処理・privacy境界を確定（DB実装は後続フェーズで、本バージョンではドキュメントのみ）。6.7の`target_type`を実DBの`profile`/`post`/`comment`に同期（旧記述`user`を修正）／新規通報はactive本人のみ・自己通報禁止・存在確認必須・fan-facingで閲覧可能なpublished投稿/コメントのみ（block・親投稿の状態も既存visibilityに従う）・重複通報禁止を明記／通報者本人は`reports`本体を直接SELECTせず、`handled_by`を除く列のみ返す専用SECURITY DEFINER RPCで自分の通報のみ確認、adminのみ本体をSELECT可、対象ユーザー・第三者・anonは閲覧不可、通報者の提出後の編集・取消は不可と明記／`detail`はtrim後最大2000文字（現DB未実装）／管理者の通報処理は専用RPC経由（direct UPDATE/物理DELETEなし）、`handled_by`はサーバー側設定、`admin_logs`記録とatomic、対象のmoderation（`moderate_post/comment`）とは分離、profile通報の処理でユーザーstatusを自動変更しないことを明記／`status`遷移規則とprofile対象のstatus別eligibilityは未確定として明記／通報のレート制限（5回/10分）は維持（trigger未実装）／8章RLS方針表のreports行と6.11の書き込み経路を同期。migration・RLS・RPCは作成していない |
| v1.20 | 2026-09-27 | reports実装（DB）とPROJECT_SPEC.mdを同期（ドキュメントのみ）。6.7・6.11・8章を実DBに合わせて更新: `detail`のDB CHECK（1〜2000文字）と`create_report()`によるtrim/空白のみ→NULL化／reportsのレート制限trigger（5件/10分・reporter単位のadvisory lock・statusを問わずCOUNT）／reportsのRLS有効（FORCEなし）・policyは`reports_select_admin`のみ・anon権限なし・authenticatedはSELECTのみ・直接INSERT/UPDATE/DELETE不可（admin含む）／`create_report()`（active本人のみ・自己通報禁止・fan-facing eligibilityの再現・profileはactive/suspendedのみで双方向block・利用不可対象は一律`REPORT_TARGET_NOT_AVAILABLE`・重複は`REPORT_ALREADY_EXISTS`・trigger優先で`REPORT_RATE_LIMITED`が先に返る・エラーコード8種）／`get_my_reports()`（own reportsのみ・`reporter_id`/`handled_by`非返却・profile存在のみ要求でsuspended/bannedも閲覧可・target/blockへのJOINなし・keyset pagination・page_sizeをclamp）。旧「RLS・RPC・trigger未実装」記述を更新し、6.7の`status`遷移規則未確定・admin_logs連携の記述は維持。**引き続き未実装**: 通報処理RPC（`status`/`handled_by`/`handled_at`の更新）、通報処理とadmin_logsのatomic記録。posts/comments/likesのレート制限triggerも未実装 |
| v1.21 | 2026-09-27 | reportsの通報処理実装（M6・M7）とPROJECT_SPEC.mdを同期（ドキュメントのみ）。6.7・6.11・8章を更新: `status`と`handled_by`/`handled_at`の整合CHECK（`reports_handled_fields_consistency_check`。`pending`/`reviewing`ではNULL、`resolved`/`rejected`ではNOT NULL）／`handled_by`＝最終判断を行ったadmin・`handled_at`＝最終判断の完了日時・`reviewing`の担当者/開始日時は`reports`に保存せず`admin_logs`のみ／`process_report(target_report_id, new_status, note)` RPC（active adminのみ・認可を最優先・`new_status`は4値の完全一致・成功遷移は`pending→reviewing/resolved/rejected`と`reviewing→resolved/rejected`の5通りのみでno-opを含む他11通りは`INVALID_REPORT_TRANSITION`・`resolved`/`rejected`はterminalでreopenなし・`SELECT ... FOR UPDATE`で直列化し`expected_current_status`は持たない・`note`は任意でtrim後1000文字・エラーコード5種）／`admin_logs`へのatomicな監査記録（`action=process_report`、`target_type=report`、`detail={from_status,to_status[,note]}`）／通報の処理と対象のmoderation（`moderate_*`・profile status）は別操作。旧「通報処理RPC未実装」「`status`遷移規則未確定」等の記述を更新。**引き続き未実装（将来）**: 終端を戻す監査ログ付きreopen RPC、`reviewing`の担当者/開始日時field、user/profile moderation RPC、posts/comments/likesのレート制限trigger |
| v1.22 | 2026-09-27 | eventsのDB実装とPROJECT_SPEC.mdを同期（ドキュメントのみ）。6.5: `events.status`を実DBの`draft`/`public`/`cancelled`（default `draft`）に修正し、`ended`（開催済み）statusは存在せず開催済みは`event_date`と現在時刻で判断することを明記／`first_published_at`（初回`public`日時。DB triggerがINSERT時のdraft固定・初回public時のnow()設定・一度設定後の不変・publicからdraftへの復帰不可を強制）と、DBが現在受理するstatus遷移（将来の管理RPCの正式操作とは別）を記載／6.6: `event_participants.status`を`going`/`attended`/`cancelled`に修正（`interested`廃止）。8章: M9 security baseline（events・event_participants・news・songs・login_attempts・app_settingsをRLS有効・policy 0件・anon/authenticatedのtable権限なしのdeny-by-defaultにし、`ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public`で今後のpublic tableへのanon/authenticatedの自動付与を除去）とM10（`login_attempts`のactive adminのみSELECT。書き込み経路は未実装）の実装状況を追記し、最終要件（RLS表）と現在のDB実装を区別。6.12・6.13にも実装状況を追記（`app_settings`はクライアント全拒否、signupの`handle_new_user()`は影響なし）。12章に残る判断事項（公開済みcancelledの公開、管理RPCの正式なstatus遷移、validation上限値、一覧の並び順、`created_by`等の公開範囲、物理DELETE、`event_participants`のanon公開範囲とwrite方式）を記載。events・event_participants・news・songsの最終RLS/RPC、Storage RLS、ログイン失敗の記録は引き続き未実装 |
| v1.23 | 2026-09-27 | eventsの公開境界（M11・M12）とPROJECT_SPEC.mdを同期（ドキュメントのみ）。6.5・8章: M11の公開の行境界（RLS policy `events_select_public`。`status='public'`、または`status='cancelled'`かつ`first_published_at IS NOT NULL`。一度公開されたLIVEは中止後も公開を継続し、公開前にcancelledになったeventは公開しない。`event_date`と利用者の状態は公開条件に使わない）／M12の公開の列境界（anon・authenticatedはtable単位のSELECTを持たず、公開8列〔`id`・`title`・`venue`・`event_date`・`description`・`image_url`・`ticket_url`・`status`〕のみ列単位のSELECT。非公開4列〔`created_by`・`created_at`・`updated_at`・`first_published_at`〕。`created_by`はadminの識別を避けるため非公開、`first_published_at`はRLS内部でのみ使用）／`SELECT *`は不可でclientは公開8列を明示、将来の列は明示的なGRANTまでは公開されないopt-in／PostgRESTを含む統合テストはNext.js実装時。adminのbase table read（RLS policy）という従来の推奨案を、列権限がロール単位であることから撤回し、admin read boundaryは専用のtrustedな読み取り境界として別途設計（未実装）。adminの書き込みは専用RPCの方向を維持（未実装）。6.1.4: 公開プロフィールの取得を実装どおり`get_public_profiles()`/`get_public_profile()`のSECURITY DEFINER RPCに修正し、`public_profiles` VIEWは存在しないことを明記（8章のprofiles行も同様）。12章の判断事項から、公開済みcancelledの扱いと公開列を解消し、残りは管理RPCの正式なstatus遷移・validation上限値・LIVE一覧の並び順/pagination・物理DELETE・admin read boundaryの方式・`event_participants`のanon公開範囲とwrite方式。event_participants・news・songsの最終RLS/RPC、`posts.event_id`の検証、Storage RLSは引き続き未実装 |
| v1.24 | 2026-09-27 | eventsのadmin読み取り境界（M13・M14）とPROJECT_SPEC.mdを同期（ドキュメントのみ）。6.5・8章・5.4: adminの読み取りは、公開の「base tableのRLS + 列単位のSELECT権限」とは別に、SECURITY DEFINER RPCで実装（列権限がロール単位のため、adminだけにbase tableの内部列をGRANTする方式は不採用）。認可は`is_admin()`（active adminのみ。一般ユーザー・suspended/banned admin・profile不在・uid NULLは拒否）で、エラーは`EVENT_MANAGEMENT_NOT_AUTHORIZED`（引数検証・対象検索より先）。EXECUTEはpostgres・authenticatedのみ（anon・PUBLIC・service_role不可）。M13 `get_admin_events(search, status_filter, after_event_date, after_id, page_size)`: active adminのみ・全status（一度も公開されていないcancelledを含む）・返却7列（`id`・`title`・`venue`・`event_date`・`status`・`first_published_at`・`updated_at`）・`event_date DESC, id DESC`・keyset pagination（片方のみのcursorは`INVALID_EVENT_CURSOR`）・`page_size`を1〜100に丸める（既定20）・`title`/`venue`の部分一致（trim・`%` `_` `\`は通常の文字・最大100文字で`EVENT_SEARCH_TOO_LONG`）・`status_filter`（不正値は`INVALID_EVENT_STATUS_FILTER`）。過去/未来のfilter・総件数・offset・任意のsortは未実装。M14 `get_admin_event(target_event_id)`: eventsの全12列（`created_by`はuuidのみ）・全statusを1件・存在しないUUIDとNULLは0行（専用エラーなし）。読み取りは`admin_logs`に記録しない。base table（公開境界）とadmin RPC（trustedなadmin境界）の区別を明記し、公開の行・列境界（M11・M12）は不変。解消した未決定事項（admin read boundaryの方式・signature・並び順・pagination・search/filter・返却列・認可）を12章・6.5から削除し、残る事項（admin write RPC・許可するstatus遷移・validation上限値・optimistic concurrency・物理DELETE・公開/liveの並び順/pagination・event_participantsのanon公開範囲とwrite方式・`posts.event_id`の検証）を更新。`/admin/events`の画面とSupabase client/PostgREST経由のintegrationは未実装。events admin writeは引き続き未実装 |
| v1.25 | 2026-09-28 | eventsのadmin書き込み境界（M15・M16・M17）とPROJECT_SPEC.mdを同期（ドキュメントのみ）。6.5・6.11・8章・5.4・12章: eventsは「公開の読み取り=base tableのRLS+列単位のSELECT権限（M11・M12）／adminの読み取り=SECURITY DEFINER RPC（M13・M14）／adminの書き込み=SECURITY DEFINER RPC（M15〜M17）」の3層。authenticated/adminへのbase tableの直接write・`admin_logs`の直接writeは不可。3 RPCとも`is_admin()`（active adminのみ・`EVENT_MANAGEMENT_NOT_AUTHORIZED`・認可はvalidationより先）、EXECUTEはpostgres・authenticatedのみ（anon・PUBLIC・service_role不可）、owner=postgres・SECURITY DEFINER・VOLATILE・`search_path=`。M15 `create_event(title, venue, event_date, description, image_url, ticket_url) -> uuid`（id・status=draft・created_by=auth.uid()・created_at・updated_at・first_published_atはサーバー管理）と、create/update共通の内部helper `internal.normalize_event_content`（EXECUTEはpostgresのみ）。validation契約: title/venue trim後1〜100文字・description NULL可で最大5000文字（blankはNULL）・event_dateはNOT NULLの有限値（過去・未来可、範囲制限なし、infinity不可）・ticket_urlは小文字https限定の現在の実装をそのまま記載（userinfo・内部空白不可、`HTTPS://`は拒否、raw IDNとIPv6リテラルは受理、RFC完全準拠ではない）・image_urlはevent-images bucketのobject key（`{uuid}.{jpg,jpeg,png,webp}`、大文字小文字を区別せず受理しlowercaseで保存、objectの実在は未確認）。M16 `update_event(target_event_id, expected_updated_at, 内容6項目) -> void`: 全置換（NULLはクリア）・statusは変更しない・no-opは成功だがUPDATE/`updated_at`/audit変更なし・stale versionはno-opより先にEVENT_CONFLICT・不存在/NULLはEVENT_NOT_FOUND。M17 `set_event_status(target_event_id, new_status, expected_updated_at) -> void`: 許可される遷移はdraft→public/cancelled、public→cancelled、cancelled（未公開）→draft、cancelled（公開済み）→publicのみで、同一statusを含むそれ以外はINVALID_EVENT_TRANSITION（未公開cancelledから直接publicは不可）・first_published_atは既存triggerが管理し中止/再公開でも上書きされない。楽観的同時実行制御: `expected_updated_at`必須（NULLはINVALID_EVENT_VERSION）・`SELECT ... FOR UPDATE`のlock下でマイクロ秒まで完全一致・不一致はEVENT_CONFLICT・date_trunc/丸め/許容幅なし。JSの`Date`経由でミリ秒に丸められる可能性があるため取得した`updated_at`文字列を加工せず返す方針（PostgREST/Supabase/Next.js経由のintegrationは未確認のTODO）。audit: 成功したwriteごとに`admin_logs`へ1行をatomicに記録（`create_event`={to_status}、`update_event`={changed_fields（固定順・値は保存しない）}、`set_event_status`={from_status,to_status}）。events管理のエラーコード（read 4種・write 12種）を整理し、trigger内部の例外は通常のAPI契約に含めない。解消した判断事項（events admin writeの方式・RPC分割・validation上限・status遷移・楽観的同時実行制御・audit・エラー）を12章・6.5から削除し、残る項目（公開/liveの並び順/pagination・物理DELETE・posts.event_idの検証・Storage object lifecycle・timestamp tokenのintegration確認・event_participantsのanon公開範囲とwrite方式）を更新。`/admin/events`の画面とNext.jsの統合は引き続き未実装 |
