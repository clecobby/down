import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { api, photoUrl } from '../../lib/api';
import { deleteUser } from '../../lib/cognito';
import { useMe } from '../../lib/me';
import { colors } from '../../lib/theme';
import { Button, Chip, Input, Label, Logo, Sheet, s } from '../../components/ui';
import ProfileSheet from '../../components/ProfileSheet';

const GENDERS = [
  ['woman', 'Women'],
  ['man', 'Men'],
  ['nonbinary', 'Non-binary'],
];

export default function Profile() {
  const { me, setMe, logout } = useMe();
  const [f, setF] = useState({
    username: me.username || '',
    name: me.name,
    bio: me.bio,
    interestedIn: me.interestedIn,
    tags: me.tags || [],
    heightCm: me.heightCm ? String(me.heightCm) : '',
  });
  const [msg, setMsg] = useState('');
  const [allTags, setAllTags] = useState([]);
  const [photoMenu, setPhotoMenu] = useState(null); // index of the photo whose menu is open
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    api('/tags').then(setAllTags).catch(() => {});
  }, []);
  const flash = (m) => {
    setMsg(m);
    setTimeout(() => setMsg(''), 1800);
  };

  const save = async (patch) => {
    try {
      setMe(await api('/me', { method: 'PATCH', body: patch }));
      flash('Saved');
    } catch (e) {
      flash(e.message);
    }
  };

  const photoAction = async (path) => {
    try {
      setMe(await api(path, { method: path.endsWith('/main') ? 'POST' : 'DELETE' }));
    } catch (e) {
      flash(e.message);
    }
  };

  async function pickPhoto() {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [3, 4], quality: 0.8 });
    if (r.canceled) return;
    const a = r.assets[0];
    const type = a.mimeType || 'image/jpeg';
    const form = new FormData();
    form.append('photo', { uri: a.uri, name: a.fileName || `photo.${type.split('/')[1]}`, type });
    try {
      setMe(await api('/me/photo', { method: 'POST', form }));
    } catch (e) {
      flash(e.message);
    }
  }

  const toggleTag = (t) =>
    setF({ ...f, tags: f.tags.includes(t) ? f.tags.filter((x) => x !== t) : f.tags.length < 5 ? [...f.tags, t] : f.tags });

  const toggle = (g) =>
    setF({ ...f, interestedIn: f.interestedIn.includes(g) ? f.interestedIn.filter((x) => x !== g) : [...f.interestedIn, g] });

  const remove = () =>
    Alert.alert('Delete account?', 'This removes your profile, matches and messages. It cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await api('/me', { method: 'DELETE' });
          await deleteUser(); // removes the Cognito account too
          setMe(null);
        },
      },
    ]);

  const area = me.county ? `${me.county}${me.region && me.region !== me.county ? `, ${me.region}` : ''}` : 'Location off — enable it from Discover';

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 }}>
        <Logo />
        {!!msg && <Text style={{ color: colors.accent, fontSize: 13 }}>{msg}</Text>}
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 0, gap: 10 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Label>Photos ({me.photos.length}/6)</Label>
            <Pressable onPress={() => setPreview(true)} hitSlop={8}>
              <Text style={{ color: colors.accent, fontSize: 13, marginTop: 10 }}>Preview my profile</Text>
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[0, 1, 2, 3, 4, 5].map((i) => {
              const p = me.photos[i];
              return (
                <Pressable
                  key={i}
                  onPress={() => (p ? setPhotoMenu(i) : pickPhoto())}
                  disabled={!p && i !== me.photos.length}
                  style={{
                    width: '31.8%',
                    aspectRatio: 3 / 4,
                    borderRadius: 14,
                    overflow: 'hidden',
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: i === 0 && p ? colors.accent : colors.line,
                    borderStyle: p ? 'solid' : 'dashed',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: !p && i !== me.photos.length ? 0.4 : 1,
                  }}
                >
                  {p ? (
                    <Image source={photoUrl(p)} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  ) : (
                    <Text style={[s.muted, { fontSize: 24 }]}>+</Text>
                  )}
                  {i === 0 && p && (
                    <View style={{ position: 'absolute', bottom: 6, left: 6, backgroundColor: colors.accent, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>MAIN</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: me.availableNow ? colors.ok : colors.line }}>
            <View style={{ flex: 1 }}>
              <Text style={[s.text, { fontWeight: '700' }]}>Available now</Text>
              <Text style={[s.muted, { fontSize: 12 }]}>Show up first for people looking tonight</Text>
            </View>
            <Switch value={me.availableNow} onValueChange={(v) => save({ availableNow: v })} trackColor={{ true: colors.ok }} />
          </View>

          <Label>Username</Label>
          <Input prefix="@" value={f.username} maxLength={20} autoCapitalize="none" autoCorrect={false} onChangeText={(v) => setF({ ...f, username: v.toLowerCase().replace(/\s/g, '') })} />
          <Label>Area</Label>
          <Text style={s.muted}>{area}</Text>
          <Label>Name</Label>
          <Input value={f.name} onChangeText={(v) => setF({ ...f, name: v })} />
          <Label>About ({300 - f.bio.length})</Label>
          <Input
            value={f.bio}
            onChangeText={(v) => setF({ ...f, bio: v })}
            multiline
            maxLength={300}
            placeholder="Keep it short. Hint, don't spell it out."
            style={{ minHeight: 90, alignItems: 'flex-start' }}
          />
          <Label>Vibe (up to 5)</Label>
          <View style={s.chips}>
            {allTags.map((t) => (
              <Chip key={t} label={t} on={f.tags.includes(t)} onPress={() => toggleTag(t)} />
            ))}
          </View>
          <Label>Height (cm)</Label>
          <Input value={f.heightCm} onChangeText={(v) => setF({ ...f, heightCm: v.replace(/\D/g, '').slice(0, 3) })} keyboardType="number-pad" placeholder="Optional" />
          <Label>Show me</Label>
          <View style={s.chips}>
            {GENDERS.map(([v, l]) => (
              <Chip key={v} label={l} on={f.interestedIn.includes(v)} onPress={() => toggle(v)} />
            ))}
          </View>
          <View style={{ gap: 12, marginTop: 16 }}>
            <Button title="Save" onPress={() => save({ ...f, heightCm: f.heightCm || null })} />
            <Button title="Log out" variant="ghost" onPress={logout} />
            <Pressable onPress={remove} style={{ padding: 12, alignItems: 'center' }}>
              <Text style={{ color: colors.accent }}>Delete account</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Sheet
        visible={photoMenu != null}
        onClose={() => setPhotoMenu(null)}
        options={[
          ...(photoMenu ? [{ label: 'Make main photo', onPress: () => photoAction(`/me/photos/${photoMenu}/main`) }] : []),
          { label: 'Remove photo', danger: true, onPress: () => photoAction(`/me/photos/${photoMenu}`) },
        ]}
      />
      {preview && <ProfileSheet user={me} onClose={() => setPreview(false)} onDecide={() => setPreview(false)} />}
    </SafeAreaView>
  );
}
