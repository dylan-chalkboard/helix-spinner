export type SeasonId =
  | 'halloween'
  | 'thanksgiving'
  | 'hanukkah'
  | 'christmas'
  | 'new-year'
  | 'lunar-new-year'
  | 'valentines'
  | 'st-patricks'
  | 'easter'
  | 'fourth-of-july'
  | 'diwali'

export type Signature =
  | 'bat'
  | 'leaves'
  | 'menorah'
  | 'snow'
  | 'fireworks'
  | 'lantern'
  | 'hearts'
  | 'clovers'
  | 'eggs'
  | 'lamps'

export type Season = {
  id: SeasonId
  name: string
  palette: string[]
  signature: Signature
  verbs: readonly string[]
  lines: readonly string[]
  isActive: (date: Date) => boolean
}

type YearDates = Record<number, [month: number, day: number]>

const DAY_MS = 24 * 60 * 60 * 1000

const dayOf = (year: number, month: number, day: number) => new Date(year, month - 1, day)

const startOfDay = (date: Date) => dayOf(date.getFullYear(), date.getMonth() + 1, date.getDate())

const daysBetween = (from: Date, to: Date) => Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS)

const isWithin = (date: Date, from: Date, to: Date) => daysBetween(from, date) >= 0 && daysBetween(date, to) >= 0

// A fixed window in the same calendar year, both ends included.
const between = (fromMonth: number, fromDay: number, toMonth: number, toDay: number) => (date: Date) =>
  isWithin(date, dayOf(date.getFullYear(), fromMonth, fromDay), dayOf(date.getFullYear(), toMonth, toDay))

// A window around a date that moves each year; checks this year's and last year's, for windows crossing New Year.
const around = (dates: YearDates, daysBefore: number, daysAfter: number) => (date: Date) =>
  [date.getFullYear(), date.getFullYear() - 1].some(year => {
    const anchor = dates[year]
    if (!anchor) {
      return false
    }
    const center = dayOf(year, anchor[0], anchor[1])
    return isWithin(date, new Date(center.getTime() - daysBefore * DAY_MS), new Date(center.getTime() + daysAfter * DAY_MS))
  })

// The first night's candle is lit on the evening of these dates.
const HANUKKAH: YearDates = {
  2025: [12, 14],
  2026: [12, 4],
  2027: [12, 24],
  2028: [12, 12],
  2029: [12, 1],
  2030: [12, 20],
  2031: [12, 10],
  2032: [11, 28],
  2033: [12, 17],
  2034: [12, 7],
  2035: [12, 26],
}

const LUNAR_NEW_YEAR: YearDates = {
  2026: [2, 17],
  2027: [2, 6],
  2028: [1, 26],
  2029: [2, 13],
  2030: [2, 3],
  2031: [1, 23],
  2032: [2, 11],
  2033: [1, 31],
  2034: [2, 19],
  2035: [2, 8],
}

// Lakshmi Puja, the main day of Diwali.
const DIWALI: YearDates = {
  2026: [11, 8],
  2027: [10, 29],
  2028: [10, 17],
  2029: [11, 5],
  2030: [10, 26],
  2031: [11, 14],
  2032: [11, 2],
  2033: [10, 22],
  2034: [11, 10],
  2035: [10, 30],
}

// US Thanksgiving: the fourth Thursday of November.
export const thanksgivingOf = (year: number) => {
  const firstWeekday = dayOf(year, 11, 1).getDay()
  const firstThursday = 1 + ((4 - firstWeekday + 7) % 7)
  return dayOf(year, 11, firstThursday + 21)
}

// Western Easter Sunday, by the anonymous Gregorian algorithm.
export const easterOf = (year: number) => {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return dayOf(year, month, day)
}

// Which night of Hanukkah it is (1 to 8), or null outside it.
export const hanukkahNight = (date: Date) => {
  for (const year of [date.getFullYear(), date.getFullYear() - 1]) {
    const start = HANUKKAH[year]
    if (!start) {
      continue
    }
    const night = daysBetween(dayOf(year, start[0], start[1]), date) + 1
    if (night >= 1 && night <= 8) {
      return night
    }
  }
  return null
}

