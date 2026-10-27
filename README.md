# PULSE · Environment & Hemoglobin

An English teaching research workbench for POD1-anchored hemoglobin trajectories after total knee arthroplasty.

**Private preview:** https://pulse-hemoglobin-workbench.secretokapi34.chatgpt.site (owner access required).

- Browser-local PULSE trajectory inference and a separate logistic risk model.
- City-level PM2.5 observations and on-demand ERA5 temperature and humidity.
- Thirty-day preadmission windows with explicit coverage checks.
- Fictional example, JSON/CSV export, print layout and responsive English interface.

## Source and verification

The complete project is in [pulse-site](pulse-site/). See its [README](pulse-site/README.md), [model manifest](pulse-site/dist/data/model-manifest.json) and [checkpoint audit](pulse-site/docs/checkpoint-audit.json). Six automated checks passed, including 24 fictional-input comparisons against the original Python models.

## Interpretation

**Teaching simulation only; not for clinical decisions.** Source records include outcome-directed adjustments. The manuscript and available local checkpoints have different performance summaries; the interface discloses this difference. Trajectories average existing checkpoints. The risk model is a disclosed 131-record teaching deployment refit, not an out-of-fold clinical probability. No patient table is included.

## Hosting and refresh status

The source repository is private. GitHub Pages was requested through GitHub CLI, but GitHub returned HTTP 422: the current plan does not support Pages for this private repository. A separate owner-private Sites deployment succeeded.

The latest bundled environmental refresh requested observations through 2026-10-26: 40 air files plus 21 ERA5 city responses succeeded. Coverage may still be incomplete due to publication delay. ERA5 can be refreshed in the browser.

The daily GitHub workflow is prepared in [pulse-pages.yml](pulse-site/docs/pulse-pages.yml), but **not active**. The current CLI authorization lacks the workflow scope. Do not interpret the stored PM2.5 snapshot as a running live data feed.

To host through GitHub Pages while preserving this repository as private, an eligible GitHub plan and workflow authorization are needed. Never make the repository public as a workaround.
