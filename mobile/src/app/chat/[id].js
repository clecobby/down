import { useCallback, useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { api } from '../../lib/api';
import { useMe } from '../../lib/me';
import { colors } from '../../lib/theme';
import { Avatar, Button, Chip, Input, Sheet, s } from '../../components/ui';
import DownSignal from '../../components/DownSignal';
import * as Haptics from 'expo-haptics';

const OPENERS = ['Hey 👋', 'So… tonight?', 'Drink first?', 'Your place or mine?', 'What are you up to later?'];
const REPORT_REASONS = ['Fake profile', 'Harassment or threats', 'Inappropriate photos', 'Asked for money', 'Seems underage'];

const fmt = (iso) => new Date(iso).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// Handy presets so suggesting a time is one tap.
function presets() {
  const at = (days, h) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(h, 0, 0, 0);
    return d;
  };
  const tonight = at(0, 21);
  return [
    ['In an hour', new Date(Date.now() + 60 * 60 * 1000)],
    ...(tonight > new Date() ? [['Tonight 9pm', tonight]] : []),
    ['Tomorrow 8pm', at(1, 20)],
  ];
}

export default function Chat() {
  const { id } = useLocalSearchParams();
  const { me } = useMe();
  const [chat, setChat] = useState(null);
  const [text, setText] = useState('');
  const [planning, setPlanning] = useState(false);
  const [plan, setPlan] = useState({ place: '', time: null });
  const [picker, setPicker] = useState(null); // null | 'date' | 'time'
  const [sheet, setSheet] = useState(null); // null | 'menu' | 'report'

  const load = useCallback(
    () =>
      api(`/matches/${id}`)
        .then(setChat)
        .catch(() => router.back()),
    [id],
  );

  useFocusEffect(
    useCallback(() => {
      load();
      const t = setInterval(load, 3000);
      return () => clearInterval(t);
    }, [load]),
  );

  // Messages and meetup invites in one timeline, newest first for the inverted list.
  const timeline = useMemo(() => {
    if (!chat) return [];
    return [...chat.messages.map((m) => ({ ...m, kind: 'msg' })), ...chat.meetups.map((m) => ({ ...m, kind: 'meet' }))].sort(
      (a, b) => b.createdAt - a.createdAt,
    );
  }, [chat]);

  async function send(body) {
    if (!body.trim()) return;
    setText('');
    await api(`/matches/${id}/messages`, { method: 'POST', body: { body } }).catch(() => {});
    load();
  }

  async function propose() {
    if (!plan.place.trim() || !plan.time) return;
    await api(`/matches/${id}/meetups`, { method: 'POST', body: { place: plan.place, time: plan.time.toISOString() } });
    setPlanning(false);
    setPlan({ place: '', time: null });
    load();
  }

  // Private "down" signal: only revealed when both have sent it.
  async function setDown(on) {
    const wasBoth = chat.down?.both;
    try {
      const down = await api(`/matches/${id}/down`, { method: on ? 'POST' : 'DELETE' });
      setChat((c) => ({ ...c, down }));
      if (down.both && !wasBoth) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
  }

  async function respond(mid, status) {
    await api(`/matches/${id}/meetups/${mid}`, { method: 'POST', body: { status } });
    load();
  }

  const leave = async (path, body) => {
    await api(path, { method: body ? 'POST' : 'DELETE', body }).catch(() => {});
    router.back();
  };

  if (!chat) return <View style={s.screen} />;
  const u = chat.user;

  return (
    <SafeAreaView style={s.screen}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line }}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </Pressable>
        <Avatar uri={u.photo} size={36} />
        <View style={{ flex: 1 }}>
          <Text style={[s.text, { fontWeight: '700' }]}>
            {u.name}, {u.age} <Text style={[s.muted, { fontWeight: '400', fontSize: 12 }]}>@{u.username}</Text>
          </Text>
          <Text style={[s.muted, { fontSize: 12 }]}>
            {u.availableNow && <Text style={{ color: colors.ok }}>● available now · </Text>}
            {u.county}
            {u.distanceMi != null && ` · ~${u.distanceMi} mi away`}
          </Text>
        </View>
        <Pressable onPress={() => setSheet('menu')} hitSlop={12}>
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
        </Pressable>
      </View>

      <DownSignal down={chat.down} name={u.name} onSend={() => setDown(true)} onWithdraw={() => setDown(false)} onPlan={() => setPlanning(true)} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        {timeline.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 16 }}>
            <Text style={[s.muted, { textAlign: 'center' }]}>You already know why you're both here. Keep it easy.</Text>
            <View style={[s.chips, { justifyContent: 'center' }]}>
              {OPENERS.map((o) => (
                <Chip key={o} label={o} onPress={() => send(o)} />
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            inverted
            data={timeline}
            keyExtractor={(t) => t.kind + t.id}
            contentContainerStyle={{ padding: 16, gap: 6 }}
            renderItem={({ item: t }) =>
              t.kind === 'msg' ? (
                <View
                  style={{
                    maxWidth: '78%',
                    alignSelf: t.senderId === me.id ? 'flex-end' : 'flex-start',
                    backgroundColor: t.senderId === me.id ? colors.accent : colors.surface2,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 20,
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 16, lineHeight: 21 }}>{t.body}</Text>
                </View>
              ) : (
                <MeetCard t={t} me={me} name={u.name} onRespond={respond} />
              )
            }
          />
        )}

        {planning && (
          <View style={{ padding: 12, gap: 10, borderTopWidth: 1, borderTopColor: colors.line }}>
            <Input placeholder="Where? (bar, café, …)" value={plan.place} onChangeText={(place) => setPlan({ ...plan, place })} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {presets().map(([label, d]) => (
                <Chip key={label} label={label} on={plan.time?.getTime() === d.getTime()} onPress={() => setPlan({ ...plan, time: d })} />
              ))}
              <Chip label={plan.time ? fmt(plan.time) : 'Pick a time…'} on={false} onPress={() => setPicker('date')} />
            </ScrollView>
            {picker && (
              <DateTimePicker
                value={plan.time || new Date()}
                // Android has no combined picker, so it goes date → time.
                mode={Platform.OS === 'ios' ? 'datetime' : picker}
                minimumDate={new Date()}
                themeVariant="dark"
                onChange={(e, d) => {
                  if (e.type === 'dismissed') return setPicker(null);
                  if (d) setPlan((p) => ({ ...p, time: d }));
                  if (Platform.OS === 'android') setPicker(picker === 'date' ? 'time' : null);
                }}
              />
            )}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title="Send invite" small onPress={propose} disabled={!plan.place.trim() || !plan.time} />
              <Button
                title="Cancel"
                small
                variant="ghost"
                onPress={() => {
                  setPlanning(false);
                  setPicker(null);
                }}
              />
            </View>
          </View>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: colors.line }}>
          <Pressable onPress={() => setPlanning(!planning)} hitSlop={8}>
            <Ionicons name="location" size={24} color={planning ? colors.accent : colors.muted} />
          </Pressable>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Message"
            placeholderTextColor={colors.muted}
            keyboardAppearance="dark"
            onSubmitEditing={() => send(text)}
            returnKeyType="send"
            style={{ flex: 1, color: colors.text, backgroundColor: colors.surface, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, fontSize: 16 }}
          />
          <Pressable
            onPress={() => send(text)}
            disabled={!text.trim()}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', opacity: text.trim() ? 1 : 0.3 }}
          >
            <Ionicons name="arrow-up" size={22} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <Sheet
        visible={sheet === 'menu'}
        onClose={() => setSheet(null)}
        options={[
          { label: 'Unmatch', onPress: () => leave(`/matches/${id}`) },
          { label: 'Block', onPress: () => leave('/block', { userId: u.id }) },
          { label: 'Report', danger: true, onPress: () => setTimeout(() => setSheet('report'), 300) },
        ]}
      />
      <Sheet
        visible={sheet === 'report'}
        title={`Why are you reporting ${u.name}?`}
        onClose={() => setSheet(null)}
        options={REPORT_REASONS.map((reason) => ({ label: reason, danger: true, onPress: () => leave('/report', { userId: u.id, reason }) }))}
      />
    </SafeAreaView>
  );
}

