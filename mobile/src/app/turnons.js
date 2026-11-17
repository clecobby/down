import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { Extrapolation, interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { api } from '../lib/api';
import { useMe } from '../lib/me';
import { colors } from '../lib/theme';
import { Button, s } from '../components/ui';

// The turn-ons game: swipe through cards, keep what you're into.
// Others only ever see what you have in common with them.
export default function TurnOnsGame() {
  const { me, setMe } = useMe();
  const [all, setAll] = useState(null);
  const [picked, setPicked] = useState(new Set(me.turnOns || []));
  const [i, setI] = useState(me.turnOns?.length ? null : 0); // null = summary
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/turn-ons').then(setAll).catch(() => setAll([]));
  }, []);

  const answer = (yes) => {
    const id = all[i].id;
    setPicked((p) => {
      const n = new Set(p);
      if (yes) n.add(id);
      else n.delete(id);
      return n;
    });
    setI(i + 1 < all.length ? i + 1 : null);
  };

  const toggle = (id) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function save() {
    setBusy(true);
    try {
      setMe(await api('/me', { method: 'PATCH', body: { turnOns: [...picked] } }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch {
      setBusy(false);
    }
  }

  if (!all) return <View style={s.screen} />;

  return (
    <SafeAreaView style={[s.screen, { padding: 20 }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={st.kicker}>Turn-ons game</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={{ color: colors.muted }}>Close</Text>
        </Pressable>
      </View>

      {i != null ? (
        <>
          <Text style={[s.h2, { marginTop: 8 }]}>Into it, or not for you?</Text>
          <Text style={[s.muted, { marginTop: 4 }]}>Only what you have in common is ever shown to someone.</Text>
          <View style={st.progress}>
            <View style={[st.progressFill, { width: `${(i / all.length) * 100}%` }]} />
          </View>
          <Text style={[s.muted, { fontSize: 12, marginTop: 6 }]}>
            {i + 1} / {all.length}
          </Text>
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <GameCard key={all[i].id} item={all[i]} onAnswer={answer} />
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Button title="Not for me" variant="ghost" style={{ flex: 1 }} onPress={() => answer(false)} />
            <Button title="Into it 🔥" style={{ flex: 1 }} onPress={() => answer(true)} />
          </View>
          <Pressable onPress={() => setI(null)} style={{ padding: 14, alignItems: 'center' }}>
            <Text style={{ color: colors.muted, fontSize: 13 }}>Skip to my picks</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={[s.h1, { fontSize: 34, marginTop: 8 }]}>{picked.size ? `You're into ${picked.size}.` : 'Pick a few.'}</Text>
          <Text style={[s.muted, { marginTop: 4, marginBottom: 16 }]}>
            Tap to change. We put people who share 3 or more first, and only show the overlap.
          </Text>
          <View style={[s.chips, { flex: 1, alignContent: 'flex-start' }]}>
            {all.map((t) => (
              <Pressable key={t.id} onPress={() => toggle(t.id)} style={[st.pick, picked.has(t.id) && st.pickOn]}>
                <Text style={[st.pickText, picked.has(t.id) && { color: '#fff' }]}>
                  {t.emoji} {t.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Button title={busy ? '…' : 'Save my turn-ons'} onPress={save} disabled={busy} />
          <Pressable onPress={() => setI(0)} style={{ padding: 14, alignItems: 'center' }}>
            <Text style={{ color: colors.muted, fontSize: 13 }}>Play again</Text>
          </Pressable>
        </>
      )}
    </SafeAreaView>
  );
}

// One big card; swipe right = into it, left = not for me.
function GameCard({ item, onAnswer }) {
  const { width } = useWindowDimensions();
  const tx = useSharedValue(0);

  const pan = usePanGesture({
    onUpdate: (e) => {
      tx.value = e.translationX;
    },
    onDeactivate: (e) => {
      if (Math.abs(tx.value) > 90 || Math.abs(e.velocityX) > 800) {
        const yes = (tx.value || e.velocityX) > 0;
        tx.value = withTiming((yes ? 1 : -1) * width, { duration: 180 }, () => scheduleOnRN(onAnswer, yes));
        scheduleOnRN(Haptics.selectionAsync);
      } else tx.value = withSpring(0);
    },
  });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { rotate: `${tx.value / 25}deg` }],
    borderColor: tx.value > 40 ? colors.accent : colors.line,
  }));
  const yes = useAnimatedStyle(() => ({ opacity: interpolate(tx.value, [20, 90], [0, 1], Extrapolation.CLAMP) }));
  const no = useAnimatedStyle(() => ({ opacity: interpolate(tx.value, [-90, -20], [1, 0], Extrapolation.CLAMP) }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[st.card, style]}>
        <Animated.Text style={[st.verdict, { left: 20, color: colors.accent }, yes]}>🔥 YES</Animated.Text>
        <Animated.Text style={[st.verdict, { right: 20, color: colors.muted }, no]}>NAH</Animated.Text>
        <Text style={{ fontSize: 96 }}>{item.emoji}</Text>
        <Text style={st.cardLabel}>{item.label}</Text>
      </Animated.View>
    </GestureDetector>
  );
}

const st = StyleSheet.create({
  kicker: { color: colors.accent, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', fontWeight: '700' },
  progress: { height: 4, borderRadius: 2, backgroundColor: colors.surface2, marginTop: 16, overflow: 'hidden' },
  progressFill: { height: 4, backgroundColor: colors.accent },
  card: {
    aspectRatio: 0.85,
    borderRadius: 28,
    backgroundColor: colors.surface,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  cardLabel: { color: colors.text, fontSize: 28, fontWeight: '900', letterSpacing: -0.8, textAlign: 'center', paddingHorizontal: 24 },
  verdict: { position: 'absolute', top: 22, fontSize: 20, fontWeight: '900', letterSpacing: 1 },
  pick: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.line },
  pickOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  pickText: { color: colors.text, fontSize: 14 },
});
