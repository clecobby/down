import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { GestureDetector, useCompetingGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import Animated, { Extrapolation, interpolate, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { colors } from '../lib/theme';
import { photoUrl } from '../lib/api';

export const THRESHOLD = 110;
const SNAP_BACK = { damping: 16, stiffness: 190, mass: 0.9 };

const tick = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
const thud = (dir) =>
  dir === 'like' ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium) : Haptics.selectionAsync();

export const distanceLabel = (u) => (u.distanceKm != null ? ` · ${u.distanceKm <= 1 ? '< 1' : `~${u.distanceKm}`} km` : '');

function CardBody({ user, index = 0, showHint }) {
  const photos = user.photos?.length ? user.photos : user.photo ? [user.photo] : [];
  return (
    <>
      {photos.length ? (
        <Image source={photoUrl(photos[index])} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} />
      ) : (
        <View style={[StyleSheet.absoluteFill, st.noPhoto]}>
          <Text style={st.initial}>{user.name[0]}</Text>
        </View>
      )}
      {photos.length > 1 && (
        <View style={st.bars} pointerEvents="none">
          {photos.map((p, i) => (
            <View key={p + i} style={[st.bar, i === index && st.barOn]} />
          ))}
        </View>
      )}
      <View style={st.info} pointerEvents="none">
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} style={StyleSheet.absoluteFill} />
        <Text style={st.name}>
          {user.name} <Text style={{ fontWeight: '400' }}>{user.age}</Text>
          {user.availableNow && <Text style={st.now}>  ● now</Text>}
        </Text>
        <Text style={st.place}>
          {user.sameCounty ? `In ${user.county}` : user.county}
          {distanceLabel(user)}
        </Text>
        {!!user.bio && (
          <Text style={st.bio} numberOfLines={2}>
            {user.bio}
          </Text>
        )}
        {showHint && <Text style={st.more}>▲ swipe up for more</Text>}
      </View>
    </>
  );
}

// The card underneath rises and brightens as the top card is dragged away. `drag` is the top card's x offset.
export function BackCard({ user, drag }) {
  const style = useAnimatedStyle(() => {
    const p = interpolate(Math.abs(drag.value), [0, THRESHOLD * 1.5], [0, 1], Extrapolation.CLAMP);
    return { transform: [{ scale: 0.93 + 0.07 * p }, { translateY: 16 * (1 - p) }], opacity: 0.55 + 0.45 * p };
  });
  return (
    <Animated.View style={[st.card, style]}>
      <CardBody user={user} />
    </Animated.View>
  );
}

