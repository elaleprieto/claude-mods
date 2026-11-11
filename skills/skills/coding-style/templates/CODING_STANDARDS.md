# Coding standards

Judgement calls for review. Mechanical rules live in the linters (`pnpm lint`); repo structure lives in `AGENTS.md`.

## One source of truth

A guard, type union, constant, or column mapping lives in one shared module and every caller imports it. When a change applies the same few lines across several files, those lines belong in a helper. Flag a copy even when the diff is net negative overall.

## Names say what the value is

A variable, parameter, or function name says what it holds or does in the domain's words, never a single letter or an abbreviation: `(row) => row.id`, not `(r) => r.id`. A boolean reads as a question (`isRefused`, `hasStock`), a function as a verb phrase. A name that needs a comment to be understood is the wrong name. A name an outside contract fixes keeps its spelling: an HTTP header, an API field, a config key a spec names.

## Small, flat functions

A function does one thing at one level of abstraction. Return early instead of nesting, extract a named helper instead of a nested ternary or a deep block, and pass an options object instead of a long positional parameter list.

## Tests come first and test behaviour

Every behaviour change starts with a failing test, and a bug fix with a test that reproduces the bug. Each acceptance criterion has a test, written through the public interface (a route, a server action, an exported function), not through internals. An outside service (a commerce API, an issue tracker, a carrier) sits behind an interface with a fake for tests; internal modules are not mocked. What only a person running the app can verify is said in the report, not left out.

## Errors reveal nothing

Every error a user can see is generic: an authorization failure says `Forbidden`, never the role required or held, and a row that is missing and a row the caller may not see get the same `not found`.

## Comments and docs stay true

A change updates every comment and doc it makes false: module headers, JSDoc, section headers, and the docs that describe the code it touches. Search for the changed names and behaviours outside the diff too: a stale line usually sits in a file the diff never opened.

## Repo text in English

Docs, code comments, and log messages are written in English, including additions to a file whose existing text is in another language.

## UI is accessible

Screens meet WCAG 2.1 AA. Text keeps AA contrast on its background and every interactive element has a visible focus. Every control has an accessible name (an icon-only button gets an `aria-label`). What changes without a page load (an item added to the cart, filters applied, form errors) is announced to screen readers through a live region whose content changes after the region exists. The keyboard alone reaches and operates everything the mouse can, in a sensible order, without traps.
