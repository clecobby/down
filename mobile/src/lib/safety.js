import { useEffect, useRef } from 'react';
import { Alert, Linking, Share } from 'react-native';
import * as Location from 'expo-location';
import { API, api } from './api';

// Safety helpers: send location while something is being shared (live share with a match, a friend
// link, or after an SOS), SOS, friend links and deleting your own history. The server decides what is
// active; the app just follows /safety/status and stops when the server answers 409.

const listeners = new Set();
// Ask the sender to re-check right away (after starting or stopping something).
export const kickSafety = () => listeners.forEach((fn) => fn());

export async function currentPosition() {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') throw new Error('Location permission is off. Turn it on in Settings to share where you are.');
  const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy };
}

// Mounted once while signed in. Watches position only while the server says something is active.
export function useSafetySender() {
  const watch = useRef(null);
  const lastSent = useRef(0);

  useEffect(() => {
    let stopped = false;

    const stopWatching = () => {
      watch.current?.remove();
      watch.current = null;
    };

    const send = async (coords) => {
      if (Date.now() - lastSent.current < 10_000) return;
      lastSent.current = Date.now();
      try {
        await api('/safety/location', { method: 'POST', body: { lat: coords.latitude, lng: coords.longitude, acc: coords.accuracy } });
      } catch (e) {
        if (e.status === 409) stopWatching(); // nothing is being shared any more
      }
    };

    const check = async () => {
      let status;
      try {
        status = await api('/safety/status');
      } catch {
        return;
      }
      const sharing = !!(status.live || status.friendLink || status.sos);
      if (!sharing) return stopWatching();
      if (watch.current || stopped) return;
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted' || stopped) return;
      lastSent.current = 0;
      watch.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 10_000, distanceInterval: 10 },
        (p) => send(p.coords),
      );
    };

    check();
    const timer = setInterval(check, 20_000);
    listeners.add(check);
    return () => {
      stopped = true;
      clearInterval(timer);
      listeners.delete(check);
      stopWatching();
    };
  }, []);
}

export async function shareWithFriend() {
  let pos = null;
  try {
    pos = await currentPosition();
  } catch (e) {
    return Alert.alert('Location is off', e.message);
  }
  const link = await api('/safety/friend-link', { method: 'POST', body: pos });
  kickSafety();
  const url = API + link.path;
  await Share.share({
    message: `I'm meeting someone from down. You can follow where I am for the next 6 hours: ${url}`,
    url,
  });
  return link;
}

export async function stopFriendLink() {
  await api('/safety/friend-link', { method: 'DELETE' });
  kickSafety();
}

export const callEmergency = () => Linking.openURL('tel:911');

// Confirm, then record where you are and flag it for the down team.
export function confirmSos(onSent) {
  Alert.alert(
    'Send SOS?',
    "This records where you are and flags it for the down team. If you're in danger, call 911 first.",
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Call 911', onPress: callEmergency },
      {
        text: 'Send SOS',
        style: 'destructive',
        onPress: async () => {
          let pos = null;
          try {
            pos = await currentPosition();
          } catch {}
          try {
            const r = await api('/safety/sos', { method: 'POST', body: pos || {} });
            kickSafety();
            onSent?.(r);
            Alert.alert('SOS sent', "We've recorded where you are. Keep the app open so it keeps updating. Want a friend to follow you too?", [
              { text: 'Not now', style: 'cancel' },
              { text: 'Share with a friend', onPress: () => shareWithFriend().catch(() => {}) },
            ]);
          } catch (e) {
            Alert.alert("Couldn't send SOS", `${e.message}. If you're in danger, call 911.`, [{ text: 'Call 911', onPress: callEmergency }, { text: 'OK' }]);
          }
        },
      },
    ],
  );
}

export function confirmDeleteHistory(onDone) {
  Alert.alert(
    'Delete your location history?',
    'This stops any sharing and deletes every location point of yours we have. It never touches anyone else’s.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const r = await api('/safety/locations', { method: 'DELETE' });
            kickSafety();
            Alert.alert(
              'Deleted',
              r.held
                ? `Your history is deleted, except ${r.held} point${r.held === 1 ? '' : 's'} kept for an open safety report. Those are deleted when it's resolved.`
                : 'Your location history is gone.',
            );
            onDone?.();
          } catch (e) {
            Alert.alert("Couldn't delete", e.message);
          }
        },
      },
    ],
  );
}
