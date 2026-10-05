export const VERBS_BY_MODE: Record<string, readonly string[]> = {
  thinking: [
    'Noodling', 'Cogitating', 'Ruminating', 'Woolgathering', 'Chin-stroking', 'Galaxy-braining',
    'Noggin-joggling', 'Cerebrating', 'Discombobulating', 'Flummoxing', 'Bumfuzzling', 'Befuddling',
    'Daydreaming', 'Moonbeaming', 'Brain-wrangling', 'Mulling-over', 'Navel-gazing', 'Puzzlewhizzing',
    'Pilpuling', 'Leavening', 'Oy-veying',
    'Contemplating-the-void', 'Overthinking', 'Brain-tickling', 'Mind-melding', 'Gear-grinding', 'Thunk-thunking',
    'Hmm-ing', 'Philosophizing', 'Stargazing', 'Wool-spinning', 'Dot-connecting', 'Lightbulbing',
    'Whirligigging', 'Rabbit-holing', 'Squinting',
    'Dillydallying', 'Custard-contemplating', 'Bubble-blowing', 'Cloud-watching', 'Lollygazing', 'Fiddlesticking',
    'Muddling', 'Ponderfuffling', 'Tea-leaf-reading', 'Marshmallow-musing', 'Sock-sorting', 'Doodlebugging',
    'Whimwhamming', 'Snoozle-thinking', 'Mind-pretzeling', 'Thought-juggling', 'Yarn-unspooling', 'Daisy-plucking',
    'Cuckoo-clocking', 'Jellybean-counting',
    'Theorycrafting', 'Min-maxing', 'Strat-plotting', 'Save-scumming', 'Wiki-checking', 'Puzzle-solving',
    'Pause-menuing', 'Skill-tree-pondering', 'Cutscene-watching', 'Boss-pattern-studying',
    'Redstone-engineering', 'Enderman-staring', 'Jungle-pathing', 'Minimap-checking', 'Eco-rounding', 'Bonfire-resting',
    'Git-gudding',
  ],
  requesting: [
    'Skedaddling', 'Gallivanting', 'Moseying', 'Hobnobbing', 'Schmoozing', 'Lickety-splitting',
    'Galumphing', 'Zigzagging', 'Absquatulating', 'Carrier-pigeoning', 'Beaming-up', 'Yoo-hooing',
    'Schlepping', 'Noodging',
    'Zooming', 'Whooshing', 'Pinballing', 'Boomeranging', 'Hot-footing', 'Scampering',
    'Scurrying', 'Yeeting', 'Teleporting', 'Zipzapping', 'Paper-airplaning', 'Smoke-signaling',
    'Ringing-the-bell', 'Knock-knocking',
    'Hopscotching', 'Tiptoeing', 'Bunny-hopping', 'Pogo-sticking', 'Hot-air-ballooning', 'Cartwheeling',
    'Message-in-a-bottling', 'Owl-posting', 'Skipping-stones', 'Kite-flying', 'Rollerskating', 'Sleigh-riding',
    'Tumbleweeding', 'Butterfly-chasing', 'Bumblebee-buzzing', 'Gondola-gliding', 'Unicycling', 'Hippity-hopping',
    'Fast-traveling', 'Warp-piping', 'Wall-jumping', 'Double-jumping', 'Respawning', 'Air-dashing',
    'Ledge-grabbing', 'Speedrunning', 'Kart-drifting', 'Lag-spiking',
    'Battle-bus-dropping', 'Storm-dodging', 'Nether-portaling', 'Warthog-jumping', 'Rushing-B', 'Tower-diving',
    'Vent-hopping', 'Air-dribbling', 'Boost-stealing',
  ],
  responding: [
    'Jibber-jabbering', 'Yammering', 'Chortling', 'Bloviating', 'Gobbledygooking', 'Razzle-dazzling',
    'Bedazzling', 'Scribbling', 'Doodling', 'Snickerdoodling', 'Taradiddling', 'Okey-dokeying',
    'Flapdoodling', 'Malarkeying', 'Guffawing', 'Codswalloping',
    'Kvetching', 'Kvelling', 'Kibitzing',
    'Blabbering', 'Prattling', 'Gabbing', 'Waxing-poetic', 'Monologuing', 'Rhapsodizing',
    'Spitballing', 'Riffing', 'Chitter-chattering', 'Sweet-talking', 'Word-salading', 'Ventriloquizing',
    'Serenading', 'Pontificating', 'Gibber-gabbing',
    'Warbling', 'Burbling', 'Tra-la-la-ing', 'Fiddle-dee-deeing', 'Brook-babbling', 'Twaddling',
    'Harrumphing', 'Tittle-tattling', 'Poppycocking', 'Balderdashing', 'Limericking', 'Rhyme-weaving',
    'Fairy-tale-telling', 'Hee-hawing', 'Whistling-dixie', 'Sing-songing', 'Yarn-spinning', 'Chuckle-sputtering',
    'Glee-clubbing', 'Ballyhooing',
    'Trash-talking', 'Hey-listening', 'Lore-dumping', 'Text-boxing', 'Victory-dancing', 'Emoting',
    'Achievement-unlocking', 'Leveling-up', 'High-scoring', 'Cutscening',
    'Flossing', 'Default-dancing', 'Victory-royaling', 'Cortana-chatting', 'GG-typing', 'All-chatting', 'Villager-hmming',
  ],
  'tool-input': [
    'Finagling', 'Fiddle-faddling', 'Thingamajigging', 'Whatchamacalliting', 'Rigmaroling',
    'Gubbinsing', 'Hocus-pocusing', 'Wigwagging', 'Persnicketing', 'Mollycoddling',
    'Challah-braiding', 'Babka-swirling',
    'Tinkering', 'Jiggering', 'Doohickeying', 'Widget-wrangling', 'Contraptioning', 'Jury-rigging',
    'MacGyvering', 'Bolt-tightening', 'Knob-twiddling', 'Gizmo-fiddling', 'Rube-Goldberging', 'Lever-pulling',
    'Screw-turning',
    'Glue-gunning', 'Duct-taping', 'Sprocket-spinning', 'Gear-greasing', 'Thimble-threading', 'Button-mashing',
    'Origami-folding', 'Lego-stacking', 'Pipe-cleanering', 'Sequin-sewing', 'Pinwheel-pinning', 'Doodad-polishing',
    'Clockwork-winding', 'Trinket-tinkering', 'Paperclip-bending', 'Snowglobe-shaking', 'Gadget-gizmoing', 'Whatsit-wiggling',
    'Loadout-tweaking', 'Inventory-tetrising', 'Crafting', 'Respeccing', 'Gear-swapping', 'Cartridge-blowing',
    'Controller-calibrating', 'Hotkey-binding', 'Mod-installing', 'Character-creating',
    'Block-placing', 'Box-building', 'Ward-placing', 'Bomb-planting', 'Spray-pattern-practicing',
  ],
  'tool-use': [
    'Hornswoggling', 'Kerplunking', 'Kablooeying', 'Spelunking', 'Snorkeling', 'Shenaniganing',
    'Tomfoolering', 'Skullduggering', 'Hullabalooing', 'Brouhahaing', 'Pandemoniuming',
    'Topsy-turvying', 'Splooting', 'Kerfuffling', 'Bamboozling', 'Scallywagging',
    'Shvitzing', 'Latke-frying', 'Noshing',
    'Clanking', 'Whirring', 'Kaboomifying', 'Zapping', 'Ka-chunking', 'Rumbling',
    'Clattering', 'Ratcheting', 'Cannonballing', 'Belly-flopping', 'Ka-pow-ing', 'Bonking',
    'Thwacking', 'Sproinging', 'Wrenching',
    'Popcorn-popping', 'Confetti-cannoning', 'Kazoo-blasting', 'Bubble-wrapping', 'Trampolining', 'Piñata-whacking',
    'Jack-in-the-boxing', 'Firework-fizzing', 'Slinky-slinking', 'Yo-yoing', 'Bumper-carring', 'Whoopee-cushioning',
    'Jelly-wobbling', 'Pinball-wizarding', 'Rollercoastering', 'Boing-boinging', 'Fizzbanging', 'Ker-sploshing',
    'Zippity-zapping', 'Whizzbanging',
    'Boss-fighting', 'Loot-goblining', 'Dungeon-crawling', 'XP-grinding', 'Spawn-camping', 'Cheesing',
    'Rage-quitting', 'Headshotting', 'Mushroom-stomping', 'Coin-collecting', 'Combo-breaking', 'Hadoukening',
    'Creeper-dodging', 'Diamond-mining', 'Goomba-stomping', 'Koopa-shell-kicking', 'Star-powering', 'Cranking-90s',
    'Spartan-lasering', 'Plasma-sticking', 'Energy-swording', 'Quickscoping', 'No-scoping', 'Killstreaking',
    'Musty-flicking', 'Flip-resetting', 'Demoing', 'Last-hitting', 'Ganking', 'Baron-stealing',
    'Jiggle-peeking', 'AWPing', 'Defusing', 'T-spinning', 'Pokéball-throwing', 'Power-pelleting',
  ],
}

