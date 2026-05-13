# Blinnaya Dashboard for GitHub Pages

This folder is ready to publish as a static GitHub Pages site.

## Quick publish through the GitHub website

1. Create a new GitHub repository.
2. Upload everything from this folder to the repository root.
3. In GitHub open:
   Settings -> Pages
4. Under Build and deployment choose:
   - Source: Deploy from a branch
   - Branch: main
   - Folder: /(root)
5. Save the settings and wait a minute.

Your dashboard will open at:
https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPOSITORY_NAME/

## Files

- index.html - main interactive dashboard
- assets/ - scripts and styles
- files/telegram_report.html - compact mobile-friendly summary
- files/telegram_report.pdf - PDF summary if PDF export succeeded
- 404.html - fallback to the dashboard entry page
- .nojekyll - disables Jekyll processing on GitHub Pages
