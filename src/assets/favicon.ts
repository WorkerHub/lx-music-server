// The site favicon, inlined as an ICO so `/favicon.ico` is served by the
// worker itself: the project ships no static-asset pipeline, and both pages
// are self-contained documents with no external files.
//
// The icon is the LX Music logo (https://lxmusic.toside.cn/img/logo.svg):
// its two `<path>` shapes were rendered to PNG with `qlmanage`, resized to
// 16x16 and 32x32 with `sips`, and packed into an ICO container that embeds
// the PNG payloads directly (no BMP/DIB conversion). 3228 bytes in total,
// 2 frames, RGBA.
//
// Decoded once at module scope: the bytes never change, so every request
// reuses the same view instead of paying for an atob per hit.

const FAVICON_ICO_BASE64 = [
  'AAABAAIAEBAAAAEAIADABAAAJgAAACAgAAABACAAtgcAAOYEAACJUE5HDQoaCgAAAA1JSERSAAAA',
  'EAAAABAIBgAAAB/z/2EAAAAEZ0FNQQAAsY8L/GEFAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1',
  'MAAA6mAAADqYAAAXcJy6UTwAAABEZVhJZk1NACoAAAAIAAGHaQAEAAAAAQAAABoAAAAAAAOgAQAD',
  'AAAAAQABAACgAgAEAAAAAQAAABCgAwAEAAAAAQAAABAAAAAANFVx8gAAAZ1pVFh0WE1MOmNvbS5h',
  'ZG9iZS54bXAAAAAAADx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9',
  'IlhNUCBDb3JlIDYuMC4wIj4KICAgPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9y',
  'Zy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4KICAgICAgPHJkZjpEZXNjcmlwdGlvbiByZGY6',
  'YWJvdXQ9IiIKICAgICAgICAgICAgeG1sbnM6ZXhpZj0iaHR0cDovL25zLmFkb2JlLmNvbS9leGlm',
  'LzEuMC8iPgogICAgICAgICA8ZXhpZjpQaXhlbFhEaW1lbnNpb24+MjU2PC9leGlmOlBpeGVsWERp',
  'bWVuc2lvbj4KICAgICAgICAgPGV4aWY6UGl4ZWxZRGltZW5zaW9uPjI1NjwvZXhpZjpQaXhlbFlE',
  'aW1lbnNpb24+CiAgICAgIDwvcmRmOkRlc2NyaXB0aW9uPgogICA8L3JkZjpSREY+CjwveDp4bXBt',
  'ZXRhPgpesB4bAAACUklEQVQ4EX2TS09TURDH//fR2zak5dFKwfhoDVQjpDFYN6gLFgZYKDvjSiXh',
  'K7g0cW/iFzB+AhcujLjRaEzcoZGWahBME4oVwVL69ra99zoz2JuSVE/S07nnzPzOnP/MURwa6DHe',
  'l75itbqFy/1xnPKFMKj39fAClF4Ai5j3s0/xrbELXVER1P0Y80cElgzEaE1zYbprdRkOHDDEQ44a',
  'AaqWiZVKVn5n/aO4M3oVMd8xiVC74o6Yyt8vy7HRdixoUGEoOtYbP/Bw6wVy5v7/AbzLwVE6aTo4',
  'LjrYlBmnX2hV8bKwKoCeV5AdmvjkS8EYFsIXxf5Eoj7Jv0XRtvCrVRG3f16Bd23KoEUQHnwyCzgX',
  'SsC0W5IRr/cEsPJc24h3AHHfCA7MKirNBvvjuDEoVZkZOC/fbhlrpPSrYgbr9byIlal/x0JoCqmN',
  'z0jtZ+kkBfeSN7FjNNCy2rgRnhKAaMBlepRbxlptW1LtlFF3FGyW8iibdUk7W/6JxMk4Yt6wBPMk',
  'gNfFNQn2q4ZsKHRarG8YI3QFla6jKor0g6HpGPMNu8FsiAZfanm3u1i0C4HTuKaP483GCkrNGhQC',
  'eFQd77ZTeJxeJj3qLkQAHlUj0Q6fBDdMzizA9ihI72VRJmfOiLP4uLtJIA1+3XsUkAycoZIdIthx',
  'xzzA82oaS8nriAYi+N1uknAWlibncXdiFjpBOkMyuEIvbm4oQZ1nUcNwv0Eghs+LB9O3MRGOYnFy',
  'FrfOzXTi3H+3jLySoSo82/uAiNGPeWqYE94hcWRg523IQtf0BwBz6WiZkMuJAAAAAElFTkSuQmCC',
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABGdBTUEAALGPC/xhBQAAACBjSFJN',
  'AAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAARGVYSWZNTQAqAAAACAABh2kA',
  'BAAAAAEAAAAaAAAAAAADoAEAAwAAAAEAAQAAoAIABAAAAAEAAAAgoAMABAAAAAEAAAAgAAAAAKyG',
  'YvMAAAGdaVRYdFhNTDpjb20uYWRvYmUueG1wAAAAAAA8eDp4bXBtZXRhIHhtbG5zOng9ImFkb2Jl',
  'Om5zOm1ldGEvIiB4OnhtcHRrPSJYTVAgQ29yZSA2LjAuMCI+CiAgIDxyZGY6UkRGIHhtbG5zOnJk',
  'Zj0iaHR0cDovL3d3dy53My5vcmcvMTk5OS8wMi8yMi1yZGYtc3ludGF4LW5zIyI+CiAgICAgIDxy',
  'ZGY6RGVzY3JpcHRpb24gcmRmOmFib3V0PSIiCiAgICAgICAgICAgIHhtbG5zOmV4aWY9Imh0dHA6',
  'Ly9ucy5hZG9iZS5jb20vZXhpZi8xLjAvIj4KICAgICAgICAgPGV4aWY6UGl4ZWxYRGltZW5zaW9u',
  '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',
].join('')

export const faviconIco: Uint8Array<ArrayBuffer> = Uint8Array.from(
  atob(FAVICON_ICO_BASE64),
  (char) => char.charCodeAt(0),
)
