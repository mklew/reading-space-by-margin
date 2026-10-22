# Reader build brief

Build a Readwise-inspired application in this empty repository and deploy it to Vercel. The user explicitly prioritizes gathering internet material, sharing from a phone, subscribing to feeds, and a clean reading experience. Use original branding and demo text. Do not publish or import the user's Readwise library.

Required implementation scope includes URL article extraction, manual text capture, a mobile-friendly share intake path, RSS and Atom subscriptions with refresh and deduplication, a separate feed inbox, clean reader typography, Inbox/Later/Archive, search and tags, highlights and notes, progress, reading preferences, trash and restore, and durable persistence. Phone capture must have an honest platform-compatible path; a PWA share target alone does not cover iOS.

Data must be private per user or per explicitly paired personal library. Cross-device capture should reach the same library. Do not silently substitute browser-only persistence for the phone-to-desktop workflow. Investigate available Vercel storage and authentication before committing to infrastructure. No paid service purchases are authorized.

Read docs/research.md for observed UI structure. The user clarified that the goal is a comprehensive product, not a surface-level reader. Explore deeper preferences, imports, exports, integrations, and additional workflows before deciding delivery scope. The core implementation is a foundation. Do not automatically defer advanced capabilities because they are harder. Record each discovered capability with evidence, implementation approach, dependencies, and a verified status. Do not use nonfunctional controls to imply capabilities ship.

Done requires deployed browser verification of capture, reading, feed subscription, organization, annotation, and persistence, with repeatable domain/API checks and an independent review.
