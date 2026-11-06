# GitHub Pages deployment

The site is intended for `https://noddson.github.io/fatecc/`. GitHub Pages serves
the application files; campaign saves remain in each participant's browser.

## Repository and first publication

The first commit on `main` contains the application source, locked dependencies,
tests, documentation, licensed rules and visual assets, and the Pages workflow.
[The initial implementation record](initial-implementation.md) describes the
features, architecture, verification, and remaining release gates in detail.
The commit message also records that scope and its validation.

The repository's Pages publishing source must be **GitHub Actions**. Configure it
in **Settings → Pages → Build and deployment → Source**, or with an authenticated
GitHub CLI after the repository and `main` exist:

```sh
gh api --method POST repos/noddson/fatecc/pages -f build_type=workflow
```

For an already enabled Pages site, use `--method PUT` instead of `POST` to change
its build type. These API requests require repository administration access.
The normal deployment workflow uses only the built-in `GITHUB_TOKEN` with
job-scoped Pages permissions; it requires no manually configured deployment secret.

If completing first publication from an existing local initial commit:

```sh
gh auth status
git remote -v
# Add this remote only if origin is not configured:
git remote add origin https://github.com/noddson/fatecc.git
git push -u origin main
```

Create an empty GitHub repository before pushing if it does not yet exist. Do not
initialize that remote with another README or commit: the local initial commit
already contains the complete project history. If a remote already contains work,
fetch and reconcile it before pushing; do not force-push over it.

After the first push, enable Pages if necessary, then open **Actions → Deploy
GitHub Pages**. If the initial run reached the Pages step before Pages was enabled,
rerun it after enabling the publishing source:

```sh
gh workflow run pages.yml --repo noddson/fatecc --ref main
gh run list --repo noddson/fatecc --workflow pages.yml
```

Inspect the deployment run and the `github-pages` environment for the final URL.
Repository visibility and account plan must support Pages; the intended public
repository works with GitHub's public-repository Pages offering.

## What the workflow does

`.github/workflows/pages.yml` runs on pushes to `main` and manual dispatches. It:

1. Checks out the exact triggering commit and sets up Node.js 24.
2. Installs npm 11.17.0, then runs `npm ci` using the committed lockfile and
   reviewed dependency lifecycle policy in `.npmrc`/`package.json`.
3. Checks the pinned GitHub SRD conversion and website heading metadata offline.
4. Runs the unit suite.
5. Reads the Pages base path and builds with that path, keeping assets, manifest,
   service-worker scope, and version/commit links consistent with the deployment.
6. Installs Chromium and verifies the production PWA with the network disabled,
   including rules, fonts, campaign persistence, and the bundled sample map.
7. Uploads only `dist/` and deploys it to the `github-pages` environment.

Official GitHub actions are pinned to verified commit IDs; comments identify the
release families. Dependency or action upgrades should be reviewed deliberately.
Build failures prevent deployment. Deployments run in a single concurrency group
so one publication cannot overwrite another midway through its upload.

`dist/`, `node_modules/`, local PDF references, temporary previews, test output,
Python caches, environment files, and development handoffs remain ignored. Keep
the workflow, `.npmrc`, formatting configuration, lockfile, `src/content/`, public
assets, and license notices committed.

## After the site is live

Open the HTTPS site once on each device to install/cache the application. Test an
offline reload after the initial download has completed. The footer should link
to the same commit shown by the successful workflow run. Apply later PWA updates
between sessions after exporting a backup.

Before moving from localhost, export **Full campaign JSON** or a ZIP backup. Open
the hosted app and import the backup there. Localhost and the GitHub Pages address
have separate browser storage; publishing does not transfer existing campaigns.
The public repository and deployment contain bundled example content and rules,
not the campaigns saved in your browser.

QR/text peer pairing works in the static application. Each device can select
Cloudflare STUN, Google STUN, or its own service; some networks need TURN. GitHub
Pages does not provide a TURN relay. See [networking.md](networking.md).

## Troubleshooting

- **Pages configuration not found:** enable the GitHub Actions publishing source,
  then rerun the workflow.
- **Asset 404s:** verify the workflow's Pages-derived `VITE_BASE_PATH`, deployed
  repository name, and final URL. The local default is `/fatecc/`.
- **Old interface after a successful deployment:** use the application's update
  prompt, or close/reopen its tabs; the service worker intentionally retains a
  usable offline version until the update is applied.
- **Missing localhost campaigns:** import an external backup on the hosted origin.
- **Peer connection failures:** verify settings on both devices and follow the
  STUN/TURN guidance; a successful Pages deployment does not prove every network
  can establish a direct peer connection.

Reference: [GitHub custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