export const WACKY_VERBS = Object.values(VERBS_BY_MODE).flat()

// Secret: never listed in the dex until found.
export const RARE_VERBS = [
  'Supercalifragilisticexpialidocious-ing', 'Quantum-noodling', 'Interdimensional-schlepping',
  'Moon-landing', 'Time-traveling', 'Dragon-taming', 'Unicorn-wrangling', 'Black-hole-slurping',
  'Wizard-dueling', 'Kraken-tickling', 'Volcano-surfing', 'Yeti-hugging', 'Comet-riding',
  'Pyramid-building', 'Phoenix-rising', 'Galaxy-juggling', 'Llama-whispering', 'Thunder-bottling',
  'Narwhal-jousting', 'Golem-kvetching',
  'Konami-coding', 'Triforce-assembling', 'Final-boss-slaying', 'MissingNo-catching', 'Any%-speedrunning',
  'Herobrine-sighting', 'Leeroy-Jenkinsing', 'Pentakilling', 'Ace-clutching', 'Rainbow-Road-racing',
]

export type Rarity = 'common' | 'rare' | 'shiny'

const RARE_ODDS = 150
const SHINY_ODDS = 1024

// Stable for one seed, so the word holds still while the row redraws within a state.
const hashOf = (text: string) => {
  let hash = 0
  for (const character of text) {
    hash = (hash * 31 + character.charCodeAt(0)) | 0
  }
  return Math.abs(hash)
}

