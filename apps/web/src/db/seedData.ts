/**
 * Starter React question bank for DevGrade.
 *
 * Coverage: 3 levels (junior/mid/senior) × 4 pillars × 4 items each
 * (two `core` @ weight 1.0 and two `advanced` @ weight 2.0), i.e. 48 questions.
 * Two items per weight class per bucket give stratified sampling a real pool to
 * randomize over (anti-leakage) while realizing the 0/33/67/100 score
 * granularity (#3). Per-bucket minimum depth is enforced by
 * `db/__tests__/seedData.test.ts` (`MIN_CORE_PER_BUCKET`/`MIN_ADVANCED_PER_BUCKET`).
 *
 * Provenance & licensing (see PRD §10.1 "Content sourcing & licensing"):
 * every row carries a `source`. `ORIGINAL` items are authored here for DevGrade.
 * Items derived from the public, permissively-licensed banks below are
 * paraphrased (never copied verbatim) and tagged with their reference so the
 * attribution obligation is auditable at the data layer:
 *   - `sudheerj/reactjs-interview-questions` (MIT)
 *   - `lydiahallie/javascript-questions` (MIT)
 *
 * Id convention: `react-{level}-{pillar}-{core|adv}`, with an optional two-digit
 * suffix (`-02`, `-03`, ...) for additional items in the same bucket.
 */

import type { NewQuestion } from "./schema";

import {
  WEIGHT_ADVANCED,
  SKILL_CATEGORY,
  CONTENT_SOURCE,
  WEIGHT_CORE,
  DIFFICULTY,
  FRAMEWORK,
} from "@/domain/constants";

