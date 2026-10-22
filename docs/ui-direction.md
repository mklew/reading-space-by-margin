# Margin interface direction

Margin is an original personal reader informed by the observed Readwise Library, Inbox/Later/Archive, separate feed inbox, notebook, and appearance flows. It contains no copied library content or Readwise assets.

The desktop layout uses a quiet 230px pale sidebar, warm white reading space, fine separators, small source metadata, a Georgia wordmark, and muted green actions. The default empty state invites URL capture and offers an explicitly optional original sample note. Empty folders explain their purpose. No sample content exists until the user adds it.

Phone layouts replace the fixed sidebar with an accessible menu. Native capture dialogs manage focus and Escape. Keyboard N opens capture and slash focuses library search outside fields. Article rows use explicit reading and organization buttons. The reader is a separate component sharing the same server library snapshot.

Library is the data shape. View, folder, query, tag, sort, selected document ID, and capture state are local presentation state. Mutations use server commands and refresh the canonical snapshot. Conflicts surface as errors and refresh current state. Preferences persist on the server. A shared URL only populates the capture form and never creates a document without submission.

Phone capture supports copy and paste, install where the browser offers it, and explicit iOS Shortcut instructions using a scoped capture token. New tokens appear only in the current settings view state. The app does not claim native iOS share-target support.

The Model the Domain principle shaped the choice to consume the existing Library model directly and keep presentation selections separate from saved library data.
