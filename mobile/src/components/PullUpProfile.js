import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { interpolate, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { colors } from '../lib/theme';
import { DecideBar, ProfileContent } from './ProfileSheet';
import { GLIDE } from './SwipeCard';

// The full profile as a panel that tracks the finger: `rise` goes 0 → 1 while you pull the card up
// (driven by TopCard), so opening feels like scrolling. Close by pulling down past the top or dragging the handle.
export default function PullUpProfile({ user, photoIndex = 0, rise, open, onClose, onDecide }) {
  const { height } = useWindowDimensions();
  const range = height * 0.7;

  const close = () => {
    rise.set(withTiming(0, GLIDE));
    onClose();
  };

  const handle = usePanGesture({
    runOnJS: true,
    onUpdate: (e) => {
      rise.set(Math.min(1, Math.max(0, 1 - e.translationY / range)));
    },
    onDeactivate: (e) => {
      if (rise.get() < 0.75 || e.velocityY > 600) close();
      else rise.set(withTiming(1, GLIDE));
    },
  });

  const panel = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - rise.get()) * height }],
    borderTopLeftRadius: interpolate(rise.get(), [0.85, 1], [28, 0], 'clamp'),
    borderTopRightRadius: interpolate(rise.get(), [0.85, 1], [28, 0], 'clamp'),
  }));

  if (!user) return null;
  return (
    <Animated.View style={[st.panel, panel]} pointerEvents={open ? 'auto' : 'none'}>
      <ProfileContent
        key={`${user.id}-${photoIndex}`}
        user={user}
        initialPage={photoIndex}
        onClose={close}
        // Pulling down past the top of the content closes it (iOS bounce).
        onScrollEndDrag={(e) => e.nativeEvent.contentOffset.y < -70 && close()}
        scrollEventThrottle={16}
      />
      <GestureDetector gesture={handle}>
        <View style={st.handleArea}>
          <View style={st.handle} />
        </View>
      </GestureDetector>
      <DecideBar onDecide={onDecide} />
    </Animated.View>
  );
}

const st = StyleSheet.create({
  panel: { ...StyleSheet.absoluteFill, backgroundColor: colors.bg, overflow: 'hidden', zIndex: 5 },
  handleArea: { position: 'absolute', top: 0, left: 80, right: 80, height: 34, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.7)' },
});
