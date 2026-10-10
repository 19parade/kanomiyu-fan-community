import type { Metadata } from "next";
import Link from "next/link";

import { ContactLink, DataTable, DocSection, LegalPage, Pending } from "@/components/legal/LegalPage";
import { OPERATOR_NAME, OPERATOR_TYPE, SITE_NAME } from "@/lib/legal/site-info";

export const metadata: Metadata = {
  title: "プライバシーポリシー（開発用ドラフト）",
  description: `${SITE_NAME}のプライバシーポリシーの開発用ドラフトです。正式に施行されたものではありません。`,
  robots: { index: false, follow: false },
};

export default function PrivacyPage() {
  return (
    <LegalPage title="プライバシーポリシー" current="/privacy">
      <p className="mt-8">
        {OPERATOR_NAME}（{OPERATOR_TYPE}。以下「運営者」）は、「{SITE_NAME}」（以下「本サービス」）で取り扱う情報について、次のとおり定めます。本サービスは、運営者による非公式のファンコミュニティです（
        <Link href="/terms" className="underline underline-offset-2">
          利用規約
        </Link>
        第2条）。
      </p>

      <DocSection heading="1. 運営者の情報">
        <ul>
          <li>
            運営者：{OPERATOR_NAME}（{OPERATOR_TYPE}）
          </li>
          <li>
            氏名・住所の開示方式：<Pending note="開示方式" />
          </li>
          <li>
            お問い合わせ窓口：<ContactLink />
          </li>
        </ul>
      </DocSection>

      <DocSection heading="2. 現在取得する情報">
        <ol>
          <li>
            <strong>会員登録時の情報</strong>
            ：メールアドレス、パスワード、ユーザー名、表示名。パスワードは認証基盤（Supabase Auth）が保管し、運営者が平文で見ることはありません。
          </li>
          <li>
            <strong>同意記録</strong>：同意した利用規約とプライバシーポリシーの版数、同意日時。
          </li>
          <li>
            <strong>認証・セッション情報</strong>：ログイン状態を保つための情報（Cookie等）。
          </li>
          <li>
            <strong>事業者のログ</strong>
            ：ホスティング・認証基盤が自動的に記録するアクセスログ（IPアドレス、日時、ブラウザ情報など）。内容と保持期間は事業者の仕様によります。
            <Pending note="事業者のログの内容・保持期間は未確認" />
          </li>
          <li>
            <strong>お問い合わせの内容</strong>：窓口に送られた内容と連絡先。
          </li>
        </ol>
      </DocSection>

      <DocSection heading="3. 準備中の機能の提供開始後に取得する情報">
        <p>これらの機能は、現在提供していません。提供開始時に、本ポリシーを確認します。</p>
        <ul>
          <li>プロフィール情報（アバター、自己紹介、ファン歴など）</li>
          <li>投稿、コメント、いいね、画像（JPEG・PNG・WebP、5MB以下）</li>
          <li>LIVE参加表明（参加状況と公開範囲。初期設定は非公開）</li>
          <li>通報（理由と補足説明）、ブロックの情報</li>
          <li>ログイン失敗の記録（メールアドレスを正規化した値、IPアドレス、日時）</li>
          <li>運営者の管理操作の記録（対象と操作内容。メールアドレス、IPアドレス、投稿本文は記録しません）</li>
        </ul>
      </DocSection>

      <DocSection heading="4. 利用目的">
        <ul>
          <li>会員登録、ログイン、本人確認（メール確認を含む）</li>
          <li>本サービスの提供・運営</li>
          <li>規約違反への対応、安全の確保、不正利用の防止</li>
          <li>お問い合わせへの対応</li>
          <li>規約・ポリシー等の重要なお知らせ</li>
        </ul>
        <p>
          メールアドレスは、上記以外の目的には使用せず、他のユーザーには表示しません。現在、広告配信やマーケティングメールの送信は行っていません。
        </p>
      </DocSection>

      <DocSection heading="5. Supabase Authの認証情報">
        <p>
          認証には、Supabase（Supabase Inc.）の認証機能を利用します。認証情報はSupabaseの管理するデータベースに保管され、パスワードは一方向に変換された形で保管されます。Supabaseにおけるデータの取り扱いの詳細は
          <Pending />
          です。
        </p>
      </DocSection>

      <DocSection heading="6. 公開される情報">
        <ul>
          <li>ユーザー名と表示名は、プロフィール機能やコミュニティ機能の提供開始後に、他のユーザーに表示されます。</li>
          <li>メールアドレスは、他のユーザーには表示されません。</li>
          <li>楽曲情報は、会員登録をしていない方にも表示されます。</li>
        </ul>
      </DocSection>

      <DocSection heading="7. Cookieとセッション">
        <p>
          ログイン状態の保持に必要なCookie（セッション情報）を使います。現在、アクセス解析、広告配信、SNS連携のためのツールは使っていません。導入する場合は、事前に本ポリシーを改定します。
        </p>
      </DocSection>

      <DocSection heading="8. 外部サービスの利用">
        <DataTable
          head={["外部サービス", "用途", "保管地域・取り扱い"]}
          rows={[
            ["Supabase", "データベース、認証、画像ストレージ", <Pending key="s" note="リージョン、データの取り扱い" />],
            ["Vercel", "ウェブサイトのホスティング", <Pending key="v" note="リージョン、データの取り扱い" />],
            [
              "メール送信サービス",
              "確認メールの送信",
              <Pending key="m" note="Supabase標準か、独自の設定か" />,
            ],
          ]}
        />
        <p>
          これらの事業者は、サービス提供に必要な範囲で情報を取り扱います。海外に保管される可能性があります。越境移転に関する記載は
          <Pending note="専門家の確認が必要です" />
          です。
        </p>
      </DocSection>

      <DocSection heading="9. 保存期間と削除">
        <ol>
          <li>アカウント情報は、利用を続けている間、保存します。</li>
          <li>
            現在、ユーザー自身が退会する機能は提供していません。削除や利用停止をご希望の場合は、窓口にご連絡ください。個人情報の削除・匿名化の具体的な手順は
            <Pending note="削除・匿名化の手順" />
            です。技術上、物理的に削除できない情報があります。
          </li>
          <li>
            規約違反への対応に関する記録は、再発防止のために保存します。保存期間は<Pending />です。
          </li>
          <li>
            投稿が提供された後は、削除された投稿も、運営上の記録として内部に保管される場合があります。保管期間は
            <Pending />
            です。
          </li>
        </ol>
      </DocSection>

      <DocSection heading="10. 第三者提供">
        <p>次の場合を除き、ご本人の同意なく第三者に個人情報を提供しません。</p>
        <ul>
          <li>法令に基づく場合</li>
          <li>人の生命・身体・財産を保護するために必要で、本人の同意を得ることが困難な場合</li>
          <li>外部サービスへの運営委託（上記8）</li>
        </ul>
      </DocSection>

      <DocSection heading="11. 安全管理">
        <p>アクセス制御や通信の暗号化など、合理的な安全管理措置を講じます。ただし、完全な安全性を保証するものではありません。</p>
      </DocSection>

      <DocSection heading="12. 開示・訂正・利用停止・削除のご請求">
        <p>
          ご自身の個人情報の開示、訂正、利用停止、削除などをご希望の場合は、<ContactLink />{" "}
          にご連絡ください。本人確認の方法と対応期間の目安は <Pending /> です。
        </p>
      </DocSection>

      <DocSection heading="13. 未成年の方">
        <p>
          未成年の方の利用条件は <Pending note="現在検討中です" /> です。
        </p>
      </DocSection>

      <DocSection heading="14. ポリシーの変更">
        <p>
          必要に応じて本ポリシーを変更します。変更の通知方法・時期、および再同意の要否・方法は
          <Pending note="規約改定時の通知・再同意" />
          です。
        </p>
      </DocSection>

      <DocSection heading="附則">
        <p>
          本ポリシーの施行日は<Pending note="施行日" />です。現在は<strong>未施行の開発用ドラフト</strong>であり、版数も確定していません。
        </p>
      </DocSection>
    </LegalPage>
  );
}
