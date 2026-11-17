import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { colors } from '../lib/theme';

const until = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// The "down" signal in a chat. Private by design: the other person only finds out when they're down too,
// so nobody is exposed or turned down. It expires on its own and can be withdrawn anytime.
export default function DownSignal({ down, name, onSend, onWithdraw, onPlan }) {
  if (!down) return null;

  if (down.both)
    return (
      <Animated.View entering={FadeIn.duration(300)} style={[st.box, st.both]}>
        <Text style={st.bothTitle}>🔥 You're both down</Text>
        <Text style={st.text}>Take it from here, and keep it good for both of you:</Text>
        <View style={{ gap: 4, marginTop: 4 }}>
          <Text style={st.tip}>• Meet somewhere public first</Text>
          <Text style={st.tip}>• Tell a friend where you'll be</Text>
          <Text style={st.tip}>• Check in with each other — anyone can change their mind, anytime</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
          <Pressable onPress={onPlan} style={st.primary}>
            <Text style={st.primaryText}>📍 Suggest where to meet</Text>
          </Pressable>
          <Pressable onPress={onWithdraw} hitSlop={8}>
            <Text style={st.link}>Not anymore</Text>
          </Pressable>
        </View>
      </Animated.View>
    );

  if (down.mine)
    return (
      <View style={[st.box, st.row]}>
        <View style={{ flex: 1 }}>
          <Text style={st.title}>😏 You're down</Text>
          <Text style={st.text}>
            {name} only finds out if they're down too · until {until(down.mineExpiresAt)}
          </Text>
        </View>
        <Pressable onPress={onWithdraw} hitSlop={8}>
          <Text style={st.link}>Withdraw</Text>
        </Pressable>
      </View>
    );

  return (
    <View style={[st.box, st.row]}>
      <View style={{ flex: 1 }}>
        <Text style={st.title}>😏 Down?</Text>
        <Text style={st.text}>Private: {name} only finds out if they're down too.</Text>
      </View>
      <Pressable onPress={onSend} style={st.primary}>
        <Text style={st.primaryText}>I'm down</Text>
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  box: { marginHorizontal: 12, marginTop: 10, padding: 12, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  both: { borderColor: colors.accent, backgroundColor: 'rgba(255,45,85,0.10)' },
  title: { color: colors.text, fontWeight: '700', fontSize: 15 },
  bothTitle: { color: colors.accent, fontWeight: '900', fontSize: 20, letterSpacing: -0.4, marginBottom: 2 },
  text: { color: colors.muted, fontSize: 13, marginTop: 2, lineHeight: 18 },
  tip: { color: colors.text, fontSize: 13 },
  primary: { backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 },
  primaryText: { color: '#fff', fontWeight: '700' },
  link: { color: colors.muted, fontSize: 13, textDecorationLine: 'underline' },
});
