import Link from "next/link";

import { LEGAL_PAGES, UNOFFICIAL_LABEL } from "@/lib/legal/site-info";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t px-4 py-6 text-sm leading-relaxed">
      <div className="mx-auto w-full max-w-2xl">
        <p className="font-bold">{UNOFFICIAL_LABEL}</p>
        <nav aria-label="規約・ポリシー" className="mt-2">
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {LEGAL_PAGES.map((page) => (
              <li key={page.href}>
                <Link href={page.href} className="inline-block py-1 underline underline-offset-2">
                  {page.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="mt-2">
          <a
            href="https://forms.gle/2Zchq7zZAckms1bq6"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            お問い合わせ
          </a>
        </p>
        <p className="mt-2 text-xs">
          上記の規約・ポリシー等は開発用のドラフトであり、正式に施行されたものではありません。
        </p>
      </div>
    </footer>
  );
}
