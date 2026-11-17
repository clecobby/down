const day = 86400000, t = Date.now();
const daily = [...Array(14)].map((_, i) => ({ day: new Date(t - (13 - i) * day).toISOString().slice(0, 10), signups: [0,1,0,2,1,3,2,4,3,5,2,6,4,7][i], swipes: [3,8,5,14,9,22,18,30,25,41,33,52,47,64][i] }));
const users = [
  { id: 10, username: 'clecobbi', name: 'Clems', email: 'admin@example.com', age: 31, gender: 'man', county: 'Orange County', country: 'US', photo: '', demo: false, banned: false, openReports: 0, createdAt: t - 3*day, lastActive: t - 60000 },
  { id: 11, username: 'mia.w1fl', name: 'Mia', email: null, age: 27, gender: 'woman', county: 'Seminole County', country: 'US', photo: 'https://randomuser.me/api/portraits/women/11.jpg', demo: true, banned: false, openReports: 2, createdAt: t - 9*day, lastActive: t - 7200000 },
  { id: 12, username: 'tyler.m0fl', name: 'Tyler', email: 'tyler@example.com', age: 29, gender: 'man', county: '', country: '', photo: 'https://randomuser.me/api/portraits/men/10.jpg', demo: false, banned: true, openReports: 0, createdAt: t - 20*day, lastActive: t - 5*day },
];
export const API = '';
export const photoUrl = (p) => p;
export async function api(path) {
  if (path.startsWith('/admin/stats')) return { realUsers: 12, demoProfiles: 88, suspended: 1, signups24h: 2, signups7d: 31, signupsPrev7d: 18, active24h: 7, swipes24h: 64, likes24h: 29, matchesTotal: 41, matches24h: 5, messages24h: 113, meetupsAccepted: 6, openReports: 3, noPhoto: 4, noLocation: 2, daily };
  if (path.startsWith('/admin/users')) return { total: users.length, users };
  return [];
}