function MeetCard({ t, me, name, onRespond }) {
  const mine = t.proposerId === me.id;
  return (
    <View
      style={{
        alignSelf: 'center',
        width: '85%',
        marginVertical: 10,
        padding: 16,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: t.status === 'accepted' ? colors.ok : colors.line,
        backgroundColor: colors.surface,
        alignItems: 'center',
        gap: 4,
        opacity: t.status === 'declined' ? 0.5 : 1,
      }}
    >
      <Text style={{ color: colors.accent, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' }}>{mine ? 'You suggested' : `${name} suggested`}</Text>
      <Text style={[s.text, { fontSize: 18, fontWeight: '700', textAlign: 'center' }]}>{t.place}</Text>
      <Text style={s.muted}>{fmt(t.time)}</Text>
      {t.status === 'pending' && !mine && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <Button title="I'm down" small onPress={() => onRespond(t.id, 'accepted')} />
          <Button title="Not this time" small variant="ghost" onPress={() => onRespond(t.id, 'declined')} />
        </View>
      )}
      {t.status === 'pending' && mine && <Text style={[s.muted, { fontSize: 12 }]}>Waiting for {name}…</Text>}
      {t.status === 'accepted' && (
        <>
          <Text style={{ color: colors.ok, fontWeight: '700', marginTop: 6 }}>It's on ✓</Text>
          <Text style={[s.muted, { fontSize: 12 }]}>Meet in public first & tell a friend.</Text>
        </>
      )}
      {t.status === 'declined' && <Text style={[s.muted, { fontSize: 12 }]}>Declined</Text>}
    </View>
  );
}
