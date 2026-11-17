import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { api, setUnauthorizedHandler } from '../lib/api';
import { loadSession, signOut } from '../lib/cognito';
import { MeContext } from '../lib/me';
import { colors } from '../lib/theme';
import { Logo } from '../components/ui';

export default function RootLayout() {
  // loading → out (no Cognito session) | setup (signed in, no profile yet) | in
  const [status, setStatus] = useState('loading');
  const [me, setMeState] = useState(null);

  const setMe = useCallback((u) => {
    setMeState(u);
    setStatus(u ? 'in' : 'out');
  }, []);

  const logout = useCallback(async () => {
    await signOut();
    setMe(null);
  }, [setMe]);

  // After sign-in (or on launch): load the profile, or send a new account to setup.
  const refresh = useCallback(
    () =>
      loadSession()
        .then((signedIn) => (signedIn ? api('/me').then(setMe) : setMe(null)))
        .catch((e) => (e.data?.needsProfile ? setStatus('setup') : logout())),
    [setMe, logout],
  );

  useEffect(() => {
    setUnauthorizedHandler(logout);
    refresh();
  }, [refresh, logout]);

  if (status === 'loading')
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Logo size={48} />
      </View>
    );

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <MeContext.Provider value={{ me, setMe, status, refresh, logout }}>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'fade' }}>
          <Stack.Screen name="index" />
          <Stack.Protected guard={status === 'out'}>
            <Stack.Screen name="signup" />
            <Stack.Screen name="login" />
            <Stack.Screen name="confirm" />
            <Stack.Screen name="reset" />
          </Stack.Protected>
          <Stack.Protected guard={status === 'setup'}>
            <Stack.Screen name="setup" />
          </Stack.Protected>
          <Stack.Protected guard={status === 'in'}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="chat/[id]" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="turnons" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
          </Stack.Protected>
        </Stack>
      </MeContext.Provider>
    </GestureHandlerRootView>
  );
}
