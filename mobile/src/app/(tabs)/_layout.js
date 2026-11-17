import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../lib/theme';

function TabIcon({ name, color, focused }) {
  return <Ionicons name={focused ? name : `${name}-outline`} size={24} color={color} />;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.line },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="discover" options={{ title: 'Discover', tabBarIcon: (p) => <TabIcon name="flame" {...p} /> }} />
      <Tabs.Screen name="matches" options={{ title: 'Matches', tabBarIcon: (p) => <TabIcon name="chatbubbles" {...p} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Me', tabBarIcon: (p) => <TabIcon name="person" {...p} /> }} />
    </Tabs>
  );
}
