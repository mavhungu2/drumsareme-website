# Cloud Functions

Firebase Cloud Functions for the DRUMSAREME website.

## Running Tests

Tests use **vitest** and require the **Firestore emulator** to be running before execution. They target the `demo-drumsareme` project (the `demo-` prefix tells Firebase to skip credential checks).

### 1. Start the Firestore emulator

```bash
# From the repo root (where firebase.json lives):
npx firebase emulators:start --only firestore --project demo-drumsareme
```

The emulator binds to `localhost:8080` by default. Leave this terminal running.

### 2. Run tests

```bash
# From functions/:
npm test
```

Tests run serially (single fork) to avoid emulator race conditions. Each test suite wipes all emulator data in `beforeEach` via the emulator REST endpoint.

### 3. Watching during development

```bash
npx vitest
```

### CI

<!-- TODO: add a GitHub Actions job that starts the emulator, runs `npm test`, and tears down. -->
<!-- Example: firebase emulators:exec --only firestore "cd functions && npm test" -->

## Building

```bash
npm run build
```

Compiled output goes to `lib/`.
