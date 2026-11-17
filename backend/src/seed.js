// Adds demo profiles to swipe on. They have no Cognito account, so nobody can log in as them.
import { now, sql } from './db.js';
import { TURN_ONS } from './turnons.js';

// name, username, gender, into, birthdate, bio, photo, available, [lat, lng, county, region, country]
const BERLIN = ['Berlin', 'Berlin', 'DE'];
const people = [
  ['Lena', 'lena.b', 'woman', 'man,woman', '1996-04-12', 'Here for the same reason you are. Wine first.', 'women/44', 1, [52.5, 13.42, ...BERLIN]],
  ['Maya', 'maya_m', 'woman', 'man', '1993-09-02', 'Low drama. High chemistry.', 'women/68', 0, [52.4, 13.06, 'Potsdam', 'Brandenburg', 'DE']],
  ['Sofia', 'sofia.nights', 'woman', 'man,woman,nonbinary', '1998-01-21', 'Tonight? Tell me your plan.', 'women/32', 1, [52.54, 13.35, ...BERLIN]],
  ['Noah', 'noah_x', 'man', 'woman', '1994-06-30', 'Straightforward. Respectful. Fun.', 'men/32', 1, [52.83, 13.82, 'Barnim', 'Brandenburg', 'DE']],
  ['Leo', 'leo91', 'man', 'woman,man', '1991-11-11', 'Cocktail, then we see.', 'men/75', 0, [52.48, 13.44, ...BERLIN]],
  [
    'Alex',
    'alex.nb',
    'nonbinary',
    'man,woman,nonbinary',
    '1997-03-08',
    'No small talk about intentions.',
    'lego/5',
    1,
    [52.36, 13.53, 'Dahme-Spreewald', 'Brandenburg', 'DE'],
  ],
  ['Jade', 'jade_h', 'woman', 'woman', '1995-07-19', 'Women only. Be direct.', 'women/12', 0, [53.55, 9.99, 'Hamburg', 'Hamburg', 'DE']],
  ['Marco', 'marco.b', 'man', 'man', '1990-02-14', 'Discreet and easygoing.', 'men/12', 1, [52.51, 13.39, ...BERLIN]],
];

// Bigger generated crowds so the test deck has variety: Berlin & Brandenburg, and Central Florida.
// County/state names match what the location lookup returns, so "same county" works.
const AREAS = {
  berlin: {
    suffix: '',
    pics: 50,
    places: [
      [52.52, 13.4, ...BERLIN],
      [52.49, 13.43, ...BERLIN],
      [52.55, 13.38, ...BERLIN],
      [52.47, 13.32, ...BERLIN],
      [52.4, 13.06, 'Potsdam', 'Brandenburg', 'DE'],
      [52.83, 13.82, 'Barnim', 'Brandenburg', 'DE'],
      [52.36, 13.53, 'Dahme-Spreewald', 'Brandenburg', 'DE'],
      [52.6, 13.15, 'Oberhavel', 'Brandenburg', 'DE'],
      [52.42, 13.75, 'Oder-Spree', 'Brandenburg', 'DE'],
    ],
    names: {
      woman: [
        'Anna',
        'Mia',
        'Emma',
        'Hannah',
        'Lea',
        'Clara',
        'Nina',
        'Laura',
        'Julia',
        'Sara',
        'Lisa',
        'Elena',
        'Marie',
        'Zoe',
        'Ida',
        'Lina',
        'Paula',
        'Greta',
        'Ella',
        'Romy',
        'Vera',
        'Kim',
        'Luisa',
        'Nora',
      ],
      man: ['Ben', 'Paul', 'Jonas', 'Finn', 'Lukas', 'Elias', 'Felix', 'Max', 'Tim', 'David', 'Jan', 'Nico'],
      nonbinary: ['Sam', 'Robin', 'Charlie', 'Kai'],
    },
  },
  florida: {
    suffix: 'fl',
    pics: 10,
    places: [
      [28.54, -81.38, 'Orange County', 'Florida', 'US'],
      [28.6, -81.34, 'Orange County', 'Florida', 'US'],
      [28.48, -81.46, 'Orange County', 'Florida', 'US'],
      [28.57, -81.2, 'Orange County', 'Florida', 'US'],
      [28.8, -81.27, 'Seminole County', 'Florida', 'US'],
      [28.67, -81.21, 'Seminole County', 'Florida', 'US'],
      [28.29, -81.41, 'Osceola County', 'Florida', 'US'],
      [28.55, -81.77, 'Lake County', 'Florida', 'US'],
      [29.21, -81.02, 'Volusia County', 'Florida', 'US'],
    ],
    names: {
      woman: [
        'Ashley',
        'Brianna',
        'Chloe',
        'Destiny',
        'Gabriela',
        'Jasmine',
        'Kayla',
        'Madison',
        'Natalie',
        'Olivia',
        'Sophia',
        'Taylor',
        'Valeria',
        'Ava',
        'Camila',
        'Isabella',
        'Jordan',
        'Mackenzie',
        'Riley',
        'Savannah',
        'Alyssa',
        'Daniela',
        'Lauren',
        'Morgan',
      ],
      man: ['Tyler', 'Marcus', 'Jake', 'Carlos', 'Brandon', 'Dylan', 'Ethan', 'Jordan', 'Mason', 'Andre', 'Ryan', 'Diego'],
      nonbinary: ['Alex', 'Casey', 'Quinn', 'Rowan'],
    },
  },
};
const BIOS = [
  'Drinks first, then we see.',
  'Spontaneous. Discreet. Kind.',
  'Tonight works for me.',
  'Say something interesting.',
  'Good vibes only.',
  'New in town, show me around.',
  'Direct is sexy.',
  'Late nights > early mornings.',
  'Respect first, fun second.',
  'Not looking for a pen pal.',
  'Bar or balcony?',
  'Chemistry is everything.',
];
const INTO = { woman: ['man', 'man,woman', 'man,nonbinary'], man: ['woman', 'woman,man', 'woman,nonbinary'], nonbinary: ['man,woman,nonbinary'] };
for (const area of Object.values(AREAS)) {
  for (const [gender, names] of Object.entries(area.names)) {
    names.forEach((name, i) => {
      const pic = gender === 'woman' ? `women/${area.pics + i}` : gender === 'man' ? `men/${area.pics + i}` : `lego/${i + 1}`;
      people.push([
        name,
        `${name.toLowerCase()}.${gender[0]}${i}${area.suffix}`,
        gender,
        INTO[gender][i % INTO[gender].length],
        `${1988 + ((i * 7) % 12)}-0${(i % 9) + 1}-1${i % 9}`,
        BIOS[(i * 5 + gender.length) % BIOS.length],
        pic,
        i % 3 === 0 ? 1 : 0,
        area.places[i % area.places.length],
      ]);
    });
  }
}

