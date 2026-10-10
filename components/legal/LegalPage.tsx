import Link from "next/link";
import type { ReactNode } from "react";

import {
  CONTACT_EMAIL,
  LEGAL_PAGES,
  OPERATOR_NAME,
  OPERATOR_TYPE,
  SITE_NAME,
} from "@/lib/legal/site-info";

export function ContactLink() {
  return (
    <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-2">
      {CONTACT_EMAIL}
    </a>
  );
}

export function Pending({ note }: { note?: string }) {
  return (
    <mark className="rounded bg-amber-200 px-1 text-amber-950 dark:bg-amber-800 dark:text-amber-50">
      【未確定{note ? `：${note}` : ""}】
    </mark>
  );
}

export function DocSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="mt-10 [&_li]:mt-2 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mt-3 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-6">
      <h2 className="text-lg font-bold leading-snug">{heading}</h2>
      {children}
    </section>
  );
}

export function DataTable({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[32rem] border-collapse text-sm">
        <thead>
          <tr>
            {head.map((cell) => (
              <th key={cell} className="border border-current/30 px-3 py-2 text-left font-bold">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="border border-current/30 px-3 py-2 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DraftNotice({ title }: { title: string }) {
  return (
    <div
      role="note"
      className="mt-6 rounded border-2 border-amber-500 bg-amber-50 p-4 text-sm leading-relaxed text-amber-950 dark:bg-amber-950 dark:text-amber-50"
    >
      <p className="font-bold">この{title}は開発用のドラフトです。</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>正式な{title}として施行されたものではありません。</li>
        <li>会員登録の同意を取得するための正式な文書としては使用できません。</li>
        <li>内容は予告なく変更されます。</li>
        <li>
          <Pending />
          と表示された項目は、運営者がまだ確定していない事項です。
        </li>
      </ul>
      <dl className="mt-3 grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1">
        <dt className="font-bold">版数</dt>
        <dd>
          <Pending note="正式な版数は未定" />
        </dd>
        <dt className="font-bold">施行日</dt>
        <dd>
          未定（<strong>未施行</strong>）
        </dd>
      </dl>
    </div>
  );
}

function UnofficialNotice() {
  return (
    <div className="mt-4 rounded border p-4 text-sm leading-relaxed">
      <p>
        <strong>{SITE_NAME}は非公式のファンコミュニティです。</strong>
        運営者（{OPERATOR_NAME}・{OPERATOR_TYPE}）が運営しており、かのうみゆさん本人、所属事務所、レーベルその他の関係者の公認・提携・監修・承認を受けたものではありません。サイト名の「かのうみゆ」は、ファンコミュニティの対象を示すために用いています。
      </p>
      <p className="mt-2">
        本サービスに関するお問い合わせは、権利者等ではなく、運営者（
        <ContactLink />
        ）へお願いします。
      </p>
    </div>
  );
}

export function LegalPage({
  title,
  current,
  children,
}: {
  title: string;
  current: (typeof LEGAL_PAGES)[number]["href"];
  children: ReactNode;
}) {
  const others = LEGAL_PAGES.filter((page) => page.href !== current);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 text-base leading-7">
      <article>
        <h1 className="text-2xl font-bold leading-snug">
          {SITE_NAME} {title}
          <span className="mt-1 block text-base font-normal">（開発用ドラフト・未施行）</span>
        </h1>
        <DraftNotice title={title} />
        <UnofficialNotice />
        {children}
      </article>

      <nav aria-label="関連ページ" className="mt-12 border-t pt-6 text-sm">
        <p className="font-bold">関連ページ</p>
        <ul className="mt-2 flex flex-col gap-2">
          {others.map((page) => (
            <li key={page.href}>
              <Link href={page.href} className="inline-block py-1 underline underline-offset-2">
                {page.label}
              </Link>
            </li>
          ))}
          <li>
            <Link href="/" className="inline-block py-1 underline underline-offset-2">
              トップページ
            </Link>
          </li>
        </ul>
      </nav>
    </main>
  );
}
