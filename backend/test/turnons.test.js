// Turn-ons: only the overlap is ever shared, and unknown ids are dropped. Run: npm test
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DB_PATH = path.join(os.tmpdir(), `down-turnons-test-${process.pid}.db`);
const { publicUser, selfUser } = await import('../src/db.js');
const { inCommon, parseTurnOns } = await import('../src/turnons.js');
after(() => {
  for (const f of ['', '-shm', '-wal']) fs.rmSync(process.env.DB_PATH + f, { force: true });
});

const person = (turn_ons) => ({
  id: 1, username: 'x', name: 'X', birthdate: '1990-01-01', gender: 'woman', interested_in: 'man', bio: '', photo: '', photos: '',
  tags: '', city: '', county: '', region: '', available_now: 0, last_active: 0, turn_ons,
});

test('in common is the overlap, in list order', () => {
  const me = person('oral,kissing,hotel');
  const them = person('hotel,toys,kissing');
  assert.deepEqual(inCommon(me, them).map((t) => t.id), ['kissing', 'hotel']);
});

test('other people never see your full list, only the overlap', () => {
  const viewer = person('kissing');
  const shown = publicUser(person('kissing,toys,roleplay'), viewer);
  assert.deepEqual(shown.inCommon.map((t) => t.id), ['kissing']);
  assert.ok(!('turnOns' in shown) && !('turn_ons' in shown));
  assert.deepEqual(selfUser(person('kissing,toys')).turnOns, ['kissing', 'toys'], 'you do see your own');
});

test('unknown or duplicate ids are dropped', () => {
  assert.deepEqual(parseTurnOns(['toys', 'toys', 'nonsense', 42]), ['toys']);
  assert.deepEqual(parseTurnOns('toys'), []);
});
