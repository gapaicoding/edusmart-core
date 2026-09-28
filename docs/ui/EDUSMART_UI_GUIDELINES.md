# EduSmart UI Guidelines

These conventions keep EduSmart a dense, task-focused School Operating System rather than a collection of unrelated screens.

## Page structure

Use a clear page title, a short task-oriented description, optional actions, then context/filters and the main content. `PageHeader` is appropriate when the same hierarchy recurs; do not force it onto detail or wizard layouts that need a different focus.

## States

- Keep static headings and labels visible while data values load.
- Use row/block skeletons for dynamic collections and stable error states with a retry action where useful.
- Empty states should explain what is empty and the next safe action.
- Translate safe user-facing errors; never show raw SQL, stack traces, or internal permission payloads.

## Actions and accessibility

- Use one clear primary action per surface; use outline/secondary actions for alternatives and destructive styling only for high-impact actions.
- Every icon-only control needs an accessible label.
- Keep visible focus, associated labels, keyboard reachability, and dialog focus behavior intact.
- Preserve capability gates and server authorization; navigation visibility is only a UX aid.

## Responsive behavior

- Prefer fluid controls and wrapping action groups below tablet widths.
- Tables must intentionally scroll, prioritize columns, or switch to cards; never create accidental page-wide overflow.
- Dialogs and forms must remain reachable and scrollable on narrow screens.

## Localization

- Bahasa Indonesia (`id`) is the default; English (`en`) is the only alternate locale in V1.
- Use semantic translation keys and keep database values, route paths, permission codes, and RPC names unchanged.
- Format dates/numbers with the selected locale. Finance amounts remain integer IDR and retain their domain currency semantics.

## Theme

- Use semantic tokens (`bg-background`, `text-foreground`, `bg-card`, `text-muted-foreground`, `border-border`, and related tokens).
- Avoid hardcoded white/black/gray presentation classes when a semantic token expresses the intent.
- Light and dark are user preferences persisted in the browser; do not add a database preference row for this concern.
