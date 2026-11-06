# Build identity and GitHub Pages path

The footer follows [Waypoint's version generator](https://github.com/noddson/waypoint/blob/main/generate-version.mjs): `YYYY.MM.<seven-character commit>`, with `.d` for a local checkout containing changes. The date uses UTC, matching Waypoint. The version links to the full commit on GitHub when the repository identity is known.

Vite embeds the metadata into the application bundle at build time and emits the same values in `dist/version.json`. The footer never fetches a newer version file at runtime, so a cached offline application continues identifying its own build after a deployment.

The full commit comes from `GITHUB_SHA`, then `COMMIT_SHA`, then the local Git HEAD. A configured commit that differs from the actual checkout is rejected. The repository comes from `GITHUB_REPOSITORY` (`owner/repository`) or a GitHub `origin` remote. HTTPS and normal Git SSH remote formats are supported. There is no guessed repository fallback. `VERSION_ASSUME_CLEAN=true` matches the existing tools' clean-CI override; use it only when the checkout really represents the specified commit.

A source folder without a Git commit or explicit CI identity displays **Local build**, without a fabricated commit link. Once built from its real Git checkout or CI, the commit link is automatic. A local commit must be pushed before its GitHub link can resolve.

Production builds and previews default to `/fatecc/`, matching the intended `https://noddson.github.io/fatecc/` hosting path. Development defaults to `/`. Set `VITE_BASE_PATH=/` for a root-hosted production build, or another same-origin path for another static-host location. The manifest start URL, scope, and icon paths use the same base.

The [Pages workflow](../.github/workflows/pages.yml) derives the build base from GitHub Pages configuration and publishes the verified build after source audits, unit tests, and production offline checks. GitHub Actions supplies the exact commit and repository identity. See [first publication and deployment](github-pages.md) for setup and [the initial implementation record](initial-implementation.md) for scope and verification limits.
