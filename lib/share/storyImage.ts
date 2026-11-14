import QRCode from "qrcode";

import { SITE_NAME } from "@/lib/legal/site-info";

// Instagram Stories canvas (9:16) per the PM spec.
const WIDTH = 1080;
const HEIGHT = 1920;

// Instagram's own UI (close button / profile header at the top, reply field
// at the bottom) commonly overlaps the top and bottom edges of a Story.
// Nothing meaningful is drawn above SAFE_TOP or below SAFE_BOTTOM so it
// never sits under that chrome (PM spec §5-1 "Instagramの操作UIと重なる
// 上下の領域に重要情報を配置しない").
const SAFE_TOP = 320;
const SAFE_BOTTOM = 1600;

const PAGE_TYPE_LABEL: Record<"feed" | "live", string> = {
  feed: "みんなの掲示板",
  live: "LIVE情報",
};

export type StoryImageInput = {
  pageType: "feed" | "live";
  title: string;
  url: string;
};

/**
 * Greedy character-by-character line wrap (not word-boundary — Japanese
 * text has no spaces to break on). Wraps into at most `maxLines` lines;
 * when the text doesn't fit, the last line is truncated and an ellipsis is
 * appended so it still fits `maxWidth` (same "…"-truncation convention as
 * lib/posts/format.ts's excerptContent(), applied here to pixel width
 * instead of character count since this renders at a fixed font size).
 */
function wrapTextByChar(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const chars = Array.from(text);
  const lines: string[] = [];
  let current = "";

  for (let i = 0; i < chars.length; i++) {
    const candidate = current + chars[i];
    if (current !== "" && ctx.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = chars[i];
      if (lines.length === maxLines) {
        // Overflowed — truncate what's already in `current` (plus
        // whatever's left unread) down to fit maxWidth with an ellipsis.
        const remaining = current + chars.slice(i + 1).join("");
        let truncated = remaining;
        while (truncated.length > 0 && ctx.measureText(`${truncated}…`).width > maxWidth) {
          truncated = truncated.slice(0, -1);
        }
        lines[lines.length - 1] = `${truncated}…`;
        return lines;
      }
    } else {
      current = candidate;
    }
  }

  if (current !== "") {
    lines.push(current);
  }
  return lines;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Generates a 1080×1920 Instagram Stories image entirely in the browser
 * (Canvas 2D) — no Supabase Storage write, no server round trip (PM spec
 * §5-1's "不要なサーバー負荷やSupabase Storageへの保存を発生させない構成
 * を優先してください"). The background is a plain brand-color gradient,
 * never a member photo or event key visual — this sidesteps entirely the
 * "non-public/members-only image leaking into a shared image" risk the PM
 * spec calls out in §8, since no such image is ever read or drawn here.
 */
export async function generateStoryImage({ pageType, title, url }: StoryImageInput): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("STORY_IMAGE_CANVAS_UNAVAILABLE");
  }

  // Background: dark-mode palette gradient (app/globals.css's --background /
  // --brand dark-theme values), with a soft brand-orange glow behind the
  // title — matches the site's existing dark hero-overlay look without
  // needing any photo asset.
  const bgGradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  bgGradient.addColorStop(0, "#1c1512");
  bgGradient.addColorStop(0.5, "#2a2019");
  bgGradient.addColorStop(1, "#1c1512");
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const glow = ctx.createRadialGradient(WIDTH / 2, 760, 80, WIDTH / 2, 760, 620);
  glow.addColorStop(0, "rgba(229, 130, 87, 0.35)");
  glow.addColorStop(1, "rgba(229, 130, 87, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // Site name.
  ctx.fillStyle = "#f2e9e1";
  ctx.font = "bold 40px sans-serif";
  ctx.fillText(SITE_NAME, WIDTH / 2, SAFE_TOP + 40);

  // Page-type badge (pill).
  const badgeLabel = PAGE_TYPE_LABEL[pageType];
  ctx.font = "bold 32px sans-serif";
  const badgeTextWidth = ctx.measureText(badgeLabel).width;
  const badgePaddingX = 36;
  const badgeWidth = badgeTextWidth + badgePaddingX * 2;
  const badgeHeight = 72;
  const badgeY = SAFE_TOP + 90;
  roundRect(ctx, WIDTH / 2 - badgeWidth / 2, badgeY, badgeWidth, badgeHeight, badgeHeight / 2);
  ctx.fillStyle = "#e58257";
  ctx.fill();
  ctx.fillStyle = "#221209";
  ctx.fillText(badgeLabel, WIDTH / 2, badgeY + badgeHeight / 2 + 11);

  // Title — wraps up to 4 lines, centered.
  const titleMaxWidth = WIDTH - 180;
  const titleFontSize = 72;
  const titleLineHeight = 96;
  ctx.font = `bold ${titleFontSize}px sans-serif`;
  const titleLines = wrapTextByChar(ctx, title, titleMaxWidth, 4);
  const titleStartY = badgeY + badgeHeight + 140;
  ctx.fillStyle = "#fffaf5";
  titleLines.forEach((line, index) => {
    ctx.fillText(line, WIDTH / 2, titleStartY + index * titleLineHeight);
  });

  // Caption.
  const captionY = titleStartY + titleLines.length * titleLineHeight + 70;
  ctx.font = "bold 38px sans-serif";
  ctx.fillStyle = "#e58257";
  ctx.fillText("ファンコミュニティで詳しく見る", WIDTH / 2, captionY);

  // QR code card (white rounded card + QR) — sized/positioned to stay
  // comfortably above SAFE_BOTTOM regardless of title line count, since
  // titleLines is capped at 4 and the fixed gaps above leave enough room.
  const qrCardSize = 440;
  const qrCardY = Math.min(captionY + 70, SAFE_BOTTOM - qrCardSize - 70);
  const qrSize = 360;
  roundRect(ctx, WIDTH / 2 - qrCardSize / 2, qrCardY, qrCardSize, qrCardSize, 32);
  ctx.fillStyle = "#fffaf5";
  ctx.fill();

  const qrCanvas = document.createElement("canvas");
  await QRCode.toCanvas(qrCanvas, url, {
    width: qrSize,
    margin: 0,
    color: { dark: "#231b16", light: "#fffaf5" },
  });
  ctx.drawImage(
    qrCanvas,
    WIDTH / 2 - qrSize / 2,
    qrCardY + (qrCardSize - qrSize) / 2,
    qrSize,
    qrSize
  );

  // Helper text below the QR card.
  ctx.font = "32px sans-serif";
  ctx.fillStyle = "#b3a295";
  ctx.fillText("QRコードを読み取って見る", WIDTH / 2, qrCardY + qrCardSize + 60);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("STORY_IMAGE_EXPORT_FAILED"));
      }
    }, "image/png");
  });
}
