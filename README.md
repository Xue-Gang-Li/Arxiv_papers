# arXiv Quantum Digest

Daily arXiv digest for superconducting quantum computing, quasiparticles, radiation/infrared/vibration related papers, and other important quantum-computing papers.

Site URL:

https://xue-gang-li.github.io/Arxiv_papers/

Daily pages use this filename format:

`Arxiv_papers_YYYY-MM-DD.html`

## GitHub Setup

Create a public GitHub repository named `Arxiv_papers` under the account `xue-gang-li`, then upload this project.

Repository secret required:

- `FEISHU_WEBHOOK`: your Feishu custom bot webhook URL.

GitHub Pages settings:

- Source: GitHub Actions

The workflow runs at 04:00 UTC, Monday-Friday, which is 12:00 Asia/Shanghai.

## Local Test

```bash
node scripts/digest.mjs
```

To skip the Feishu notification:

```bash
FEISHU_WEBHOOK= node scripts/digest.mjs
```

## Notes

The classifier is keyword based. It intentionally prioritizes:

- superconducting qubits, transmons, Josephson circuits, circuit QED
- quasiparticles, cosmic rays, ionizing radiation, phonons, infrared leakage, blackbody radiation
- quantum error correction, logical qubits, fault tolerance, decoherence, noise spectroscopy

The Chinese summary is a concise digest based on the English abstract; the arXiv page remains the source of truth.
