# Moktan Family Tree

An interactive family tree built with React, Vite, and Tailwind CSS.

- Add and edit relatives, parents, children, and multiple spouses.
- Automatically arrange relatives and their connections.
- Search for a person to center and zoom to their card; press Enter to cycle through matches.
- Switch between light and dark themes.
- Export and import family tree JSON backups.

## Run locally

Use Node.js 22.12 or newer and npm.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite.

## Verify and build

```sh
npm test
npm run build
npm run preview
```

The production build is generated in `dist/`.

## Family records

Records are stored in this browser's local storage, not in GitHub or a shared database. Use **Backup Tree** to save your records and **Load Tree** to restore them or transfer them to another browser. A different website address or browser has separate storage.

Uploading this repository to GitHub stores the application source; it does not publish a live website.