// The draggable top card. flingRef.current(dir) lets the ✕ / ♥ buttons trigger the same exit.
// Each card owns its position (so a new card always starts centered) and mirrors it into `drag`
// for the card underneath and the action buttons.
export function TopCard({ user, onSwipe, flingRef, drag, onOpen }) {
  const { width, height } = useWindowDimensions();
  const [photoIndex, setPhotoIndex] = useState(0);
  const photoCount = user.photos?.length || 1;
  // Tap the left/right side of the card to flip through photos.
  const flip = (right) => setPhotoIndex((i) => Math.min(photoCount - 1, Math.max(0, i + (right ? 1 : -1))));
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const tiltSign = useSharedValue(1); // grabbed in the lower half → tilt the other way, like a real card
  const armed = useSharedValue(false); // past the threshold (for the haptic tick)


  const fling = (dir, vx = 0, vy = 0) => {
    'worklet';
    const sign = dir === 'like' ? 1 : -1;
    const toX = sign * width * 1.4;
    // Faster throws leave faster; keep it between 160 and 320 ms.
    const speed = Math.max(Math.abs(vx), 1400);
    const duration = Math.min(320, Math.max(160, (Math.abs(toX - tx.value) / speed) * 1000));
    ty.value = withTiming(ty.value + vy * (duration / 1000) * 0.5, { duration });
    tx.value = withTiming(toX, { duration }, () => scheduleOnRN(onSwipe, dir));
    scheduleOnRN(thud, dir);
  };

  const pan = usePanGesture({
    onBegin: (e) => {
      tiltSign.value = e.y > height * 0.35 ? -1 : 1;
    },
    onUpdate: (e) => {
      tx.value = e.translationX;
      ty.value = e.translationY;
      const past = Math.abs(e.translationX) > THRESHOLD;
      if (past !== armed.value) {
        armed.value = past;
        if (past) scheduleOnRN(tick);
      }
    },
    onDeactivate: (e) => {
      armed.value = false;
      const thrown = Math.abs(e.velocityX) > 800 && Math.sign(e.velocityX) === Math.sign(tx.value || e.velocityX);
      const swipedUp = ty.value < -110 && Math.abs(tx.value) < THRESHOLD && e.velocityY < 0;
      if (swipedUp) {
        scheduleOnRN(onOpen);
        tx.value = withSpring(0, SNAP_BACK);
        ty.value = withSpring(0, SNAP_BACK);
      } else if (Math.abs(tx.value) > THRESHOLD || thrown) {
        fling((tx.value || e.velocityX) > 0 ? 'like' : 'pass', e.velocityX, e.velocityY);
      } else {
        tx.value = withSpring(0, { ...SNAP_BACK, velocity: e.velocityX });
        ty.value = withSpring(0, { ...SNAP_BACK, velocity: e.velocityY });
      }
    },
  });

  useAnimatedReaction(
    () => tx.value,
    (v) => {
      // eslint-disable-next-line react-hooks/immutability -- shared value, written on the UI thread by design
      drag.value = v;
    },
  );

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { rotate: `${interpolate(tx.value, [-width, width], [-18, 18]) * tiltSign.value}deg` },
    ],
  }));
  const glow = useAnimatedStyle(() => ({ opacity: interpolate(tx.value, [0, THRESHOLD * 1.6], [0, 0.45], Extrapolation.CLAMP) }));
  const shade = useAnimatedStyle(() => ({ opacity: interpolate(tx.value, [-THRESHOLD * 1.6, 0], [0.4, 0], Extrapolation.CLAMP) }));
  const likeStyle = useAnimatedStyle(() => {
    const p = interpolate(tx.value, [20, THRESHOLD], [0, 1], Extrapolation.CLAMP);
    return { opacity: p, transform: [{ rotate: '-14deg' }, { scale: 0.7 + 0.3 * p }] };
  });
  const passStyle = useAnimatedStyle(() => {
    const p = interpolate(tx.value, [-THRESHOLD, -20], [1, 0], Extrapolation.CLAMP);
    return { opacity: p, transform: [{ rotate: '14deg' }, { scale: 0.7 + 0.3 * p }] };
  });

  // Tap: bottom of the card opens the full profile; left/right side flips photos.
  const cardH = useSharedValue(1);
  const tap = useTapGesture({
    maxDistance: 10,
    onActivate: (e) => {
      if (e.y > cardH.value * 0.65) scheduleOnRN(onOpen);
      else scheduleOnRN(flip, e.x > width / 2);
    },
  });
  const gesture = useCompetingGestures(pan, tap);

  useEffect(() => {
    flingRef.current = fling;
  });

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[st.card, st.shadow, cardStyle]} onLayout={(e) => (cardH.value = e.nativeEvent.layout.height)}>
        <CardBody user={user} index={photoIndex} showHint />
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, glow]}>
          <LinearGradient colors={['rgba(255,45,85,0.0)', colors.accent]} start={{ x: 0.2, y: 0 }} end={{ x: 1, y: 0.4 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, shade]} />
        <Animated.Text style={[st.stamp, st.like, likeStyle]}>DOWN</Animated.Text>
        <Animated.Text style={[st.stamp, st.pass, passStyle]}>NOPE</Animated.Text>
      </Animated.View>
    </GestureDetector>
  );
}

const st = StyleSheet.create({
  card: { ...StyleSheet.absoluteFill, borderRadius: 24, overflow: 'hidden', backgroundColor: colors.surface },
  shadow: { boxShadow: '0 12px 32px rgba(0,0,0,0.5)' },
  noPhoto: { backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  initial: { fontSize: 120, fontWeight: '900', color: colors.line },
  info: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 20, paddingTop: 60 },
  name: { color: '#fff', fontSize: 30, fontWeight: '900', letterSpacing: -1 },
  now: { color: colors.ok, fontSize: 14, fontWeight: '500' },
  place: { color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  bio: { color: '#fff', marginTop: 8, lineHeight: 20 },
  more: { color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 10, textAlign: 'center', letterSpacing: 0.5 },
  bars: { position: 'absolute', top: 10, left: 12, right: 12, flexDirection: 'row', gap: 4 },
  bar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)' },
  barOn: { backgroundColor: '#fff' },
  stamp: { position: 'absolute', top: 36, paddingHorizontal: 14, paddingVertical: 4, borderWidth: 4, borderRadius: 12, fontSize: 34, fontWeight: '900', letterSpacing: 2 },
  like: { left: 24, color: colors.accent, borderColor: colors.accent },
  pass: { right: 24, color: '#fff', borderColor: '#fff' },
});
