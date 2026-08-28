import { GripVertical } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { LinearTransition, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { CompactTaskRow } from '@/components/tasks/CompactTaskRow';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { motion, priorityColors, priorityLabels } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import type { TaskPriority, TaskWithSubtasks } from '@/types/database';

const priorities: TaskPriority[] = ['red', 'yellow', 'blue', 'green'];
const priorityRows: TaskPriority[][] = [priorities.slice(0, 2), priorities.slice(2, 4)];
type DropFrame = { x: number; y: number; width: number; height: number };
type DropFrames = Partial<Record<TaskPriority, DropFrame>>;

function DraggableTask({ task, dropFrames, onComplete, onMove, onRename, onDraggingChange }: { task: TaskWithSubtasks; dropFrames: DropFrames; onComplete: () => void; onMove: (priority: TaskPriority) => void; onRename: (title: string) => void | Promise<void>; onDraggingChange: (dragging: boolean, priority: TaskPriority) => void }) {
  const { colors } = useTheme(); const reduceMotion = useReducedMotion(); const x = useSharedValue(0); const y = useSharedValue(0); const lift = useSharedValue(0);
  const drop = useCallback((absoluteX: number, absoluteY: number) => {
    const target = priorities.find((priority) => { const frame = dropFrames[priority]; return frame && absoluteX >= frame.x && absoluteX <= frame.x + frame.width && absoluteY >= frame.y && absoluteY <= frame.y + frame.height; });
    if (target && target !== task.priority) { void Haptics.selectionAsync().catch(() => undefined); onMove(target); }
  }, [dropFrames, onMove, task.priority]);
  const gesture = Gesture.Pan().minDistance(7).shouldCancelWhenOutside(false)
    .onBegin(() => { lift.value = reduceMotion ? 1 : withSpring(1, motion.spring); runOnJS(onDraggingChange)(true, task.priority); })
    .onUpdate((event) => { x.value = event.translationX; y.value = event.translationY; })
    .onFinalize((event) => {
      runOnJS(drop)(event.absoluteX, event.absoluteY); runOnJS(onDraggingChange)(false, task.priority);
      lift.value = reduceMotion ? 0 : withSpring(0, { damping: 13, stiffness: 220 }); x.value = reduceMotion ? 0 : withSpring(0, { damping: 13, stiffness: 220 }); y.value = reduceMotion ? 0 : withSpring(0, { damping: 13, stiffness: 220 });
    });
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: 1 + lift.value * 0.05 }, { rotate: `${lift.value * 2}deg` }],
    zIndex: lift.value > 0 ? 100 : 1, opacity: 1 - lift.value * 0.04,
    shadowColor: '#000', shadowOpacity: lift.value * 0.34, shadowRadius: lift.value * 18, shadowOffset: { width: 0, height: lift.value * 10 }, elevation: lift.value * 16,
  }));
  return <GestureDetector gesture={gesture}><Animated.View layout={reduceMotion ? undefined : LinearTransition.springify().damping(13).stiffness(190)} style={animatedStyle}><CompactTaskRow task={task} onToggle={onComplete} onRename={onRename} showColorDot={false} showDate={false} dragHandle={<View style={styles.dragHandle}><GripVertical size={14} color={colors.textMuted} /></View>} /></Animated.View></GestureDetector>;
}

export function MatrixBoard({ tasks, onComplete, onMove, onRename, onOpenQuadrant }: { tasks: TaskWithSubtasks[]; onComplete: (task: TaskWithSubtasks) => void; onMove: (task: TaskWithSubtasks, priority: TaskPriority) => void; onRename: (task: TaskWithSubtasks, title: string) => void | Promise<void>; onOpenQuadrant: (priority: TaskPriority) => void }) {
  const { colors } = useTheme(); const quadrantRefs = useRef<Partial<Record<TaskPriority, View | null>>>({}); const [dropFrames, setDropFrames] = useState<DropFrames>({}); const [draggingPriority, setDraggingPriority] = useState<TaskPriority | null>(null);
  const measureQuadrant = useCallback((priority: TaskPriority) => { quadrantRefs.current[priority]?.measureInWindow((x, y, width, height) => setDropFrames((current) => ({ ...current, [priority]: { x, y, width, height } }))); }, []);
  return <View style={styles.grid}>{priorityRows.map((row, rowIndex) => <View key={rowIndex} style={styles.row}>{row.map((priority) => { const items = tasks.filter((task) => task.priority === priority); const lifted = draggingPriority === priority; return <View collapsable={false} ref={(node) => { quadrantRefs.current[priority] = node; }} onLayout={() => measureQuadrant(priority)} key={priority} style={[styles.quadrant, lifted && styles.liftedQuadrant, { backgroundColor: colors.card, borderColor: lifted ? priorityColors[priority] : colors.border }]}>
    <AnimatedPressable accessibilityRole="button" accessibilityLabel={`Open ${priorityLabels[priority]} tasks`} onPress={() => onOpenQuadrant(priority)} style={styles.header}><View style={[styles.dot, { backgroundColor: priorityColors[priority] }]} /><Text style={[styles.title, { color: colors.text }]}>{priorityLabels[priority]}</Text><Text style={[styles.count, { color: colors.textMuted }]}>{items.length}</Text></AnimatedPressable>
    <ScrollView nestedScrollEnabled removeClippedSubviews={false} style={styles.taskList} contentContainerStyle={styles.taskContent} showsVerticalScrollIndicator={items.length > 7}>{items.map((task) => <DraggableTask key={task.id} task={task} dropFrames={dropFrames} onComplete={() => onComplete(task)} onMove={(next) => onMove(task, next)} onRename={(title) => onRename(task, title)} onDraggingChange={(dragging, source) => setDraggingPriority(dragging ? source : null)} />)}{items.length === 0 && <Text style={[styles.empty, { color: colors.textMuted }]}>Drop tasks here</Text>}</ScrollView>
  </View>; })}</View>)}</View>;
}

const styles = StyleSheet.create({ grid: { flex: 1, gap: 8, overflow: 'visible' }, row: { flex: 1, minHeight: 0, flexDirection: 'row', gap: 8, overflow: 'visible' }, quadrant: { flex: 1, minWidth: 0, minHeight: 0, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 8, overflow: 'visible' }, liftedQuadrant: { zIndex: 50, elevation: 8 }, header: { minHeight: 24, flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }, taskList: { flex: 1, minHeight: 0, overflow: 'visible' }, taskContent: { overflow: 'visible' }, dragHandle: { width: 24, height: 28, alignItems: 'center', justifyContent: 'center' }, dot: { width: 7, height: 7, borderRadius: 4 }, title: { flex: 1, fontSize: 10, fontWeight: '700' }, count: { fontSize: 9 }, empty: { textAlign: 'center', fontSize: 9, paddingVertical: 20 } });
