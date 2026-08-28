import type { TaskPriority, TaskWithSubtasks } from '@/types/database';
export function MatrixBoard(props: { tasks: TaskWithSubtasks[]; onComplete: (task: TaskWithSubtasks) => void; onMove: (task: TaskWithSubtasks, priority: TaskPriority) => void; onRename: (task: TaskWithSubtasks, title: string) => void | Promise<void>; onOpenQuadrant: (priority: TaskPriority) => void }): React.JSX.Element;