export const pickVerb = (mode: string, seed: string) => {
  const verbs = VERBS_BY_MODE[mode] ?? WACKY_VERBS
  return verbs[hashOf(`${mode}:${seed}`) % verbs.length] ?? 'Bamboozling'
}

// The verb a spinner state shows, with its rarity: now and then a secret rare verb, and very rarely a shiny.
const SEASONAL_ODDS = 3

// About one pick in three comes from the active holiday pack, when there is one.
const seasonalPick = (seasonal: readonly string[] | undefined, salt: string) => {
  const isSeasonal = seasonal !== undefined && seasonal.length > 0 && hashOf(`season:${salt}`) % SEASONAL_ODDS === 0
  return isSeasonal ? seasonal[hashOf(`season-verb:${salt}`) % seasonal.length] : undefined
}

export const drawVerb = (
  mode: string,
  seed: string,
  seasonal?: readonly string[],
): { verb: string; rarity: Rarity } => {
  const isRare = hashOf(`rare:${mode}:${seed}`) % RARE_ODDS === 0
  const regular = seasonalPick(seasonal, `${mode}:${seed}`) ?? pickVerb(mode, seed)
  const verb = isRare ? (RARE_VERBS[hashOf(seed) % RARE_VERBS.length] ?? 'Quantum-noodling') : regular
  const isShiny = hashOf(`shiny:${mode}:${seed}`) % SHINY_ODDS === 0
  return { verb, rarity: isShiny ? 'shiny' : isRare ? 'rare' : 'common' }
}

const IRREGULAR_PAST: Record<string, string> = {
  lighting: 'lit',
  shining: 'shone',
  singing: 'sang',
  wearing: 'wore',
  dyeing: 'dyed',
  drawing: 'drew',
  building: 'built',
  making: 'made',
  hanging: 'hung',
  taking: 'took',
  Ringing: 'Rang',
  spinning: 'spun',
  Overthinking: 'Overthought',
  splitting: 'split',
  grinding: 'ground',
  thinking: 'thought',
  blowing: 'blew',
  flying: 'flew',
  riding: 'rode',
  reading: 'read',
  telling: 'told',
  bending: 'bent',
  winding: 'wound',
  weaving: 'wove',
  Speedrunning: 'Speedran',
  speedrunning: 'speedran',
  quitting: 'quit',
  fighting: 'fought',
  binding: 'bound',
  breaking: 'broke',
  sticking: 'stuck',
  resetting: 'reset',
  stealing: 'stole',
  hitting: 'hit',
  throwing: 'threw',
  catching: 'caught',
  Headshotting: 'Headshot',
}

const VOWELS = 'aeiou'

const pastOf = (gerund: string) => {
  const irregular = IRREGULAR_PAST[gerund]
  if (irregular) {
    return irregular
  }
  const stem = gerund.slice(0, -'ing'.length)
  const endsInConsonantY = stem.endsWith('y') && !VOWELS.includes(stem.at(-2) ?? 'a')
  return endsInConsonantY ? `${stem.slice(0, -1)}ied` : `${stem}ed`
}

// "Hornswoggling" → "Hornswoggled", "Waxing-poetic" → "Waxed-poetic", "Latke-frying" → "Latke-fried".
export const toPastTense = (verb: string) => {
  const parts = verb.split('-')
  const index = verb.endsWith('ing') ? parts.length - 1 : parts.findIndex(part => part.endsWith('ing'))
  const part = parts[index]
  if (part === undefined) {
    return verb
  }
  parts[index] = pastOf(part)
  return parts.join('-')
}

export const pickPastVerb = (seed: string, seasonal?: readonly string[]) =>
  toPastTense(seasonalPick(seasonal, `past:${seed}`) ?? pickVerb('any', seed))
