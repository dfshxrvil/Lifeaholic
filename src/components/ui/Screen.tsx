import { PropsWithChildren } from 'react';
import { Platform, ScrollView, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { layout } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';

type Props = PropsWithChildren<{ scroll?: boolean; style?: StyleProp<ViewStyle>; contentStyle?: StyleProp<ViewStyle> }>;

export function Screen({ children, scroll = false, style, contentStyle }: Props) {
  const { colors } = useTheme();
  const content = <View style={[styles.content, contentStyle]}>{children}</View>;
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safe, { backgroundColor: colors.background }, style]}>
      {scroll ? <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>{content}</ScrollView> : content}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1 },
  content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', flex: 1, paddingHorizontal: Platform.OS === 'web' ? 28 : 20 },
});
