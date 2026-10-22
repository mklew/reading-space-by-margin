# Configurable keyboard controls

Use a fixed dictionary of reader actions with optional single-character overrides. A general command registry would introduce unsupported action names and extensibility the current product does not use. Empty overrides disable a shortcut; absent overrides keep defaults.

Default actions: capture N, search /, next J, previous K, archive E, later L, notebook B. Escape remains a dismissal key rather than a configurable reading action. Library capture/search work outside open dialogs and documents. Reader navigation, triage and notebook actions work only while reading. Modifiers, composition, repeat and editable targets suppress commands.

The preferences API validates effective uniqueness, including collisions with defaults. Settings keeps drafts until save; schema errors are visible. Binding hints derive from the same effective configuration. Preferences export/import carries mappings with other reading settings.

Verified: 65 tests pass, including schema/matcher behavior and API persistence/rejection. Browser rebind N to Q, reload, Q opens capture, typing Q in URL field leaves it as text; J opens next document and B closes notebook. Reset to defaults saved after testing. Production build passes.
