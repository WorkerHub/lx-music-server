import { describe, expect, it } from 'vitest'
import { adminPageHtml } from '@/pages/admin'
import { homePageHtml } from '@/pages/home'
import { registerPageHtml } from '@/pages/register'
import {
  adminTokenCss,
  BREAKPOINTS,
  baseTokensCss,
  darkTokensCss,
  ssrDarkTokensCss,
  ssrTokenCss,
} from './tokens'

const luminance = (hex: string): number => {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    )
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

const contrast = (foreground: string, background: string): number => {
  const light = luminance(foreground)
  const dark = luminance(background)
  return (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05)
}

describe('shared design tokens', () => {
  it('composes SSR and admin palettes without leaking the media query into admin', () => {
    expect(ssrTokenCss).toBe(baseTokensCss + ssrDarkTokensCss)
    expect(adminTokenCss).toBe(baseTokensCss + darkTokensCss)
    expect(ssrDarkTokensCss).toContain('@media (prefers-color-scheme: dark)')
    expect(darkTokensCss).not.toContain('@media')
    expect(adminTokenCss).not.toContain('@media (prefers-color-scheme: dark)')
    expect(BREAKPOINTS).toEqual({ sm: 640, md: 1024 })
  })

  it('injects the matching palette into all three page entry points', () => {
    for (const html of [homePageHtml('open'), registerPageHtml]) {
      expect(html).toContain(ssrTokenCss)
      expect(html).not.toContain(darkTokensCss)
    }
    expect(adminPageHtml).toContain(adminTokenCss)
    expect(adminPageHtml).not.toContain(ssrDarkTokensCss)
  })

  it('defines every typography, spacing, shape and motion token in the frozen scale', () => {
    for (const step of [
      'display',
      'h1',
      'h2',
      'h3',
      'body',
      'small',
      'label',
    ]) {
      for (const property of ['size', 'lh', 'weight', 'tracking']) {
        expect(baseTokensCss).toContain(`--lx-text-${step}-${property}:`)
      }
    }
    const spaces = [4, 8, 12, 16, 24, 32, 48, 64]
    spaces.forEach((pixels, index) => {
      expect(baseTokensCss).toContain(`--lx-space-${index + 1}: ${pixels}px;`)
    })
    for (const token of [
      '--lx-font-body:',
      '--lx-font-mono:',
      '--lx-radius-sm: 6px;',
      '--lx-radius-md: 10px;',
      '--lx-radius-lg: 14px;',
      '--lx-radius-full: 999px;',
      '--lx-shadow-1:',
      '--lx-shadow-2:',
      '--lx-motion-fast: 120ms;',
      '--lx-motion-base: 200ms;',
      '--lx-motion-slow: 320ms;',
      '--lx-ease-standard:',
      '--lx-ease-out:',
    ]) {
      expect(baseTokensCss).toContain(token)
    }
  })

  it('keeps text colors above WCAG AA on their actual light and dark surfaces', () => {
    for (const palette of [baseTokensCss, darkTokensCss]) {
      const value = (name: string) => {
        const match = palette.match(new RegExp(`--lx-${name}: (#[0-9a-f]{6});`))
        expect(match, `${name} must be a six-digit hex color`).not.toBeNull()
        return match![1]
      }
      const surfaces = [
        value('bg'),
        value('sunken'),
        value('card'),
        value('raised'),
      ]
      for (const name of ['text', 'heading', 'muted']) {
        for (const surface of surfaces) {
          expect(
            contrast(value(name), surface),
            `${name} on ${surface}`,
          ).toBeGreaterThanOrEqual(4.5)
        }
      }
      for (const state of ['ok', 'warn', 'danger']) {
        expect(
          contrast(value(`${state}-text`), value(`${state}-bg`)),
        ).toBeGreaterThanOrEqual(4.5)
      }
      expect(contrast(value('brand'), value('bg'))).toBeGreaterThanOrEqual(4.5)
      expect(
        contrast(value('brand-on'), value('brand')),
      ).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('leaves raw colors only in the token source and the fixed logo artwork', () => {
    for (const html of [
      homePageHtml('open'),
      registerPageHtml,
      adminPageHtml,
    ]) {
      const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/)
      expect(styleMatch).not.toBeNull()
      const pageStyles = styleMatch![1]
        .replace(baseTokensCss, '')
        .replace(ssrDarkTokensCss, '')
        .replace(darkTokensCss, '')
      expect(pageStyles.match(/#[0-9a-f]{3,8}|rgba?\(|hsla?\(/gi)).toBeNull()
      expect(pageStyles).not.toMatch(/var\(--(?!lx-|brand-logo-size)/)
    }
  })
})
