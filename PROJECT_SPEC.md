# かのうみゆファンコミュニティ 開発仕様書

- ドキュメント種別: 開発仕様書（実装者向け）
- ステータス: Draft v1.3
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
/admin/events      LIVE管理
/admin/news        ニュース管理
/admin/music       楽曲管理
/admin/logs        管理者操作ログ
```

### 5.5 アクセス制御の基本方針

- 会員向けページは未ログイン時 `/login` へリダイレクト。
- 管理者ページは `profiles.role = 'admin'` 以外のユーザーを `/` へリダイレクト（またはアクセス拒否）。
- ページ側の制御に加え、DB側のRLSでも同様の制御を行う（後述）。画面での非表示のみに依存しない。

---

## 6. データベース設計（Supabase PostgreSQL）

前提: Supabase Authの `auth.users` を認証の正とし、`profiles` テーブルで公開プロフィール情報を管理する（`profiles.id = auth.users.id`）。

命名規則: テーブル名はスネークケース複数形、主キーは `id uuid`、作成日時は `created_at`、更新日時は `updated_at` で統一する。

### 6.1 profiles

**目的**: 会員の公開プロフィール情報、ロール、アカウント状態を管理する。

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid (PK) | `auth.users.id` を参照 |
| username | text | 公開プロフィールURL(`/fans/[username]`)に使用する一意な識別子 |
| display_name | text | 表示名 |
| avatar_url | text (nullable) | Storage `avatars` バケット内画像URL |
| bio | text (nullable) | 自己紹介 |
| fan_since | date (nullable) | ファン歴（任意入力） |
| role | text | `member` \| `admin`（デフォルト `member`） |
| status | text | `active` \| `suspended` \| `banned`（デフォルト `active`。挙動の詳細は6.1.1参照） |
| terms_version | text | 同意した利用規約のバージョン識別子 |
| terms_agreed_at | timestamptz (nullable) | 利用規約に同意した日時 |
| privacy_policy_version | text | 同意したプライバシーポリシーのバージョン識別子 |
| privacy_policy_agreed_at | timestamptz (nullable) | プライバシーポリシーに同意した日時 |
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
- `/me/edit`（プロフィール編集）では`username`を編集不可（読み取り専用）項目として扱う。RLS上のUPDATEポリシーにおいても、`username`カラムの変更は許可しない（`display_name`等の他カラムのみ更新可能とする）ことをアプリ側・DB側の両方で徹底する。
- 将来的にusername変更機能を追加する場合は、旧usernameから新usernameへのリダイレクト、旧URLの扱い、変更頻度制限などを含めて別途設計するものとし、MVPのスコープには含めない。

#### 6.1.1 profiles.status の挙動（確定）

| status | ログイン | サイト閲覧 | 投稿・コメント・いいね・LIVE参加表明等のコミュニティ操作 | 主要ページへのアクセス |
|---|---|---|---|---|
| active | 可 | 可 | 可 | 制限なし |
| suspended | 可 | 可 | 不可（作成系操作をすべて禁止） | 制限なし（コミュニティ機能以外は通常利用可能） |
| banned | 可（認証自体は可能） | 不可 | 不可 | コミュニティ機能および主要ページへのアクセスを制限し、専用の案内ページへ誘導する |

- **suspended**: ログイン・サイト閲覧は可能。投稿・コメント・いいね・LIVE参加表明等のコミュニティ操作（作成系操作）は禁止する。これらの操作を行おうとした場合は、アプリ側で「利用制限中のため実行できません」といった、現在利用制限中であることを伝える汎用メッセージを表示する。
- **banned**: 認証自体は可能だが、コミュニティ機能および主要ページ（`/community`配下、`/me`配下、LIVE参加表明等）へのアクセスを制限し、専用の案内ページへ誘導する。投稿・コメント・いいね・LIVE参加表明等の作成系操作も禁止する。
- 案内文言はいずれも簡潔な汎用メッセージとし、通報内容・通報理由・処分理由の詳細等、個別の判断根拠は表示しない。
- 上記はRLS（DB側）とアプリ側の両方で二重に制御する。RLS側は「作成系操作(INSERT)は `status='active'` のユーザーのみ許可」という形でINSERTポリシーに反映する。
- banned ユーザーのアクセス制限はアプリ側のルーティング制御（ミドルウェア等）でも行うが、コミュニティ系テーブルへのINSERT/UPDATEはRLSでも遮断する。

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
| image_url | text (nullable) | Storage `post-images` バケット内画像URL |
| status | text | `published` \| `hidden` \| `deleted`（デフォルト `published`。論理削除を基本とし、物理削除は行わない） |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**リレーション**: `author_id → profiles.id`、`event_id → events.id`（任意）。`comments.post_id`, `likes.post_id` から参照される。

**ユニーク制約**: なし。

**備考**: LIVEレポートを独立テーブルにせず `posts` の一種として実装することで、コメント・いいね・通報の仕組みをそのまま流用できる。

**status / 表示制御の方針**（コメント6.3にも同様に適用）:
- `status` による削除・非表示は論理削除を基本とし、レコード自体はDB上に保持する。
- 一般ユーザー（投稿者以外）には `status='published'` の投稿のみ表示する。
- 投稿者本人には、自分の投稿は `status` の値に関係なく（`hidden`/`deleted`でも）閲覧できる。`deleted`の場合はUI上で「削除済み」であることが分かる表示にする。
- 投稿が`deleted`（または`hidden`）の場合、紐づく`comments`・`likes`はDB上には保持したまま、一般ユーザーへは表示しない。投稿者本人が自分の投稿を見る場合は、紐づくコメント・いいねも合わせて確認できる。
- ログイン中のユーザーに対しては、上記に加えて自分がブロックしたユーザーの投稿もSELECT結果から除外する（6.8 blocksの方針を参照）。

**`hidden` と `deleted` の使い分け（確定）**:

| status | 意味 | 主な発生契機 | 再公開の可能性 |
|---|---|---|---|
| `hidden` | 運営による一時的な非表示 | 規約違反の疑いがある投稿を、管理者が調査目的で一時的に見えなくする | あり（調査の結果、問題なしと判断すれば`published`に戻す） |
| `deleted` | 投稿者本人または運営による削除 | 投稿者自身の削除操作、または運営による最終的な削除判断 | 原則なし（再公開しない。DB上のレコードは論理削除として保持する） |

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

**リレーション**: `post_id → posts.id`、`author_id → profiles.id`。

**ユニーク制約**: なし。

**表示制御の方針**: 6.2 posts の「status / 表示制御の方針」および「`hidden`と`deleted`の使い分け」と同様。コメント作成者本人は自分のコメントを`status`に関わらず閲覧でき、`deleted`の場合は「削除済み」と分かる表示にする。加えて、親投稿(`posts`)が一般ユーザーに非表示（`hidden`/`deleted`）の場合は、コメント自体の`status`が`published`であっても一般ユーザーには表示しない。ログイン中のユーザーに対しては、コメント投稿者を自分がブロックしている場合、そのコメントもSELECT結果から除外する。

---

### 6.4 likes

**目的**: 投稿への「いいね」。

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid (PK) | |
| post_id | uuid (FK → posts.id) | 対象投稿 |
| user_id | uuid (FK → profiles.id) | いいねしたユーザー |
| created_at | timestamptz | |

**リレーション**: `post_id → posts.id`、`user_id → profiles.id`。

**ユニーク制約**: `(post_id, user_id)` に UNIQUE（多重いいね防止）。

**表示制御の方針**: `likes`自体に`status`は持たないが、親投稿(`posts`)が一般ユーザーに非表示（`hidden`/`deleted`）の場合、そのいいね件数・いいね一覧も一般ユーザーには表示しない。レコードはDB上に保持する。この場合に閲覧可能なのは「そのいいねが紐づいている投稿の投稿者本人」であり、「いいねをしたユーザー本人」を指すものではない（いいねをした側のユーザーであっても、投稿者自身でなければ非公開の投稿に対する自分のいいねを見ることはできない）。

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
| image_url | text (nullable) | Storage `event-images` バケット内画像URL |
| ticket_url | text (nullable) | チケット関連の外部リンク（転売防止のため公式リンクのみ想定） |
| status | text | `upcoming` \| `ended` \| `cancelled`（デフォルト `upcoming`） |
| created_by | uuid (FK → profiles.id) | 作成した管理者 |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**リレーション**: `posts.event_id`, `event_participants.event_id` から参照される。

**ユニーク制約**: なし。

---

### 6.6 event_participants

**目的**: LIVEへの参加表明を管理する。

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid (PK) | |
| event_id | uuid (FK → events.id) | 対象LIVE |
| user_id | uuid (FK → profiles.id) | 参加表明したユーザー |
| status | text | `going` \| `interested` \| `cancelled`（デフォルト `going`） |
| visibility | text | `public` \| `private` \| `attended`（デフォルト `public`） |
| created_at | timestamptz | |

**リレーション**: `event_id → events.id`、`user_id → profiles.id`。

**ユニーク制約**: `(event_id, user_id)` に UNIQUE（1ユーザー1LIVEにつき1レコード、状態変更はUPDATEで行う）。

**visibility（公開設定）の方針**:
- `public`: 他ユーザーにも参加表明として公開する（デフォルト）。
- `private`: 本人のみ確認可能。他ユーザー・LIVE詳細ページの参加者一覧には表示しない。
- `attended`: 参加済みであることを公開してよい状態（LIVE後の実績表示等を想定）。
- LIVE詳細ページの参加者一覧には `visibility='public'` または `'attended'` のレコードのみ表示する。`private`は本人がマイページ（`/me/events`）で確認する分にのみ表示する。

---

### 6.7 reports

**目的**: 投稿・コメント・ユーザーに対する通報を管理する。

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid (PK) | |
| reporter_id | uuid (FK → profiles.id) | 通報者 |
| target_type | text | `post` \| `comment` \| `user` |
| target_id | uuid | 対象レコードのID（`target_type`に応じて `posts`/`comments`/`profiles` を参照。ポリモーフィックのためDB外部キー制約は付与しない） |
| reason | text | 通報理由（カテゴリ） |
| detail | text (nullable) | 詳細説明 |
| status | text | `pending` \| `reviewing` \| `resolved` \| `rejected`（デフォルト `pending`） |
| handled_by | uuid (FK → profiles.id, nullable) | 対応した管理者 |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**リレーション**: `reporter_id → profiles.id`、`handled_by → profiles.id`。`target_id` はアプリケーション側で `target_type` に応じて解決する。

**ユニーク制約**: `(reporter_id, target_type, target_id)` に UNIQUE。同一ユーザーによる同一対象への重複通報は原則禁止とし、DB側で防止する。アプリ側は重複INSERT時に「既に通報済みです」等のエラーとしてハンドリングする。

**通報時の挙動（確定）**:
- 通報されたことを対象ユーザー（`target_id`が指すユーザー、または投稿・コメントの作成者）へ通知しない。
- 通報者（`reporter_id`）の身元を対象ユーザーへ公開しない。`reports`テーブルのSELECTは通報者本人とadmin(`is_admin()`)のみに限定し、対象ユーザーが自分に対する通報の`reporter_id`を参照できないようにする。
- 通報された投稿・コメントは、管理者が対応を判断するまでは通常どおり表示する（通報のみを理由に自動で`hidden`化はしない）。
- 管理者が内容を確認した上で、必要に応じて対象の投稿・コメントを`hidden`または`deleted`に変更する等の対応を行う。この対応は`admin_logs`に記録する。

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

**ユニーク制約**: `(blocker_id, blocked_id)` に UNIQUE。加えて `blocker_id <> blocked_id` のCHECK制約を推奨（自己ブロック防止）。

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
| image_url | text (nullable) | 画像URL |
| source_url | text (nullable) | 公式情報源へのリンク（任意） |
| status | text | `draft` \| `published`（デフォルト `draft`） |
| published_at | timestamptz | 公開日時（未来日時を設定した場合は、その日時が到来するまで一般ユーザーには公開しない） |
| created_by | uuid (FK → profiles.id) | 作成した管理者 |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**リレーション**: `created_by → profiles.id`。

**ユニーク制約**: なし。

**表示制御の方針**:
- 一般ユーザーには `status='published'` かつ `published_at <= 現在時刻` の記事のみ表示する。
- 管理者は `status='draft'` の記事、および `published_at` が未来の記事も `/admin/news` で閲覧・編集できる。

---

### 6.10 songs

**目的**: 楽曲情報の管理（`/music` ページ用）。

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid (PK) | |
| title | text | 楽曲名 |
| release_date | date (nullable) | リリース日 |
| cover_image_url | text (nullable) | ジャケット画像URL |
| description | text (nullable) | 楽曲説明 |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**リレーション**: なし（独立マスタ）。

**ユニーク制約**: なし。

**備考（コミュニティルール反映）**: 歌詞全文の掲載は禁止事項のため、`lyrics` 等の全文格納カラムは設けない。引用する場合も短い抜粋のみを想定し、専用カラムは用意せず `description` 内での短文引用に留める運用とする。

---

### 6.11 admin_logs

**目的**: 管理者操作の監査ログ。

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid (PK) | |
| admin_id | uuid (FK → profiles.id) | 操作した管理者 |
| action | text | 操作種別（例: `delete_post`, `ban_user`, `resolve_report`） |
| target_type | text | 操作対象の種別（例: `post`, `user`, `report`） |
| target_id | uuid | 操作対象のID |
| detail | jsonb (nullable) | 操作の詳細（変更前後の値など） |
| created_at | timestamptz | |

**リレーション**: `admin_id → profiles.id`。

**ユニーク制約**: なし。

**書き込み経路の方針（確定）**:
- `admin_logs`へのINSERTをクライアントから直接許可するRLSポリシーは作成しない。
- 記録はServer Action / Route Handler等、サーバーサイド処理からのみ行う（サーバー側でのみ書き込み権限を持たせる。クライアントSDKからのINSERTは常に拒否する）。
- 管理者操作の監査ログであるため、一般ユーザー（管理者を含む）によるクライアント経由の改ざん・偽装記録を防止することを目的とする。

---

## 7. 認証（Supabase Auth）

- Supabase Authを用いた認証を行う（メールアドレス＋パスワードを基本とする）。
- サインアップ時に `auth.users` レコード作成後、対応する `profiles` レコードを作成する（トリガーまたはアプリケーション処理で自動生成）。
- パスワード再設定は `/forgot-password` からSupabase Authの機能を利用する。
- セッション管理はSupabaseのSSR/クライアントSDKに準拠する。

### 利用規約・プライバシーポリシーへの同意記録（確定）

- サインアップ時に、利用規約への同意を `profiles.terms_version`（同意したバージョン）と `profiles.terms_agreed_at`（同意日時）として記録する。
- 同様に、プライバシーポリシーへの同意を `profiles.privacy_policy_version` と `profiles.privacy_policy_agreed_at` として記録する。
- アプリ側で「現行の利用規約バージョン」「現行のプライバシーポリシーバージョン」を定数・設定値として管理し、ログイン中のユーザーの各バージョンがそれと一致しない場合に比較できるデータ構造をMVPの時点で用意しておく。
- 規約またはプライバシーポリシーを改定した場合に、既存ユーザーへ再同意を求めるかどうか（および求める場合のフロー）は、その改定が発生した時点で判断する。MVP時点ではバージョンを記録・比較できる状態にしておくことのみを必須要件とする。

---

## 8. セキュリティ方針

- **RLS必須**: 全テーブルでRow Level Securityを有効化する。画面上でボタンを非表示にする・APIレスポンスを絞るなどのアプリケーション層の制御だけに頼らず、DB側でも権限を制御する。
- **サービスロールキーの非公開**: `SUPABASE_SERVICE_ROLE_KEY` はサーバーサイド専用とし、クライアントに一切露出させない（環境変数はサーバー専用の変数名で管理し、`NEXT_PUBLIC_` プレフィックスを付けない）。
- **入力値バリデーション**: フォーム入力（投稿・コメント・プロフィール等）はクライアント側・サーバー側の両方でバリデーションを行う。
- **画像アップロード制限（確定）**: 許可する形式は JPEG / PNG / WebP、最大ファイルサイズは 5MB とする。クライアント側での事前チェックに加え、サーバー側（アップロード処理・Storageポリシー）でもMIMEタイプとサイズを必ず検証し、クライアント側チェックのみに依存しない。
- **スパム・レート制限**: 投稿・コメント・いいね・通報・ログイン試行の連続実行に対するレート制限を設ける（対象範囲・初期閾値は確定。実装方式は12章の要決定事項を参照）。
- **秘密情報の管理**: `.env.local` 等の秘密情報はGitにコミットしない。`.gitignore` で除外を徹底する。

### RLSポリシーの基本方針（テーブル別）

| テーブル | 参照(SELECT) | 作成(INSERT) | 更新/削除(UPDATE/DELETE) |
|---|---|---|---|
| profiles | 全員（公開情報のみ） | 本人（サインアップ時） | 本人 or admin(`is_admin()`) |
| posts | `status='published'`は全員（ただしログイン中は自分がブロックした投稿者の投稿を除く）、`hidden`/`deleted`は投稿者本人 or admin(`is_admin()`)のみ | ログイン済み本人（`status='active'`のユーザーのみ） | 投稿者本人 or admin(`is_admin()`) |
| comments | `status='published'`かつ親投稿が公開範囲内なら全員（ただしログイン中は自分がブロックした投稿者のコメントを除く）、それ以外はコメント投稿者本人 or admin(`is_admin()`)のみ | ログイン済み本人（`status='active'`のユーザーのみ） | コメント投稿者本人 or admin(`is_admin()`) |
| likes | 親投稿が公開範囲内であれば全員、それ以外は当該投稿の投稿者本人のみ（いいねした本人ではない） | ログイン済み本人（自分の分のみ、`status='active'`のユーザーのみ） | 本人のみ削除可 |
| events | 全員 | admin(`is_admin()`) のみ | admin(`is_admin()`) のみ |
| event_participants | `visibility in ('public','attended')`は全員、`private`は本人のみ、いずれも本人は常に自分の分を閲覧可 | ログイン済み本人（自分の分のみ、`status='active'`のユーザーのみ） | 本人 or admin(`is_admin()`) |
| reports | 通報者本人 or admin(`is_admin()`) | ログイン済み本人（`status='active'`のユーザーのみ） | admin(`is_admin()`) のみ |
| blocks | 本人のみ（自分がブロックした一覧） | ログイン済み本人 | 本人のみ |
| news | `status='published'`かつ`published_at<=now()`は全員、`draft`または未来の`published_at`はadmin(`is_admin()`)のみ | admin(`is_admin()`) のみ | admin(`is_admin()`) のみ |
| songs | 全員 | admin(`is_admin()`) のみ | admin(`is_admin()`) のみ |
| admin_logs | admin(`is_admin()`) のみ | クライアントからのINSERTは不可。サーバーサイド処理（Server Action/Route Handler等）からのみ記録 | 不可（追記のみ、更新・削除禁止） |

> 上記は方針レベルの整理であり、実装時に具体的なSQLポリシーとしてマイグレーションに落とし込む。

### 管理者判定とRLSの循環参照回避

`profiles.role` を各テーブルのRLSポリシーから直接参照すると、`profiles`自体のRLSポリシー評価と絡んで循環参照（無限再帰）を起こす可能性がある。これを避けるため、以下の設計とする。

- 管理者判定用のヘルパー関数 `is_admin() returns boolean`（内部で`auth.uid()`を用いて呼び出し元自身のロールのみを判定する）を用意し、各テーブルのRLSポリシーはこの関数経由で判定する（`profiles.role`を直接SELECTするサブクエリをポリシー内に書かない）。
- この関数は `SECURITY DEFINER` として定義し、関数所有者の権限で実行することでRLSの再帰評価を回避する。
- `SECURITY DEFINER`関数は`search_path`を明示的に固定する（例: `SET search_path = public, pg_temp`）。固定しない場合、呼び出し側が`search_path`を操作して意図しないオブジェクトを参照させる「search_path経由の権限昇格」のリスクがあるため、必ず設定する。
- 関数の実行権限は必要最小限（`authenticated`ロール等）に絞る。
- `is_admin()`は原則として引数なしで呼び出し元の認証ユーザー（`auth.uid()`）自身の管理者権限を判定する用途に限定する。任意の`uid`を指定して他ユーザーの管理者権限を判定する用途では使用しない（他者のロールを調べる機能が必要な場合は、別途admin専用の関数・APIとして設計する）。この制約により、RLSポリシーから安全に（＝呼び出し元が任意のユーザーの権限情報を引き出す手段にならない形で）利用できる設計とする。

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

> 実装方式（DB側トリガー、Supabase Edge Function、Next.js側のミドルウェア/Route Handler等、Next.js/Supabaseの構成に適した方式）は未確定。12章「未確定事項」を参照し、実装前に決定する。

---

## 9. ストレージ（Supabase Storage）

想定バケット:

| バケット名 | 用途 | 備考 |
|---|---|---|
| avatars | プロフィールアバター画像 | 本人のみアップロード・更新可、公開読み取り可 |
| post-images | 投稿添付画像 | 投稿者本人のみアップロード可、公開読み取り可（`posts.status`に連動して非表示制御） |
| event-images | LIVE告知画像 | admin のみアップロード可、公開読み取り可 |

- 各バケットで許可するのは JPEG / PNG / WebP のみとし、最大ファイルサイズは 5MB とする（8章「画像アップロード制限」参照）。
- バケットごとにStorage RLSポリシーを設定し、アップロード権限を上記の通り制限する。

### ファイルパスの命名規則（確定）

Storage RLSでアップロード先を制御できるよう、ファイルパスは以下の規則に統一する。

```
avatars/{user_id}/{uuid}.{ext}
post-images/{user_id}/{uuid}.{ext}
event-images/{uuid}.{ext}
```

- `avatars`・`post-images` は先頭フォルダを `user_id`（`auth.uid()`と一致する値）とし、Storage RLSポリシーで `storage.foldername(name)[1] = auth.uid()::text` 相当の条件を用いて、他ユーザーの領域へのアップロードを禁止する。
- `event-images` はユーザーフォルダを持たず、INSERTをadmin(`is_admin()`)のみに制限することでアクセス制御する。
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

これらは `reports.reason` の選択肢設計、および管理者による投稿・コメント・ユーザー対応（`admin_logs` に記録）の判断基準として用いる。

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

- レート制限の実装方式（DB側トリガー、Supabase Edge Function、Next.js側のミドルウェア/Route Handler等、Next.js/Supabaseの構成に適した方式をどれにするか）。対象操作と初期閾値は8章で確定済み。
- `banned`ユーザーを誘導する「専用の案内ページ」の具体的なルート/URL（例: `/account-restricted` 等）が、5章のページ構成に未定義。新規ページとして追加するか、既存ページ（例: `/`）内の表示切り替えで対応するかを決定する。
- ユーザーが`suspended`/`banned`になった時点で、そのユーザーが過去に投稿した`published`な投稿・コメントを、他の一般ユーザーから見て引き続き表示するか、自動的に非表示（`hidden`相当）にするかが未定義。現行の`posts`/`comments`のSELECT方針は投稿単位の`status`のみを見ており、投稿者の`profiles.status`は考慮していない。

---

## 13. 変更履歴

| バージョン | 日付 | 内容 |
|---|---|---|
| v1.0 | 2026-09-19 | 初版作成 |
| v1.1 | 2026-09-19 | レビュー結果を反映。投稿・コメントの論理削除と表示制御を明確化／newsにstatus(draft/published)を追加／`/fans/[username]`へURL方針を変更し username 形式制約を追加／管理者判定のRLS循環参照回避策(`is_admin()`関数とsearch_path固定)を追加／Storageファイルパス規則を追加／profiles.statusの挙動(active/suspended/banned)を明文化／reportsに重複通報防止のUNIQUE制約を追加／利用規約同意記録(terms_version, terms_agreed_at)を追加／レート制限の対象範囲を確定／event_participantsに参加表明の公開設定(visibility)を追加 |
| v1.2 | 2026-09-19 | admin_logsへのクライアント直接INSERT禁止（サーバーサイド処理からのみ記録）を明記／`is_admin()`の用途を呼び出し元自身(`auth.uid()`)の判定に限定し、任意uid指定での他者判定を禁止する方針を明記／likesのRLSにおける「投稿者本人」が「いいねしたユーザー」ではなく「そのいいねが紐づく投稿の投稿者」を指すことを明確化／MVPではusername変更を非対応とする方針を確定（`/me/edit`はusername読み取り専用） |
| v1.3 | 2026-09-19 | posts/commentsの`hidden`(一時非表示・再公開の可能性あり)と`deleted`(原則恒久的な論理削除)の使い分けを確定／通報時の非通知・通報者非公開・管理者判断まで通常表示する方針を確定／ブロック時の一方向非表示(ブロックした本人視点でのみ非表示)・非通知を確定しRLSに反映／レート制限の初期閾値(投稿10回/10分等)を確定(実装方式は引き続き未確定)／画像アップロードをJPEG/PNG/WebP・最大5MB・サーバー側検証必須で確定／profilesに`privacy_policy_version`・`privacy_policy_agreed_at`を追加／suspended・bannedの挙動と案内文言方針(汎用メッセージ、詳細非表示)を確定 |
