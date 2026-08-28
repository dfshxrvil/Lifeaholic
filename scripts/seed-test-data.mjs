import { createClient } from '@supabase/supabase-js';

const [email, password] = process.argv.slice(2);
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!email || !password || !url || !key) {
  console.error('Missing email, password, or Supabase environment variables.');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let auth = await supabase.auth.signInWithPassword({ email, password });

if (auth.error) {
  const signUp = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username: 'test_user' } },
  });

  if (signUp.error) {
    console.error(`Authentication failed: ${signUp.error.message}`);
    process.exit(1);
  }

  if (!signUp.data.session) {
    console.error('CONFIRMATION_REQUIRED: Confirm the test account email, then run this script again.');
    process.exit(2);
  }

  auth = { data: signUp.data, error: null };
}

const user = auth.data.user;
if (!user) {
  console.error('Authenticated session did not contain a user.');
  process.exit(1);
}

const dateKey = (offset) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};

const taskSeeds = [
  {
    title: 'Plan weekly goals',
    description: 'Choose the three outcomes that matter most this week.',
    date: dateKey(0),
    is_completed: false,
    priority: 'red',
    subtasks: ['Review last week', 'Choose top three goals', 'Block focus time'],
  },
  {
    title: 'Deep work session',
    description: 'Complete one distraction-free focus block.',
    date: dateKey(0),
    is_completed: true,
    priority: 'yellow',
    subtasks: ['Silence notifications', 'Start focus timer'],
  },
  {
    title: 'Review study notes',
    description: 'Summarize the key ideas and questions.',
    date: dateKey(1),
    is_completed: false,
    priority: 'blue',
    subtasks: ['Read chapter summary', 'Create five flashcards'],
  },
  {
    title: 'Prepare calendar agenda',
    description: 'Review upcoming commitments and plan preparation time.',
    date: dateKey(2),
    is_completed: false,
    priority: 'green',
    subtasks: ['Check upcoming events', 'Add preparation blocks'],
  },
];

const profileUpdate = await supabase
  .from('profiles')
  .update({ username: 'test_user' })
  .eq('id', user.id);

if (profileUpdate.error) {
  console.error(`Profile update failed: ${profileUpdate.error.message}`);
  process.exit(1);
}

let tasksCreated = 0;
let subtasksCreated = 0;

for (const seed of taskSeeds) {
  let { data: task, error: taskLookupError } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', user.id)
    .eq('date', seed.date)
    .eq('title', seed.title)
    .maybeSingle();

  if (taskLookupError) {
    console.error(`Task lookup failed: ${taskLookupError.message}`);
    process.exit(1);
  }

  if (!task) {
    const insertion = await supabase
      .from('tasks')
      .insert({
        user_id: user.id,
        title: seed.title,
        description: seed.description,
        date: seed.date,
        is_completed: seed.is_completed,
        priority: seed.priority,
      })
      .select('*')
      .single();

    if (insertion.error) {
      console.error(`Task insertion failed: ${insertion.error.message}`);
      process.exit(1);
    }

    task = insertion.data;
    tasksCreated += 1;
  }

  const existing = await supabase.from('subtasks').select('title').eq('task_id', task.id);
  if (existing.error) {
    console.error(`Subtask lookup failed: ${existing.error.message}`);
    process.exit(1);
  }

  const existingTitles = new Set((existing.data ?? []).map((item) => item.title));
  const missing = seed.subtasks
    .filter((title) => !existingTitles.has(title))
    .map((title, index) => ({ task_id: task.id, title, is_completed: seed.is_completed && index === 0 }));

  if (missing.length) {
    const insertion = await supabase.from('subtasks').insert(missing);
    if (insertion.error) {
      console.error(`Subtask insertion failed: ${insertion.error.message}`);
      process.exit(1);
    }
    subtasksCreated += missing.length;
  }
}

console.log(`SEED_OK tasks_created=${tasksCreated} subtasks_created=${subtasksCreated} tasks_total=${taskSeeds.length}`);
await supabase.auth.signOut();
