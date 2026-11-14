<p align="center">
  <a href="https://allocflow.github.io/"><img src="assets/img/og.jpg" width="100%" alt="AllocFlow project page"></a>
</p>

<h3 align="center">Project page for <a href="https://allocflow.github.io/">AllocFlow</a></h3>

<p align="center">
  <a href="https://allocflow.github.io/"><img src="https://img.shields.io/badge/Visit-allocflow.github.io-2B44D6?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Visit"></a>
  <a href="https://arxiv.org/abs/2611.19937"><img src="https://img.shields.io/badge/arXiv-2611.19937-B31B1B?style=for-the-badge&logo=arxiv&logoColor=white" alt="arXiv"></a>
  <a href="https://github.com/allocflow/AllocFlow"><img src="https://img.shields.io/badge/Code-AllocFlow-121316?style=for-the-badge&logo=github&logoColor=white" alt="Code"></a>
</p>

This repository hosts the static source of the AllocFlow project page. It needs no build step: plain HTML, CSS and JavaScript.

```bash
npx serve .        # or: python3 -m http.server 8000
```

| Path | Contents |
|:--|:--|
| `index.html` | the page |
| `assets/js/flow.js` | the hero wordmark and the interactive flow-matching lab, both driven by the exact marginal velocity field of a Gaussian mixture |
| `assets/js/main.js` | the results chart, tables and reveal animations |
| `assets/data/pnl.js` | cumulative PnL series digitized from Figure 1 of the paper |
| `assets/video/` | the two-minute explainer, in English and with bilingual subtitles |
