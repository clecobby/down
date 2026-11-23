import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { api } from '../../lib/api';
import { colors } from '../../lib/theme';
import { Avatar, Button, s } from '../../components/ui';
import SafetyTools from '../../components/SafetyTools';
import { currentPosition, kickSafety } from '../../lib/safety';

const mi = (km) => (km == null ? null : km * 0.621371);
const fmtDistance = (km) => {
  const m = mi(km);
  if (m == null) return null;
  return m < 0.1 ? `${Math.round(km * 1000 * 3.28084)} ft` : `${m.toFixed(m < 10 ? 1 : 0)} mi`;
};
const ago = (t) => {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  return s < 60 ? `${s}s ago` : `${Math.round(s / 60)} min ago`;
};
const until = (t) => {
  const m = Math.max(0, Math.round((t - Date.now()) / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`;
};

// Live location with one match, on the way to meet. Both have to agree; either can stop it.
export default function LiveShare() {
  const { id } = useLocalSearchParams();
  const [user, setUser] = useState(null);
  const [live, setLive] = useState(undefined); // undefined = loading, null = not sharing
  const [busy, setBusy] = useState(false);
  const map = useRef(null);
  const fitted = useRef(false);

  const load = useCallback(async () => {
    try {
      const [chat, r] = await Promise.all([api(`/matches/${id}`), api(`/matches/${id}/live`)]);
      setUser(chat.user);
      setLive(r.live);
    } catch {
      router.back();
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
      const t = setInterval(load, 5000);
      return () => clearInterval(t);
    }, [load]),
  );

  // Frame both people once there's something to show.
  useEffect(() => {
    if (!live?.them || fitted.current) return;
    const pts = [live.them, live.me].filter(Boolean).map((p) => ({ latitude: p.lat, longitude: p.lng }));
    fitted.current = true;
    setTimeout(() => map.current?.fitToCoordinates(pts, { edgePadding: { top: 80, bottom: 80, left: 60, right: 60 }, animated: true }), 300);
  }, [live]);

  async function act(path, body) {
    setBusy(true);
    try {
      const r = await api(`/matches/${id}/live${path}`, { method: 'POST', body });
      setLive(r.live);
      kickSafety();
    } catch (e) {
      Alert.alert('Live location', e.message);
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    try {
      await currentPosition(); // asks for permission up front
    } catch (e) {
      return Alert.alert('Location is off', e.message);
    }
    act('');
  }

  if (!user || live === undefined) return <View style={s.screen} />;
  const status = live?.status;

  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line }}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </Pressable>
        <Avatar uri={user.photo} size={36} />
        <View style={{ flex: 1 }}>
          <Text style={[s.text, { fontWeight: '700' }]}>Meeting {user.name}</Text>
          <Text style={[s.muted, { fontSize: 12 }]}>
            {status === 'active' ? `Live location on · ends in ${until(live.endsAt)}` : 'Safety'}
          </Text>
        </View>
        <Ionicons name="shield-checkmark" size={22} color={status === 'active' ? colors.ok : colors.muted} />
      </View>

      {status === 'active' ? (
        <View style={{ flex: 1 }}>
          <MapView
            ref={map}
            style={{ flex: 1 }}
            showsUserLocation
            userInterfaceStyle="dark"
            initialRegion={
              live.them || live.me
                ? { latitude: (live.them || live.me).lat, longitude: (live.them || live.me).lng, latitudeDelta: 0.03, longitudeDelta: 0.03 }
                : undefined
            }
          >
            {live.trail.length > 1 && (
              <Polyline coordinates={live.trail.map((p) => ({ latitude: p.lat, longitude: p.lng }))} strokeColor={colors.accent} strokeWidth={4} />
            )}
            {live.them && <Marker coordinate={{ latitude: live.them.lat, longitude: live.them.lng }} title={user.name} pinColor={colors.accent} />}
          </MapView>
          <View style={{ padding: 16, gap: 12, borderTopWidth: 1, borderTopColor: colors.line }}>
            <Text style={[s.text, { fontSize: 18, fontWeight: '700' }]}>
              {live.them
                ? live.distanceKm != null
                  ? `${user.name} is ${fmtDistance(live.distanceKm)} away`
                  : `${user.name} is on the map`
                : `Waiting for ${user.name}'s location…`}
            </Text>
            {live.them && <Text style={s.muted}>Updated {ago(live.them.at)}</Text>}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title="We met ✓" style={{ flex: 1 }} disabled={busy} onPress={() => act('/end', { reason: 'met' })} />
              <Button title="Stop sharing" variant="ghost" style={{ flex: 1 }} disabled={busy} onPress={() => act('/end', { reason: 'stopped' })} />
            </View>
            <SafetyTools compact />
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
          <Ionicons name="navigate-circle" size={56} color={colors.accent} style={{ alignSelf: 'center' }} />
          {status === 'pending' && !live.startedByMe ? (
            <>
              <Text style={[s.h2, { textAlign: 'center' }]}>{user.name} wants to share live location</Text>
              <Text style={[s.muted, { textAlign: 'center' }]}>
                You'll each see the other on a map while you head to meet. It stops when either of you taps "We met" or "Stop", or after 3 hours.
              </Text>
              <Button title="Share both ways" disabled={busy} onPress={async () => {
                try {
                  await currentPosition();
                } catch (e) {
                  return Alert.alert('Location is off', e.message);
                }
                act('/accept');
              }} />
              <Button title="Not now" variant="ghost" disabled={busy} onPress={() => act('/decline')} />
            </>
          ) : status === 'pending' ? (
            <>
              <Text style={[s.h2, { textAlign: 'center' }]}>Waiting for {user.name}</Text>
              <Text style={[s.muted, { textAlign: 'center' }]}>Nothing is shared until {user.name} accepts too.</Text>
              <Button title="Cancel request" variant="ghost" disabled={busy} onPress={() => act('/end', { reason: 'stopped' })} />
            </>
          ) : (
            <>
              <Text style={[s.h2, { textAlign: 'center' }]}>Share live location while you meet</Text>
              <Text style={[s.muted, { textAlign: 'center', lineHeight: 20 }]}>
                If {user.name} accepts, you'll each see the other moving on a map on the way to meet. It stops when either of you taps "We met" or "Stop", or after 3 hours.
              </Text>
              <View style={{ gap: 8, backgroundColor: colors.surface, borderRadius: 14, padding: 14 }}>
                <Point icon="lock-closed" text="Encrypted, and deleted after 24 hours." />
                <Point icon="trash" text="You can delete your own history anytime." />
                <Point icon="flag" text="If someone files a report, both trails are kept until the down team resolves it, so nobody can erase what happened." />
                <Point icon="phone-portrait" text="Keep the app open on the way: location only updates while it's open." />
              </View>
              <Button title={`Ask ${user.name} to share`} disabled={busy} onPress={start} />
            </>
          )}
          <View style={{ height: 8 }} />
          <SafetyTools />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Point({ icon, text }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <Ionicons name={icon} size={16} color={colors.muted} style={{ marginTop: 2 }} />
      <Text style={[s.muted, { flex: 1, lineHeight: 19 }]}>{text}</Text>
    </View>
  );
}
