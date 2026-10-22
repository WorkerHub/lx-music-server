// The site favicon, inlined as an ICO so `/favicon.ico` is served by the
// worker itself: the project ships no static-asset pipeline, and both pages
// are self-contained documents with no external files.
//
// The icon is the official LX Music app icon, taken from the favicon the
// project site publishes for itself (a single 32x32 frame).  Its 32x32 bitmap
// is reproduced here pixel for pixel, and a 16x16 frame is derived from it by
// a box-filter downscale so small tab icons stay legible; both frames are
// stored as PNG payloads (the ICO container allows that) to keep the file
// small.  1334 bytes in total, 2 frames, RGBA.
//
// Decoded once at module scope: the bytes never change, so every request
// reuses the same view instead of paying for an atob per hit.

const FAVICON_ICO_BASE64 = [
  'AAABAAIAEBAAAAEAIAB5AQAAJgAAACAgAAABACAAlwMAAJ8BAACJUE5HDQoaCgAAAA1JSERSAAAA',
  'EAAAABAIBgAAAB/z/2EAAAFASURBVHjaY2DAAeKuzWgE4h9AfAaIJwKxBxCzMBALgIoPAvF/NPwG',
  'iBuAmJsYAw5hMQCGHwCxDiUGgPBzIBYixoBHQJwLxFOA+C6aISnEGHAOTbwLyYBicgxggroKJGdP',
  '0ICE27NzvFZVcPiur+EEYiakGDqGroEHiGuBeA8QrwTix/E3Z832WllR57uu5i9Q8x+fddVHwGqv',
  'zwTFgiqyZnEgvoUe0gm35zT4rK1eA9T8H4R91la9ARoqDzQgBN32eeia42/M/Jl0f34Z0IC1MAOA',
  '+A0u/75C03zLZ32NldfK8jCgpitIBnwG4gggDkQ34BOaAQ/9Nta6Am1/h6QZGaegG7Abwws3Z53z',
  '21xvi8WQBGxe0AfibxiBeGvWLu/VlXpATTBD4vDFuyEQ7wXi71AvrQJiGZAcUKMqEGNNNAAXtIPs',
  'Gk1xHwAAAABJRU5ErkJggolQTkcNChoKAAAADUlIRFIAAAAgAAAAIAgGAAAAc3p69AAAA15JREFU',
  'eNrFl11IU2EYx1/oQoogMgjqPgi68crIIkMEdR/aMstay82CKIIurPlt5gdmhJXmx3QKpZgfTZcK',
  'zYygoiISR5bpnBqUhheVN5aB0On/HM5sznOO5+Bkgx+72N79f+/zPu+zjTHhcfpTnRruAQ5Mgx5Q',
  'CGLBRjWfs+yhYuEZIVyMP8AFzoPw9RIolhEIhKoTGWyBEhUCPt6CPaEU8FEaagHiUagFiKZQCxCa',
  'YAr8AG7wDfxVKNAdTAG73+vbQTQoB99lBL6ul0AgdRICc8EXGKllaZ56lj7VxCxeu/+aWyJrJoIr',
  'gHDzhJ2Z8Hzs5Q1mHKpk5vEG35pNYDZgTXtQBSzYNe0+qfcqi2/OYAkPrOzEu9uoRiMqs+wLzMfR',
  'tQuM1HII5dI/N2WaPtSwxN4CPjjRmc80bZkssaeAl0obq6d11/zC3WufAyN1fDjYn/K8nGk7s7do',
  '2rPC9c68rfruvG0gjGSOv77JqDoBldMoFdgNLoIyYQe7lhpq1MbhjM8dGSihkvfpHuZwemf+AoJ/',
  'AQ4sQkib1FfIVyBtzNYqhFcrGcURYFDi+vCDxuxt4IzuqjBtR3aczpHLCaHLgNQgpBgdDyq1gHUz',
  'SxmjNkmBC0ommdlr506i0xGSqusSF9B2ZHkMriIK1yJwEet2UENSX9ANERMwKp3lJGAcqmI6BwQc',
  '0gKHHxchrD4CoVFYwyyTmBGTjSz5WdkKAfoJ9VOVgJsEciUFgAd9gOt4h29Eqtip4Wo+PKHVukIg',
  'Z9VgunZjNg47mD07fX+czhZHYJIT0HXmMGpEQ38x03Vm021h6BuG11YIvFhNAN38G2e4l65W6psK',
  'lvy0lAQyJcJ5AZoJfCgqgV7hoXAxgVlZAbp2XvsV2klcc4Yzoc3aizNuxr33yAjMgx7gAF+AxRcu',
  'JjAnL4Bzn7Bfp13Ht1welgmVwyAn4FFwBDR8YgyuYmqiJyrDY/zDxQRalDQhDSBUYh9dLxUShwLD',
  'xQQ0iq7gf4kohRLRYuFiAkz4yaxcwmtPoaZEl7skwg9KhUsJbAZepRKWqcZq08caGkZEf0D4Ablw',
  'KQEm/MMdUCBxieY5TTb6MIzkDXiuBK9A5GrhcgI+YoUjmRH+9c6DUVABdtJ7eIH3d5m+ixdgSkID',
  'Bf4BMM4NOnBLYE8AAAAASUVORK5CYII=',
].join('')

export const faviconIco: Uint8Array<ArrayBuffer> = Uint8Array.from(
  atob(FAVICON_ICO_BASE64),
  (char) => char.charCodeAt(0),
)
