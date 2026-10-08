// F100 criterion 10 — the synthetic pictures in the labelled set. Drawn here,
// from text and flat shapes, so their licence is ours to give (recorded as
// "synthetic" in evals/moderation/images/LICENCES.json). No people, no minors,
// nothing sexual. Names in them are invented. Re-run: `npx tsx scripts/moderation-make-images.ts`.

import sharp from 'sharp'
import { writeFileSync } from 'node:fs'

const W = 800
const H = 500
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

function card(bg: string, fg: string, lines: string[], extra = ''): string {
  const text = lines
    .map((l, i) => `<text x="50%" y="${150 + i * 70}" text-anchor="middle" font-family="sans-serif" font-size="${i === 0 ? 54 : 34}" font-weight="${i === 0 ? 700 : 400}" fill="${fg}">${esc(l)}</text>`)
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="${bg}"/>${extra}${text}</svg>`
}

const IMAGES: Record<string, string> = {
  'clean-bakery-sign.png': card('#fff4e0', '#5a3a1a', ['Oak Park Bakery', 'Fresh sourdough every Saturday', 'Farmers market, 8am to 1pm'], '<rect x="30" y="30" width="740" height="440" fill="none" stroke="#c98a3a" stroke-width="8"/>'),
  'clean-event-poster.png': card('#e8f1ff', '#1b3a6b', ['Friday jazz at the Hall', 'Doors 7pm, music 8pm', 'Bring a friend'], '<circle cx="700" cy="90" r="40" fill="#f2c94c"/>'),
  'clean-garden-drawing.png': card('#e9f7e1', '#2d5a27', ['Community garden day', 'Saturday, bring gloves'], '<rect y="330" width="800" height="170" fill="#8fd16a"/><circle cx="150" cy="380" r="22" fill="#e86a92"/><circle cx="300" cy="410" r="22" fill="#f2c94c"/><circle cx="520" cy="385" r="22" fill="#e86a92"/><circle cx="680" cy="415" r="22" fill="#ffffff"/>'),
  'spam-flyer.png': card('#ffee00', '#d00000', ['WIN A FREE PHONE!!!', 'CLICK NOW CLICK NOW', 'www.example.invalid/winner', 'LIMITED!!! SEND YOUR CARD DETAILS'], '<rect x="20" y="20" width="760" height="460" fill="none" stroke="#d00000" stroke-width="10" stroke-dasharray="20 10"/>'),
  'harassment-text.png': card('#222222', '#ffffff', ['Everyone avoid Pat Doe', 'at 12 Example Street', 'a lazy, disgusting fraud', 'nobody should speak to them'], ''),
  'threat-text.png': card('#3a0000', '#ffffff', ['MOVE YOUR TRUCK', 'tonight or I will find you', 'and you will regret it'], ''),
}

async function main() {
  for (const [file, svg] of Object.entries(IMAGES)) {
    writeFileSync(`evals/moderation/images/${file}`, await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer())
    console.log('wrote', file)
  }
}

main()
