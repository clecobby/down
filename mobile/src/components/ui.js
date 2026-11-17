import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../lib/theme';
import { photoUrl } from '../lib/api';

export function Logo({ size = 24 }) {
  return (
    <Text style={{ color: colors.text, fontSize: size, fontWeight: '900', letterSpacing: -size * 0.04 }}>
      down<Text style={{ color: colors.accent }}>.</Text>
    </Text>
  );
}

export function Button({ title, onPress, variant = 'primary', small, disabled, style }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.btn,
        variant === 'primary' ? s.primary : s.ghost,
        small && s.small,
        (pressed || disabled) && { opacity: 0.6 },
        style,
      ]}
    >
      <Text style={[s.btnText, small && { fontSize: 14 }]}>{title}</Text>
    </Pressable>
  );
}

export function Input({ style, prefix, ...props }) {
  return (
    <View style={[s.inputWrap, style]}>
      {prefix && <Text style={s.prefix}>{prefix}</Text>}
      <TextInput placeholderTextColor={colors.muted} style={s.input} keyboardAppearance="dark" {...props} />
    </View>
  );
}

export function Chip({ label, on, onPress }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, on && s.chipOn]}>
      <Text style={[s.chipText, on && { color: colors.bg }]}>{label}</Text>
    </Pressable>
  );
}

export const Label = ({ children }) => <Text style={s.label}>{children}</Text>;

export function Avatar({ uri, size = 52, ring }) {
  return (
    <Image
      source={photoUrl(uri)}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surface2, borderWidth: ring ? 2 : 0, borderColor: colors.accent }}
      contentFit="cover"
    />
  );
}

// Bottom sheet with a list of options. options: [{ label, onPress, danger }]
export function Sheet({ visible, title, options, onClose }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.sheetBackdrop} onPress={onClose}>
        <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
          {title && <Text style={s.sheetTitle}>{title}</Text>}
          {options.map((o) => (
            <Pressable
              key={o.label}
              style={s.sheetRow}
              onPress={() => {
                onClose();
                o.onPress();
              }}
            >
              <Text style={[s.sheetText, o.danger && { color: colors.accent }]}>{o.label}</Text>
            </Pressable>
          ))}
          <Pressable style={s.sheetRow} onPress={onClose}>
            <Text style={[s.sheetText, { color: colors.muted }]}>Cancel</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  muted: { color: colors.muted },
  text: { color: colors.text },
  h1: { color: colors.text, fontSize: 40, fontWeight: '900', letterSpacing: -1.6 },
  h2: { color: colors.text, fontSize: 22, fontWeight: '700', letterSpacing: -0.4 },
  btn: { borderRadius: 999, paddingVertical: 16, alignItems: 'center' },
  primary: { backgroundColor: colors.accent },
  ghost: { borderWidth: 1, borderColor: colors.line },
  small: { paddingVertical: 10, paddingHorizontal: 16 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 12 },
  prefix: { color: colors.muted, paddingLeft: 16, fontSize: 16 },
  input: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: 14, paddingHorizontal: 16 },
  chip: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: colors.line },
  chipOn: { backgroundColor: colors.text, borderColor: colors.text },
  chipText: { color: colors.text, fontSize: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  label: { color: colors.muted, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', marginTop: 10 },
  error: { color: colors.accent, fontSize: 14 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface2, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8 },
  sheetTitle: { color: colors.muted, textAlign: 'center', paddingVertical: 12, fontSize: 13 },
  sheetRow: { paddingVertical: 16, alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  sheetText: { color: colors.text, fontSize: 17 },
});