export const SEASONS: readonly Season[] = [
  {
    id: 'halloween',
    name: 'Halloween',
    palette: ['#4c1d95', '#f97316', '#fed7aa'],
    signature: 'bat',
    isActive: between(10, 31, 10, 31),
    verbs: [
      'Cauldron-bubbling', 'Ghost-wrangling', 'Pumpkin-carving', 'Broomstick-zooming', 'Cobweb-spinning',
      'Potion-brewing', 'Bat-flapping', 'Spell-casting', 'Haunting', 'Skeleton-rattling', 'Candy-hoarding',
      'Graveyard-tiptoeing', 'Monster-mashing', 'Trick-or-treating', 'Witch-cackling', 'Mummy-wrapping',
      'Fog-machining', 'Howling-at-the-moon', 'Spooking', 'Coffin-creaking',
    ],
    lines: [
      'The first jack-o\'-lanterns were carved from turnips in Ireland and Scotland.',
      'Halloween grew out of Samhain, an ancient Celtic festival marking the end of the harvest.',
      'Candy corn was invented in the 1880s.',
      'The fear of Halloween has a name: Samhainophobia.',
    ],
  },
  {
    id: 'thanksgiving',
    name: 'Thanksgiving',
    palette: ['#78350f', '#ea580c', '#fde68a'],
    signature: 'leaves',
    isActive: date => daysBetween(thanksgivingOf(date.getFullYear()), date) === 0,
    verbs: [
      'Gravy-boating', 'Turkey-trotting', 'Pie-slicing', 'Cranberry-saucing', 'Drumstick-drumming',
      'Leftover-loading', 'Napkin-folding', 'Wishbone-wishing', 'Gobble-gobbling', 'Corn-shucking',
      'Table-setting', 'Parade-watching', 'Stuffing-stuffing', 'Casserole-carrying', 'Nap-taking',
    ],
    lines: [
      'Thanksgiving became a national US holiday in 1863, under Abraham Lincoln.',
      'The White House turkey pardon became an official yearly tradition in 1989.',
      "Butterball's Turkey Talk-Line has been answering holiday cooking questions since 1981.",
      'The story goes that TV dinners were born from a huge surplus of Thanksgiving turkey in 1953.',
    ],
  },
  {
    id: 'hanukkah',
    name: 'Hanukkah',
    palette: ['#1e3a8a', '#60a5fa', '#e5e7eb'],
    signature: 'menorah',
    isActive: date => hanukkahNight(date) !== null,
    verbs: [
      'Latke-flipping', 'Dreidel-spinning', 'Menorah-lighting', 'Sufganiyah-snacking', 'Gelt-gobbling',
      'Candle-counting', 'Applesauce-dolloping', 'Oil-sizzling', 'Shamash-shining', 'Miracle-making',
      'Gift-unwrapping', 'Maccabee-marching', 'Dreidel-gambling', 'Sour-cream-swirling',
    ],
    lines: [
      'Hanukkah means "dedication" in Hebrew.',
      'Hanukkah lasts eight nights, for the oil that the story says burned for eight days.',
      'The letters on a dreidel stand for "a great miracle happened there".',
      'Sufganiyot, jelly doughnuts, are a Hanukkah favorite because they are fried in oil.',
    ],
  },
  {
    id: 'christmas',
    name: 'Christmas',
    palette: ['#14532d', '#dc2626', '#f8fafc'],
    signature: 'snow',
    isActive: between(12, 25, 12, 25),
    verbs: [
      'Gift-wrapping', 'Sleigh-belling', 'Cookie-baking', 'Tinsel-tangling', 'Ornament-hanging',
      'Chimney-sliding', 'Reindeer-wrangling', 'Snowman-building', 'Stocking-stuffing', 'Carol-singing',
      'Mistletoe-dodging', 'Eggnog-sipping', 'Elf-hustling', 'Gingerbread-architecting', 'Present-peeking',
    ],
    lines: [
      'In 1965 "Jingle Bells" became the first song played in space, by the Gemini 6 astronauts.',
      'Rudolph the Red-Nosed Reindeer was created in 1939 for a department store booklet.',
      'Norway has sent London a Christmas tree for Trafalgar Square every year since 1947.',
      "Electric Christmas lights were first shown off in 1882, by an associate of Thomas Edison.",
    ],
  },
  {
    id: 'new-year',
    name: "New Year's",
    palette: ['#1e1b4b', '#eab308', '#fefce8'],
    signature: 'fireworks',
    isActive: date => between(12, 31, 12, 31)(date) || between(1, 1, 1, 1)(date),
    verbs: [
      'Countdown-counting', 'Confetti-tossing', 'Resolution-making', 'Champagne-popping', 'Ball-dropping',
      'Noisemaker-tooting', 'Sparkler-waving', 'Fresh-starting', 'Calendar-flipping', 'Party-hatting',
      'Auld-lang-syning', 'Midnight-toasting',
    ],
    lines: [
      'The Times Square ball drop began in 1907.',
      '"Auld Lang Syne" comes from a 1788 poem by Robert Burns.',
      'In Spain people eat 12 grapes at midnight, one for each chime of the clock.',
      "Kiritimati, one of Kiribati's Line Islands, is among the first places on Earth to reach the new year.",
    ],
  },
  {
    id: 'lunar-new-year',
    name: 'Lunar New Year',
    palette: ['#7f1d1d', '#dc2626', '#facc15'],
    signature: 'lantern',
    isActive: around(LUNAR_NEW_YEAR, 0, 0),
    verbs: [
      'Dumpling-folding', 'Lantern-lighting', 'Red-envelope-gifting', 'Lion-dancing', 'Firecracker-popping',
      'Fortune-wishing', 'Noodle-slurping', 'Dragon-parading', 'Tangerine-trading', 'Spring-cleaning',
      'Reunion-feasting', 'Lucky-charming',
    ],
    lines: [
      'Each Lunar New Year belongs to one of 12 zodiac animals.',
      'The Lunar New Year travel rush is often called the largest yearly human migration on Earth.',
      'Red envelopes of money are given for luck in the new year.',
      'Long noodles are eaten at Lunar New Year to wish for a long life.',
    ],
  },
  {
    id: 'valentines',
    name: "Valentine's",
    palette: ['#831843', '#ec4899', '#fce7f3'],
    signature: 'hearts',
    isActive: between(2, 14, 2, 14),
    verbs: [
      'Card-swapping', 'Cupid-arrowing', 'Chocolate-boxing', 'Heart-doodling', 'Rose-gifting', 'Poem-penning',
      'Love-lettering', 'Candy-hearting', 'Swoon-swooning', 'Sweetheart-crooning',
    ],
    lines: [
      "More than a hundred million Valentine's cards are exchanged in the US each year.",
      'Candy conversation hearts with little sayings date back to the 1860s.',
      "Esther Howland helped make Valentine's cards popular in the US in the 1840s.",
    ],
  },
  {
    id: 'st-patricks',
    name: "St. Patrick's",
    palette: ['#14532d', '#22c55e', '#fef08a'],
    signature: 'clovers',
    isActive: between(3, 17, 3, 17),
    verbs: [
      'Shamrock-spotting', 'Leprechaun-chasing', 'Rainbow-chasing', 'Pot-of-gold-hunting', 'Jig-dancing',
      'Clover-counting', 'Bagpipe-blasting', 'Parade-marching', 'Green-wearing', 'Lucky-dipping',
      'Limerick-reciting',
    ],
    lines: [
      "Chicago has dyed its river green for St. Patrick's Day since 1962.",
      'Saint Patrick was born in Roman Britain, not Ireland.',
      "One of the earliest St. Patrick's Day parades in the Americas was held in St. Augustine, Florida, in 1601.",
    ],
  },
  {
    id: 'easter',
    name: 'Easter',
    palette: ['#6d28d9', '#f9a8d4', '#fef9c3'],
    signature: 'eggs',
    isActive: date => daysBetween(easterOf(date.getFullYear()), date) === 0,
    verbs: [
      'Egg-hunting', 'Egg-dyeing', 'Bunny-bouncing', 'Jellybean-hoarding', 'Chocolate-nibbling',
      'Peep-squishing', 'Spring-blooming', 'Pastel-painting', 'Carrot-crunching', 'Basket-filling',
    ],
    lines: [
      'The White House Easter Egg Roll began in 1878.',
      'Peeps marshmallow chicks have been made by the same company since 1953.',
      'Chocolate Easter eggs caught on in Europe in the 1800s.',
    ],
  },
  {
    id: 'fourth-of-july',
    name: 'Fourth of July',
    palette: ['#1e3a8a', '#ef4444', '#f8fafc'],
    signature: 'fireworks',
    isActive: between(7, 4, 7, 4),
    verbs: [
      'Firework-launching', 'Flag-waving', 'Hot-dog-grilling', 'Sparkler-twirling', 'Barbecue-flipping',
      'Parade-cheering', 'Picnic-packing', 'Star-spangling', 'Watermelon-slicing', 'Freedom-ringing',
    ],
    lines: [
      'John Adams and Thomas Jefferson both died on July 4, 1826.',
      'Congress actually voted for independence on July 2, 1776.',
      "Nathan's Famous has held its hot dog eating contest on the Fourth of July for decades.",
      'Americans are estimated to eat about 150 million hot dogs on the Fourth of July.',
    ],
  },
  {
    id: 'diwali',
    name: 'Diwali',
    palette: ['#7c2d12', '#f59e0b', '#fef3c7'],
    signature: 'lamps',
    isActive: around(DIWALI, 0, 0),
    verbs: [
      'Diya-lighting', 'Rangoli-drawing', 'Sweet-sharing', 'Lamp-glowing', 'Sparkler-swirling',
      'Lantern-hanging', 'Ladoo-munching', 'Marigold-stringing', 'Mithai-gifting', 'Light-festivaling',
    ],
    lines: [
      'Diwali is often called the Festival of Lights.',
      'Rangoli patterns are made with colored powder, rice or flower petals.',
      'Diwali is celebrated by Hindus, Sikhs, Jains and some Buddhists.',
      'Diwali celebrations usually span five days.',
    ],
  },
]

export const activeSeasons = (date: Date) => SEASONS.filter(season => season.isActive(date))

export const seasonById = (id: string) => SEASONS.find(season => season.id === id)