export const seedQuestions: NewQuestion[] = [
  // ── JUNIOR · Reactivity & State ───────────────────────────────────────────
  {
    id: "react-junior-reactivity-core",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.REACTIVITY,
    title: "State vs. props",
    prompt:
      "In a React function component, which statement about state and props is correct?",
    codeBlock: null,
    options: [
      "Props are mutable inside the child; state is read-only.",
      "State is owned by the component and can change over time; props are passed in by the parent and are read-only to the receiver.",
      "Both props and state can be reassigned directly to trigger a re-render.",
      "Reassigning a prop inside the child re-renders the parent.",
    ],
    correctAnswer: 1,
    explanation:
      "State is component-owned and updated through its setter to schedule a re-render. Props are inputs from the parent and are read-only to the child. Mutating either directly does not reliably re-render.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.SUDHEERJ_REACT,
  },
  {
    id: "react-junior-reactivity-adv",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.REACTIVITY,
    title: "Batched updates from the same value",
    prompt: "Starting from 0, what is `count` after a single click?",
    codeBlock: [
      "function Counter() {",
      "  const [count, setCount] = useState(0)",
      "  function handleClick() {",
      "    setCount(count + 1)",
      "    setCount(count + 1)",
      "    setCount(count + 1)",
      "  }",
      "  return <button onClick={handleClick}>{count}</button>",
      "}",
    ].join("\n"),
    options: ["3", "1", "0", "2"],
    correctAnswer: 1,
    explanation:
      "All three calls read the same `count` (0) captured by this render's closure, so each queues `setCount(1)`. React batches them and the last write wins → 1. Use the updater form `setCount(c => c + 1)` to accumulate to 3.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },

  // ── JUNIOR · Lifecycle & Effects ──────────────────────────────────────────
  {
    id: "react-junior-lifecycle-core",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.LIFECYCLE,
    title: "Empty dependency array",
    prompt:
      "What does an effect with an empty dependency array do?\n\n`useEffect(() => { /* ... */ }, [])`",
    codeBlock: null,
    options: [
      "Runs after every render.",
      "Runs once, after the component's initial mount.",
      "Runs synchronously before the first render.",
      "Never runs because the array is empty.",
    ],
    correctAnswer: 1,
    explanation:
      "An empty dependency array means the effect has no reactive dependencies, so React runs it once after the initial mount (and runs its cleanup on unmount).",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.SUDHEERJ_REACT,
  },
  {
    id: "react-junior-lifecycle-adv",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.LIFECYCLE,
    title: "Effect cleanup timing",
    prompt: "When does the function returned by this effect run?",
    codeBlock: [
      "useEffect(() => {",
      "  const id = setInterval(tick, 1000)",
      "  return () => clearInterval(id)",
      "}, [])",
    ].join("\n"),
    options: [
      "Only once, immediately after the effect runs.",
      "Before the component unmounts (and before the effect re-runs on a dependency change).",
      "On every render, before the DOM is painted.",
      "Never, because the dependency array is empty.",
    ],
    correctAnswer: 1,
    explanation:
      "React runs an effect's cleanup before re-running the effect (when a dependency changes) and once more when the component unmounts. With `[]` here, cleanup runs only at unmount, clearing the interval.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },

  // ── JUNIOR · Performance & Optimization ───────────────────────────────────
  {
    id: "react-junior-performance-core",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.PERFORMANCE,
    title: "Why lists need a key",
    prompt: "Why does React ask for a `key` on items rendered from a list?",
    codeBlock: null,
    options: [
      "It sets the item's position in the DOM via CSS order.",
      "It gives each item a stable identity so React can match, reuse, and update the right elements during reconciliation.",
      "It encrypts the list data before rendering.",
      "It is required only for TypeScript to type the array.",
    ],
    correctAnswer: 1,
    explanation:
      "Keys give siblings a stable identity across renders, letting React's reconciler tell which items were added, removed, or reordered and reuse DOM/state accordingly instead of rebuilding them.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.SUDHEERJ_REACT,
  },
  {
    id: "react-junior-performance-adv",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.PERFORMANCE,
    title: "Array index as key",
    prompt:
      "A list of stateful rows uses the array index as its `key`. Items can be inserted and reordered. What is the main risk?",
    codeBlock: [
      "{items.map((item, index) => (",
      "  <EditableRow key={index} item={item} />",
      "))}",
    ].join("\n"),
    options: [
      "None — the index is always the safest key.",
      "When the list reorders or an item is inserted, indices shift and React may associate a row's state with the wrong item.",
      "React throws a runtime error for numeric keys.",
      "It disables reconciliation entirely for the list.",
    ],
    correctAnswer: 1,
    explanation:
      "Index keys are only stable while the list is append-only and static. On insert/reorder the index-to-item mapping changes, so React reuses the wrong element and local state (inputs, focus) can attach to the wrong row. Prefer a stable id.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },

  // ── JUNIOR · Async & Data ─────────────────────────────────────────────────
  {
    id: "react-junior-async-core",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.ASYNC,
    title: "Where to fetch data",
    prompt:
      "In a function component, where should a side effect like fetching data on mount go?",
    codeBlock: null,
    options: [
      "Directly in the component body, during render.",
      "Inside a `useEffect` (or an event handler) — never during render.",
      "Inside the JSX return expression.",
      "In the component's default props.",
    ],
    correctAnswer: 1,
    explanation:
      "Rendering must stay pure and side-effect-free. Data fetching belongs in a `useEffect` for mount/dependency-driven loads, or in an event handler for user-triggered loads.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.SUDHEERJ_REACT,
  },
  {
    id: "react-junior-async-adv",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.ASYNC,
    title: "Promise vs. synchronous order",
    prompt: "In what order are the values logged?",
    codeBlock: [
      "console.log('A')",
      "Promise.resolve().then(() => console.log('B'))",
      "console.log('C')",
    ].join("\n"),
    options: ["A, B, C", "A, C, B", "B, A, C", "A, C then nothing"],
    correctAnswer: 1,
    explanation:
      "Synchronous code runs first (`A`, `C`). The `.then` callback is a microtask queued to run after the current synchronous code finishes, so `B` logs last → A, C, B.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.LYDIAHALLIE_JS,
  },

  // ── MID · Reactivity & State ──────────────────────────────────────────────
  {
    id: "react-mid-reactivity-core",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.REACTIVITY,
    title: "Copying props into state",
    prompt:
      "A component copies a prop into state once on mount and renders from that state. What's the bug?",
    codeBlock: [
      "function Price({ amount }) {",
      "  const [value] = useState(amount)",
      "  return <span>{value}</span>",
      "}",
    ].join("\n"),
    options: [
      "It re-renders too often.",
      "`value` is initialized once and won't update when the `amount` prop later changes; derive it during render instead.",
      "`useState` cannot accept a prop as its initial value.",
      "It mutates the parent's state.",
    ],
    correctAnswer: 1,
    explanation:
      "`useState(amount)` only reads `amount` on the first render; later prop changes are ignored. If the value is fully determined by props, render it directly (derived state) rather than mirroring it into state.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.SUDHEERJ_REACT,
  },
  {
    id: "react-mid-reactivity-adv",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.REACTIVITY,
    title: "Sharing state between siblings",
    prompt:
      "Two sibling components must stay in sync with the same value. What is the idiomatic React approach?",
    codeBlock: null,
    options: [
      "Duplicate the state in each sibling and keep them in sync manually.",
      "Lift the state to their closest common parent and pass it down as props (or via context).",
      "Store it on `window` and read it in both.",
      "Use a module-level mutable variable imported by both.",
    ],
    correctAnswer: 1,
    explanation:
      "When two components need the same changing value, lift it to their nearest common ancestor and pass it down. A single owner keeps them consistent; duplicating state invites drift.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },

  // ── MID · Lifecycle & Effects ─────────────────────────────────────────────
  {
    id: "react-mid-lifecycle-core",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.LIFECYCLE,
    title: "Missing effect dependency",
    prompt:
      "This effect logs a stale `count`. What is the root cause and correct fix?",
    codeBlock: [
      "useEffect(() => {",
      "  const id = setInterval(() => console.log(count), 1000)",
      "  return () => clearInterval(id)",
      "}, [])",
    ].join("\n"),
    options: [
      "The interval is too slow; lower the delay.",
      "`count` is omitted from the dependency array, so the effect closes over the first render's value; include `count` (or use a ref/updater) so it stays current.",
      "`clearInterval` must be called before `setInterval`.",
      "`console.log` cannot be used inside an effect.",
    ],
    correctAnswer: 1,
    explanation:
      "With `[]`, the closure captures `count` from the first render and never updates. List `count` as a dependency (the effect re-subscribes with fresh values), or read it from a ref, to avoid the stale-closure bug.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.SUDHEERJ_REACT,
  },
  {
    id: "react-mid-lifecycle-adv",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.LIFECYCLE,
    title: "Effects in StrictMode (dev)",
    prompt:
      "In React 18+ development, a mount effect appears to run twice. Why, and what does it tell you?",
    codeBlock: null,
    options: [
      "It's a bug in React 18; downgrade to fix it.",
      "StrictMode intentionally mounts, unmounts, and remounts components in development to surface effects that aren't cleaned up correctly; production runs once.",
      "The component is rendered by two parents.",
      "Effects always run twice, in development and production.",
    ],
    correctAnswer: 1,
    explanation:
      "React 18 StrictMode double-invokes effects (setup → cleanup → setup) in development only, to reveal missing or incorrect cleanup. An effect written with proper cleanup is resilient to this and behaves correctly in production, where it runs once.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },

  // ── MID · Performance & Optimization ──────────────────────────────────────
  {
    id: "react-mid-performance-core",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.PERFORMANCE,
    title: "What useMemo is for",
    prompt: "What problem does `useMemo` primarily solve?",
    codeBlock: null,
    options: [
      "It caches a component so it never re-renders.",
      "It memoizes the result of an expensive calculation, recomputing only when its dependencies change.",
      "It replaces `useState` for derived values.",
      "It runs a side effect after render.",
    ],
    correctAnswer: 1,
    explanation:
      "`useMemo(fn, deps)` remembers the previous return value and recomputes only when a dependency changes, avoiding repeat work for expensive computations (or preserving a referential identity passed to memoized children).",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.SUDHEERJ_REACT,
  },
  {
    id: "react-mid-performance-adv",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.PERFORMANCE,
    title: "React.memo defeated by inline props",
    prompt:
      "`Child` is wrapped in `React.memo`, yet it re-renders on every parent render. Why?",
    codeBlock: [
      "const Child = React.memo(function Child({ onClick }) {",
      "  return <button onClick={onClick}>Click</button>",
      "})",
      "",
      "function Parent() {",
      "  return <Child onClick={() => doSomething()} />",
      "}",
    ].join("\n"),
    options: [
      "`React.memo` only works on class components.",
      "A new `onClick` function is created every render, so the prop reference differs and `memo`'s shallow comparison fails; stabilize it with `useCallback`.",
      "`memo` requires a custom comparison to work at all.",
      "The button element forces a re-render.",
    ],
    correctAnswer: 1,
    explanation:
      "`React.memo` skips re-render only when props are shallowly equal. The inline arrow creates a fresh function each render, so `onClick` is never equal. Wrap it in `useCallback` (with correct deps) to keep a stable reference.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },

  // ── MID · Async & Data ────────────────────────────────────────────────────
  {
    id: "react-mid-async-core",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.ASYNC,
    title: "Out-of-order fetch responses",
    prompt:
      "An effect fetches whenever `query` changes and calls `setData` on resolve. Rapid typing sometimes shows results for an old query. What fixes it correctly?",
    codeBlock: [
      "useEffect(() => {",
      "  fetch(`/search?q=${query}`)",
      "    .then((r) => r.json())",
      "    .then(setData)",
      "}, [query])",
    ].join("\n"),
    options: [
      "Debounce with a longer interval so responses can't overlap.",
      "Track staleness in cleanup: set an `ignore` flag (or use AbortController) so a superseded response is discarded.",
      "Move the fetch out of the effect and into render.",
      "Wrap `setData` in `useMemo`.",
    ],
    correctAnswer: 1,
    explanation:
      "Responses can resolve out of order, so a slow earlier request may overwrite a newer one. The effect's cleanup should mark the in-flight request stale (an `ignore` boolean checked before `setData`, or `AbortController.abort()`), so only the latest query's result is applied.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.SUDHEERJ_REACT,
  },
  {
    id: "react-mid-async-adv",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.ASYNC,
    title: "Parallel vs. sequential awaits",
    prompt:
      "Each request takes ~1s. Roughly how long until both results are available, and how would you make it faster?",
    codeBlock: [
      "const user = await fetchUser(id)",
      "const posts = await fetchPosts(id)",
    ].join("\n"),
    options: [
      "~1s; it's already parallel.",
      "~2s because the awaits run sequentially; start both first and `await Promise.all([...])` to overlap them (~1s).",
      "~2s and it cannot be made faster.",
      "~0s; awaits don't block.",
    ],
    correctAnswer: 1,
    explanation:
      "Awaiting the first request before starting the second serializes them (~2s). Since `fetchPosts` doesn't depend on `user`, kick both off and `await Promise.all([fetchUser(id), fetchPosts(id)])` so they run concurrently (~1s).",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.LYDIAHALLIE_JS,
  },

  // ── SENIOR · Reactivity & State ───────────────────────────────────────────
  {
    id: "react-senior-reactivity-core",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.REACTIVITY,
    title: "useReducer over useState",
    prompt: "When is `useReducer` a better fit than multiple `useState` calls?",
    codeBlock: null,
    options: [
      "Never; `useReducer` is a legacy API.",
      "When several values change together under complex, related transitions — a reducer centralizes that logic and makes updates predictable and testable.",
      "Only when the component is a class.",
      "Whenever any state exists, for performance.",
    ],
    correctAnswer: 1,
    explanation:
      "`useReducer` shines when the next state depends on the previous one and multiple sub-values transition together. Consolidating the rules in a pure reducer improves predictability, testability, and lets you dispatch intent rather than scatter setters.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.SUDHEERJ_REACT,
  },
  {
    id: "react-senior-reactivity-adv",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.REACTIVITY,
    title: "Context value identity",
    prompt:
      "Every consumer of this context re-renders on each `Provider` render, even when unrelated. Why?",
    codeBlock: [
      "function App() {",
      "  const [user, setUser] = useState(null)",
      "  return (",
      "    <AuthContext.Provider value={{ user, setUser }}>",
      "      <Routes />",
      "    </AuthContext.Provider>",
      "  )",
      "}",
    ].join("\n"),
    options: [
      "Context always re-renders every consumer on any render.",
      "The `value` object literal is recreated each render, so its reference changes and all consumers re-render; memoize it with `useMemo`.",
      "`setUser` changes identity every render.",
      "Consumers must be wrapped in `React.memo` or context won't work.",
    ],
    correctAnswer: 1,
    explanation:
      "Context consumers re-render when the provided `value` changes by identity. The inline `{ user, setUser }` is a new object every render, so all consumers update. Wrap it in `useMemo([user])` (and pass a stable `setUser`) to re-render only when `user` actually changes.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },

  // ── SENIOR · Lifecycle & Effects ──────────────────────────────────────────
  {
    id: "react-senior-lifecycle-core",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.LIFECYCLE,
    title: "useLayoutEffect vs. useEffect",
    prompt:
      "You measure a DOM node and adjust layout before the user sees a flicker. Which hook, and why?",
    codeBlock: null,
    options: [
      "`useEffect`, because it runs before paint.",
      "`useLayoutEffect`, because it runs synchronously after DOM mutations but before the browser paints, letting you measure and mutate without a visible flash.",
      "Either one; they run at the same time.",
      "`useMemo`, to cache the measurement.",
    ],
    correctAnswer: 1,
    explanation:
      "`useEffect` runs after paint, so DOM reads/writes there can flicker. `useLayoutEffect` fires synchronously after mutations and before paint — correct for measuring and adjusting layout — at the cost of blocking paint, so use it sparingly.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.SUDHEERJ_REACT,
  },
  {
    id: "react-senior-lifecycle-adv",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.LIFECYCLE,
    title: "Re-subscribing on dependency change",
    prompt:
      "This effect subscribes to a live channel that depends on `roomId`. What must be true for it to be correct as `roomId` changes?",
    codeBlock: [
      "useEffect(() => {",
      "  const conn = createConnection(roomId)",
      "  conn.connect()",
      "  return () => conn.disconnect()",
      "}, [roomId])",
    ].join("\n"),
    options: [
      "Nothing; effects never need cleanup for subscriptions.",
      "On each `roomId` change React runs the previous cleanup (disconnecting the old room) before connecting the new one, so cleanup must fully tear down the prior connection.",
      "The dependency array should be empty to avoid reconnecting.",
      "`connect` and `disconnect` should both run only at unmount.",
    ],
    correctAnswer: 1,
    explanation:
      "With `[roomId]`, each change triggers cleanup for the old value (disconnect) and then setup for the new one (connect). The cleanup must symmetrically undo the setup; otherwise connections leak as the room changes.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },

  // ── SENIOR · Performance & Optimization ───────────────────────────────────
  {
    id: "react-senior-performance-core",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.PERFORMANCE,
    title: "What useCallback preserves",
    prompt:
      "What does `useCallback` provide that helps performance, and when is it actually useful?",
    codeBlock: null,
    options: [
      "It makes a function execute faster.",
      "It returns a stable function identity across renders, which matters when that function is a dependency or a prop to a memoized child.",
      "It memoizes the function's return value.",
      "It prevents the function from ever being recreated in memory.",
    ],
    correctAnswer: 1,
    explanation:
      "`useCallback(fn, deps)` returns the same function reference until a dependency changes. That referential stability only pays off when the function feeds a `React.memo` child or another hook's dependency array; otherwise it's overhead.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.SUDHEERJ_REACT,
  },
  {
    id: "react-senior-performance-adv",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.PERFORMANCE,
    title: "Keeping the UI responsive with useTransition",
    prompt:
      "Typing in a search box janks because it renders a huge, expensive results list synchronously. Which built-in React 18 tool best addresses this?",
    codeBlock: null,
    options: [
      "Wrap the list in `useMemo` so it never re-renders.",
      "Mark the expensive list update as non-urgent with `useTransition`, so the input stays responsive while the results render at lower priority.",
      "Move rendering into a `useEffect`.",
      "Increase the debounce until it feels smooth.",
    ],
    correctAnswer: 1,
    explanation:
      "`useTransition` lets you flag the costly results update as a transition (non-urgent). React keeps the urgent input update responsive and renders the heavy list without blocking typing, optionally showing an `isPending` state — more robust than tuning a debounce.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },

  // ── SENIOR · Async & Data ─────────────────────────────────────────────────
  {
    id: "react-senior-async-core",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.ASYNC,
    title: "Cancelling a stale request",
    prompt:
      "Which mechanism most cleanly cancels an in-flight `fetch` when an effect re-runs or the component unmounts?",
    codeBlock: null,
    options: [
      "Wrapping `fetch` in `setTimeout`.",
      "Creating an `AbortController`, passing its `signal` to `fetch`, and calling `abort()` from the effect's cleanup.",
      "Calling `setData(null)` before fetching.",
      "There is no way to cancel a `fetch`.",
    ],
    correctAnswer: 1,
    explanation:
      "Pass `controller.signal` to `fetch` and call `controller.abort()` in the effect's cleanup. The request rejects with an `AbortError` you can ignore, preventing state updates from stale requests and freeing the connection.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.SUDHEERJ_REACT,
  },
  {
    id: "react-senior-async-adv",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.ASYNC,
    title: "async/await and the microtask queue",
    prompt: "What is the exact log order?",
    codeBlock: [
      "async function run() {",
      "  console.log(1)",
      "  await null",
      "  console.log(2)",
      "}",
      "console.log(3)",
      "run()",
      "console.log(4)",
    ].join("\n"),
    options: ["3, 1, 4, 2", "1, 2, 3, 4", "3, 4, 1, 2", "3, 1, 2, 4"],
    correctAnswer: 0,
    explanation:
      "`console.log(3)` runs first. Calling `run()` logs `1` synchronously up to the `await`, which schedules the continuation (`2`) as a microtask and returns. `console.log(4)` runs next, then the microtask logs `2` → 3, 1, 4, 2.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.LYDIAHALLIE_JS,
  },

  // ══ BATCH A ════════════════════════════════════════════════════════════════
  // A second core + advanced item per (level × pillar) bucket, so stratified
  // sampling has a real pool to randomize over (min depth enforced by
  // db/__tests__/seedData.test.ts). Topics are distinct from the items above.

  // ── JUNIOR · Reactivity & State ───────────────────────────────────────────
  {
    id: "react-junior-reactivity-core-02",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.REACTIVITY,
    title: "Controlling an input",
    prompt: "How do you make a text `<input>` a controlled component in React?",
    codeBlock: null,
    options: [
      "Set only `defaultValue` and read the DOM node when you need the value.",
      "Bind `value` to state and update that state in an `onChange` handler.",
      "Assign to `input.value` directly inside the render body.",
      "Wrap the input in `useMemo`.",
    ],
    correctAnswer: 1,
    explanation:
      "A controlled input derives its `value` from React state and pushes user edits back into state via `onChange`, making React the single source of truth. `defaultValue` alone leaves the input uncontrolled.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.SUDHEERJ_REACT,
  },
  {
    id: "react-junior-reactivity-adv-02",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.REACTIVITY,
    title: "Adding to an array in state",
    prompt:
      "Which line correctly adds `next` to the list and triggers a re-render?",
    codeBlock: "const [todos, setTodos] = useState([])",
    options: [
      "todos.push(next)",
      "setTodos(todos.push(next))",
      "setTodos([...todos, next])",
      "todos = [...todos, next]",
    ],
    correctAnswer: 2,
    explanation:
      "State must be updated immutably through its setter. `push` mutates the existing array (and returns a length, not the array), so React sees no new reference. `setTodos([...todos, next])` passes a fresh array, scheduling a re-render.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },

  // ── JUNIOR · Lifecycle & Effects ──────────────────────────────────────────
  {
    id: "react-junior-lifecycle-core-02",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.LIFECYCLE,
    title: "Effect with no dependency array",
    prompt:
      "How often does this effect run?\n\n`useEffect(() => { doThing() })`",
    codeBlock: null,
    options: [
      "Once, after mount only.",
      "After every render — the initial mount and every update.",
      "Never, because there is no dependency array.",
      "Only when props change.",
    ],
    correctAnswer: 1,
    explanation:
      "Omitting the second argument entirely runs the effect after every completed render. `[]` would run it once after mount; `[dep]` would run it whenever `dep` changes.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.SUDHEERJ_REACT,
  },
  {
    id: "react-junior-lifecycle-adv-02",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.LIFECYCLE,
    title: "What re-runs this effect",
    prompt: "After mount, what causes this effect to run again?",
    codeBlock: [
      "useEffect(() => {",
      "  loadProfile(userId)",
      "}, [userId])",
    ].join("\n"),
    options: [
      "Any re-render of the component.",
      "A change to the `userId` value between renders.",
      "Nothing; it runs only once.",
      "A change to any state anywhere in the component.",
    ],
    correctAnswer: 1,
    explanation:
      "React re-runs an effect only when a value in its dependency array changes between renders (compared with `Object.is`). Here that is `userId`; unrelated re-renders do not re-trigger it.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },

  // ── JUNIOR · Performance & Optimization ───────────────────────────────────
  {
    id: "react-junior-performance-core-02",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.PERFORMANCE,
    title: "What triggers a re-render",
    prompt: "Which of these causes a React function component to re-render?",
    codeBlock: null,
    options: [
      "Mutating a plain local variable inside the component.",
      "Logging to the console during render.",
      "A change to its state (via a setter) or to the props it receives.",
      "Editing a module-level variable it happens to read.",
    ],
    correctAnswer: 2,
    explanation:
      "A component re-renders when its own state changes through a setter, when its parent re-renders and passes new props, or when a context it consumes changes. Mutating plain variables does not notify React.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.SUDHEERJ_REACT,
  },
  {
    id: "react-junior-performance-adv-02",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.PERFORMANCE,
    title: "Do children re-render with the parent?",
    prompt:
      "A parent's state changes and it re-renders. By default, what happens to its child components?",
    codeBlock: null,
    options: [
      "Only children whose props changed re-render.",
      "No children re-render unless they hold their own state.",
      "They re-render too, whether or not their props changed — unless memoized.",
      "React throws if the children lack keys.",
    ],
    correctAnswer: 2,
    explanation:
      "By default React re-renders the whole subtree below a component that re-renders, including children whose props are unchanged. `React.memo` with stable props is what lets a child skip that work.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },

  // ── JUNIOR · Async & Data ─────────────────────────────────────────────────
  {
    id: "react-junior-async-core-02",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.ASYNC,
    title: "Showing a loading state",
    prompt:
      "You fetch data on mount and want a spinner until it arrives. What is the standard approach?",
    codeBlock: null,
    options: [
      "Block rendering with a `while` loop until the data is ready.",
      "Keep a `loading` status in state; show the spinner while it is true and flip it when the fetch settles.",
      "Read `document.readyState` during render.",
      "Fetch synchronously so no spinner is needed.",
    ],
    correctAnswer: 1,
    explanation:
      "Track request status in state (e.g. loading / error / data). Render the spinner while loading is true, then set it false in the effect once the promise resolves or rejects, keeping rendering declarative.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-junior-async-adv-02",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.ASYNC,
    title: "An async useEffect callback",
    prompt:
      "Why is passing an `async` function directly to `useEffect` a mistake?",
    codeBlock: [
      "useEffect(async () => {",
      "  const data = await load()",
      "  setData(data)",
      "}, [])",
    ].join("\n"),
    options: [
      "`await` is not allowed inside effects at all.",
      "An `async` function returns a Promise, but React expects an effect to return nothing or a cleanup function — declare the async function inside and call it.",
      "It forces the effect to run twice.",
      "`setData` cannot be called after an `await`.",
    ],
    correctAnswer: 1,
    explanation:
      "An `async` function always returns a Promise, which React would mistake for a cleanup function. Declare the async function inside the effect and invoke it — `useEffect(() => { (async () => { ... })() }, [])` — returning a real cleanup if needed.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },

  // ── MID · Reactivity & State ──────────────────────────────────────────────
  {
    id: "react-mid-reactivity-core-02",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.REACTIVITY,
    title: "Reading state right after setting it",
    prompt:
      "Starting from a count of 0, what does this log on the first click?",
    codeBlock: [
      "function onClick() {",
      "  setCount(count + 1)",
      "  console.log(count)",
      "}",
    ].join("\n"),
    options: ["1", "0", "undefined", "It logs twice."],
    correctAnswer: 1,
    explanation:
      "`setCount` schedules an update; it does not reassign the `count` binding in the current render's scope. `console.log(count)` still sees this render's value (0). The new value is visible on the next render.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-mid-reactivity-adv-02",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.REACTIVITY,
    title: "Mutation with the same reference",
    prompt: "After clicking, the list on screen does not update. Why?",
    codeBlock: [
      "function add(item) {",
      "  items.push(item)",
      "  setItems(items)",
      "}",
    ].join("\n"),
    options: [
      "`push` is asynchronous.",
      "`setItems` receives the same array reference it already holds, so React bails out of re-rendering; pass a new array instead.",
      "You must call `setItems` twice.",
      "Arrays cannot be stored in state.",
    ],
    correctAnswer: 1,
    explanation:
      "React compares the next state to the previous with `Object.is`. Mutating the array in place and passing the same reference looks unchanged, so React skips the render. Create a new array: `setItems([...items, item])`.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },

  // ── MID · Lifecycle & Effects ─────────────────────────────────────────────
  {
    id: "react-mid-lifecycle-core-02",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.LIFECYCLE,
    title: "Object literal in the dependency array",
    prompt:
      "This effect runs on every render even though the data looks stable. What is the cause?",
    codeBlock: [
      "useEffect(() => {",
      "  subscribe(options)",
      "}, [{ id }])",
    ].join("\n"),
    options: [
      "`subscribe` mutates state.",
      "A new object literal `{ id }` is created each render, so its reference always differs and the effect re-runs; depend on the primitive `id` instead.",
      "Objects cannot be used inside effects.",
      "The dependency array needs a second element.",
    ],
    correctAnswer: 1,
    explanation:
      "Dependencies are compared by identity. A fresh object or array literal in the deps array is a new reference every render, so the effect never sees it as equal. Depend on the primitive fields (`[id]`) or memoize the object.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-mid-lifecycle-adv-02",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.LIFECYCLE,
    title: "Persisting a value without re-rendering",
    prompt:
      "You need to remember a timer id across renders without causing a re-render when it changes. What fits best?",
    codeBlock: null,
    options: [
      "A `useState` value.",
      "A module-level variable shared by all instances.",
      "A `useRef` — its `.current` persists across renders and updating it does not trigger a render.",
      "A `useMemo` with an empty dependency array.",
    ],
    correctAnswer: 2,
    explanation:
      "`useRef` gives each component instance a stable, mutable container whose `.current` survives renders and, unlike state, can be updated without scheduling a re-render — ideal for timer ids, previous values, and instance-local bookkeeping.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.SUDHEERJ_REACT,
  },

  // ── MID · Performance & Optimization ──────────────────────────────────────
  {
    id: "react-mid-performance-core-02",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.PERFORMANCE,
    title: "When React.memo helps",
    prompt: "Wrapping a component in `React.memo` is most useful when…",
    codeBlock: null,
    options: [
      "the component receives no props.",
      "it re-renders often with the same props while its render work is non-trivial, and its props keep a stable identity.",
      "you want it to render only once, ever.",
      "it manages its own local state.",
    ],
    correctAnswer: 1,
    explanation:
      "`React.memo` skips a re-render when props are shallowly equal. It pays off for components that would otherwise re-render frequently with unchanged, referentially-stable props. If props change every render (inline objects/functions), memo adds cost without benefit.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.SUDHEERJ_REACT,
  },
  {
    id: "react-mid-performance-adv-02",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.PERFORMANCE,
    title: "Isolating an expensive subtree",
    prompt:
      "A fast-changing input sits beside an expensive chart in the same component, and typing re-renders the chart. What is the cleanest fix?",
    codeBlock: null,
    options: [
      "Wrap the whole component in `useMemo`.",
      "Move the input and its state into a small child component, so the parent (and the chart) no longer re-render on every keystroke.",
      "Debounce every render of the component.",
      "Store the input value on `window`.",
    ],
    correctAnswer: 1,
    explanation:
      "The re-render comes from the input's state living too high in the tree. Colocating that state in a dedicated child limits re-renders to that child, leaving the expensive sibling untouched — a structural fix that beats sprinkling memoization.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },

  // ── MID · Async & Data ────────────────────────────────────────────────────
  {
    id: "react-mid-async-core-02",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.ASYNC,
    title: "fetch and HTTP error codes",
    prompt:
      "A `fetch` to an endpoint returning 500 never hits your `.catch`. Why?",
    codeBlock: null,
    options: [
      "`fetch` retries 5xx responses automatically.",
      "`fetch` rejects only on network failures; HTTP 4xx/5xx still resolve, so you must check `response.ok` yourself.",
      "500 responses are served from cache.",
      "You must use `XMLHttpRequest` to catch errors.",
    ],
    correctAnswer: 1,
    explanation:
      "`fetch` rejects only when the request cannot complete (network error, CORS, abort). An HTTP error status still resolves successfully, so inspect `response.ok` (or `response.status`) and throw to route 4xx/5xx into your error handling.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.LYDIAHALLIE_JS,
  },
  {
    id: "react-mid-async-adv-02",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.ASYNC,
    title: "One request among many fails",
    prompt:
      "You load three independent resources with `Promise.all` and one rejects. What happens, and how do you still use the successful ones?",
    codeBlock: null,
    options: [
      "`Promise.all` returns the successes and ignores the failure.",
      "`Promise.all` rejects as soon as any input rejects, discarding the others; use `Promise.allSettled` to get each result's status independently.",
      "It waits and retries the failed request.",
      "It resolves with `undefined` in place of the failure.",
    ],
    correctAnswer: 1,
    explanation:
      "`Promise.all` short-circuits: the first rejection rejects the whole thing and the fulfilled values are lost. `Promise.allSettled` waits for every promise and returns a `{ status, value | reason }` per entry, so partial success is usable.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.LYDIAHALLIE_JS,
  },

  // ── SENIOR · Reactivity & State ───────────────────────────────────────────
  {
    id: "react-senior-reactivity-core-02",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.REACTIVITY,
    title: "Subscribing to an external store",
    prompt:
      "Which hook is designed to read from an external (non-React) store safely under concurrent rendering?",
    codeBlock: null,
    options: [
      "`useEffect` combined with `useState`.",
      "`useMemo`.",
      "`useSyncExternalStore`.",
      "`useReducer`.",
    ],
    correctAnswer: 2,
    explanation:
      "`useSyncExternalStore` subscribes to an external store and reads its snapshot without tearing — inconsistent reads across a concurrent render. The ad-hoc `useEffect` + `useState` pattern can surface stale or torn values under concurrency.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-senior-reactivity-adv-02",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.REACTIVITY,
    title: "Automatic batching in React 18",
    prompt:
      "Two `setState` calls inside a `setTimeout` — how many re-renders in React 18?",
    codeBlock: ["setTimeout(() => {", "  setA(1)", "  setB(2)", "}, 0)"].join(
      "\n",
    ),
    options: [
      "Two — updates outside React events are never batched.",
      "One — React 18 automatically batches updates from timeouts, promises, and native handlers too.",
      "Zero until the next user event.",
      "It depends on how deep the component is.",
    ],
    correctAnswer: 1,
    explanation:
      "Before React 18, batching applied only inside React's own event handlers, so timeouts and promises caused a render per `setState`. React 18's automatic batching groups these updates as well, yielding a single re-render. Use `flushSync` to opt out.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },

  // ── SENIOR · Lifecycle & Effects ──────────────────────────────────────────
  {
    id: "react-senior-lifecycle-core-02",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.LIFECYCLE,
    title: "When not to use an effect",
    prompt:
      "You compute a filtered list from `items` and `query`. Where should that computation live?",
    codeBlock: null,
    options: [
      "In a `useEffect` that writes the result into separate state.",
      "Directly during render — optionally wrapped in `useMemo` — with no effect at all.",
      "In a `useLayoutEffect`.",
      "In a ref updated on every render.",
    ],
    correctAnswer: 1,
    explanation:
      "Data derived from props/state should be computed during render, not synced into state via an effect. An effect there adds an extra render and a chance for the copy to drift. Compute it inline, reaching for `useMemo` only if the calculation is genuinely expensive.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.SUDHEERJ_REACT,
  },
  {
    id: "react-senior-lifecycle-adv-02",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.LIFECYCLE,
    title: "Exposing an imperative API",
    prompt:
      "A parent needs to call `.focus()` on a custom `<TextField>` child. Which pair exposes that cleanly?",
    codeBlock: null,
    options: [
      "`useMemo` and context.",
      "`forwardRef` together with `useImperativeHandle` to expose a limited method surface.",
      "A global event bus.",
      "`useState` storing the DOM node.",
    ],
    correctAnswer: 1,
    explanation:
      "`forwardRef` lets the parent's ref reach the child, and `useImperativeHandle(ref, () => ({ focus }))` defines exactly which imperative methods are exposed — a controlled escape hatch instead of leaking the whole DOM node.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.SUDHEERJ_REACT,
  },

  // ── SENIOR · Performance & Optimization ───────────────────────────────────
  {
    id: "react-senior-performance-core-02",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.PERFORMANCE,
    title: "Rendering very long lists",
    prompt:
      "A list of 10,000 rows makes the page sluggish. What is the most effective rendering strategy?",
    codeBlock: null,
    options: [
      "Wrap every row in `React.memo`.",
      "Virtualize the list — render only the rows in and near the viewport, recycling them as the user scrolls.",
      "Move the list rendering into a `useEffect`.",
      "Re-fetch a page on every scroll pixel.",
    ],
    correctAnswer: 1,
    explanation:
      "The cost is in mounting thousands of DOM nodes. List virtualization (windowing) renders only the visible slice plus a small buffer, keeping the node count small regardless of dataset size. Memoizing rows does not remove the nodes.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-senior-performance-adv-02",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.PERFORMANCE,
    title: "Deferring an expensive derived render",
    prompt:
      "You want a text input to stay snappy while a heavy list derived from its value renders behind it. Which hook renders that list from a lagging copy of the value?",
    codeBlock: null,
    options: [
      "`useMemo`.",
      "`useDeferredValue`, which returns a deferred copy of the value so the expensive render can lag behind the urgent input update.",
      "`useRef`.",
      "`useLayoutEffect`.",
    ],
    correctAnswer: 1,
    explanation:
      "`useDeferredValue(value)` yields a version of the value that updates at lower priority. The input reflects keystrokes immediately while the expensive list re-renders from the deferred value, avoiding jank — the value-based complement to `useTransition`.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },

  // ── SENIOR · Async & Data ─────────────────────────────────────────────────
  {
    id: "react-senior-async-core-02",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.ASYNC,
    title: "How Suspense handles pending data",
    prompt:
      "With a Suspense-enabled data source, what happens while a component's data is still loading?",
    codeBlock: null,
    options: [
      "The component renders with `undefined` data.",
      "The component suspends and React shows the nearest `<Suspense>` boundary's `fallback` until the data resolves.",
      "React throws an unhandled error.",
      "The effect retries silently in the background.",
    ],
    correctAnswer: 1,
    explanation:
      "A component reading not-yet-ready data 'suspends'; React walks up to the nearest `<Suspense>` boundary and renders its `fallback` meanwhile, then swaps in the real content once the data resolves — no manual loading flag in that component.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.SUDHEERJ_REACT,
  },
  {
    id: "react-senior-async-adv-02",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.ASYNC,
    title: "Avoiding a request waterfall",
    prompt:
      "A page fetches the user, then the user's posts in a child effect, then comments in a grandchild — each awaiting the previous to mount. What is the problem and fix?",
    codeBlock: null,
    options: [
      "Nothing; this is already optimal.",
      "It is a waterfall: each request waits for a parent to render and fetch first; hoist or parallelize the independent fetches (or preload) so they run concurrently.",
      "Effects cannot fetch, so it never completes.",
      "Only the last request actually runs.",
    ],
    correctAnswer: 1,
    explanation:
      "Chaining fetches through nested components serializes them into a waterfall, adding a round-trip per level. Kick off independent requests together (lift data loading, `Promise.all`, or route-level preloading) so total latency is one round-trip, not N.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },
];
