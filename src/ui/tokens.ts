// The single source of design tokens for every server-rendered page.
// Values are frozen by docs/design-system.md §2–§7. Pages consume these
// strings in their existing inline <style> elements; no external stylesheet
// or resource is needed, so the content-security policy stays unchanged.
// The inline LX logo keeps its fixed brand-artwork fills (#5ed698/#4daf7c),
// the only raw-color exception outside this module (docs/design-system.md §2).

export const baseTokensCss = `:root {
  color-scheme: light;
  /* 控件高度 token 在亮/暗两套下共用同一份声明，见 :root。 */
  --lx-font-body: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
  --lx-font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  --lx-text-display-size: 30px;
  --lx-text-display-lh: 1.2;
  --lx-text-display-weight: 700;
  --lx-text-display-tracking: -0.02em;
  --lx-text-h1-size: 24px;
  --lx-text-h1-lh: 1.25;
  --lx-text-h1-weight: 700;
  --lx-text-h1-tracking: -0.02em;
  --lx-text-h2-size: 18px;
  --lx-text-h2-lh: 1.3;
  --lx-text-h2-weight: 600;
  --lx-text-h2-tracking: -0.01em;
  --lx-text-h3-size: 16px;
  --lx-text-h3-lh: 1.35;
  --lx-text-h3-weight: 600;
  --lx-text-h3-tracking: -0.01em;
  --lx-text-body-size: 14px;
  --lx-text-body-lh: 1.55;
  --lx-text-body-weight: 400;
  --lx-text-body-tracking: 0;
  --lx-text-small-size: 13px;
  --lx-text-small-lh: 1.45;
  --lx-text-small-weight: 400;
  --lx-text-small-tracking: 0;
  --lx-text-label-size: 12px;
  --lx-text-label-lh: 1.4;
  --lx-text-label-weight: 600;
  --lx-text-label-tracking: 0.04em;
  --lx-space-1: 4px;
  --lx-space-2: 8px;
  --lx-space-3: 12px;
  --lx-space-4: 16px;
  --lx-space-5: 24px;
  --lx-space-6: 32px;
  --lx-space-7: 48px;
  --lx-space-8: 64px;
  /* 控件高度（项 1/4/5/6）：间距 scale 不能当控件高度用，输入框、按钮、
     主题按钮统一走这两个 token。*/
  --lx-control-height: 36px;
  --lx-control-tap: 48px;
  --lx-brand: #157f4a;
  --lx-brand-hover: #11693d;
  --lx-brand-on: #ffffff;
  --lx-brand-soft: #e6f6ee;
  --lx-brand-border: #b3e2c8;
  --lx-bg: #f6f7f9;
  --lx-sunken: #eceef1;
  --lx-card: #ffffff;
  --lx-raised: #ffffff;
  --lx-backdrop: #16202c;
  --lx-line: #e3e6ea;
  --lx-border-strong: #c9cfd6;
  --lx-muted: #5d6b7a;
  --lx-text: #1b2430;
  --lx-heading: #0e141c;
  --lx-ok-bg: #ecfdf3;
  --lx-ok-border: #a6e9c5;
  --lx-ok-text: #067647;
  --lx-warn-bg: #fffaeb;
  --lx-warn-border: #f5d98b;
  --lx-warn-text: #93370d;
  --lx-danger-bg: #fef3f2;
  --lx-danger-border: #f5b8b2;
  --lx-danger-text: #b42318;
  --lx-radius-sm: 6px;
  --lx-radius-md: 10px;
  --lx-radius-lg: 14px;
  --lx-radius-full: 999px;
  --lx-shadow-1: 0 1px 2px rgba(14, 20, 28, 0.06);
  --lx-shadow-2: 0 12px 32px -8px rgba(14, 20, 28, 0.18);
  --lx-motion-crisp: 80ms;
  --lx-motion-fast: 120ms;
  --lx-motion-base: 200ms;
  --lx-motion-slow: 320ms;
  --lx-motion-spin: 720ms;
  --lx-ease-standard: cubic-bezier(.2,.6,.3,1);
  --lx-ease-out: cubic-bezier(.16,1,.3,1);
  --lx-ease-emphasized: cubic-bezier(.22,1,.36,1);
}
`

// Dark palettes are separate from @media so admin can keep an explicit light
// choice even when the operating system prefers dark. The SSR pages instead
// reuse this same palette below a system-preference media query.
const darkTokens = `
  color-scheme: dark;
  --lx-brand: #4ade80;
  --lx-brand-hover: #6be89a;
  --lx-brand-on: #0b1f13;
  --lx-brand-soft: #12291c;
  --lx-brand-border: #1f4530;
  --lx-bg: #0e1116;
  --lx-sunken: #14181e;
  --lx-card: #1a1f26;
  --lx-raised: #222933;
  --lx-backdrop: #05070a;
  --lx-line: #2b323c;
  /* Controls keep the regular control-height step in both themes: the control
     tokens live in :root above and are shared, so the two palettes cannot
     drift apart. */
  --lx-border-strong: #3d4550;
  --lx-muted: #98a2b3;
  --lx-text: #e6e9ee;
  --lx-heading: #f2f4f7;
  --lx-ok-bg: #0d2a1d;
  --lx-ok-border: #1f5a3d;
  --lx-ok-text: #75e0a7;
  --lx-warn-bg: #2e2410;
  --lx-warn-border: #5c4a1f;
  --lx-warn-text: #fec84b;
  --lx-danger-bg: #331715;
  --lx-danger-border: #5c2b27;
  --lx-danger-text: #fda29b;
  --lx-shadow-1: none;
  --lx-shadow-2: none;
  --lx-motion-crisp: 80ms;
  --lx-motion-fast: 120ms;
  --lx-motion-base: 200ms;
  --lx-motion-slow: 320ms;
  --lx-motion-spin: 720ms;
  --lx-ease-standard: cubic-bezier(.2,.6,.3,1);
  --lx-ease-out: cubic-bezier(.16,1,.3,1);
  --lx-ease-emphasized: cubic-bezier(.22,1,.36,1);
`

export const darkTokensCss = `[data-theme="dark"] {${darkTokens}}
`

export const ssrDarkTokensCss = `@media (prefers-color-scheme: dark) {
  :root {${darkTokens}  }
}
`

export const ssrTokenCss = baseTokensCss + ssrDarkTokensCss
export const adminTokenCss = baseTokensCss + darkTokensCss

// CSS custom properties cannot be used in media-query conditions. Keep these
// TypeScript values as the source for JS, and the matching 640px / 1024px
// literals in page CSS, per docs/design-system.md §8.
export const BREAKPOINTS = { sm: 640, md: 1024 } as const
