# Third‑party notices

Schemava is an independent product. It uses the following third‑party open‑source software. Schemava does
**not** include, bundle, or distribute SurveyJS Creator, SurveyJS PDF Generator, or SurveyJS Dashboard, or any
other commercial SurveyJS product. All third‑party product names and trademarks are the property of their
respective owners.

## Runtime renderer (not bundled — loaded from a CDN)

### SurveyJS Form Library — `survey-core` / `survey-js-ui`
Used to preview and render forms from SurveyJS‑compatible JSON. Loaded at runtime from a CDN (pinned via
`config('schemava.renderer_version')`); it is **not** redistributed inside this package.

- License: MIT
- Copyright © Devsoft Baltic OÜ
- https://github.com/surveyjs/survey-library

```
MIT License — Copyright (c) Devsoft Baltic OÜ

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and
to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of
the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
IN THE SOFTWARE.
```

## Bundled into the compiled builder asset (`resources/dist/schemava-builder.js`)

These MIT‑licensed libraries are compiled into the visual builder bundle:

- **Vue** (MIT) — © Evan You & Vue contributors — https://github.com/vuejs/core
- **vuedraggable** (MIT) — © Sortable contributors — https://github.com/SortableJS/vue.draggable.next
- **anime.js** (MIT) — © Julian Garnier — https://github.com/juliangarnier/anime
- **Tailwind CSS** (MIT, build‑time) — © Tailwind Labs — https://github.com/tailwindlabs/tailwindcss

## Framework

This package integrates with **Laravel** (MIT) and **FilamentPHP** (MIT) but does not redistribute them; they
are peer dependencies installed in the host application. Schemava claims no ownership of the Laravel, Livewire,
FilamentPHP, or SurveyJS names or marks.
