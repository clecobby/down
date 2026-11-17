import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import Animated, { Extrapolation, FadeIn, FadeInDown, ZoomIn, interpolate, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { api, photoUrl } from '../../lib/api';
import { useMe } from '../../lib/me';
import { colors } from '../../lib/theme';
import { Button, Logo, s } from '../../components/ui';
import { BackCard, THRESHOLD, TopCard } from '../../components/SwipeCard';
import ProfileSheet from '../../components/ProfileSheet';

// Refresh location on open. The server snaps it to ~1 km and only shares county + rough distance.
async function sendLocation() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new Error("Location is off, so you won't see people near you.");
  const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return api('/me/location', { method: 'POST', body: { lat: coords.latitude, lng: coords.longitude } });
}

export default function Discover() {
  const { me, setMe } = useMe();
  const [deck, setDeck] = useState(null);
  const [match, setMatch] = useState(null);
  const [viewing, setViewing] = useState(null); // profile opened by swiping up
  const [locErr, setLocErr] = useState('');
  const flingRef = useRef(null);
  const drag = useSharedValue(0); // top card's x offset: drives the card underneath and the buttons

  const load = useCallback(() => api('/discover').then(setDeck).catch(() => setDeck([])), []);

  const locate = useCallback(
    () =>
      sendLocation()
        .then((user) => {
          setMe(user);
          setLocErr('');
          return load();
        })
        .catch((e) => setLocErr(e.message)),
    [setMe, load],
  );

  useEffect(() => {
    load();
    locate();
  }, [load, locate]);

  async function swipe(dir) {
    const [user, ...rest] = deck;
    setDeck(rest);
    const r = await api('/swipe', { method: 'POST', body: { userId: user.id, dir } }).catch(() => ({}));
    if (r.match?.isNew) {
      // only celebrate the first time
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setMatch(r.match);
    }
    if (rest.length < 3)
      api('/discover')
        .then((more) => setDeck((d) => [...d, ...more.filter((m) => m.id !== user.id && !d.some((x) => x.id === m.id))]))
        .catch(() => {});
  }

  const [top, next] = deck || [];

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 }}>
        <Logo />
        {!!me.county && (
          <View style={{ backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 }}>
            <Text style={[s.muted, { fontSize: 12 }]}>📍 {me.county}</Text>
          </View>
        )}
      </View>

      {!!locErr && !me.hasLocation && (
        <Pressable onPress={locate} style={{ marginHorizontal: 16, marginBottom: 12, padding: 12, borderRadius: 12, backgroundColor: colors.accentSoft }}>
          <Text style={[s.text, { fontSize: 13 }]}>
            {locErr} <Text style={{ color: colors.accent, textDecorationLine: 'underline' }}>Turn on</Text>
          </Text>
        </Pressable>
      )}

      <View style={{ flex: 1, marginHorizontal: 16 }}>
        {deck?.length === 0 && (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <Text style={s.h2}>That's everyone for now.</Text>
            <Text style={s.muted}>New people join all the time.</Text>
            <Button title="Refresh" variant="ghost" small onPress={load} />
          </View>
        )}
        {next && <BackCard key={`b${next.id}`} user={next} drag={drag} />}
        {top && <TopCard key={`t${top.id}`} user={top} onSwipe={swipe} flingRef={flingRef} drag={drag} onOpen={() => setViewing(top)} />}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 28, paddingVertical: 16, opacity: top ? 1 : 0 }}>
        <ActionButton drag={drag} dir="pass" onPress={() => flingRef.current?.('pass')} />
        <ActionButton drag={drag} dir="like" onPress={() => flingRef.current?.('like')} />
      </View>

      {viewing && (
        <ProfileSheet
          user={viewing}
          onClose={() => setViewing(null)}
          onDecide={(dir) => {
            setViewing(null);
            // Let the sheet slide away, then throw the card.
            setTimeout(() => flingRef.current?.(dir), 350);
          }}
        />
      )}

      <Modal visible={!!match} transparent animationType="fade" onRequestClose={() => setMatch(null)}>
        {match && (
          <Animated.View entering={FadeIn.duration(200)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', padding: 24, gap: 14 }}>
            <Animated.View entering={ZoomIn.springify().damping(12)} style={{ alignSelf: 'center', marginBottom: 8 }}>
              <Image
                source={photoUrl(match.user.photo)}
                style={{ width: 140, height: 140, borderRadius: 70, borderWidth: 3, borderColor: colors.accent }}
              />
            </Animated.View>
            <Animated.Text entering={FadeInDown.delay(120).springify()} style={[s.h1, { color: colors.accent, textAlign: 'center' }]}>
              You're both down.
            </Animated.Text>
            <Animated.Text entering={FadeInDown.delay(200).springify()} style={[s.muted, { textAlign: 'center' }]}>
              You and {match.user.name} want the same thing. Say hi.
            </Animated.Text>
            <Button
              title="Start talking"
              onPress={() => {
                setMatch(null);
                router.push(`/chat/${match.id}`);
              }}
            />
            <Button title="Keep looking" variant="ghost" onPress={() => setMatch(null)} />
          </Animated.View>
        )}
      </Modal>
    </SafeAreaView>
  );
}

// ✕ / ♥ buttons swell as the card is dragged toward them.
function ActionButton({ drag, dir, onPress }) {
  const like = dir === 'like';
  const style = useAnimatedStyle(() => {
    const p = interpolate(like ? drag.value : -drag.value, [0, THRESHOLD], [0, 1], Extrapolation.CLAMP);
    const other = interpolate(like ? -drag.value : drag.value, [0, THRESHOLD], [0, 1], Extrapolation.CLAMP);
    return { transform: [{ scale: 1 + 0.18 * p - 0.12 * other }], opacity: 1 - 0.5 * other };
  });
  return (
    <Animated.View style={style}>
      <Pressable
        onPress={() => {
          Haptics.selectionAsync();
          onPress();
        }}
        style={({ pressed }) => [roundBtn(like), pressed && { transform: [{ scale: 0.9 }] }]}
      >
        <Ionicons name={like ? 'heart' : 'close'} size={30} color={like ? '#fff' : colors.text} />
      </Pressable>
    </Animated.View>
  );
}

const roundBtn = (like) => ({
  width: 64,
  height: 64,
  borderRadius: 32,
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: like ? colors.accent : colors.surface,
  borderWidth: 1,
  borderColor: like ? colors.accent : colors.line,
});
