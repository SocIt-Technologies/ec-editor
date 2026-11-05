# ec-editor

EasyCare's rich-text editor for lab and radiology reports: [CKEditor 5](https://ckeditor.com/ckeditor-5/) in a
standalone page that the EasyCare EMR embeds in an iframe and talks to only by `postMessage`.

## Licences

- This project's own code (`src/`, build files) is licensed under the BSD 2-Clause licence - see `LICENSE`.
- CKEditor 5 is used under the GNU General Public License v2 or later (`licenseKey: 'GPL'`); see
  `node_modules/ckeditor5/LICENSE.md`. A build of this project (`dist/`) includes CKEditor 5 and is
  distributed under the GPL.
- The EMR is a separate program: it embeds the built page in an iframe and exchanges only the messages below.

## Messages

| Direction | Message | Meaning |
| --- | --- | --- |
| EMR → editor | `init {html, readOnly, terms}` | Create the editor with this content |
| EMR → editor | `setData {html}` | Replace the content (a change the EMR made); not echoed back |
| EMR → editor | `terms {terms}` | The special terms offered after typing `[[` |
| Editor → EMR | `ready` | Listening; send `init` |
| Editor → EMR | `change {html}` | The user changed the content (at most every 300 ms) |

Both sides accept messages only from the other's window and origin. The editor is served beside the EMR (same
origin); for local development set `VITE_EMR_ORIGIN` (e.g. `http://localhost:4200`).

## Features

CKEditor 5's open source plugins, plus two of this project's own (BSD-2) for what CKEditor 4's reports used and
CKEditor 5 has no open source feature for:

- `src/plugins/lineheight.ts` - line height of paragraphs (`style="line-height: X"`)
- `src/plugins/textcase.ts` - UPPER / lower / Capitalize the selected text

`src/plugins/imageembed.ts` embeds pasted and inserted images as data URLs, shrunk to 900 px wide, JPEG at 70%.
Content CKEditor 5 has no feature for (classes, inline styles, other elements) is kept by General HTML Support,
except event handler attributes.

## Build

```
npm ci
npm run build      # dist/, to copy to /editor/ on the server
npm run dev        # local development
```
