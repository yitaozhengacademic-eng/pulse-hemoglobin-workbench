# Deployment status — 2026-10-27

The owner explicitly authorized this repository to become public on 2026-10-27. GitHub CLI verified `PUBLIC` for `yitaozhengacademic-eng/pulse-hemoglobin-workbench`.

Live website: https://yitaozhengacademic-eng.github.io/pulse-hemoglobin-workbench/

GitHub Pages uses GitHub Actions and enforces HTTPS. The installed `.github/workflows/pulse-pages.yml` is active. Initial test and deployment run `40465288223` completed successfully. Only `pulse-site/dist` is published as the site.

The workflow tests model parity and environmental rules, refreshes public environmental observations daily at 06:23 China Standard Time, commits the observations, and deploys the site. GitHub may delay scheduled runs. Source publication delays and missing observations remain visible; a successful workflow does not establish complete exposure coverage.

The CLI authorization lacks workflow-writing scope, so the workflow was installed through the owner's authorized Chrome session. Routine source updates and status checks use GitHub CLI. No credentials, original patient tables, manuscript document, or individual patient outputs are published. Tests use invented inputs; checkpoint audits contain only aggregate errors.

The earlier private Sites preview remains separate and is not the canonical public site. The private `idea` backup remains unchanged.
