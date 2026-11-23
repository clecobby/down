import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../lib/theme';
import { s } from '../components/ui';
import SafetyTools from '../components/SafetyTools';

// Safety tools outside a specific match (from the Profile tab).
export default function Safety() {
  return (
    <SafeAreaView style={s.screen}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10 }}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </Pressable>
        <Text style={s.h2}>Safety</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <Text style={[s.muted, { lineHeight: 20 }]}>
          Meeting someone? Open your chat with them and tap the shield to share live location both ways. Here you can also let a friend follow you, or send an SOS.
        </Text>
        <SafetyTools />
        <View style={{ gap: 6, marginTop: 8 }}>
          <Text style={s.label}>How your location is kept</Text>
          <Text style={[s.muted, { lineHeight: 20 }]}>
            Location you share is encrypted and deleted after 24 hours. You can delete yours sooner; you can never delete someone else's. If a report or SOS is
            filed, the trails involved are kept until the down team resolves it, then deleted. Only the down team can open a kept trail, and every look is logged.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
