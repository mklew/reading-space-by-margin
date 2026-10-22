# Local browser verification

Verified against localhost:3000 using a synthetic local account, not the user's Readwise library.

- Sign-in initially failed: Origin was http://localhost:3000 while NextRequest.url used http://0.0.0.0:3000. Same-origin validation now compares the public Host (or configured APP_ORIGIN); browser sign-in succeeded after the fix.
- Added the built-in sample note. Inbox and saved count became 1; title and excerpt appeared.
- Selected the visible document and added the tag `verification` using the bulk toolbar. Selection cleared, tag appeared on the document, and tag-filter options updated.
- Created a pinned view named `Verification reads`, query `tag:verification AND in:inbox`. Settings reported one matching document and the navigation gained the view.
- Opened that pinned view. The query and one matching sample document appeared in the search list.

Not yet verified: imports/downloads, reload persistence of these browser-created records, bulk movement, stale-write UI recovery, mobile layout, keyboard-only flows, reader annotation controls, or deployed behavior. These observations do not establish complete product readiness.

## Reader/notebook follow-up

- Saved a synthetic document note in the reader; global Notebook subsequently displayed that exact note under its document title.
- Opened metadata editing and submitted a test author. The input showed the new value; independent reload persistence has not yet been checked, so metadata save is not fully verified.
- Expanded Listen: system voices and speed choices populated. Play disabled itself and enabled Pause/Stop; Pause changed Play to Resume; Stop and return to library completed without a visible error. This verifies control transitions, not audible output quality or long-document playback reliability.

## Private document URLs

Opened the synthetic sample from the library and observed `/read/<document-id>` in the browser. Reloaded that URL and verified the same article and saved synthetic document note were present. Browser Back returned to `/` with the library visible and reader closed. This verifies local signed-in opening/reload/back navigation; cross-device sign-in and clipboard permission behavior remain unverified. Typecheck passed. A fresh tab was used after the prior local tab repeatedly timed out; the server was not restarted.

## Restart recovery and in-document search

After the user reloaded localhost, browser access recovered. Opened the existing synthetic sample, expanded Find in document, searched for `reading`, and clicked Next match. The UI reported `1 of 1 matches`; the screenshot shows the matching word selected. The previously saved synthetic document note remains visible after the server/app restart. Evidence: `images/reader-find.jpg`. Upload verification remains pending; the interrupted file-chooser attempt is not evidence of a successful upload.

## PDF upload and reload

Successfully used Settings → PDF or EPUB file to upload the synthetic `margin-browser-fixture.pdf`. The UI reported Saved and library count increased from one to two. Opened its library row and verified Page 1 contained `Synthetic browser PDF verification.` Reloaded its private document URL and verified the same text remained. Original viewing and download links were present; their destinations were not exercised in this check. Screenshot: `images/pdf-reader.jpg`. This completes local browser upload/extracted-reading/reload verification for a one-page text PDF, not scanned, large, encrypted or complex-layout PDFs.

## Browser ZIP backup and repeat import

Downloaded Full archive (ZIP) through Settings to the browser's Downloads location. Parsed the actual download: two documents, one original, no warnings; original PDF bytes exactly matched the synthetic upload. Selected that ZIP through the Import file picker. Preview showed two documents, one saved view and one original. Applying it reported zero new documents/views and three existing items skipped. The library count stayed two. Evidence: `images/backup-restore.jpg`. Separate-library restore remains covered by automated tests rather than this browser check.

## Annotation export correction

Per-document Markdown export now includes author, document tags and highlight tags, and prefixes every line of a multiline quote. Its object URL is released after a delay, matching the notebook download behavior. Typecheck passed. Rendered download verification with tagged/multiline highlights is still pending; this is a code correction, not a completed browser verification claim.

## EPUB image and chapter verification

Uploaded synthetic illustrated EPUB through Settings. Browser decoded its authenticated image (complete true, naturalWidth 1). A second fixture with forty paragraphs proved forward chapter navigation: reader scroll moved from 0 to 3652.94; the private document URL remained unchanged. Back-to-first-chapter moved scroll to 342.94 and placed its heading at viewport y=63.93. Screenshot: images/epub-navigation.jpg. Synthetic documents remain in the local verification library.

All 62 automated tests and production build pass. New coverage verifies original-owned image access, cross-owner and signed-out rejection, safe raster formats, chapter targets across encoded paths, and exact text/highlight offsets through ZIP restore. Missing-original JSON removes image URLs without changing annotation text. Fixed-layout reproduction, SVG images and large direct uploads remain incomplete.

## Keyboard controls

Settings validates duplicate effective keys before saving. Browser changed capture from N to Q, saved, reloaded, and opened capture using Q. Typing Q in the URL field entered the character without activating a command. J opened the next document and B closed the notebook. Reset-to-default and save restored N after verification. Screenshot: images/keyboard-settings.jpg. API tests prove persistence and reject collisions with inherited defaults. Full suite: 65 passing; production build passes.

## API and CLI integrations

Read-token settings and instructions inspected in browser (images/integrations.jpg). Credential creation/revocation verified through isolated API tests, not by creating persistent browser-account credentials. CLI subprocess against actual API handlers retrieved a document and its annotation from the temporary library. Read tokens fail capture/command/file endpoints; capture tokens fail library reads; foreign records return 404; revocation invalidates read tokens while capture tokens survive. CLI tests include redirect refusal, no credential leakage, malformed/oversized responses and actual 15-second stalled-body timeout. Full suite 70 passes; typecheck and production build pass.
# YouTube verification, 2026-10-22

NASA's official channel feed returned regular videos and a Short. Existing entries acquired video metadata after refresh with the current store implementation. Saved "From the Moon to the 50-Yard Line" to the synthetic library, opened it, and verified the publisher description and explicit missing-transcript notice. Clicking Load YouTube video rendered the YouTube player with a Play video button at youtube-nocookie.com/embed/-62C9R_41Sc. Playback itself was not tested. Screenshot: images/youtube-reader.jpg. Full automated suite: 78 passed; production build passed.
