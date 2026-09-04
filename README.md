# Unprompted

Unprompted turns the topics in an Obsidian vault into a lightweight speaking-practice ritual. Select a vault, spin a topic, speak against a timer, and review your session afterward.

## Features

- Reads `[[wikilinks]]` from Markdown files inside an Obsidian vault
- Supports folder selection, individual Markdown files, and ZIP uploads
- Client-side processing with no account or backend required
- Weighted topic selection that favors lower-rated and less-recently used topics
- Self-rating from 1–5 for each topic
- Animated topic spinner
- Full-screen speaking timer
- Add 30 seconds during a session
- Session summary with planned time, actual speaking time, extensions, and mode
- Local session history with Markdown export/import
- Responsive layout for desktop and mobile
- Optional dark mode and configurable timer/spin settings

## Run locally

This is a static website. Open `index.html` directly, or serve the project with any static web server:

```bash
python3 -m http.server 4173
```

Then open [http://localhost:4173](http://localhost:4173).

## Deploy with GitHub Pages

1. Push the repository to GitHub.
2. Open **Settings → Pages**.
3. Select **Deploy from a branch**.
4. Choose the branch and root folder.
5. Save and open the generated Pages URL.

No build step is required.

## Privacy and storage

Vault files are processed in the browser. They are not uploaded by the application. Ratings, settings, and session history are stored in browser storage and may be removed when site data is cleared.

Use **Export history.md** to create a portable backup, and **Import history.md** to restore it on another browser or after clearing site data.

## Browser notes

Chrome desktop provides the best folder-selection experience. Safari and mobile browsers may require selecting Markdown files individually or uploading a ZIP. A hosted GitHub Pages site cannot read pasted filesystem paths or write directly to an arbitrary local vault folder.

## Project structure

```text
index.html   Application markup and UI
styles.css   Base visual styling
app.js       Topic processing and session logic
```

## License

Add the license appropriate for your project before publishing.