const t = now();
// password_hash is set explicitly: databases created before Cognito still require it.
const insert = (...p) =>
  sql.run(
    `INSERT INTO users
      (email, username, password_hash, name, birthdate, gender, interested_in, bio, photo, city, available_now,
       lat, lng, county, region, country, last_active, created_at)
     VALUES (?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ...p,
  );
const exists = (username) => sql.one('SELECT 1 FROM users WHERE username = ?', username);

let added = 0;
for (const [name, username, gender, interested, birth, bio, pic, avail, [lat, lng, county, region, country]] of people) {
  if (await exists(username)) continue;
  added++;
  await insert(
    `${username}@demo.down.app`,
    username,
    name,
    birth,
    gender,
    interested,
    bio,
    `https://randomuser.me/api/portraits/${pic}.jpg`,
    county,
    avail,
    lat,
    lng,
    county,
    region,
    country,
    t,
    t,
  );
}

// Extras for demo profiles that don't have them yet: a few more photos, vibe tags and a height.
const TAG_SETS = [
  ['Tonight', 'Drinks first'],
  ['Can host', 'Discreet'],
  ['This week', 'Spontaneous'],
  ['No strings', 'Can travel'],
  ['Weekends', 'Drinks first', 'Regular thing'],
  ['Tonight', 'Can host'],
  ['Discreet', 'Regular thing'],
];
let filled = 0;
for (const [i, [, username, gender, , , , pic]] of people.entries()) {
  const photos = [`https://randomuser.me/api/portraits/${pic}.jpg`, ...[1, 2, 3].map((n) => `https://picsum.photos/seed/${username}-${n}/600/800`)];
  const height = (gender === 'man' ? 172 : gender === 'woman' ? 158 : 165) + ((i * 7) % 20);
  filled += (
    await sql.run(
      "UPDATE users SET photos = ?, tags = ?, height_cm = ? WHERE username = ? AND cognito_sub IS NULL AND COALESCE(photos, '') = ''",
      JSON.stringify(photos), TAG_SETS[i % TAG_SETS.length].join(','), height, username,
    )
  ).changes;
}

// Turn-ons for demo profiles that haven't played the game: 5–10 picks each, varied but repeatable.
let played = 0;
for (const [i, [, username]] of people.entries()) {
  const picks = TURN_ONS.filter((_, j) => (i * 7 + j * 3) % 5 < 2 + (i % 3)).map((t) => t.id);
  played += (await sql.run("UPDATE users SET turn_ons = ? WHERE username = ? AND cognito_sub IS NULL AND COALESCE(turn_ons, '') = ''", picks.join(','), username)).changes;
}
console.log(`Added ${added} demo profiles (${people.length - added} already there), filled extras for ${filled}, turn-ons for ${played}.`);
await sql.end();
