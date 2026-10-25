# Run Margin locally

Use Node.js 22.3 or newer, npm and Git. Local development uses PGlite, so you do not need a PostgreSQL service to try the app.

## Install

```sh
git clone https://github.com/mklew/reading-space-by-margin.git
cd reading-space-by-margin
npm ci
cp .env.example .env.local
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copy the generated value into `SETUP_SECRET` in `.env.local`. Leave `DATABASE_URL` empty for local PGlite storage. Keep `APP_ORIGIN=http://localhost:3000` when using that address.

```sh
npm run dev
```

Open `http://localhost:3000`. Use the setup code to create the single account. Choose a separate password of at least 12 characters. The setup secret is not your account password.

## Try the first reading flow

Add a short personal note or a public article. Open it, select a passage to highlight, and write a note in the notebook panel. Move it to Later, then open it again from the library.

Use synthetic content while evaluating the installation. Check [reading workflows](reading.md) when you want a different capture destination or navigation layout.

## Where your data lives

Without `DATABASE_URL`, data is stored in `READER_DATA_DIR`, set to `.reader-data` in the example environment. Run only one app process against that directory. It is ignored by Git. If you choose a custom directory, exclude it separately.

Production requires PostgreSQL. `npm run build` checks the production bundle, but running the built app with `npm start` also requires production database configuration. Follow [deployment](deployment.md) for that path.

## Common first-run problems

| Symptom | Check |
| --- | --- |
| Setup code rejected | The value in `.env.local` and a restarted development server |
| Account already exists | Sign in to the existing account; setup is single-use per database |
| Browser mutation rejected | The browser URL matches `APP_ORIGIN` exactly |
| PGlite lock or startup failure | Another process may be using the same data directory |

Never delete a data directory containing a library you want to keep. Export a backup first.
