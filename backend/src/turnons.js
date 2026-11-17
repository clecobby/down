// The turn-ons game: everyone swipes through these and keeps what they're into.
// Other people never see your full list — only what you have in common.
export const TURN_ONS = [
  { id: 'kissing', label: 'Long kisses', emoji: '💋' },
  { id: 'slow', label: 'Slow & sensual', emoji: '🕯️' },
  { id: 'rough', label: 'A little rough', emoji: '🔥' },
  { id: 'dominant', label: 'Taking control', emoji: '👑' },
  { id: 'submissive', label: 'Being told what to do', emoji: '🙇' },
  { id: 'roleplay', label: 'Role play', emoji: '🎭' },
  { id: 'toys', label: 'Toys', emoji: '🎁' },
  { id: 'lingerie', label: 'Lingerie', emoji: '🖤' },
  { id: 'dirtytalk', label: 'Dirty talk', emoji: '🗣️' },
  { id: 'massage', label: 'Massage first', emoji: '💆' },
  { id: 'shower', label: 'Shower together', emoji: '🚿' },
  { id: 'morning', label: 'Morning sex', emoji: '☀️' },
  { id: 'allnight', label: 'All night', emoji: '🌙' },
  { id: 'quickie', label: 'Quickies', emoji: '⚡' },
  { id: 'outdoors', label: 'Somewhere risky', emoji: '🌳' },
  { id: 'hotel', label: 'Hotel night', emoji: '🏨' },
  { id: 'oral', label: 'Oral', emoji: '👅' },
  { id: 'tied', label: 'Light bondage', emoji: '🎀' },
  { id: 'watching', label: 'Mirrors & watching', emoji: '🪞' },
  { id: 'experimenting', label: 'Trying new things', emoji: '🧪' },
];

const IDS = new Set(TURN_ONS.map((t) => t.id));
const BY_ID = Object.fromEntries(TURN_ONS.map((t) => [t.id, t]));

export const parseTurnOns = (list) => [...new Set((Array.isArray(list) ? list : []).filter((id) => IDS.has(id)))];

export const turnOnsOf = (u) => (u?.turn_ons ? u.turn_ons.split(',').filter((id) => IDS.has(id)) : []);

// What two people are both into, in list order.
export function inCommon(a, b) {
  const mine = new Set(turnOnsOf(a));
  return turnOnsOf(b)
    .filter((id) => mine.has(id))
    .sort((x, y) => TURN_ONS.indexOf(BY_ID[x]) - TURN_ONS.indexOf(BY_ID[y]))
    .map((id) => BY_ID[id]);
}
