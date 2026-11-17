import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { GestureDetector, useCompetingGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import Animated, { Easing, Extrapolation, interpolate, useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { colors } from '../lib/theme';
import { photoUrl } from '../lib/api';

export const THRESHOLD = 110;
// Glide, don't bounce: every settle uses an ease-out, no springs.
export const GLIDE = { duration: 260, easing: Easing.out(Easing.cubic) };

// One soft tap when a like lands; nothing on pass, nothing while dragging.
const softTap = (dir) => dir === 'like' && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

export const distanceLabel = (u) => (u.distanceKm != null ? ` · ${u.distanceKm <= 1 ? '< 1' : `~${u.distanceKm}`} km` : '');
export const photosOfUser = (u) => (u.photos?.length ? u.photos : u.photo ? [u.photo] : []);

// Photos sit side by side and slide like a carousel when `index` changes.
function Photos({ user, index }) {
  const photos = photosOfUser(user);
  const [w, setW] = useState(0);
  const x = useSharedValue(0);
  useEffect(() => {
    x.set(withTiming(-index * w, GLIDE));
  }, [index, w, x]);
  const strip = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  if (!photos.length)
    return (
      <View style={[StyleSheet.absoluteFill, st.noPhoto]}>
        <Text style={st.initial}>{user.name[0]}</Text>
      </View>
    );
  return (
    <View style={StyleSheet.absoluteFill} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Animated.View style={[{ flexDirection: 'row', height: '100%', width: w * photos.length }, strip]}>
        {photos.map((p, i) => (
          <Image key={p + i} source={photoUrl(p)} style={{ width: w, height: '100%' }} contentFit="cover" transition={120} />
        ))}
      </Animated.View>
    </View>
  );
}

function CardBody({ user, index = 0, showHint }) {
  const photos = photosOfUser(user);
  return (
    <>
      <Photos user={user} index={index} />
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
        {user.inCommon?.length > 0 && (
          <View style={st.common}>
            <Text style={st.commonText}>🔥 {user.inCommon.length} in common</Text>
          </View>
        )}
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

// The card underneath rises as the top card is thrown away. It stays hidden while a profile is being
// pulled up, so nobody else shows through.
export function BackCard({ user, drag, rise }) {
  const style = useAnimatedStyle(() => {
    const p = interpolate(Math.abs(drag.get()), [0, THRESHOLD * 1.5], [0, 1], Extrapolation.CLAMP);
    const hidden = Math.min(1, rise.get() * 6);
    return { transform: [{ scale: 0.93 + 0.07 * p }, { translateY: 16 * (1 - p) }], opacity: (0.55 + 0.45 * p) * (1 - hidden) };
  });
  return (
    <Animated.View style={[st.card, style]}>
      <CardBody user={user} />
    </Animated.View>
  );
}

// The draggable top card.
// - drag sideways to like/pass; flingRef.current(dir) lets the ✕ / ♥ buttons do the same
// - tap the right/left half to slide through photos
// - drag up to pull the full profile over the card (`rise` 0 → 1 follows the finger, like scrolling);
//   onOpen(photoIndex) opens it on the photo you were looking at
export function TopCard({ user, onSwipe, flingRef, drag, rise, onOpen }) {
  const { width, height } = useWindowDimensions();
  const [photoIndex, setPhotoIndex] = useState(0);
  const photoCount = Math.max(1, photosOfUser(user).length);
  const flip = (forward) => setPhotoIndex((i) => (forward ? (i + 1) % photoCount : Math.max(0, i - 1)));
  const open = () => onOpen(photoIndex);

  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const tiltSign = useSharedValue(1); // grabbed in the lower half → tilt the other way, like a real card
  const mode = useSharedValue(0); // 0 = undecided, 1 = swiping sideways, 2 = pulling the profile up
  const cardW = useSharedValue(width);
  const pullRange = height * 0.7;

  const openProfile = () => {
    'worklet';
    rise.set(withTiming(1, GLIDE));
    scheduleOnRN(open);
  };

  const fling = (dir, vx = 0, vy = 0) => {
    'worklet';
    const sign = dir === 'like' ? 1 : -1;
    const toX = sign * width * 1.4;
    // Faster throws leave faster; keep it between 180 and 320 ms.
    const speed = Math.max(Math.abs(vx), 1400);
    const duration = Math.min(320, Math.max(180, (Math.abs(toX - tx.value) / speed) * 1000));
    ty.value = withTiming(ty.value + vy * (duration / 1000) * 0.4, { duration, easing: Easing.out(Easing.quad) });
    tx.value = withTiming(toX, { duration, easing: Easing.out(Easing.quad) }, () => scheduleOnRN(onSwipe, dir));
    scheduleOnRN(softTap, dir);
  };

  const pan = usePanGesture({
    onBegin: (e) => {
      tiltSign.value = e.y > height * 0.35 ? -1 : 1;
      mode.value = 0;
    },
    onUpdate: (e) => {
      // Lock the direction once the finger has clearly moved, so a swipe never half-opens the profile.
      if (mode.value === 0 && Math.max(Math.abs(e.translationX), Math.abs(e.translationY)) > 10)
        mode.value = e.translationY < 0 && Math.abs(e.translationY) > Math.abs(e.translationX) * 1.2 ? 2 : 1;
      if (mode.value === 2) {
        // The card stays put; only the profile comes up over it.
        rise.set(Math.min(1, Math.max(0, -e.translationY / pullRange)));
        return;
      }
      tx.value = e.translationX;
      ty.value = e.translationY;
    },
    onDeactivate: (e) => {
      if (mode.value === 2) {
        // Past a quarter of the way, or flicked up: glide open. Otherwise glide back down.
        if (rise.get() > 0.25 || e.velocityY < -600) openProfile();
        else rise.set(withTiming(0, GLIDE));
        return;
      }
      const thrown = Math.abs(e.velocityX) > 800 && Math.sign(e.velocityX) === Math.sign(tx.value || e.velocityX);
      if (Math.abs(tx.value) > THRESHOLD || thrown) {
        fling((tx.value || e.velocityX) > 0 ? 'like' : 'pass', e.velocityX, e.velocityY);
      } else {
        tx.value = withTiming(0, GLIDE);
        ty.value = withTiming(0, GLIDE);
      }
    },
  });

  // Tap the right half for the next photo, the left half for the previous one.
  const tap = useTapGesture({
    maxDistance: 10,
    onActivate: (e) => {
      scheduleOnRN(flip, e.x > cardW.value / 2);
    },
  });
  const gesture = useCompetingGestures(pan, tap);

  useAnimatedReaction(
    () => tx.value,
    (v) => {
      drag.set(v);
    },
  );

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { rotate: `${interpolate(tx.value, [-width, width], [-16, 16]) * tiltSign.value}deg` },
    ],
  }));
  const glow = useAnimatedStyle(() => ({ opacity: interpolate(tx.value, [0, THRESHOLD * 1.6], [0, 0.45], Extrapolation.CLAMP) }));
  const shade = useAnimatedStyle(() => ({ opacity: interpolate(tx.value, [-THRESHOLD * 1.6, 0], [0.4, 0], Extrapolation.CLAMP) }));
  const likeStyle = useAnimatedStyle(() => {
    const p = interpolate(tx.value, [20, THRESHOLD], [0, 1], Extrapolation.CLAMP);
    return { opacity: p, transform: [{ rotate: '-12deg' }, { scale: 0.85 + 0.15 * p }] };
  });
  const passStyle = useAnimatedStyle(() => {
    const p = interpolate(tx.value, [-THRESHOLD, -20], [1, 0], Extrapolation.CLAMP);
    return { opacity: p, transform: [{ rotate: '12deg' }, { scale: 0.85 + 0.15 * p }] };
  });

  useEffect(() => {
    flingRef.current = fling;
  });

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[st.card, st.shadow, cardStyle]} onLayout={(e) => (cardW.value = e.nativeEvent.layout.width)}>
        <CardBody user={user} index={photoIndex} showHint />
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, glow]}>
          <LinearGradient colors={['rgba(255,45,85,0.0)', colors.accent]} start={{ x: 0.2, y: 0 }} end={{ x: 1, y: 0.4 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, shade]} />
        <Animated.View style={[st.smiley, likeStyle]} pointerEvents="none">
          <Text style={st.smileyFace}>😏</Text>
          <Text style={st.smileyText}>DOWN</Text>
        </Animated.View>
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
  smiley: {
    position: 'absolute',
    top: 30,
    left: 22,
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 22,
    borderWidth: 4,
    borderColor: colors.accent,
    backgroundColor: 'rgba(255,45,85,0.18)',
  },
  smileyFace: { fontSize: 58, lineHeight: 66 },
  smileyText: { color: colors.accent, fontSize: 20, fontWeight: '900', letterSpacing: 2 },
  common: { alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(255,45,85,0.85)' },
  commonText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  pass: { right: 24, color: '#fff', borderColor: '#fff' },
});
