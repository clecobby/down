import { useCallback, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../lib/api';
import { colors } from '../../lib/theme';
import { Avatar, Label, Logo, s } from '../../components/ui';

const ago = (t) => {
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h`;
  return `${Math.floor(m / 1440)}d`;
};

export default function Matches() {
  const [list, setList] = useState(null);

  // Poll while this tab is visible.
  useFocusEffect(
    useCallback(() => {
      const load = () => api('/matches').then(setList).catch(() => setList([]));
      load();
      const t = setInterval(load, 5000);
      return () => clearInterval(t);
    }, []),
  );

  const fresh = list?.filter((m) => !m.lastMessage) || [];
  const talking = list?.filter((m) => m.lastMessage) || [];

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <View style={{ paddingHorizontal: 20, paddingVertical: 12 }}>
        <Logo />
      </View>
      <FlatList
        data={talking}
        keyExtractor={(m) => String(m.id)}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
        ListHeaderComponent={
          <>
            {list?.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 60, gap: 8 }}>
                <Text style={s.h2}>No matches yet.</Text>
                <Text style={s.muted}>Swipe right on people you're down with.</Text>
              </View>
            )}
            {fresh.length > 0 && (
              <>
                <Label>New</Label>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingVertical: 12 }}>
                  {fresh.map((m) => (
                    <Pressable key={m.id} onPress={() => router.push(`/chat/${m.id}`)} style={{ alignItems: 'center', gap: 6 }}>
                      <Avatar uri={m.user.photo} size={72} ring />
                      <Text style={[s.text, { fontSize: 13 }]}>{m.user.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}
            {talking.length > 0 && <Label>Talking</Label>}
          </>
        }
        renderItem={({ item: m }) => (
          <Pressable
            onPress={() => router.push(`/chat/${m.id}`)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line }}
          >
            <Avatar uri={m.user.photo} />
            <View style={{ flex: 1 }}>
              <Text style={[s.text, { fontWeight: '700' }]}>
                {m.user.name}
                {m.user.availableNow && <Text style={{ color: colors.ok }}> ●</Text>}
              </Text>
              <Text style={s.muted} numberOfLines={1}>
                {m.lastMessage}
              </Text>
            </View>
            <Text style={[s.muted, { fontSize: 12 }]}>{ago(m.lastAt)}</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}
