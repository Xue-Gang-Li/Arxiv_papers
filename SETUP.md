# Setup Checklist

## 1. Create the GitHub repository

Create a public repository:

- Owner: `xue-gang-li`
- Repository name: `Arxiv_papers`
- Visibility: public
- Do not add a README during creation if you plan to upload this folder directly.

Expected site:

https://xue-gang-li.github.io/Arxiv_papers/

## 2. Upload the project

Upload all files in this folder to the repository root:

- `.github/workflows/daily-digest.yml`
- `scripts/digest.mjs`
- `package.json`
- `README.md`
- `public/index.html`
- `public/Arxiv_papers_YYYY-MM-DD.html`
- `data/`

## 3. Add the Feishu webhook as a repository secret

Go to:

`Settings` -> `Secrets and variables` -> `Actions` -> `New repository secret`

Add:

- Name: `FEISHU_WEBHOOK`
- Secret: paste your Feishu custom bot webhook URL

Do not put the webhook directly into source files.

## 4. Enable GitHub Pages

Go to:

`Settings` -> `Pages`

Set:

- Source: `GitHub Actions`

## 5. Test once

Go to:

`Actions` -> `Daily arXiv Quantum Digest` -> `Run workflow`

After the workflow finishes, open:

https://xue-gang-li.github.io/Arxiv_papers/

## Schedule

The workflow runs Monday-Friday at 12:00 Asia/Shanghai.
