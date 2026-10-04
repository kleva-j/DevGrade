/**
 * Starter React question bank for DevGrade.
 *
 * Coverage: 3 levels (junior/mid/senior) × 4 pillars × 12 items each
 * (six `core` @ weight 1.0 and six `advanced` @ weight 2.0), i.e. 144 questions.
 * Multiple items per weight class per bucket give stratified sampling a real pool
 * to randomize over (anti-leakage) while realizing the 0/33/67/100 score
 * granularity (#3). Per-bucket minimum depth is enforced by
 * `db/__tests__/seedData.test.ts` (`MIN_CORE_PER_BUCKET`/`MIN_ADVANCED_PER_BUCKET`).
 * Correct-answer positions are balanced within each level/pillar and weight
 * class at authoring time. IDs are explicit and stable even if options reorder;
 * assessments save their own one-time shuffled presentation order.
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
      {
        id: 0,
        text: "Props are mutable inside the child; state is read-only.",
      },
      {
        id: 1,
        text: "Reassigning a prop inside the child re-renders the parent.",
      },
      {
        id: 2,
        text: "Both props and state can be reassigned directly to trigger a re-render.",
      },
      {
        id: 3,
        text: "State is owned by the component and can change over time; props are passed in by the parent and are read-only to the receiver.",
      },
    ],
    correctOptionId: 3,
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
    options: [
      { id: 0, text: "3" },
      { id: 1, text: "0" },
      { id: 2, text: "1" },
      { id: 3, text: "2" },
    ],
    correctOptionId: 2,
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
      { id: 0, text: "Runs after every render." },
      { id: 1, text: "Runs synchronously before the first render." },
      { id: 2, text: "Runs once, after the component's initial mount." },
      { id: 3, text: "Never runs because the array is empty." },
    ],
    correctOptionId: 2,
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
      { id: 0, text: "Only once, immediately after the effect runs." },
      { id: 1, text: "Never, because the dependency array is empty." },
      { id: 2, text: "On every render, before the DOM is painted." },
      {
        id: 3,
        text: "Before the component unmounts (and before the effect re-runs on a dependency change).",
      },
    ],
    correctOptionId: 3,
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
      {
        id: 0,
        text: "It gives each item a stable identity so React can match, reuse, and update the right elements during reconciliation.",
      },
      { id: 1, text: "It sets the item's position in the DOM via CSS order." },
      { id: 2, text: "It encrypts the list data before rendering." },
      { id: 3, text: "It is required only for TypeScript to type the array." },
    ],
    correctOptionId: 0,
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
      {
        id: 0,
        text: "When the list reorders or an item is inserted, indices shift and React may associate a row's state with the wrong item.",
      },
      { id: 1, text: "None — the index is always the safest key." },
      { id: 2, text: "React throws a runtime error for numeric keys." },
      { id: 3, text: "It disables reconciliation entirely for the list." },
    ],
    correctOptionId: 0,
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
      { id: 0, text: "Directly in the component body, during render." },
      { id: 1, text: "In the component's default props." },
      { id: 2, text: "Inside the JSX return expression." },
      {
        id: 3,
        text: "Inside a `useEffect` (or an event handler) — never during render.",
      },
    ],
    correctOptionId: 3,
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
    options: [
      { id: 0, text: "A, B, C" },
      { id: 1, text: "B, A, C" },
      { id: 2, text: "A, C, B" },
      { id: 3, text: "A, C then nothing" },
    ],
    correctOptionId: 2,
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
      {
        id: 0,
        text: "`value` is initialized once and won't update when the `amount` prop later changes; derive it during render instead.",
      },
      { id: 1, text: "It re-renders too often." },
      { id: 2, text: "`useState` cannot accept a prop as its initial value." },
      { id: 3, text: "It mutates the parent's state." },
    ],
    correctOptionId: 0,
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
      {
        id: 0,
        text: "Lift the state to their closest common parent and pass it down as props (or via context).",
      },
      {
        id: 1,
        text: "Duplicate the state in each sibling and keep them in sync manually.",
      },
      { id: 2, text: "Store it on `window` and read it in both." },
      { id: 3, text: "Use a module-level mutable variable imported by both." },
    ],
    correctOptionId: 0,
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
      { id: 0, text: "The interval is too slow; lower the delay." },
      { id: 1, text: "`clearInterval` must be called before `setInterval`." },
      {
        id: 2,
        text: "`count` is omitted from the dependency array, so the effect closes over the first render's value; include `count` (or use a ref/updater) so it stays current.",
      },
      { id: 3, text: "`console.log` cannot be used inside an effect." },
    ],
    correctOptionId: 2,
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
      { id: 0, text: "It's a bug in React 18; downgrade to fix it." },
      { id: 1, text: "The component is rendered by two parents." },
      {
        id: 2,
        text: "StrictMode intentionally mounts, unmounts, and remounts components in development to surface effects that aren't cleaned up correctly; production runs once.",
      },
      {
        id: 3,
        text: "Effects always run twice, in development and production.",
      },
    ],
    correctOptionId: 2,
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
      { id: 0, text: "It caches a component so it never re-renders." },
      {
        id: 1,
        text: "It memoizes the result of an expensive calculation, recomputing only when its dependencies change.",
      },
      { id: 2, text: "It replaces `useState` for derived values." },
      { id: 3, text: "It runs a side effect after render." },
    ],
    correctOptionId: 1,
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
      { id: 0, text: "`React.memo` only works on class components." },
      { id: 1, text: "The button element forces a re-render." },
      { id: 2, text: "`memo` requires a custom comparison to work at all." },
      {
        id: 3,
        text: "A new `onClick` function is created every render, so the prop reference differs and `memo`'s shallow comparison fails; stabilize it with `useCallback`.",
      },
    ],
    correctOptionId: 3,
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
      {
        id: 0,
        text: "Debounce with a longer interval so responses can't overlap.",
      },
      {
        id: 1,
        text: "Track staleness in cleanup: set an `ignore` flag (or use AbortController) so a superseded response is discarded.",
      },
      { id: 2, text: "Move the fetch out of the effect and into render." },
      { id: 3, text: "Wrap `setData` in `useMemo`." },
    ],
    correctOptionId: 1,
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
      {
        id: 0,
        text: "~2s because the awaits run sequentially; start both first and `await Promise.all([...])` to overlap them (~1s).",
      },
      { id: 1, text: "~1s; it's already parallel." },
      { id: 2, text: "~2s and it cannot be made faster." },
      { id: 3, text: "~0s; awaits don't block." },
    ],
    correctOptionId: 0,
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
      { id: 0, text: "Never; `useReducer` is a legacy API." },
      {
        id: 1,
        text: "When several values change together under complex, related transitions — a reducer centralizes that logic and makes updates predictable and testable.",
      },
      { id: 2, text: "Only when the component is a class." },
      { id: 3, text: "Whenever any state exists, for performance." },
    ],
    correctOptionId: 1,
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
      {
        id: 0,
        text: "Context always re-renders every consumer on any render.",
      },
      { id: 1, text: "`setUser` changes identity every render." },
      {
        id: 2,
        text: "The `value` object literal is recreated each render, so its reference changes and all consumers re-render; memoize it with `useMemo`.",
      },
      {
        id: 3,
        text: "Consumers must be wrapped in `React.memo` or context won't work.",
      },
    ],
    correctOptionId: 2,
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
      { id: 0, text: "`useEffect`, because it runs before paint." },
      { id: 1, text: "`useMemo`, to cache the measurement." },
      { id: 2, text: "Either one; they run at the same time." },
      {
        id: 3,
        text: "`useLayoutEffect`, because it runs synchronously after DOM mutations but before the browser paints, letting you measure and mutate without a visible flash.",
      },
    ],
    correctOptionId: 3,
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
      { id: 0, text: "Nothing; effects never need cleanup for subscriptions." },
      {
        id: 1,
        text: "On each `roomId` change React runs the previous cleanup (disconnecting the old room) before connecting the new one, so cleanup must fully tear down the prior connection.",
      },
      {
        id: 2,
        text: "The dependency array should be empty to avoid reconnecting.",
      },
      {
        id: 3,
        text: "`connect` and `disconnect` should both run only at unmount.",
      },
    ],
    correctOptionId: 1,
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
      { id: 0, text: "It makes a function execute faster." },
      {
        id: 1,
        text: "It prevents the function from ever being recreated in memory.",
      },
      { id: 2, text: "It memoizes the function's return value." },
      {
        id: 3,
        text: "It returns a stable function identity across renders, which matters when that function is a dependency or a prop to a memoized child.",
      },
    ],
    correctOptionId: 3,
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
      { id: 0, text: "Wrap the list in `useMemo` so it never re-renders." },
      { id: 1, text: "Move rendering into a `useEffect`." },
      {
        id: 2,
        text: "Mark the expensive list update as non-urgent with `useTransition`, so the input stays responsive while the results render at lower priority.",
      },
      { id: 3, text: "Increase the debounce until it feels smooth." },
    ],
    correctOptionId: 2,
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
      { id: 0, text: "Wrapping `fetch` in `setTimeout`." },
      {
        id: 1,
        text: "Creating an `AbortController`, passing its `signal` to `fetch`, and calling `abort()` from the effect's cleanup.",
      },
      { id: 2, text: "Calling `setData(null)` before fetching." },
      { id: 3, text: "There is no way to cancel a `fetch`." },
    ],
    correctOptionId: 1,
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
    options: [
      { id: 0, text: "3, 1, 4, 2" },
      { id: 1, text: "1, 2, 3, 4" },
      { id: 2, text: "3, 4, 1, 2" },
      { id: 3, text: "3, 1, 2, 4" },
    ],
    correctOptionId: 0,
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
      {
        id: 0,
        text: "Bind `value` to state and update that state in an `onChange` handler.",
      },
      {
        id: 1,
        text: "Set only `defaultValue` and read the DOM node when you need the value.",
      },
      {
        id: 2,
        text: "Assign to `input.value` directly inside the render body.",
      },
      { id: 3, text: "Wrap the input in `useMemo`." },
    ],
    correctOptionId: 0,
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
      { id: 0, text: "todos.push(next)" },
      { id: 1, text: "setTodos(todos.push(next))" },
      { id: 2, text: "setTodos([...todos, next])" },
      { id: 3, text: "todos = [...todos, next]" },
    ],
    correctOptionId: 2,
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
      { id: 0, text: "Once, after mount only." },
      { id: 1, text: "Only when props change." },
      { id: 2, text: "Never, because there is no dependency array." },
      {
        id: 3,
        text: "After every render — the initial mount and every update.",
      },
    ],
    correctOptionId: 3,
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
      { id: 0, text: "Any re-render of the component." },
      { id: 1, text: "A change to the `userId` value between renders." },
      { id: 2, text: "Nothing; it runs only once." },
      { id: 3, text: "A change to any state anywhere in the component." },
    ],
    correctOptionId: 1,
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
      {
        id: 0,
        text: "A change to its state (via a setter) or to the props it receives.",
      },
      { id: 1, text: "Logging to the console during render." },
      { id: 2, text: "Mutating a plain local variable inside the component." },
      { id: 3, text: "Editing a module-level variable it happens to read." },
    ],
    correctOptionId: 0,
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
      { id: 0, text: "Only children whose props changed re-render." },
      {
        id: 1,
        text: "No children re-render unless they hold their own state.",
      },
      { id: 2, text: "React throws if the children lack keys." },
      {
        id: 3,
        text: "They re-render too, whether or not their props changed — unless memoized.",
      },
    ],
    correctOptionId: 3,
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
      {
        id: 0,
        text: "Keep a `loading` status in state; show the spinner while it is true and flip it when the fetch settles.",
      },
      {
        id: 1,
        text: "Block rendering with a `while` loop until the data is ready.",
      },
      { id: 2, text: "Read `document.readyState` during render." },
      { id: 3, text: "Fetch synchronously so no spinner is needed." },
    ],
    correctOptionId: 0,
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
      {
        id: 0,
        text: "An `async` function returns a Promise, but React expects an effect to return nothing or a cleanup function — declare the async function inside and call it.",
      },
      { id: 1, text: "`await` is not allowed inside effects at all." },
      { id: 2, text: "It forces the effect to run twice." },
      { id: 3, text: "`setData` cannot be called after an `await`." },
    ],
    correctOptionId: 0,
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
    options: [
      { id: 0, text: "1" },
      { id: 1, text: "It logs twice." },
      { id: 2, text: "undefined" },
      { id: 3, text: "0" },
    ],
    correctOptionId: 3,
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
      { id: 0, text: "`push` is asynchronous." },
      { id: 1, text: "Arrays cannot be stored in state." },
      { id: 2, text: "You must call `setItems` twice." },
      {
        id: 3,
        text: "`setItems` receives the same array reference it already holds, so React bails out of re-rendering; pass a new array instead.",
      },
    ],
    correctOptionId: 3,
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
      {
        id: 0,
        text: "A new object literal `{ id }` is created each render, so its reference always differs and the effect re-runs; depend on the primitive `id` instead.",
      },
      { id: 1, text: "`subscribe` mutates state." },
      { id: 2, text: "Objects cannot be used inside effects." },
      { id: 3, text: "The dependency array needs a second element." },
    ],
    correctOptionId: 0,
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
      {
        id: 0,
        text: "A `useRef` — its `.current` persists across renders and updating it does not trigger a render.",
      },
      { id: 1, text: "A module-level variable shared by all instances." },
      { id: 2, text: "A `useState` value." },
      { id: 3, text: "A `useMemo` with an empty dependency array." },
    ],
    correctOptionId: 0,
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
      { id: 0, text: "the component receives no props." },
      { id: 1, text: "you want it to render only once, ever." },
      {
        id: 2,
        text: "it re-renders often with the same props while its render work is non-trivial, and its props keep a stable identity.",
      },
      { id: 3, text: "it manages its own local state." },
    ],
    correctOptionId: 2,
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
      {
        id: 0,
        text: "Move the input and its state into a small child component, so the parent (and the chart) no longer re-render on every keystroke.",
      },
      { id: 1, text: "Wrap the whole component in `useMemo`." },
      { id: 2, text: "Debounce every render of the component." },
      { id: 3, text: "Store the input value on `window`." },
    ],
    correctOptionId: 0,
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
      { id: 0, text: "`fetch` retries 5xx responses automatically." },
      { id: 1, text: "You must use `XMLHttpRequest` to catch errors." },
      { id: 2, text: "500 responses are served from cache." },
      {
        id: 3,
        text: "`fetch` rejects only on network failures; HTTP 4xx/5xx still resolve, so you must check `response.ok` yourself.",
      },
    ],
    correctOptionId: 3,
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
      {
        id: 0,
        text: "`Promise.all` returns the successes and ignores the failure.",
      },
      { id: 1, text: "It waits and retries the failed request." },
      {
        id: 2,
        text: "`Promise.all` rejects as soon as any input rejects, discarding the others; use `Promise.allSettled` to get each result's status independently.",
      },
      { id: 3, text: "It resolves with `undefined` in place of the failure." },
    ],
    correctOptionId: 2,
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
      { id: 0, text: "`useEffect` combined with `useState`." },
      { id: 1, text: "`useMemo`." },
      { id: 2, text: "`useReducer`." },
      { id: 3, text: "`useSyncExternalStore`." },
    ],
    correctOptionId: 3,
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
      { id: 0, text: "Two — updates outside React events are never batched." },
      { id: 1, text: "It depends on how deep the component is." },
      { id: 2, text: "Zero until the next user event." },
      {
        id: 3,
        text: "One — React 18 automatically batches updates from timeouts, promises, and native handlers too.",
      },
    ],
    correctOptionId: 3,
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
      {
        id: 0,
        text: "In a `useEffect` that writes the result into separate state.",
      },
      { id: 1, text: "In a `useLayoutEffect`." },
      {
        id: 2,
        text: "Directly during render — optionally wrapped in `useMemo` — with no effect at all.",
      },
      { id: 3, text: "In a ref updated on every render." },
    ],
    correctOptionId: 2,
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
      {
        id: 0,
        text: "`forwardRef` together with `useImperativeHandle` to expose a limited method surface.",
      },
      { id: 1, text: "`useMemo` and context." },
      { id: 2, text: "A global event bus." },
      { id: 3, text: "`useState` storing the DOM node." },
    ],
    correctOptionId: 0,
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
      {
        id: 0,
        text: "Virtualize the list — render only the rows in and near the viewport, recycling them as the user scrolls.",
      },
      { id: 1, text: "Wrap every row in `React.memo`." },
      { id: 2, text: "Move the list rendering into a `useEffect`." },
      { id: 3, text: "Re-fetch a page on every scroll pixel." },
    ],
    correctOptionId: 0,
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
      { id: 0, text: "`useMemo`." },
      { id: 1, text: "`useLayoutEffect`." },
      { id: 2, text: "`useRef`." },
      {
        id: 3,
        text: "`useDeferredValue`, which returns a deferred copy of the value so the expensive render can lag behind the urgent input update.",
      },
    ],
    correctOptionId: 3,
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
      { id: 0, text: "The component renders with `undefined` data." },
      { id: 1, text: "React throws an unhandled error." },
      {
        id: 2,
        text: "The component suspends and React shows the nearest `<Suspense>` boundary's `fallback` until the data resolves.",
      },
      { id: 3, text: "The effect retries silently in the background." },
    ],
    correctOptionId: 2,
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
      { id: 0, text: "Nothing; this is already optimal." },
      { id: 1, text: "Only the last request actually runs." },
      { id: 2, text: "Effects cannot fetch, so it never completes." },
      {
        id: 3,
        text: "It is a waterfall: each request waits for a parent to render and fetch first; hoist or parallelize the independent fetches (or preload) so they run concurrently.",
      },
    ],
    correctOptionId: 3,
    explanation:
      "Chaining fetches through nested components serializes them into a waterfall, adding a round-trip per level. Kick off independent requests together (lift data loading, `Promise.all`, or route-level preloading) so total latency is one round-trip, not N.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },

  // ══ BATCH B ════════════════════════════════════════════════════════════════
  // A third and fourth core + advanced item per bucket (→ 4 core + 4 advanced
  // each). Deepens the randomization pool further; topics stay distinct from
  // the items above. Per-bucket floor enforced by db/__tests__/seedData.test.ts.

  // ── JUNIOR · Reactivity & State ───────────────────────────────────────────
  {
    id: "react-junior-reactivity-core-03",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.REACTIVITY,
    title: "Tracking two independent values",
    prompt:
      "You need to track a `name` string and an `age` number independently. What is the idiomatic hook usage?",
    codeBlock: null,
    options: [
      { id: 0, text: "One `useState` call is the maximum per component." },
      { id: 1, text: "Store both on a single `useRef`." },
      {
        id: 2,
        text: "Call `useState` twice — one for `name` and one for `age`.",
      },
      { id: 3, text: "Wrap each value in its own `useMemo`." },
    ],
    correctOptionId: 2,
    explanation:
      "A component may call `useState` as many times as it needs. Two independent values are cleanest as two separate state variables; grouping them in one object works too but then every update must spread the unchanged fields.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.SUDHEERJ_REACT,
  },
  {
    id: "react-junior-reactivity-core-04",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.REACTIVITY,
    title: "Toggling a boolean",
    prompt: "`open` is a boolean in state. Which handler reliably flips it?",
    codeBlock: null,
    options: [
      { id: 0, text: "open = !open" },
      { id: 1, text: "setOpen((o) => !o)" },
      { id: 2, text: "setOpen(open)" },
      { id: 3, text: "open.toggle()" },
    ],
    correctOptionId: 1,
    explanation:
      "Use the setter with the updater form `setOpen(o => !o)` so the flip is based on the latest value. Reassigning `open` directly does not notify React, and `setOpen(open)` sets it to its current value.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-junior-reactivity-adv-03",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.REACTIVITY,
    title: "Making three increments add up",
    prompt:
      "You want three `+1` updates in one handler to increase count by 3. Which call form works?",
    codeBlock: null,
    options: [
      { id: 0, text: "setCount(count + 1), three times" },
      { id: 1, text: "setCount(count + 3) is the only way" },
      { id: 2, text: "count = count + 3" },
      { id: 3, text: "setCount((c) => c + 1), three times" },
    ],
    correctOptionId: 3,
    explanation:
      "The updater form `setCount(c => c + 1)` queues functions that each receive the latest pending value, so three of them accumulate to +3. Passing `count + 1` reads the same render's value three times, collapsing to +1.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-junior-reactivity-adv-04",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.REACTIVITY,
    title: "Updating one field of an object in state",
    prompt: "How do you update just `user.name` and trigger a re-render?",
    codeBlock: "const [user, setUser] = useState({ name: '', age: 0 })",
    options: [
      { id: 0, text: "setUser({ ...user, name: next })" },
      { id: 1, text: "setUser({ name: next })" },
      { id: 2, text: "user.name = next" },
      { id: 3, text: "setUser((user.name = next))" },
    ],
    correctOptionId: 0,
    explanation:
      "Create a new object that copies the old fields and overrides one: `setUser({ ...user, name: next })`. Mutating `user.name` keeps the same reference (no re-render), and `setUser({ name: next })` would drop `age`.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.SUDHEERJ_REACT,
  },

  // ── JUNIOR · Lifecycle & Effects ──────────────────────────────────────────
  {
    id: "react-junior-lifecycle-core-03",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.LIFECYCLE,
    title: "What effects are for",
    prompt: "In React, what is `useEffect` primarily meant to do?",
    codeBlock: null,
    options: [
      { id: 0, text: "Render JSX conditionally." },
      { id: 1, text: "Replace all event handlers." },
      {
        id: 2,
        text: "Synchronize a component with an external system or run side effects after render (subscriptions, timers, manual DOM, fetching).",
      },
      { id: 3, text: "Memoize expensive values." },
    ],
    correctOptionId: 2,
    explanation:
      "Effects let you step outside React to synchronize with external systems — subscriptions, timers, network, non-React DOM — after the render is committed. Pure rendering and user-event logic do not belong there.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.SUDHEERJ_REACT,
  },
  {
    id: "react-junior-lifecycle-core-04",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.LIFECYCLE,
    title: "Purpose of the cleanup function",
    prompt: "Why does an effect return a function?",
    codeBlock: null,
    options: [
      { id: 0, text: "To return JSX to render." },
      { id: 1, text: "It is decorative and has no behavior." },
      { id: 2, text: "To memoize the effect." },
      {
        id: 3,
        text: "To undo what the effect set up — e.g. clear a timer or remove a subscription — before the next run and on unmount.",
      },
    ],
    correctOptionId: 3,
    explanation:
      "The returned cleanup undoes the effect's setup. React runs it before re-running the effect (deps changed) and once at unmount, preventing leaks like dangling intervals or duplicate listeners.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.SUDHEERJ_REACT,
  },
  {
    id: "react-junior-lifecycle-adv-03",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.LIFECYCLE,
    title: "Effect with a value dependency",
    prompt: "How often does this effect run?",
    codeBlock: [
      "useEffect(() => {",
      "  document.title = `Count: ${count}`",
      "}, [count])",
    ].join("\n"),
    options: [
      {
        id: 0,
        text: "After every render where `count` differs from the previous render.",
      },
      { id: 1, text: "Once, after mount only." },
      { id: 2, text: "Never." },
      { id: 3, text: "Before every render." },
    ],
    correctOptionId: 0,
    explanation:
      "With `[count]`, React runs the effect after the initial mount and then after any render where `count` changed (compared with `Object.is`). Renders that do not change `count` skip it.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-junior-lifecycle-adv-04",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.LIFECYCLE,
    title: "Effect that loops forever",
    prompt: "What happens with this effect?",
    codeBlock: ["useEffect(() => {", "  setCount(count + 1)", "})"].join("\n"),
    options: [
      {
        id: 0,
        text: "It loops infinitely: with no dependency array it runs after every render, and each `setCount` triggers another render.",
      },
      { id: 1, text: "It never runs." },
      { id: 2, text: "It runs exactly once." },
      { id: 3, text: "React batches it into a single update." },
    ],
    correctOptionId: 0,
    explanation:
      "No dependency array means the effect runs after every render. Calling `setCount` schedules a new render, which runs the effect again — an infinite loop. Add a dependency array (or a condition) so it settles.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },

  // ── JUNIOR · Performance & Optimization ───────────────────────────────────
  {
    id: "react-junior-performance-core-03",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.PERFORMANCE,
    title: "Where the key goes",
    prompt: "When rendering a list with `.map`, which element gets the `key`?",
    codeBlock: ["items.map((item) => (", "  <li>{item.label}</li>", "))"].join(
      "\n",
    ),
    options: [
      { id: 0, text: "Any child element deep inside the item." },
      {
        id: 1,
        text: "The outermost element returned for each item (here the `<li>`).",
      },
      { id: 2, text: "The `<ul>` wrapping the whole list." },
      { id: 3, text: "No element — keys are automatic." },
    ],
    correctOptionId: 1,
    explanation:
      "The `key` belongs on the top-level element produced for each list item — the `<li>` here — so React can identify siblings. Putting it deeper or on the container does not give the items stable identity.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.SUDHEERJ_REACT,
  },
  {
    id: "react-junior-performance-core-04",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.PERFORMANCE,
    title: "Re-render vs DOM update",
    prompt:
      "A component re-renders but produces identical output. What does React do to the DOM?",
    codeBlock: null,
    options: [
      { id: 0, text: "Rebuilds the entire DOM subtree." },
      { id: 1, text: "Nothing — re-rendering always skips the DOM entirely." },
      { id: 2, text: "Reloads the page." },
      {
        id: 3,
        text: "Compares the new elements to the previous ones and updates only what actually changed (often nothing).",
      },
    ],
    correctOptionId: 3,
    explanation:
      "Re-rendering produces new React elements; React diffs them against the previous tree and commits only real differences. An identical render results in no DOM mutations, though the component function still ran.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-junior-performance-adv-03",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.PERFORMANCE,
    title: "Random values as keys",
    prompt: "A list uses `key={Math.random()}`. What goes wrong?",
    codeBlock: null,
    options: [
      { id: 0, text: "Nothing — random keys are the most unique." },
      { id: 1, text: "React rejects numeric keys." },
      {
        id: 2,
        text: "A new key is generated every render, so React cannot match items across renders and remounts them — losing DOM state, focus, and performance.",
      },
      { id: 3, text: "It only affects TypeScript types." },
    ],
    correctOptionId: 2,
    explanation:
      "Keys must be stable across renders. `Math.random()` produces a different key each render, so React treats every item as brand-new — unmounting and remounting them, discarding input/focus state and doing needless work. Use a stable id.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-junior-performance-adv-04",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.PERFORMANCE,
    title: "Defining a component inside another",
    prompt:
      "`List` defines `Row` inside its body and renders it. Why do rows lose their state on every `List` render?",
    codeBlock: [
      "function List() {",
      "  function Row() { /* ... */ }",
      "  return items.map(() => <Row />)",
      "}",
    ].join("\n"),
    options: [
      { id: 0, text: "Rows cannot hold state." },
      { id: 1, text: "Missing keys cause it." },
      {
        id: 2,
        text: "A new `Row` function is created on each `List` render, so React sees a different component type and remounts every row, resetting their state.",
      },
      { id: 3, text: "`map` clears state." },
    ],
    correctOptionId: 2,
    explanation:
      "Declaring a component inside another creates a brand-new function identity each render. React compares by type, sees a 'different' component, and remounts it — wiping local state. Define components at module scope and pass data via props.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },

  // ── JUNIOR · Async & Data ────────────────────────────────────────────────
  {
    id: "react-junior-async-core-03",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.ASYNC,
    title: "Handling a failed fetch",
    prompt:
      "Besides loading and data, what third piece of state makes a fetch UI robust?",
    codeBlock: null,
    options: [
      { id: 0, text: "A `color` state." },
      { id: 1, text: "A `key` state." },
      {
        id: 2,
        text: "An `error` state, set in a `catch`, so you can show a message instead of a blank screen.",
      },
      { id: 3, text: "None — failures can be ignored." },
    ],
    correctOptionId: 2,
    explanation:
      "Model the request as loading / data / error. Catch rejections and store an error value so the UI can render a message and a retry, rather than hanging on the spinner or crashing.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-junior-async-core-04",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.ASYNC,
    title: "Reading a JSON body",
    prompt:
      "After `const res = await fetch(url)`, how do you get the parsed JSON body?",
    codeBlock: null,
    options: [
      { id: 0, text: "Read `res.body` directly." },
      { id: 1, text: "`res.json()` synchronously returns the object." },
      {
        id: 2,
        text: "`await res.json()` — it returns a promise that resolves to the parsed data.",
      },
      { id: 3, text: "`JSON.parse(res)`." },
    ],
    correctOptionId: 2,
    explanation:
      "`res.json()` itself returns a promise (the body is read as a stream), so you must `await res.json()`. `res` is the response wrapper, not the parsed data.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.LYDIAHALLIE_JS,
  },
  {
    id: "react-junior-async-adv-03",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.ASYNC,
    title: "Where await is allowed",
    prompt: "This line throws a syntax error. Why?",
    codeBlock: [
      "function load() {",
      "  const data = await fetch(url)",
      "}",
    ].join("\n"),
    options: [
      { id: 0, text: "`fetch` is not a function." },
      {
        id: 1,
        text: "`await` can only be used inside an `async` function (or at a module's top level) — mark `load` as `async`.",
      },
      { id: 2, text: "`const` cannot hold a promise." },
      { id: 3, text: "You must use `.then` only." },
    ],
    correctOptionId: 1,
    explanation:
      "`await` is valid only inside an `async` function or at the top level of a module. Add `async` to `load` (`async function load()`), or use `.then` instead.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.LYDIAHALLIE_JS,
  },
  {
    id: "react-junior-async-adv-04",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.ASYNC,
    title: "Forgetting to await",
    prompt: "What is `user` here?",
    codeBlock: [
      "async function getUser() {",
      "  const user = fetchUser()",
      "  return user.name",
      "}",
    ].join("\n"),
    options: [
      { id: 0, text: "The resolved user object." },
      { id: 1, text: "The string 'name'." },
      { id: 2, text: "null" },
      {
        id: 3,
        text: "A pending Promise, so `user.name` is `undefined` — you forgot to `await fetchUser()`.",
      },
    ],
    correctOptionId: 3,
    explanation:
      "`fetchUser()` returns a promise; without `await`, `user` is that promise, not the resolved value, so `user.name` is `undefined`. Write `const user = await fetchUser()`.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.LYDIAHALLIE_JS,
  },

  // ── MID · Reactivity & State ──────────────────────────────────────────────
  {
    id: "react-mid-reactivity-core-03",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.REACTIVITY,
    title: "Avoiding a stale value across updates",
    prompt:
      "A handler calls `setCount` several times based on the current count and gets the wrong total. What is the fix?",
    codeBlock: null,
    options: [
      { id: 0, text: "Call `setCount` once with a hardcoded number." },
      {
        id: 1,
        text: "Use the updater form `setCount(c => c + 1)` so each update sees the latest pending value.",
      },
      { id: 2, text: "Wrap `count` in a `useRef`." },
      { id: 3, text: "Add a dependency array to the component." },
    ],
    correctOptionId: 1,
    explanation:
      "When the next state depends on the previous, pass a function to the setter. React applies queued updaters in order against the latest value, avoiding the stale result of reading the render's `count` repeatedly.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.SUDHEERJ_REACT,
  },
  {
    id: "react-mid-reactivity-core-04",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.REACTIVITY,
    title: "Updating a nested field",
    prompt:
      "`form` is `{ email, prefs }` in state. How do you change only `email`?",
    codeBlock: null,
    options: [
      { id: 0, text: "form.email = next; setForm(form)" },
      { id: 1, text: "setForm({ ...form, email: next })" },
      { id: 2, text: "setForm({ email: next })" },
      { id: 3, text: "setForm((prev) => (prev.email = next))" },
    ],
    correctOptionId: 1,
    explanation:
      "Spread the previous object and override the field: `setForm({ ...form, email: next })`. `setForm({ email: next })` drops `prefs`; `form.email = next; setForm(form)` mutates the existing object and passes the same reference, so React can skip re-rendering; `setForm((prev) => (prev.email = next))` mutates `prev` and returns the assigned value rather than the form object.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.SUDHEERJ_REACT,
  },
  {
    id: "react-mid-reactivity-adv-03",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.REACTIVITY,
    title: "Resetting a component's state",
    prompt:
      "`<Profile userId={id} />` keeps stale internal state when `id` changes. What is the cleanest React way to reset it?",
    codeBlock: null,
    options: [
      { id: 0, text: "Clear every state field in an effect on id change." },
      { id: 1, text: "Call a `forceUpdate` helper." },
      {
        id: 2,
        text: "Give it a changing `key`: `<Profile key={id} userId={id} />` so React remounts it fresh when id changes.",
      },
      { id: 3, text: "Move all of its state to the parent." },
    ],
    correctOptionId: 2,
    explanation:
      "Changing a component's `key` makes React treat it as a new instance and remount it, discarding its state. `key={id}` cleanly resets `<Profile>` per user — simpler and less bug-prone than manually resetting each field in an effect.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-mid-reactivity-adv-04",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.REACTIVITY,
    title: "Storing derivable data in state",
    prompt:
      "A component keeps `items` and `itemCount` both in state and they drift out of sync. What is the root problem?",
    codeBlock: null,
    options: [
      { id: 0, text: "State cannot hold arrays." },
      { id: 1, text: "It needs `useReducer`." },
      {
        id: 2,
        text: "`itemCount` is derivable from `items`, so storing it separately creates two sources of truth; compute it during render instead.",
      },
      { id: 3, text: "The effect dependencies are wrong." },
    ],
    correctOptionId: 2,
    explanation:
      "Anything you can compute from existing state/props should not live in its own state. Derive `items.length` during render. Duplicating it means every mutation must update both, and any miss causes drift.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.SUDHEERJ_REACT,
  },

  // ── MID · Lifecycle & Effects ─────────────────────────────────────────────
  {
    id: "react-mid-lifecycle-core-03",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.LIFECYCLE,
    title: "When cleanup runs on dependency change",
    prompt:
      "An effect depends on `[roomId]` and returns a cleanup. When `roomId` changes, what is the order?",
    codeBlock: null,
    options: [
      { id: 0, text: "Only the new effect runs; cleanup waits for unmount." },
      {
        id: 1,
        text: "React runs the previous cleanup first (for the old roomId), then runs the effect for the new roomId.",
      },
      { id: 2, text: "The effect runs, then its own cleanup immediately." },
      { id: 3, text: "Nothing runs until unmount." },
    ],
    correctOptionId: 1,
    explanation:
      "On a dependency change React cleans up the previous effect before setting up the next, so you disconnect the old room before connecting the new one. Cleanup also runs a final time at unmount.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.SUDHEERJ_REACT,
  },
  {
    id: "react-mid-lifecycle-core-04",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.LIFECYCLE,
    title: "A function in the dependency array",
    prompt:
      "The lint rule wants a helper function in the effect's deps, but adding it re-runs the effect every render. What is the fix?",
    codeBlock: null,
    options: [
      { id: 0, text: "Disable the lint rule permanently." },
      { id: 1, text: "Delete the dependency array." },
      {
        id: 2,
        text: "Wrap the function in `useCallback` (or move it inside the effect) so its identity is stable.",
      },
      { id: 3, text: "Convert the function to a class method." },
    ],
    correctOptionId: 2,
    explanation:
      "A function declared in the component body is recreated each render, so listing it in deps re-runs the effect constantly. Stabilize it with `useCallback` (correct deps) or define it inside the effect so it is not a dependency.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.SUDHEERJ_REACT,
  },
  {
    id: "react-mid-lifecycle-adv-03",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.LIFECYCLE,
    title: "A listener stuck on old state",
    prompt:
      "An effect with `[]` adds a `keydown` listener that logs `count`, but it always logs 0. Why?",
    codeBlock: [
      "useEffect(() => {",
      "  const onKey = () => console.log(count)",
      "  window.addEventListener('keydown', onKey)",
      "  return () => window.removeEventListener('keydown', onKey)",
      "}, [])",
    ].join("\n"),
    options: [
      { id: 0, text: "`count` is not really state." },
      {
        id: 1,
        text: "The listener closes over the first render's `count`; with `[]` the effect never re-subscribes with a fresh value. Add `count` to deps or read it from a ref.",
      },
      { id: 2, text: "`keydown` fires too fast." },
      { id: 3, text: "`removeEventListener` is called incorrectly." },
    ],
    correctOptionId: 1,
    explanation:
      "The handler captures `count` from the render that ran the effect. With `[]` it is set up once and keeps the initial value forever. Include `count` in deps (re-subscribes) or keep the latest value in a ref the handler reads.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-mid-lifecycle-adv-04",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.LIFECYCLE,
    title: "Syncing props into state with an effect",
    prompt:
      "A component copies `props.value` into state inside a `useEffect` on every prop change. What is the better approach?",
    codeBlock: null,
    options: [
      { id: 0, text: "It is already ideal." },
      {
        id: 1,
        text: "Do not mirror it: use the prop directly during render (a derived value), or reset with a `key` — avoiding the extra render and drift the effect introduces.",
      },
      { id: 2, text: "Use `useLayoutEffect` instead." },
      { id: 3, text: "Store it in a ref." },
    ],
    correctOptionId: 1,
    explanation:
      "Syncing props to state via an effect causes an extra render and a second source of truth that can drift. If the value is fully determined by props, read it during render; to reset internal state on change, use a `key`.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.SUDHEERJ_REACT,
  },

  // ── MID · Performance & Optimization ───────────────────────────────────
  {
    id: "react-mid-performance-core-03",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.PERFORMANCE,
    title: "What useCallback returns",
    prompt: "What does `useCallback(fn, deps)` give you?",
    codeBlock: null,
    options: [
      { id: 0, text: "A function that executes faster." },
      { id: 1, text: "The memoized return value of the function." },
      {
        id: 2,
        text: "The same function reference across renders until a dependency changes.",
      },
      { id: 3, text: "A debounced version of the function." },
    ],
    correctOptionId: 2,
    explanation:
      "`useCallback` preserves a function's identity between renders (until deps change). That referential stability matters when the function is passed to a `React.memo` child or used in another hook's dependency array; otherwise it is overhead.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.SUDHEERJ_REACT,
  },
  {
    id: "react-mid-performance-core-04",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.PERFORMANCE,
    title: "The cost of memoization",
    prompt: "Why not wrap every value and callback in `useMemo`/`useCallback`?",
    codeBlock: null,
    options: [
      { id: 0, text: "They break the rules of hooks." },
      {
        id: 1,
        text: "Memoization is not free — it adds memory and comparison cost, so it only pays off for expensive computations or values that need a stable identity.",
      },
      { id: 2, text: "They only work in production builds." },
      { id: 3, text: "They disable re-renders entirely." },
    ],
    correctOptionId: 1,
    explanation:
      "Each memo hook stores a value and compares dependencies every render. For cheap values that overhead can exceed the savings. Reach for them when a computation is genuinely expensive or a stable reference is required by a memoized child/effect.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-mid-performance-adv-03",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.PERFORMANCE,
    title: "Passing children to skip re-renders",
    prompt:
      "A `Wrapper` re-renders often (it holds a counter), but its `children` are expensive and unrelated. Why do the children not re-render when passed as `props.children`?",
    codeBlock: ["<Wrapper>", "  <ExpensiveTree />", "</Wrapper>"].join("\n"),
    options: [
      { id: 0, text: "Children never re-render, ever." },
      { id: 1, text: "`Wrapper` is memoized automatically." },
      {
        id: 2,
        text: "`<ExpensiveTree />` is created by the parent and passed in as a stable prop, so Wrapper's own re-renders do not recreate it — React reuses the same element.",
      },
      { id: 3, text: "It is a coincidence of timing." },
    ],
    correctOptionId: 2,
    explanation:
      "The element is constructed where it is written (the parent) and handed to Wrapper as `children`. When Wrapper re-renders from its own state, the `children` prop is the same element reference, so React skips that subtree — the 'pass children / move state down' pattern.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-mid-performance-adv-04",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.PERFORMANCE,
    title: "A memo that will not update",
    prompt:
      "`const total = useMemo(() => sum(items), [])` shows a stale total when `items` changes. Why?",
    codeBlock: null,
    options: [
      { id: 0, text: "`useMemo` cannot compute sums." },
      {
        id: 1,
        text: "The empty dependency array means it computes once and never recomputes; include `items` in the deps.",
      },
      { id: 2, text: "`sum` is impure." },
      { id: 3, text: "`useMemo` needs a `useEffect` alongside it." },
    ],
    correctOptionId: 1,
    explanation:
      "`useMemo` recomputes only when a dependency changes. With `[]` it caches the first result forever, so later `items` changes are not reflected. The deps must include every reactive value the calculation reads — here `[items]`.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },

  // ── MID · Async & Data ────────────────────────────────────────────────
  {
    id: "react-mid-async-core-03",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.ASYNC,
    title: "The return type of an async function",
    prompt: "What does `getValue` return?",
    codeBlock: ["async function getValue() {", "  return 42", "}"].join("\n"),
    options: [
      { id: 0, text: "A Promise that resolves to 42." },
      { id: 1, text: "The number 42." },
      { id: 2, text: "undefined" },
      { id: 3, text: "A syntax error." },
    ],
    correctOptionId: 0,
    explanation:
      "An `async` function always returns a Promise; a plain `return 42` resolves that promise with 42. Callers must `await getValue()` (or use `.then`) to read the value.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.LYDIAHALLIE_JS,
  },
  {
    id: "react-mid-async-core-04",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.ASYNC,
    title: "When sequential awaits are correct",
    prompt:
      "You need the user's id from the first request to make the second. Is running them in parallel appropriate?",
    codeBlock: null,
    options: [
      { id: 0, text: "Yes, always parallelize requests." },
      { id: 1, text: "Neither request can be awaited." },
      { id: 2, text: "Yes, `Promise.all` handles the dependency for you." },
      {
        id: 3,
        text: "No — the second request depends on the first's result, so they must run sequentially; only independent requests should be parallelized.",
      },
    ],
    correctOptionId: 3,
    explanation:
      "Parallelism helps only for independent work. When the second call needs data from the first, awaiting them in sequence is required. Reserve `Promise.all` for requests that do not depend on each other.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-mid-async-adv-03",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.ASYNC,
    title: "Timing out a slow request",
    prompt:
      "Which built-in lets you reject if a fetch does not settle within 5s?",
    codeBlock: null,
    options: [
      { id: 0, text: "Promise.all([...])" },
      {
        id: 1,
        text: "Promise.race([fetch(...), timeout(5000)]) — whichever settles first wins.",
      },
      { id: 2, text: "Promise.allSettled([...])" },
      { id: 3, text: "await with a longer delay" },
    ],
    correctOptionId: 1,
    explanation:
      "`Promise.race` settles as soon as the first input settles. Racing the fetch against a promise that rejects after 5s implements a timeout. Combine it with `AbortController` to also cancel the underlying request.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.LYDIAHALLIE_JS,
  },
  {
    id: "react-mid-async-adv-04",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.ASYNC,
    title: "Avoiding a request per keystroke",
    prompt:
      "A search box fires a fetch on every keystroke, flooding the server. What is the standard fix?",
    codeBlock: null,
    options: [
      { id: 0, text: "Make the fetch faster." },
      { id: 1, text: "Move the fetch into render." },
      { id: 2, text: "Use `Promise.all`." },
      {
        id: 3,
        text: "Debounce the input — wait until typing pauses (e.g. 300ms) before firing, and cancel the pending request on each new keystroke.",
      },
    ],
    correctOptionId: 3,
    explanation:
      "Debouncing delays the request until the user stops typing for a short interval, collapsing a burst of keystrokes into one call. Pair it with cancellation (clear the timer / abort in flight) so only the final query runs.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },

  // ── SENIOR · Reactivity & State ───────────────────────────────────────────
  {
    id: "react-senior-reactivity-core-03",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.REACTIVITY,
    title: "Rules for a reducer",
    prompt: "Which statement about a `useReducer` reducer is correct?",
    codeBlock: null,
    options: [
      { id: 0, text: "It may perform side effects like fetching." },
      {
        id: 1,
        text: "It must be a pure function: given state and action, return the next state without mutation or side effects.",
      },
      { id: 2, text: "It must mutate the state object in place." },
      { id: 3, text: "It runs asynchronously." },
    ],
    correctOptionId: 1,
    explanation:
      "A reducer must be pure — no fetching, no mutation, no I/O. It computes the next state from the current state and the action, returning a new object. Side effects belong in event handlers or effects, not the reducer.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.SUDHEERJ_REACT,
  },
  {
    id: "react-senior-reactivity-core-04",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.REACTIVITY,
    title: "Identity of setState and dispatch",
    prompt:
      "Is it safe to omit a `useState` setter or `useReducer` `dispatch` from an effect's dependency array?",
    codeBlock: null,
    options: [
      {
        id: 0,
        text: "Yes — React guarantees these functions are stable across renders, so they need not be dependencies.",
      },
      { id: 1, text: "No, they change every render." },
      { id: 2, text: "Only in production." },
      { id: 3, text: "Only if wrapped in `useCallback`." },
    ],
    correctOptionId: 0,
    explanation:
      "React guarantees the identity of `setState` setters and `dispatch` is stable for the component's lifetime, so the lint rule allows omitting them from dependency arrays. Values they close over are not stable, but the functions themselves are.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.SUDHEERJ_REACT,
  },
  {
    id: "react-senior-reactivity-adv-03",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.REACTIVITY,
    title: "What 'tearing' means",
    prompt:
      "In concurrent React, why can reading an external mutable store with plain `useState` + `useEffect` be unsafe?",
    codeBlock: null,
    options: [
      { id: 0, text: "It is always safe." },
      { id: 1, text: "It disables Suspense." },
      { id: 2, text: "It causes hydration to be skipped." },
      {
        id: 3,
        text: "During a concurrent render the store can change mid-render, so different components read different values — 'tearing' (visual inconsistency). `useSyncExternalStore` prevents it.",
      },
    ],
    correctOptionId: 3,
    explanation:
      "Concurrent rendering can pause and resume. If an external store mutates between reads, parts of the same render see different snapshots — tearing. `useSyncExternalStore` gives React a consistent snapshot and forces a re-render on change, avoiding it.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-senior-reactivity-adv-04",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.REACTIVITY,
    title: "Forcing a synchronous update",
    prompt:
      "You must read updated DOM layout immediately after a state change, before the browser paints. Which API opts out of batching to flush synchronously?",
    codeBlock: null,
    options: [
      { id: 0, text: "useMemo" },
      { id: 1, text: "useEffect" },
      {
        id: 2,
        text: "flushSync(() => setState(...)) from react-dom, used sparingly because it forgoes batching.",
      },
      { id: 3, text: "startTransition" },
    ],
    correctOptionId: 2,
    explanation:
      "`flushSync` forces React to apply the enclosed updates and commit to the DOM synchronously, so you can measure layout right after. It defeats automatic batching and hurts performance, so it is a last resort — the opposite of `startTransition`.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },

  // ── SENIOR · Lifecycle & Effects ──────────────────────────────────────────
  {
    id: "react-senior-lifecycle-core-03",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.LIFECYCLE,
    title: "Why an effect keeps re-running",
    prompt:
      "An effect lists a component-defined `handler` in its deps and re-runs every render even when nothing meaningful changed. Best explanation?",
    codeBlock: null,
    options: [
      { id: 0, text: "Effects always run every render." },
      {
        id: 1,
        text: "`handler` is recreated each render, so its reference differs every time; memoize it with `useCallback` or move it inside the effect.",
      },
      { id: 2, text: "React ignores dependency arrays for functions." },
      { id: 3, text: "The effect must use `useLayoutEffect`." },
    ],
    correctOptionId: 1,
    explanation:
      "Functions defined in the render body get a fresh identity each render. Listing such a function as a dependency makes the effect see a 'changed' dep every time. Stabilize with `useCallback` or inline the function within the effect.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.SUDHEERJ_REACT,
  },
  {
    id: "react-senior-lifecycle-core-04",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.LIFECYCLE,
    title: "Refs and dependency arrays",
    prompt:
      "Do you need to include a `useRef` object in an effect's dependency array?",
    codeBlock: null,
    options: [
      { id: 0, text: "Yes, always." },
      { id: 1, text: "Refs cannot be used in effects." },
      { id: 2, text: "Only its `.current` value." },
      {
        id: 3,
        text: "No — the ref object's identity is stable across renders and reading/writing `.current` is not reactive, so it need not be a dependency.",
      },
    ],
    correctOptionId: 3,
    explanation:
      "`useRef` returns the same object every render, and mutating `.current` does not trigger renders or count as a reactive read. So the ref itself is a stable, dependency-free handle — you do not list it, nor does changing `.current` re-run effects.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.SUDHEERJ_REACT,
  },
  {
    id: "react-senior-lifecycle-adv-03",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.LIFECYCLE,
    title: "Reading the latest value without re-subscribing",
    prompt:
      "A subscription set up in an effect (deps `[]`) needs the latest `onMessage` callback without tearing down the subscription each time it changes. A common pattern is…",
    codeBlock: null,
    options: [
      { id: 0, text: "Add `onMessage` to deps and reconnect on every change." },
      { id: 1, text: "Move the subscription into render." },
      { id: 2, text: "Use `useMemo` on the callback." },
      {
        id: 3,
        text: "Keep the callback in a ref updated each render, and have the stable subscription read `ref.current` — getting the latest without re-subscribing.",
      },
    ],
    correctOptionId: 3,
    explanation:
      "Store the changing callback in a ref (updated during render or a tiny effect) and have the long-lived subscription call `ref.current`. The subscription stays set up once while always invoking the newest handler — the idea React formalizes as an Effect Event.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-senior-lifecycle-adv-04",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.LIFECYCLE,
    title: "A subscription without cleanup",
    prompt:
      "An effect calls `socket.subscribe(handler)` but returns no cleanup. What is the consequence?",
    codeBlock: [
      "useEffect(() => {",
      "  socket.subscribe(handler)",
      "}, [roomId])",
    ].join("\n"),
    options: [
      {
        id: 0,
        text: "Each roomId change (and StrictMode remount) adds another subscription without removing the old one — leaking handlers and causing duplicate events.",
      },
      { id: 1, text: "Nothing; cleanup is optional here." },
      { id: 2, text: "The component will not render." },
      { id: 3, text: "`handler` runs only once." },
    ],
    correctOptionId: 0,
    explanation:
      "Without returning `() => socket.unsubscribe(handler)`, every re-run stacks a new subscription on top of the old. Over dependency changes, unmounts, and StrictMode's dev remount, handlers leak and events fire multiple times. Always tear down what you set up.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.SUDHEERJ_REACT,
  },

  // ── SENIOR · Performance & Optimization ───────────────────────────────────
  {
    id: "react-senior-performance-core-03",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.PERFORMANCE,
    title: "Before optimizing",
    prompt:
      "A page feels slow. What is the disciplined first step before adding memoization?",
    codeBlock: null,
    options: [
      {
        id: 0,
        text: "Measure with the React DevTools Profiler (and browser performance tools) to find what actually re-renders or costs time.",
      },
      { id: 1, text: "Wrap everything in `React.memo`." },
      { id: 2, text: "Rewrite the components as classes." },
      { id: 3, text: "Remove all keys." },
    ],
    correctOptionId: 0,
    explanation:
      "Optimize from evidence. The React DevTools Profiler shows which components render, how often, and why, so you target the real bottleneck instead of scattering memoization that adds complexity and cost without measured benefit.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-senior-performance-core-04",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.PERFORMANCE,
    title: "Why a memoized child still re-renders",
    prompt:
      "`Child` is wrapped in `React.memo` but re-renders whenever the parent does. Which combination actually lets it skip?",
    codeBlock: null,
    options: [
      { id: 0, text: "`React.memo` alone is always enough." },
      { id: 1, text: "A `key` prop on the child." },
      { id: 2, text: "A `useEffect` in the child." },
      {
        id: 3,
        text: "`React.memo` plus stable props — object props via `useMemo` and function props via `useCallback` — so the shallow prop comparison passes.",
      },
    ],
    correctOptionId: 3,
    explanation:
      "`React.memo` only skips when props are shallowly equal. If the parent passes new inline objects/functions each render, the comparison fails. Stabilize those props with `useMemo`/`useCallback` so the whole chain aligns and the child can bail out.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.SUDHEERJ_REACT,
  },
  {
    id: "react-senior-performance-adv-03",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.PERFORMANCE,
    title: "Splitting context to limit re-renders",
    prompt:
      "One big context holds both a fast-changing `mousePos` and a rarely-changing `theme`; all consumers re-render constantly. Best fix?",
    codeBlock: null,
    options: [
      {
        id: 0,
        text: "Split into two providers (theme vs mousePos) so components consume only what they need and re-render only when that slice changes.",
      },
      { id: 1, text: "Memoize every consumer." },
      { id: 2, text: "Remove context entirely." },
      { id: 3, text: "Store both in one `useState`." },
    ],
    correctOptionId: 0,
    explanation:
      "Context re-renders all consumers when its value changes. Separating volatile and stable data into distinct contexts means theme consumers do not re-render on every mouse move. Splitting by update frequency is the standard scaling technique.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-senior-performance-adv-04",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.PERFORMANCE,
    title: "Stabilizing a context value",
    prompt:
      "Consumers re-render on every provider render even when the data is unchanged. The provider passes `value={{ user, logout }}`. Fix?",
    codeBlock: null,
    options: [
      { id: 0, text: "Wrap each consumer in `React.memo`." },
      {
        id: 1,
        text: "Memoize the value: `useMemo(() => ({ user, logout }), [user, logout])`, keeping `logout` stable with `useCallback`, so the reference changes only when the data does.",
      },
      { id: 2, text: "Pass the object as `children`." },
      { id: 3, text: "Use two separate contexts." },
    ],
    correctOptionId: 1,
    explanation:
      "A fresh `{ user, logout }` literal each render is a new reference, so every consumer re-renders. Memoize the provider value (and stabilize `logout` with `useCallback`) so its identity changes only when `user`/`logout` truly change.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.SUDHEERJ_REACT,
  },

  // ── SENIOR · Async & Data ────────────────────────────────────────────────
  {
    id: "react-senior-async-core-03",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.ASYNC,
    title: "After aborting a fetch",
    prompt:
      "You call `controller.abort()` in an effect cleanup. What must the fetch's `catch` do?",
    codeBlock: null,
    options: [
      {
        id: 0,
        text: "Detect and ignore the `AbortError` (expected on abort) while still surfacing real errors.",
      },
      { id: 1, text: "Re-throw everything, including the abort." },
      { id: 2, text: "Retry the request immediately." },
      { id: 3, text: "Call `setState` with the error." },
    ],
    correctOptionId: 0,
    explanation:
      "Aborting rejects the fetch with an `AbortError`. That is the expected, benign outcome of cleanup, so branch on `err.name === 'AbortError'` (or check `signal.aborted`) and ignore it; only report genuine network/parse failures.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-senior-async-core-04",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.ASYNC,
    title: "Pairing Suspense with failures",
    prompt:
      "A Suspense boundary shows a fallback while data loads. What handles the case where that data load fails?",
    codeBlock: null,
    options: [
      { id: 0, text: "Suspense also catches errors." },
      {
        id: 1,
        text: "An Error Boundary — Suspense handles the pending state, and a surrounding Error Boundary catches a failed load and renders an error UI.",
      },
      { id: 2, text: "A try/catch inside the JSX." },
      { id: 3, text: "A `useEffect`." },
    ],
    correctOptionId: 1,
    explanation:
      "Suspense only orchestrates the pending state. Failures surface as errors that an Error Boundary catches, so the robust pattern wraps Suspense in an Error Boundary — fallback for loading, boundary for failure.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.SUDHEERJ_REACT,
  },
  {
    id: "react-senior-async-adv-03",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.ASYNC,
    title: "Reading a promise with use()",
    prompt:
      "In React 19, which API lets a component read a promise's value (suspending until it resolves) and can even be called conditionally?",
    codeBlock: null,
    options: [
      { id: 0, text: "useEffect" },
      { id: 1, text: "useMemo" },
      {
        id: 2,
        text: "The `use()` hook — it unwraps a promise (or context) and, unlike other hooks, may be called inside conditions and loops.",
      },
      { id: 3, text: "useSyncExternalStore" },
    ],
    correctOptionId: 2,
    explanation:
      "`use(promise)` reads a promise, suspending the component until it settles and integrating with Suspense. It is exempt from the usual top-level hook rule, so it can be used conditionally — handy for reading context or promises down a branch.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-senior-async-adv-04",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.ASYNC,
    title: "Optimistic UI with rollback",
    prompt:
      "A 'like' button should feel instant but the request may fail. What is the robust pattern?",
    codeBlock: null,
    options: [
      { id: 0, text: "Wait for the server before showing any change." },
      {
        id: 1,
        text: "Optimistically update the UI immediately, then roll back to the previous state if the request rejects (and reconcile on success).",
      },
      { id: 2, text: "Disable the button forever after one click." },
      { id: 3, text: "Poll the server every second." },
    ],
    correctOptionId: 1,
    explanation:
      "Optimistic updates apply the expected result right away for responsiveness, keep the prior state, and revert if the mutation fails. React 19's `useOptimistic` formalizes this; the key is storing the rollback value and handling rejection.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },

  // ══ BATCH C ════════════════════════════════════════════════════════════════
  // A fifth and sixth core + advanced item per bucket (→ 6 core + 6 advanced
  // each, 144 total), reaching the §10.1 pool-depth target. Topics stay distinct
  // from every item above. Per-bucket floor enforced by
  // db/__tests__/seedData.test.ts (MIN_CORE/ADVANCED_PER_BUCKET = 6).

  // ── JUNIOR · Reactivity & State ───────────────────────────────────────────
  {
    id: "react-junior-reactivity-core-05",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.REACTIVITY,
    title: "The initial state argument",
    prompt:
      "What is the role of the argument passed to `useState`?\n\n`const [count, setCount] = useState(10)`",
    codeBlock: null,
    options: [
      { id: 0, text: "It is the value React uses on every render." },
      {
        id: 1,
        text: "It is the initial value, used only on the first render; later renders ignore it.",
      },
      { id: 2, text: "It permanently locks the state to that value." },
      { id: 3, text: "It re-initializes the state after every update." },
    ],
    correctOptionId: 1,
    explanation:
      "The argument is the initial state and is read only on the component's first render. On later renders React keeps the current state and ignores the argument.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-junior-reactivity-core-06",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.REACTIVITY,
    title: "Removing an item from a list in state",
    prompt:
      "You keep a to-do list in state. How do you correctly remove one item?",
    codeBlock: null,
    options: [
      {
        id: 0,
        text: "`setTodos(todos.filter((t) => t.id !== id))`, creating a new array.",
      },
      { id: 1, text: "`todos.splice(i, 1)` then `setTodos(todos)`." },
      { id: 2, text: "`delete todos[i]` then re-render manually." },
      { id: 3, text: "`todos[i] = null` then `setTodos(todos)`." },
    ],
    correctOptionId: 0,
    explanation:
      "State must be updated immutably. `filter` returns a new array without the removed item, and passing a brand-new reference lets React detect the change and re-render. `splice`/`delete` mutate the existing array in place.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-junior-reactivity-adv-05",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.REACTIVITY,
    title: "Object state replaces, not merges",
    prompt: "Starting from the state below, what is `user` after the update?",
    codeBlock: [
      "const [user, setUser] = useState({ name: 'Ada', age: 36 })",
      "// later:",
      "setUser({ age: 37 })",
    ].join("\n"),
    options: [
      { id: 0, text: "{ name: 'Ada', age: 37 } — React merges the objects." },
      { id: 1, text: "{ name: 'Ada', age: 36 } — the update is ignored." },
      { id: 2, text: "It throws because the shape changed." },
      {
        id: 3,
        text: "{ age: 37 } — the setter replaces the whole value, so `name` is lost.",
      },
    ],
    correctOptionId: 3,
    explanation:
      "Unlike class `this.setState`, the `useState` setter replaces the state value rather than merging it. Spread the previous state to keep other fields: `setUser((u) => ({ ...u, age: 37 }))`.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-junior-reactivity-adv-06",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.REACTIVITY,
    title: "Mutating an array in place",
    prompt: "Why doesn't the list update on screen after clicking add?",
    codeBlock: [
      "const [items, setItems] = useState([])",
      "function add(x) {",
      "  items.push(x)",
      "  setItems(items)",
      "}",
    ].join("\n"),
    options: [
      { id: 0, text: "`push` returns the new length, not the array." },
      {
        id: 1,
        text: "`items` is the same array reference, so React skips the re-render; build a new array instead.",
      },
      { id: 2, text: "State can only hold primitives." },
      { id: 3, text: "`setItems` must be awaited." },
    ],
    correctOptionId: 1,
    explanation:
      "`push` mutates the existing array, so `setItems(items)` receives the same reference React already has and bails out. Use `setItems([...items, x])` (or the updater form) to pass a new array.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },

  // ── JUNIOR · Lifecycle & Effects ──────────────────────────────────────────
  {
    id: "react-junior-lifecycle-core-05",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.LIFECYCLE,
    title: "When an effect runs",
    prompt: "By default, when does the function inside `useEffect(fn)` run?",
    codeBlock: null,
    options: [
      { id: 0, text: "Before the component renders." },
      {
        id: 1,
        text: "After the render is committed to the screen (after paint).",
      },
      { id: 2, text: "Only when the component unmounts." },
      { id: 3, text: "Synchronously in the middle of rendering." },
    ],
    correctOptionId: 1,
    explanation:
      "Effects run after React commits the render to the DOM and the browser paints, so they don't block the visual update. Use `useLayoutEffect` for the rare case you must run before paint.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-junior-lifecycle-core-06",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.LIFECYCLE,
    title: "Listing a value the effect reads",
    prompt: "The effect reads `name`. What belongs in the dependency array?",
    codeBlock: [
      "useEffect(() => {",
      "  document.title = `Hello, ${name}`",
      "}, [/* ? */])",
    ].join("\n"),
    options: [
      { id: 0, text: "`[name]`, so it re-runs whenever `name` changes." },
      { id: 1, text: "Nothing; effects track dependencies automatically." },
      { id: 2, text: "`[]`, so it only runs once." },
      { id: 3, text: "`[document.title]`." },
    ],
    correctOptionId: 0,
    explanation:
      "List every reactive value the effect reads. Because the effect uses `name`, `[name]` makes React re-run it whenever `name` changes, keeping the title in sync.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.SUDHEERJ_REACT,
  },
  {
    id: "react-junior-lifecycle-adv-05",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.LIFECYCLE,
    title: "Setting state after unmount",
    prompt:
      "A component starts a fetch in an effect and calls `setData` when it resolves, but it may unmount first. What is the correct guard?",
    codeBlock: null,
    options: [
      { id: 0, text: "Nothing is needed; React ignores it silently." },
      {
        id: 1,
        text: "Use a cleanup flag (or AbortController) so you don't set state after unmount.",
      },
      { id: 2, text: "Wrap the fetch in `setTimeout`." },
      { id: 3, text: "Call `setData` inside the cleanup function." },
    ],
    correctOptionId: 1,
    explanation:
      "If the component unmounts before the request resolves, updating state is wasted work. Track an `ignore`/`cancelled` flag in the effect and check it before calling `setData`, or abort the request in cleanup.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-junior-lifecycle-adv-06",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.LIFECYCLE,
    title: "Subscribing to a browser event",
    prompt: "Why does this effect return a function?",
    codeBlock: [
      "useEffect(() => {",
      "  function onResize() { /* ... */ }",
      "  window.addEventListener('resize', onResize)",
      "  return () => window.removeEventListener('resize', onResize)",
      "}, [])",
    ].join("\n"),
    options: [
      { id: 0, text: "To run the listener immediately." },
      { id: 1, text: "To make the effect asynchronous." },
      {
        id: 2,
        text: "To remove the listener on unmount, preventing a leak and duplicate handlers.",
      },
      { id: 3, text: "It is optional and has no effect." },
    ],
    correctOptionId: 2,
    explanation:
      "The returned cleanup removes the event listener when the component unmounts (or before the effect re-runs). Without it, listeners accumulate and reference stale scope — a common memory leak.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },

  // ── JUNIOR · Performance & Optimization ───────────────────────────────────
  {
    id: "react-junior-performance-core-05",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.PERFORMANCE,
    title: "How unique a key must be",
    prompt: "How unique must a React `key` be?",
    codeBlock: null,
    options: [
      { id: 0, text: "Globally unique across the entire app." },
      { id: 1, text: "Unique per component type." },
      { id: 2, text: "It does not need to be unique." },
      { id: 3, text: "Unique among its siblings in the same list." },
    ],
    correctOptionId: 3,
    explanation:
      "Keys only need to be stable and unique among siblings rendered in the same array. They help React match elements between renders; they are not global ids.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-junior-performance-core-06",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.PERFORMANCE,
    title: "A re-render is not a slow app",
    prompt:
      "Your component re-renders when its parent updates. Is that a problem?",
    codeBlock: null,
    options: [
      { id: 0, text: "Yes, every re-render is a bug to eliminate." },
      { id: 1, text: "Yes, you must wrap everything in React.memo." },
      {
        id: 2,
        text: "Not by itself — re-rendering is normal and usually cheap; optimize only measured slow paths.",
      },
      { id: 3, text: "Only if it renders to the DOM." },
    ],
    correctOptionId: 2,
    explanation:
      "Re-rendering means React re-runs the function and diffs the result; it does not necessarily touch the DOM and is usually inexpensive. Reach for memoization only when profiling shows a real cost.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-junior-performance-adv-05",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.PERFORMANCE,
    title: "Changing a key resets state",
    prompt:
      "What happens to `Profile`'s internal state when `userId` changes?\n\n`<Profile key={userId} />`",
    codeBlock: null,
    options: [
      { id: 0, text: "It is preserved across the change." },
      {
        id: 1,
        text: "React unmounts the old instance and mounts a fresh one, resetting its state.",
      },
      { id: 2, text: "Only props update; state is untouched." },
      { id: 3, text: "It throws a key error." },
    ],
    correctOptionId: 1,
    explanation:
      "A component's identity is tied to its key and position. Changing the key makes React treat it as a different element — unmounting the old one and mounting a new one with fresh state. This is a deliberate way to reset state.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-junior-performance-adv-06",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.PERFORMANCE,
    title: "Expensive work in render",
    prompt: "`expensiveCompare` is costly. What is the concern here?",
    codeBlock: [
      "function List({ items }) {",
      "  const sorted = items.slice().sort(expensiveCompare)",
      "  return sorted.map(/* ... */)",
      "}",
    ].join("\n"),
    options: [
      { id: 0, text: "It runs once for the whole app." },
      {
        id: 1,
        text: "It runs on every render; memoize it with useMemo if it is actually a bottleneck.",
      },
      { id: 2, text: "Sorting mutates the `items` prop." },
      { id: 3, text: "You cannot call array methods in render." },
    ],
    correctOptionId: 1,
    explanation:
      "Work in the component body runs on every render. If sorting is genuinely expensive and inputs rarely change, wrap it in `useMemo(() => ..., [items])`. Note `slice()` already avoids mutating the `items` prop.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },

  // ── JUNIOR · Async & Data ─────────────────────────────────────────────────
  {
    id: "react-junior-async-core-05",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.ASYNC,
    title: "Storing fetched data in state",
    prompt: "You fetch data in an effect. How does it end up on screen?",
    codeBlock: null,
    options: [
      { id: 0, text: "Return it from the effect." },
      {
        id: 1,
        text: "Store it in state via a setter; the state update triggers a re-render that shows it.",
      },
      { id: 2, text: "Assign it to a local variable in the component body." },
      { id: 3, text: "Write it to `window`." },
    ],
    correctOptionId: 1,
    explanation:
      "Asynchronously fetched data must be placed into state (e.g. `setData(json)`). The resulting re-render reads the new state and displays it. A plain local variable would be lost on the next render.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-junior-async-core-06",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.ASYNC,
    title: "Clearing loading in every path",
    prompt: "Why put `setLoading(false)` in the `finally` block?",
    codeBlock: [
      "setLoading(true)",
      "try {",
      "  const res = await fetch(url)",
      "  setData(await res.json())",
      "} catch (e) {",
      "  setError(e)",
      "} finally {",
      "  setLoading(false)",
      "}",
    ].join("\n"),
    options: [
      { id: 0, text: "So it runs only on success." },
      {
        id: 1,
        text: "So loading is cleared whether the request succeeds or fails.",
      },
      { id: 2, text: "To retry the request." },
      { id: 3, text: "It has no effect there." },
    ],
    correctOptionId: 1,
    explanation:
      "`finally` runs after either branch, guaranteeing the loading flag is cleared on both success and error. Putting it only in `try` would leave the UI stuck loading when the request throws.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-junior-async-adv-05",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.ASYNC,
    title: "await is non-blocking",
    prompt:
      "While an `async` function is paused at `await fetch(...)`, what happens to the rest of the app?",
    codeBlock: null,
    options: [
      { id: 0, text: "The whole page freezes until the response arrives." },
      { id: 1, text: "React stops all other components." },
      { id: 2, text: "Other effects are cancelled." },
      {
        id: 3,
        text: "Nothing freezes — `await` only suspends that function; the UI stays responsive.",
      },
    ],
    correctOptionId: 3,
    explanation:
      "`await` suspends only the enclosing async function and yields control back to the event loop. The browser keeps handling events, rendering, and other work, so the UI remains interactive.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.LYDIAHALLIE_JS,
  },
  {
    id: "react-junior-async-adv-06",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.JUNIOR,
    skillCategory: SKILL_CATEGORY.ASYNC,
    title: "await vs a .then chain",
    prompt: "How do snippets A and B relate?",
    codeBlock: [
      "// A",
      "const res = await fetch(url)",
      "const data = await res.json()",
      "// B",
      "fetch(url).then((res) => res.json()).then((data) => { /* ... */ })",
    ].join("\n"),
    options: [
      {
        id: 0,
        text: "They are equivalent ways to sequence async steps; await is sugar over promises/then.",
      },
      { id: 1, text: "They behave differently; only await actually waits." },
      { id: 2, text: "B runs synchronously." },
      { id: 3, text: "A blocks the main thread, B does not." },
    ],
    correctOptionId: 0,
    explanation:
      "`async/await` is built on promises; awaiting a promise is equivalent to chaining `.then`. Both sequence the steps without blocking the main thread — `await` is just more readable for linear flows.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.LYDIAHALLIE_JS,
  },

  // ── MID · Reactivity & State ──────────────────────────────────────────────
  {
    id: "react-mid-reactivity-core-05",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.REACTIVITY,
    title: "Lazy initialization",
    prompt:
      "Why pass a function to useState instead of calling it inline?\n\n`useState(() => expensiveInit())` vs `useState(expensiveInit())`",
    codeBlock: null,
    options: [
      { id: 0, text: "It makes the state lazy-loaded from the server." },
      { id: 1, text: "It memoizes the state across components." },
      {
        id: 2,
        text: "The initializer runs only on the first render; the inline call runs `expensiveInit()` on every render.",
      },
      { id: 3, text: "Functions cannot be stored in state otherwise." },
    ],
    correctOptionId: 2,
    explanation:
      "`useState(fn)` calls `fn` once, on mount. Writing `useState(expensiveInit())` computes the value on every render (even though it is discarded after the first), wasting work. Lazy initialization avoids that.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-mid-reactivity-core-06",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.REACTIVITY,
    title: "Updating one object in an array",
    prompt: "Why map with a spread instead of `todos[i].done = true`?",
    codeBlock: [
      "setTodos(todos.map((t) =>",
      "  t.id === id ? { ...t, done: true } : t",
      "))",
    ].join("\n"),
    options: [
      {
        id: 0,
        text: "It updates immutably: a new array with a new object for the changed item, leaving others by reference.",
      },
      { id: 1, text: "Spreading deep-clones the whole list." },
      { id: 2, text: "map is faster than indexing." },
      { id: 3, text: "Direct assignment is not valid JavaScript." },
    ],
    correctOptionId: 0,
    explanation:
      "Immutable updates require new references for what changed. `map` yields a new array, and the spread creates a new object only for the matched item; unchanged items keep their identity, which helps memoized children skip re-rendering.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-mid-reactivity-adv-05",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.REACTIVITY,
    title: "Passing a setter to a child",
    prompt:
      "A child needs to update a piece of the parent's state. What is the idiomatic approach?",
    codeBlock: null,
    options: [
      { id: 0, text: "Give the child direct access to the parent's variable." },
      {
        id: 1,
        text: "Pass a callback (or the setter) down as a prop; the child calls it to request the change.",
      },
      { id: 2, text: "Use a global mutable object." },
      { id: 3, text: "Re-declare the state in the child." },
    ],
    correctOptionId: 1,
    explanation:
      "State lives in the parent that owns it; children request changes by calling a function passed as a prop (e.g. `onChange`). This keeps a single source of truth and unidirectional data flow.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-mid-reactivity-adv-06",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.REACTIVITY,
    title: "Custom hooks don't share state",
    prompt:
      "Two different components each call `useCounter()`. Do they share the same counter?",
    codeBlock: [
      "function useCounter() {",
      "  const [n, setN] = useState(0)",
      "  return [n, () => setN((c) => c + 1)]",
      "}",
    ].join("\n"),
    options: [
      { id: 0, text: "Yes, custom hooks create shared/global state." },
      { id: 1, text: "Only if they have the same props." },
      { id: 2, text: "Yes, until one unmounts." },
      {
        id: 3,
        text: "No — each component that calls the hook gets its own independent state.",
      },
    ],
    correctOptionId: 3,
    explanation:
      "A custom hook is just a function that calls hooks; it does not create shared state. Every component instance that uses it gets its own separate state. To share state, lift it up or use context/an external store.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },

  // ── MID · Lifecycle & Effects ─────────────────────────────────────────────
  {
    id: "react-mid-lifecycle-core-05",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.LIFECYCLE,
    title: "Effect run order",
    prompt:
      "A component defines two `useEffect`s. In what order do they run after a render?",
    codeBlock: null,
    options: [
      { id: 0, text: "In reverse order." },
      { id: 1, text: "Alphabetically by dependency." },
      { id: 2, text: "Randomly." },
      { id: 3, text: "Top-to-bottom, in the order they are defined." },
    ],
    correctOptionId: 3,
    explanation:
      "React runs effects in the order they are declared in the component, top to bottom, after commit. Cleanup functions run in the same order before the next run or unmount.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-mid-lifecycle-core-06",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.LIFECYCLE,
    title: "Subscription dependencies",
    prompt: "Why is `source` in the dependency array?",
    codeBlock: [
      "useEffect(() => {",
      "  const sub = source.subscribe(onData)",
      "  return () => sub.unsubscribe()",
      "}, [source])",
    ].join("\n"),
    options: [
      { id: 0, text: "So the component re-renders when source changes." },
      { id: 1, text: "To memoize `onData`." },
      { id: 2, text: "It is unnecessary; subscriptions ignore deps." },
      {
        id: 3,
        text: "So React re-subscribes (cleanup + re-run) when `source` changes to a new object.",
      },
    ],
    correctOptionId: 3,
    explanation:
      "The effect subscribes to `source`, so `source` is a dependency. When it changes, React runs the cleanup (unsubscribe from the old one) and re-runs the effect (subscribe to the new one), keeping the subscription correct.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-mid-lifecycle-adv-05",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.LIFECYCLE,
    title: "Declaring a function inside the effect",
    prompt: "Why declare `handle` inside the effect instead of outside?",
    codeBlock: [
      "useEffect(() => {",
      "  function handle() { doThing(url) }",
      "  handle()",
      "}, [url])",
    ].join("\n"),
    options: [
      { id: 0, text: "To make it run twice." },
      { id: 1, text: "To avoid using url." },
      { id: 2, text: "Functions cannot be declared outside effects." },
      {
        id: 3,
        text: "So it is not an outside dependency; the effect then depends only on the values it uses (url).",
      },
    ],
    correctOptionId: 3,
    explanation:
      "Declaring the function inside the effect means you do not have to add the function itself to the dependency array (its identity changes each render). The effect then depends only on the reactive values it reads, like `url`.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-mid-lifecycle-adv-06",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.LIFECYCLE,
    title: "Debouncing inside an effect",
    prompt: "What does this effect pattern achieve?",
    codeBlock: [
      "useEffect(() => {",
      "  const id = setTimeout(() => search(query), 300)",
      "  return () => clearTimeout(id)",
      "}, [query])",
    ].join("\n"),
    options: [
      {
        id: 0,
        text: "It debounces: each new `query` cancels the pending timer, so search runs 300ms after typing stops.",
      },
      { id: 1, text: "It runs search on every keystroke immediately." },
      { id: 2, text: "It caches search results." },
      { id: 3, text: "It throttles to one call per render." },
    ],
    correctOptionId: 0,
    explanation:
      "On each `query` change the cleanup clears the previous timeout before setting a new one, so `search` fires only once the user pauses for 300ms. This is the canonical effect-based debounce.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },

  // ── MID · Performance & Optimization ──────────────────────────────────────
  {
    id: "react-mid-performance-core-05",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.PERFORMANCE,
    title: "useMemo vs useCallback",
    prompt: "What is the difference between `useMemo` and `useCallback`?",
    codeBlock: null,
    options: [
      {
        id: 0,
        text: "`useMemo` memoizes a computed value; `useCallback` memoizes a function (≡ `useMemo(() => fn, deps)`).",
      },
      { id: 1, text: "`useCallback` runs after render, `useMemo` before." },
      { id: 2, text: "They are identical." },
      { id: 3, text: "`useMemo` is only for arrays." },
    ],
    correctOptionId: 0,
    explanation:
      "`useMemo(fn, deps)` caches the return value of `fn`. `useCallback(fn, deps)` caches the function itself so its identity is stable across renders — useful when passing callbacks to memoized children. `useCallback(fn, d)` ≡ `useMemo(() => fn, d)`.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-mid-performance-core-06",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.PERFORMANCE,
    title: "useMemo is a hint",
    prompt:
      "Can you rely on `useMemo` to keep a value cached forever between renders?",
    codeBlock: null,
    options: [
      { id: 0, text: "Yes, it is a guaranteed permanent cache." },
      { id: 1, text: "Only for primitives." },
      { id: 2, text: "Yes, until the app reloads." },
      {
        id: 3,
        text: "No — it is a performance hint; React may discard and recompute it, so don't depend on it for correctness.",
      },
    ],
    correctOptionId: 3,
    explanation:
      "`useMemo` may recompute even when deps did not change (e.g. to free memory). Treat it as an optimization, not a semantic guarantee — code must stay correct if the value is recomputed.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-mid-performance-adv-05",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.PERFORMANCE,
    title: "Custom comparator for React.memo",
    prompt: "What does the second argument to `React.memo` do?",
    codeBlock: [
      "export default React.memo(Row, (prev, next) =>",
      "  prev.item.id === next.item.id && prev.item.v === next.item.v",
      ")",
    ].join("\n"),
    options: [
      { id: 0, text: "Sorts the props." },
      { id: 1, text: "It is a fallback component." },
      { id: 2, text: "Deep-clones props before comparing." },
      {
        id: 3,
        text: "A custom `areEqual` comparator: return true to skip the re-render, false to render.",
      },
    ],
    correctOptionId: 3,
    explanation:
      "By default `React.memo` shallow-compares props. Supplying `areEqual(prev, next)` lets you decide equality; returning `true` means 'props are equal, skip rendering'. Note the inverted return compared to `shouldComponentUpdate`.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-mid-performance-adv-06",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.PERFORMANCE,
    title: "Moving state down",
    prompt:
      "A parent holds `hovered` state that only one small child uses, but updating it re-renders the whole subtree. Best fix?",
    codeBlock: null,
    options: [
      {
        id: 0,
        text: "Move the `hovered` state down into the small component that uses it (colocation).",
      },
      { id: 1, text: "Wrap every child in React.memo." },
      { id: 2, text: "Lift the state even higher." },
      { id: 3, text: "Store it in a ref and force updates." },
    ],
    correctOptionId: 0,
    explanation:
      "If only a small part of the tree needs a piece of state, colocate it there. Updates then re-render only that component instead of the whole parent subtree — often simpler and more effective than blanket memoization.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },

  // ── MID · Async & Data ────────────────────────────────────────────────────
  {
    id: "react-mid-async-core-05",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.ASYNC,
    title: "try/catch around await",
    prompt: "What does the `catch` block handle here?",
    codeBlock: [
      "try {",
      "  const res = await fetch(url)",
      "  const data = await res.json()",
      "} catch (err) {",
      "  // ...",
      "}",
    ].join("\n"),
    options: [
      { id: 0, text: "HTTP 404 and 500 responses." },
      { id: 1, text: "Nothing; await cannot throw." },
      {
        id: 2,
        text: "Network/rejection errors from the awaited promises — fetch rejects on network failure, not on HTTP errors.",
      },
      { id: 3, text: "Syntax errors in the response." },
    ],
    correctOptionId: 2,
    explanation:
      "`await` rethrows a rejected promise, so `try/catch` catches network failures and JSON parse errors. Note `fetch` does NOT reject on 4xx/5xx — check `res.ok` separately to treat those as errors.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.LYDIAHALLIE_JS,
  },
  {
    id: "react-mid-async-core-06",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.ASYNC,
    title: "What Promise.race does",
    prompt: "What does `Promise.race([a, b])` settle with?",
    codeBlock: null,
    options: [
      {
        id: 0,
        text: "The settlement (value or error) of whichever promise settles first.",
      },
      { id: 1, text: "Only after both settle." },
      { id: 2, text: "An array of both results." },
      { id: 3, text: "The slower of the two." },
    ],
    correctOptionId: 0,
    explanation:
      "`Promise.race` settles as soon as the first input settles, adopting its value or rejection. It is useful for timeouts — race a request against a delayed reject.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-mid-async-adv-05",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.ASYNC,
    title: "Ignore flag in an async effect",
    prompt: "What problem does the `ignore` flag solve?",
    codeBlock: [
      "useEffect(() => {",
      "  let ignore = false",
      "  fetchUser(id).then((u) => { if (!ignore) setUser(u) })",
      "  return () => { ignore = true }",
      "}, [id])",
    ].join("\n"),
    options: [
      { id: 0, text: "It caches the user." },
      {
        id: 1,
        text: "It prevents a stale/late response from a previous `id` from overwriting newer state (and setting state after unmount).",
      },
      { id: 2, text: "It retries the request." },
      { id: 3, text: "It makes the effect synchronous." },
    ],
    correctOptionId: 1,
    explanation:
      "When `id` changes quickly, an older request may resolve after a newer one. The cleanup sets `ignore = true` for the previous run, so its late `setUser` is skipped — avoiding out-of-order overwrites and post-unmount updates.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-mid-async-adv-06",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.MID,
    skillCategory: SKILL_CATEGORY.ASYNC,
    title: "Retry with backoff",
    prompt:
      "A flaky endpoint occasionally fails. What is a reasonable resilience pattern?",
    codeBlock: null,
    options: [
      { id: 0, text: "Retry immediately in an infinite loop." },
      { id: 1, text: "Never retry; always fail." },
      {
        id: 2,
        text: "Retry a bounded number of times with increasing (exponential) backoff, then surface the error.",
      },
      { id: 3, text: "Reload the whole page on any error." },
    ],
    correctOptionId: 2,
    explanation:
      "Bounded retries with exponential backoff (e.g. 200ms, 400ms, 800ms) smooth over transient failures without hammering the server or looping forever. After the cap, report the error so the user is not stuck.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },

  // ── SENIOR · Reactivity & State ───────────────────────────────────────────
  {
    id: "react-senior-reactivity-core-05",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.REACTIVITY,
    title: "When Context fits",
    prompt: "Which use is React Context best suited for?",
    codeBlock: null,
    options: [
      {
        id: 0,
        text: "Low-frequency, widely-read values like theme, locale, or the current user.",
      },
      {
        id: 1,
        text: "High-frequency state that changes many times per second.",
      },
      { id: 2, text: "Replacing all component props." },
      { id: 3, text: "Local state of a single component." },
    ],
    correctOptionId: 0,
    explanation:
      "Context broadcasts a value to all consumers and re-renders them when it changes, so it fits relatively static, widely-needed data (theme, auth). For hot, frequently-updating state, an external store with selectors avoids re-rendering every consumer.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-senior-reactivity-core-06",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.REACTIVITY,
    title: "Splitting a large reducer",
    prompt:
      "A `useReducer` has grown to handle many unrelated action groups. A clean refactor is to…",
    codeBlock: null,
    options: [
      { id: 0, text: "Keep everything in one giant switch forever." },
      { id: 1, text: "Replace it with dozens of useState calls." },
      {
        id: 2,
        text: "Split it into smaller reducer functions and compose them by state slice.",
      },
      { id: 3, text: "Move the logic into the render body." },
    ],
    correctOptionId: 2,
    explanation:
      "As reducers grow, decompose them by state slice into smaller pure reducers and combine them, mirroring how `combineReducers` works. Each stays focused and testable while the top-level reducer delegates.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-senior-reactivity-adv-05",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.REACTIVITY,
    title: "Lazy reducer initializer",
    prompt:
      "What is the third argument `init`?\n\n`useReducer(reducer, initialArg, init)`",
    codeBlock: null,
    options: [
      { id: 0, text: "A middleware function." },
      {
        id: 1,
        text: "A lazy initializer: React calls `init(initialArg)` once to compute the initial state.",
      },
      { id: 2, text: "The action creator." },
      { id: 3, text: "A selector." },
    ],
    correctOptionId: 1,
    explanation:
      "`useReducer`'s optional third argument computes initial state lazily as `init(initialArg)`, running only on mount. It is handy for expensive setup or to reset state to a computed baseline.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-senior-reactivity-adv-06",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.REACTIVITY,
    title: "state vs ref for mutable data",
    prompt:
      "You need to keep a mutable value (e.g. a WebSocket instance) across renders that should NOT trigger re-renders. What do you use?",
    codeBlock: null,
    options: [
      {
        id: 0,
        text: "useRef — its `.current` persists across renders and mutating it does not re-render.",
      },
      { id: 1, text: "useState." },
      { id: 2, text: "A module-level global." },
      { id: 3, text: "A plain local variable." },
    ],
    correctOptionId: 0,
    explanation:
      "`useRef` gives a stable, mutable container that survives renders without causing them. State is for values that should re-render the UI when they change; refs are for mutable data (timers, sockets, previous values) that should not.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },

  // ── SENIOR · Lifecycle & Effects ──────────────────────────────────────────
  {
    id: "react-senior-lifecycle-core-05",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.LIFECYCLE,
    title: "Removing the exact listener",
    prompt: "For cleanup to work, the removed handler must be…",
    codeBlock: [
      "useEffect(() => {",
      "  window.addEventListener('scroll', onScroll)",
      "  return () => window.removeEventListener('scroll', onScroll)",
      "}, [onScroll])",
    ].join("\n"),
    options: [
      {
        id: 0,
        text: "The same function reference passed to addEventListener.",
      },
      { id: 1, text: "Any function with the same name." },
      { id: 2, text: "An inline arrow function." },
      { id: 3, text: "Recreated on every render." },
    ],
    correctOptionId: 0,
    explanation:
      "`removeEventListener` matches by reference. Passing a different function instance (e.g. a fresh inline arrow) leaves the original listener attached. Keep the handler's identity stable and pass the same reference to both calls.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-senior-lifecycle-core-06",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.LIFECYCLE,
    title: "Rules of hooks",
    prompt: "Why is calling `useState` inside this `if` invalid?",
    codeBlock: [
      "if (loggedIn) {",
      "  const [name, setName] = useState('')",
      "}",
    ].join("\n"),
    options: [
      { id: 0, text: "useState cannot hold strings." },
      { id: 1, text: "You need useEffect instead." },
      {
        id: 2,
        text: "Hooks must be called unconditionally at the top level so their call order stays stable across renders.",
      },
      { id: 3, text: "It re-renders infinitely." },
    ],
    correctOptionId: 2,
    explanation:
      "React tracks hook state by call order. Calling a hook conditionally changes that order between renders and breaks the mapping. Always call hooks at the top level; put the condition inside the hook or in render logic instead.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.SUDHEERJ_REACT,
  },
  {
    id: "react-senior-lifecycle-adv-05",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.LIFECYCLE,
    title: "forwardRef to a DOM node",
    prompt: "What does `forwardRef` enable here?",
    codeBlock: [
      "const Input = forwardRef((props, ref) => (",
      "  <input ref={ref} {...props} />",
      "))",
    ].join("\n"),
    options: [
      { id: 0, text: "It memoizes the component." },
      {
        id: 1,
        text: "It lets a parent pass a ref through to the child's underlying DOM node.",
      },
      { id: 2, text: "It forwards props automatically without spreading." },
      { id: 3, text: "It creates a portal." },
    ],
    correctOptionId: 1,
    explanation:
      "Function components do not receive `ref` as a normal prop. `forwardRef` exposes it as a second argument so a parent can attach a ref to a child's DOM node (e.g. to focus an input). React 19 also allows `ref` as a prop directly.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-senior-lifecycle-adv-06",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.LIFECYCLE,
    title: "useLayoutEffect to avoid flicker",
    prompt:
      "You measure a tooltip and reposition it. `useEffect` causes a visible flicker; why does `useLayoutEffect` fix it?",
    codeBlock: null,
    options: [
      { id: 0, text: "It runs the effect on the server." },
      { id: 1, text: "It skips the measurement." },
      {
        id: 2,
        text: "It runs synchronously after DOM mutations but before the browser paints, so the user never sees the intermediate position.",
      },
      { id: 3, text: "It debounces the layout." },
    ],
    correctOptionId: 2,
    explanation:
      "`useLayoutEffect` fires after DOM updates but before paint, letting you measure and adjust layout in the same frame. With `useEffect` the browser paints the un-repositioned tooltip first, then the correction, producing a flicker.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },

  // ── SENIOR · Performance & Optimization ───────────────────────────────────
  {
    id: "react-senior-performance-core-05",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.PERFORMANCE,
    title: "Code splitting with React.lazy",
    prompt: "What is the main benefit of `React.lazy` here?",
    codeBlock: [
      "const Settings = React.lazy(() => import('./Settings'))",
      "// <Suspense fallback={<Spinner/>}><Settings/></Suspense>",
    ].join("\n"),
    options: [
      { id: 0, text: "It memoizes Settings." },
      {
        id: 1,
        text: "It code-splits Settings into a separate bundle loaded on demand, shrinking the initial JS.",
      },
      { id: 2, text: "It renders Settings on the server." },
      { id: 3, text: "It prevents Settings from ever re-rendering." },
    ],
    correctOptionId: 1,
    explanation:
      "`React.lazy` + dynamic `import()` splits the component into its own chunk fetched only when rendered, reducing initial bundle size and time-to-interactive. A `Suspense` boundary shows a fallback while it loads.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-senior-performance-core-06",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.PERFORMANCE,
    title: "Throttling an expensive handler",
    prompt:
      "A `scroll` handler runs expensive work and janks the page. Best mitigation?",
    codeBlock: null,
    options: [
      { id: 0, text: "Add more state." },
      { id: 1, text: "Wrap the component in React.memo." },
      {
        id: 2,
        text: "Throttle/debounce the handler (or batch work into requestAnimationFrame) so it runs less often.",
      },
      { id: 3, text: "Move it into useMemo." },
    ],
    correctOptionId: 2,
    explanation:
      "High-frequency events like scroll/resize fire far more often than needed. Throttling (rate-limit) or debouncing (run after quiet), or batching work into `requestAnimationFrame`, keeps the main thread free.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-senior-performance-adv-05",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.PERFORMANCE,
    title: "useTransition vs useDeferredValue",
    prompt: "How do `useTransition` and `useDeferredValue` differ?",
    codeBlock: null,
    options: [
      { id: 0, text: "They are the same API." },
      {
        id: 1,
        text: "`useTransition` marks a state update you own as non-urgent; `useDeferredValue` defers a value you receive without owning the update.",
      },
      { id: 2, text: "`useDeferredValue` blocks rendering." },
      { id: 3, text: "`useTransition` is only for data fetching." },
    ],
    correctOptionId: 1,
    explanation:
      "Both keep the UI responsive by deprioritizing work. Use `useTransition` when you own the state update and can wrap it in `startTransition`; use `useDeferredValue` when you only have the value (e.g. a prop) and want a lagging copy for expensive rendering.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-senior-performance-adv-06",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.PERFORMANCE,
    title: "Offloading heavy computation",
    prompt:
      "A pure CPU-heavy computation freezes the UI even with memoization. What is the structural fix?",
    codeBlock: null,
    options: [
      { id: 0, text: "Add useCallback." },
      { id: 1, text: "Wrap it in useMemo again." },
      {
        id: 2,
        text: "Move the computation off the main thread (e.g. a Web Worker), then update state with the result.",
      },
      { id: 3, text: "Render it inside Suspense." },
    ],
    correctOptionId: 2,
    explanation:
      "Memoization only avoids repeat work; it cannot make a single heavy synchronous computation non-blocking. Offloading to a Web Worker keeps the main thread free to render and handle input, posting the result back to update state.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },

  // ── SENIOR · Async & Data ─────────────────────────────────────────────────
  {
    id: "react-senior-async-core-05",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.ASYNC,
    title: "Event-handler fetches and Suspense",
    prompt:
      "You fetch data in a click handler (not during render). Do you need a Suspense boundary?",
    codeBlock: null,
    options: [
      { id: 0, text: "Yes, always." },
      { id: 1, text: "Only in development." },
      {
        id: 2,
        text: "No — Suspense is for data read during render; event-handler fetches just update state normally.",
      },
      { id: 3, text: "Yes, or React throws." },
    ],
    correctOptionId: 2,
    explanation:
      "Suspense suspends components that read a pending resource during render. A fetch kicked off by an event handler resolves and calls a state setter like any async work — no Suspense boundary required.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-senior-async-core-06",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.ASYNC,
    title: "Request deduplication",
    prompt:
      "Several components mount at once and each fetches `/user/1`. How do data libraries avoid N duplicate requests?",
    codeBlock: null,
    options: [
      { id: 0, text: "They cancel all but the first randomly." },
      { id: 1, text: "They disable fetching." },
      { id: 2, text: "They queue them strictly sequentially." },
      {
        id: 3,
        text: "They dedupe by caching in-flight requests by key, so concurrent callers share one promise/result.",
      },
    ],
    correctOptionId: 3,
    explanation:
      "Data libraries (React Query, SWR) key requests and share a single in-flight promise plus a cache entry, so simultaneous callers for the same key get one network request and the same cached result.",
    difficultyWeight: WEIGHT_CORE,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-senior-async-adv-05",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.ASYNC,
    title: "Streaming SSR with Suspense",
    prompt: "How does Suspense improve server-side rendering?",
    codeBlock: null,
    options: [
      {
        id: 0,
        text: "It enables streaming: the server sends ready HTML first and streams slower, suspended sections as they resolve.",
      },
      { id: 1, text: "It disables SSR." },
      { id: 2, text: "It renders everything on the client only." },
      { id: 3, text: "It inlines all data as globals." },
    ],
    correctOptionId: 0,
    explanation:
      "With streaming SSR, a `Suspense` boundary lets the server flush the shell and already-ready content immediately, then stream in the slow parts (with their fallbacks shown meanwhile) as their data resolves — improving TTFB and perceived load.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },
  {
    id: "react-senior-async-adv-06",
    framework: FRAMEWORK.REACT,
    difficulty: DIFFICULTY.SENIOR,
    skillCategory: SKILL_CATEGORY.ASYNC,
    title: "Transitions for async actions",
    prompt: "What do transitions give async 'actions' in React 19?",
    codeBlock: [
      "const [isPending, startTransition] = useTransition()",
      "// startTransition(async () => { await save(form) })",
    ].join("\n"),
    options: [
      { id: 0, text: "They cancel the request." },
      { id: 1, text: "They memoize the form." },
      { id: 2, text: "They make fetch synchronous." },
      {
        id: 3,
        text: "They provide a built-in pending state and keep the UI responsive while the async update runs.",
      },
    ],
    correctOptionId: 3,
    explanation:
      "React 19 actions build on transitions: wrapping an async update gives you `isPending` for free and lets React keep the app interactive, apply the result, and integrate with `useOptimistic`/form actions — without hand-managing loading flags.",
    difficultyWeight: WEIGHT_ADVANCED,
    source: CONTENT_SOURCE.ORIGINAL,
  },
];
