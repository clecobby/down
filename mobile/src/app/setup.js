import { useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Location from 'expo-location';
import { api } from '../lib/api';
import { useMe } from '../lib/me';
import { colors } from '../lib/theme';
import { Button, Chip, Input, Label, s } from '../components/ui';
import AuthScreen from '../components/AuthScreen';

const GENDERS = [
  ['woman', 'Woman'],
  ['man', 'Man'],
  ['nonbinary', 'Non-binary'],
];

const eighteenYearsAgo = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 18);
  return d;
};
const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// First run after confirming the account: create the dating profile.
export default function Setup() {
  const { setMe, logout } = useMe();
  const [f, setF] = useState({ name: '', username: '', gender: '', interestedIn: [] });
  const [birth, setBirth] = useState(null);
  const [showPicker, setShowPicker] = useState(false);
  const [uCheck, setUCheck] = useState(null);
  const [loc, setLoc] = useState({ state: 'idle' }); // idle | asking | ok | denied
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));
  const toggle = (g) => set('interestedIn')(f.interestedIn.includes(g) ? f.interestedIn.filter((x) => x !== g) : [...f.interestedIn, g]);

  // Live username check, debounced.
  useEffect(() => {
    if (!f.username) return;
    const t = setTimeout(() => api(`/username-available?u=${encodeURIComponent(f.username)}`).then(setUCheck).catch(() => {}), 350);
    return () => clearTimeout(t);
  }, [f.username]);
  const check = uCheck?.username === f.username ? uCheck : null;

  // Matching is by county, so we ask up front and explain why.
  async function askLocation() {
    setLoc({ state: 'asking' });
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return setLoc({ state: 'denied' });
    try {
      const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLoc({ state: 'ok', lat: coords.latitude, lng: coords.longitude });
    } catch {
      setLoc({ state: 'denied' });
    }
  }

  async function submit() {
    if (!birth) return setErr('Add your birthday');
    if (!f.gender) return setErr('Pick how you identify');
    if (!f.interestedIn.length) return setErr('Pick who you want to meet');
    if (loc.state === 'idle' || loc.state === 'asking') return setErr('Share your location so we can show people near you');
    setErr('');
    setBusy(true);
    try {
      let me = await api('/profile', { method: 'POST', body: { ...f, birthdate: isoDate(birth) } });
      if (loc.state === 'ok') me = await api('/me/location', { method: 'POST', body: { lat: loc.lat, lng: loc.lng } }).catch(() => me);
      setMe(me);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <AuthScreen title="About you.">
      <Input placeholder="First name" value={f.name} onChangeText={set('name')} maxLength={40} />
      <Input
        prefix="@"
        placeholder="username"
        value={f.username}
        onChangeText={(v) => set('username')(v.toLowerCase().replace(/\s/g, ''))}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
      />
      <Text style={{ fontSize: 13, color: !check ? colors.muted : check.available ? colors.ok : colors.accent }}>
        {!check ? '3–20 characters: letters, numbers, . and _' : check.available ? `@${check.username} is yours` : check.error}
      </Text>

      <Label>Birthday</Label>
      <Pressable onPress={() => setShowPicker(!showPicker)} style={[s.inputWrap, { padding: 14 }]}>
        <Text style={{ color: birth ? colors.text : colors.muted, fontSize: 16 }}>{birth ? birth.toLocaleDateString() : 'Pick a date'}</Text>
      </Pressable>
      {showPicker && (
        <DateTimePicker
          value={birth || eighteenYearsAgo()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          maximumDate={eighteenYearsAgo()}
          themeVariant="dark"
          onChange={(e, d) => {
            if (Platform.OS === 'android') setShowPicker(false);
            if (d && e.type !== 'dismissed') setBirth(d);
          }}
        />
      )}

      <Label>I am</Label>
      <View style={s.chips}>
        {GENDERS.map(([v, l]) => (
          <Chip key={v} label={l} on={f.gender === v} onPress={() => set('gender')(v)} />
        ))}
      </View>

      <Label>Into</Label>
      <View style={s.chips}>
        {GENDERS.map(([v, l]) => (
          <Chip key={v} label={l} on={f.interestedIn.includes(v)} onPress={() => toggle(v)} />
        ))}
      </View>

      <Label>Where you are</Label>
      <Pressable
        onPress={askLocation}
        disabled={loc.state === 'asking'}
        style={{ padding: 16, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: loc.state === 'ok' ? colors.ok : colors.line, gap: 4 }}
      >
        <Text style={[s.text, { fontWeight: '700' }]}>
          {loc.state === 'ok' ? '📍 Location on' : loc.state === 'asking' ? 'Finding you…' : '📍 Share my location'}
        </Text>
        <Text style={[s.muted, { fontSize: 12 }]}>
          {loc.state === 'denied'
            ? 'Location is blocked. Allow it in Settings to see people near you — or continue without it.'
            : 'We match you with people in your county. Others only see your county and a rough distance — never your exact spot.'}
        </Text>
      </Pressable>

      {!!err && <Text style={s.error}>{err}</Text>}
      <Button title={busy ? '…' : "Let's go"} onPress={submit} disabled={busy} style={{ marginTop: 8 }} />
      <Pressable onPress={logout} style={{ padding: 12, alignItems: 'center' }}>
        <Text style={{ color: colors.muted }}>Log out</Text>
      </Pressable>
    </AuthScreen>
  );
}
