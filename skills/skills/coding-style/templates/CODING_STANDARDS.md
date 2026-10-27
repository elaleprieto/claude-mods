# Coding standards

Judgement calls for review. Mechanical rules live in the linters (`pnpm lint`); repo structure lives in `AGENTS.md`.

## One source of truth

A guard, type union, constant, or column mapping lives in one shared module and every caller imports it. When a change applies the same few lines across several files, those lines belong in a helper. Flag a copy even when the diff is net negative overall.

## Names say what the value is

A variable, parameter, or function name says what it holds or does in the domain's words, never a single letter or an abbreviation: `(row) => row.id`, not `(r) => r.id`. A boolean reads as a question (`isRefused`, `hasStock`), a function as a verb phrase. A name that needs a comment to be understood is the wrong name.

## Small, flat functions

A function does one thing at one level of abstraction. Return early instead of nesting, extract a named helper instead of a nested ternary or a deep block, and pass an options object instead of a long positional parameter list.

## Errors reveal nothing

Every error a user can see is generic: an authorization failure says `Forbidden`, never the role required or held, and a row that is missing and a row the caller may not see get the same `not found`.

## Comments and docs stay true

A change updates every comment and doc it makes false: module headers, JSDoc, section headers, and the docs that describe the code it touches. Search for the changed names and behaviours outside the diff too: a stale line usually sits in a file the diff never opened.

## Repo text in English

Docs, code comments, and log messages are written in English, including additions to a file whose existing text is in another language.
