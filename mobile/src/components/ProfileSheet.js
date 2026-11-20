import { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../lib/theme';
import { photoUrl } from '../lib/api';
import { distanceLabel } from './SwipeCard';

const GENDER = { woman: 'Woman', man: 'Man', nonbinary: 'Non-binary' };

// Profile preview as a page sheet (used for "Preview my profile"). Discover uses ProfileContent in its pull-up panel.
// onDecide('like' | 'pass') closes the sheet and swipes the card.
export default function ProfileSheet({ user, onClose, onDecide }) {
  if (!user) return null;
  return (
    <Modal visible animationType="slide" presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined} onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ProfileContent user={user} onClose={onClose} />
        <DecideBar onDecide={onDecide} />
      </View>
    </Modal>
  );
}

// The scrollable full profile: photo gallery, what you have in common, details. Extra props go to the ScrollView.
export function ProfileContent({ user, onClose, initialPage = 0, ...scrollProps }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(initialPage);
  const photos = user.photos?.length ? user.photos : user.photo ? [user.photo] : [];
  const photoH = Math.round(width * 1.25);
  const common = user.inCommon || [];

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 120 + insets.bottom }} {...scrollProps}>
      <View>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: initialPage * width, y: 0 }}
          onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        >
          {photos.map((p, i) => (
            <Image key={p + i} source={photoUrl(p)} style={{ width, height: photoH, backgroundColor: colors.surface2 }} contentFit="cover" transition={120} />
          ))}
        </ScrollView>
        {photos.length > 1 && (
          <View style={st.bars} pointerEvents="none">
            {photos.map((p, i) => (
              <View key={p + i} style={[st.bar, i === page && st.barOn]} />
            ))}
          </View>
        )}
        <Pressable onPress={onClose} hitSlop={12} style={st.close}>
          <Ionicons name="chevron-down" size={24} color="#fff" />
        </Pressable>
      </View>

      <View style={{ padding: 20, gap: 14 }}>
        <View>
          <Text style={st.name}>
            {user.name} <Text style={{ fontWeight: '400' }}>{user.age}</Text>
          </Text>
          <Text style={st.muted}>
            @{user.username}
            {'  ·  '}
            {user.sameCounty ? `In ${user.county}` : user.county}
            {distanceLabel(user)}
          </Text>
          {user.availableNow && <Text style={{ color: colors.ok, marginTop: 4 }}>● Available now</Text>}
        </View>

        {common.length > 0 && (
          <View style={[st.section, st.commonBox]}>
            <Text style={[st.label, { color: colors.accent }]}>🔥 You're both into</Text>
            <View style={st.chips}>
              {common.slice(0, 3).map((t) => (
                <View key={t.id} style={st.commonChip}>
                  <Text style={st.commonChipText}>
                    {t.emoji} {t.label}
                  </Text>
                </View>
              ))}
            </View>
            {common.length > 3 && <Text style={[st.muted, { marginTop: 8 }]}>+ {common.length - 3} more — find out together.</Text>}
          </View>
        )}

        {user.tags?.length > 0 && (
          <View style={st.chips}>
            {user.tags.map((t) => (
              <View key={t} style={st.tag}>
                <Text style={st.tagText}>{t}</Text>
              </View>
            ))}
          </View>
        )}

        {!!user.bio && (
          <View style={st.section}>
            <Text style={st.label}>About</Text>
            <Text style={st.body}>{user.bio}</Text>
          </View>
        )}

        <View style={st.section}>
          {!!user.lookingFor && <Row icon="heart-outline" text={`Looking for ${user.lookingFor}`} />}
          {user.heightCm != null && <Row icon="resize-outline" text={`${user.heightCm} cm`} />}
          <Row icon={user.gender === 'woman' ? 'female' : user.gender === 'man' ? 'male' : 'male-female'} text={GENDER[user.gender] || user.gender} />
          <Row icon="location-outline" text={`${user.county}${distanceLabel(user)}`} />
        </View>
      </View>
    </ScrollView>
  );
}

// ✕ / ♥ pinned to the bottom of the full profile.
export function DecideBar({ onDecide }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[st.actions, { paddingBottom: insets.bottom + 16 }]}>
      <Pressable onPress={() => onDecide('pass')} style={[st.round, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <Ionicons name="close" size={30} color={colors.text} />
      </Pressable>
      <Pressable onPress={() => onDecide('like')} style={[st.round, { backgroundColor: colors.accent, borderColor: colors.accent }]}>
        <Ionicons name="heart" size={30} color="#fff" />
      </Pressable>
    </View>
  );
}

function Row({ icon, text }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
      <Ionicons name={icon} size={18} color={colors.muted} />
      <Text style={st.body}>{text}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  name: { color: colors.text, fontSize: 32, fontWeight: '900', letterSpacing: -1 },
  muted: { color: colors.muted, marginTop: 2 },
  commonBox: { borderWidth: 1, borderColor: colors.accent, backgroundColor: 'rgba(255,45,85,0.08)' },
  commonChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: colors.accent },
  commonChipText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  label: { color: colors.muted, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  body: { color: colors.text, fontSize: 16, lineHeight: 22 },
  section: { backgroundColor: colors.surface, borderRadius: 18, padding: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.accentSoft },
  tagText: { color: colors.accent, fontWeight: '600', fontSize: 14 },
  bars: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', gap: 4 },
  bar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)' },
  barOn: { backgroundColor: '#fff' },
  close: {
    position: 'absolute',
    top: 26,
    right: 14,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 28,
    paddingTop: 16,
    backgroundColor: 'rgba(10,10,11,0.92)',
  },
  round: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});
