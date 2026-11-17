// Adds demo profiles to swipe on. They have no Cognito account, so nobody can log in as them.
import { db, now } from './db.js';

// name, username, gender, into, birthdate, bio, photo, available, [lat, lng, county, region]
const BERLIN = ['Berlin', 'Berlin'];
const people = [
  ['Lena', 'lena.b', 'woman', 'man,woman', '1996-04-12', 'Here for the same reason you are. Wine first.', 'women/44', 1, [52.5, 13.42, ...BERLIN]],
  ['Maya', 'maya_m', 'woman', 'man', '1993-09-02', 'Low drama. High chemistry.', 'women/68', 0, [52.4, 13.06, 'Potsdam', 'Brandenburg']],
  ['Sofia', 'sofia.nights', 'woman', 'man,woman,nonbinary', '1998-01-21', 'Tonight? Tell me your plan.', 'women/32', 1, [52.54, 13.35, ...BERLIN]],
  ['Noah', 'noah_x', 'man', 'woman', '1994-06-30', 'Straightforward. Respectful. Fun.', 'men/32', 1, [52.83, 13.82, 'Barnim', 'Brandenburg']],
  ['Leo', 'leo91', 'man', 'woman,man', '1991-11-11', 'Cocktail, then we see.', 'men/75', 0, [52.48, 13.44, ...BERLIN]],
  ['Alex', 'alex.nb', 'nonbinary', 'man,woman,nonbinary', '1997-03-08', 'No small talk about intentions.', 'lego/5', 1, [52.36, 13.53, 'Dahme-Spreewald', 'Brandenburg']],
  ['Jade', 'jade_h', 'woman', 'woman', '1995-07-19', 'Women only. Be direct.', 'women/12', 0, [53.55, 9.99, 'Hamburg', 'Hamburg']],
  ['Marco', 'marco.b', 'man', 'man', '1990-02-14', 'Discreet and easygoing.', 'men/12', 1, [52.51, 13.39, ...BERLIN]],
];

// A bigger generated crowd around Berlin & Brandenburg so the test deck has variety.
const PLACES = [
  [52.52, 13.4, ...BERLIN], [52.49, 13.43, ...BERLIN], [52.55, 13.38, ...BERLIN], [52.47, 13.32, ...BERLIN],
  [52.4, 13.06, 'Potsdam', 'Brandenburg'], [52.83, 13.82, 'Barnim', 'Brandenburg'], [52.36, 13.53, 'Dahme-Spreewald', 'Brandenburg'],
  [52.6, 13.15, 'Oberhavel', 'Brandenburg'], [52.42, 13.75, 'Oder-Spree', 'Brandenburg'],
];
const BIOS = [
  'Drinks first, then we see.', 'Spontaneous. Discreet. Kind.', 'Tonight works for me.', 'Say something interesting.',
  'Good vibes only.', 'New in town, show me around.', 'Direct is sexy.', 'Late nights > early mornings.',
  'Respect first, fun second.', 'Not looking for a pen pal.', 'Bar or balcony?', 'Chemistry is everything.',
];
const NAMES = {
  woman: ['Anna', 'Mia', 'Emma', 'Hannah', 'Lea', 'Clara', 'Nina', 'Laura', 'Julia', 'Sara', 'Lisa', 'Elena', 'Marie', 'Zoe', 'Ida', 'Lina', 'Paula', 'Greta', 'Ella', 'Romy', 'Vera', 'Kim', 'Luisa', 'Nora'],
  man: ['Ben', 'Paul', 'Jonas', 'Finn', 'Lukas', 'Elias', 'Felix', 'Max', 'Tim', 'David', 'Jan', 'Nico'],
  nonbinary: ['Sam', 'Robin', 'Charlie', 'Kai'],
};
const INTO = { woman: ['man', 'man,woman', 'man,nonbinary'], man: ['woman', 'woman,man', 'woman,nonbinary'], nonbinary: ['man,woman,nonbinary'] };
for (const [gender, names] of Object.entries(NAMES)) {
  names.forEach((name, i) => {
    const pic = gender === 'woman' ? `women/${50 + i}` : gender === 'man' ? `men/${50 + i}` : `lego/${i + 1}`;
    people.push([
      name,
      `${name.toLowerCase()}.${gender[0]}${i}`,
      gender,
      INTO[gender][i % INTO[gender].length],
      `${1988 + ((i * 7) % 12)}-0${(i % 9) + 1}-1${i % 9}`,
      BIOS[(i * 5 + gender.length) % BIOS.length],
      pic,
      i % 3 === 0 ? 1 : 0,
      PLACES[i % PLACES.length],
    ]);
  });
}

const t = now();
// password_hash is set explicitly: databases created before Cognito still require it.
const insert = db.prepare(`INSERT INTO users
  (email, username, password_hash, name, birthdate, gender, interested_in, bio, photo, city, available_now,
   lat, lng, county, region, country, last_active, created_at)
  VALUES (?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DE', ?, ?)`);
const exists = db.prepare('SELECT 1 FROM users WHERE username = ?');

let added = 0;
for (const [name, username, gender, interested, birth, bio, pic, avail, [lat, lng, county, region]] of people) {
  if (exists.get(username)) continue;
  added++;
  insert.run(`${username}@demo.down.app`, username, name, birth, gender, interested, bio, `https://randomuser.me/api/portraits/${pic}.jpg`, county, avail, lat, lng, county, region, t, t);
}

// Extras for demo profiles that don't have them yet: a few more photos, vibe tags and a height.
const TAG_SETS = [
  ['Tonight', 'Drinks first'], ['Can host', 'Discreet'], ['This week', 'Spontaneous'], ['No strings', 'Can travel'],
  ['Weekends', 'Drinks first', 'Regular thing'], ['Tonight', 'Can host'], ['Discreet', 'Regular thing'],
];
const extras = db.prepare(
  "UPDATE users SET photos = ?, tags = ?, height_cm = ? WHERE username = ? AND cognito_sub IS NULL AND COALESCE(photos, '') = ''",
);
let filled = 0;
people.forEach(([, username, gender, , , , pic], i) => {
  const photos = [`https://randomuser.me/api/portraits/${pic}.jpg`, ...[1, 2, 3].map((n) => `https://picsum.photos/seed/${username}-${n}/600/800`)];
  const height = (gender === 'man' ? 172 : gender === 'woman' ? 158 : 165) + ((i * 7) % 20);
  filled += extras.run(JSON.stringify(photos), TAG_SETS[i % TAG_SETS.length].join(','), height, username).changes;
});

console.log(`Added ${added} demo profiles (${people.length - added} already there), filled extras for ${filled}.`);
