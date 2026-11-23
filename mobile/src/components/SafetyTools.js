import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../lib/api';
import { colors } from '../lib/theme';
import { s } from './ui';
import { confirmDeleteHistory, confirmSos, shareWithFriend, stopFriendLink } from '../lib/safety';

// SOS, "share with a friend" and "delete my history" — on the live share screen and the Safety screen.
export default function SafetyTools({ compact }) {
  const [status, setStatus] = useState(null);
  const load = useCallback(() => api('/safety/status').then(setStatus).catch(() => {}), []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const friendOn = !!status?.friendLink;
  const rows = [
    {
      icon: 'people',
      label: friendOn ? 'Stop sharing with your friend' : 'Share my location with a friend',
      onPress: () => (friendOn ? stopFriendLink() : shareWithFriend()).catch(() => {}).finally(load),
    },
    ...(compact ? [] : [{ icon: 'trash-outline', label: 'Delete my location history', onPress: () => confirmDeleteHistory(load) }]),
  ];

  return (
    <View style={{ gap: 10 }}>
      <Pressable
        onPress={() => confirmSos(load)}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          backgroundColor: '#d70015',
          borderRadius: 999,
          paddingVertical: compact ? 12 : 16,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Ionicons name="warning" size={20} color="#fff" />
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{status?.sos ? 'SOS sent · send again' : 'SOS'}</Text>
      </Pressable>
      {rows.map((r) => (
        <Pressable key={r.label} onPress={r.onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
          <Ionicons name={r.icon} size={20} color={colors.text} />
          <Text style={[s.text, { flex: 1 }]}>{r.label}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>
      ))}
      {friendOn && <Text style={[s.muted, { fontSize: 12 }]}>Your friend can follow you until {new Date(status.friendLink.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.</Text>}
    </View>
  );
}
