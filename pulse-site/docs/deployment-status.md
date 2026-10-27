# Deployment status — 2026-10-27

The user requested a new private GitHub repository: `yitaozhengacademic-eng/pulse-hemoglobin-workbench`. The website lives under `pulse-site/`. An earlier private copy was uploaded to `idea` before the user requested a new repository.

GitHub Pages API returned HTTP 422: `Your current plan does not support GitHub Pages for this repository.` The repository remains private.

The CLI OAuth token has `repo`, `gist`, and `read:org` scopes, but not `workflow`. A tree containing `.github/workflows/pulse-pages.yml` was rejected with 404; the same source upload without that workflow succeeded. The workflow is retained as `docs/pulse-pages.yml`, not enabled. No daily refresh is currently scheduled.

The bundled environmental snapshot was refreshed through 2026-10-26: 40 daily air files and 21 city weather responses, all 61 requests successful. Recent data can still be incomplete due to ERA5 publication delay.

A private Sites preview is being prepared as a separate host. ERA5 retrieval works on demand; city PM2.5 is served from the bundled observations. This preview does not change the source repository visibility.
