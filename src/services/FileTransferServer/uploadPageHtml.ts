export interface CloudProviderConfig {
  companionUrl: string;
  googleDrive?: {
    clientId: string;
    apiKey: string;
    appId: string;
  };
}

export function getUploadPageHtml(cloud?: CloudProviderConfig): string {
  const googleDrivePlugin = cloud?.googleDrive
    ? `uppy.use(GoogleDrivePicker, {
        companionUrl: '${cloud.companionUrl}',
        clientId: '${cloud.googleDrive.clientId}',
        apiKey: '${cloud.googleDrive.apiKey}',
        appId: '${cloud.googleDrive.appId}',
      });`
    : "";

  const dropboxPlugin = cloud
    ? `uppy.use(Dropbox, { companionUrl: '${cloud.companionUrl}' });`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MDNT BRWK — Upload Music</title>
<link href="https://releases.transloadit.com/uppy/v5.2.1/uppy.min.css" rel="stylesheet">
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&display=swap');

  :root {
    --black: #000000;
    --surface: #0a0a0a;
    --border: #1a1a1a;
    --border-hover: #333333;
    --text-primary: #e5e5e5;
    --text-secondary: #a3a3a3;
    --text-muted: #525252;
    --text-faint: #404040;
    --accent: #6FE7FF;
    --accent-dim: rgba(111, 231, 255, 0.08);
    --accent-glow: rgba(111, 231, 255, 0.15);
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: var(--black);
    color: var(--text-primary);
    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 48px 24px 40px;
    -webkit-font-smoothing: antialiased;
  }

  /* ---- Header ---- */
  .brand {
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 4px;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 12px;
  }
  .title {
    font-size: 28px;
    font-weight: 600;
    color: var(--text-primary);
    letter-spacing: -0.5px;
    margin-bottom: 8px;
  }
  .subtitle {
    font-size: 14px;
    color: var(--text-muted);
    line-height: 1.5;
    max-width: 360px;
  }

  .header {
    text-align: center;
    margin-bottom: 40px;
  }

  /* ---- Uppy container ---- */
  #uppy-container {
    width: 100%;
    max-width: 560px;
  }

  /* ---- Format pills ---- */
  .formats {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: center;
    margin-top: 28px;
    max-width: 560px;
  }
  .formats span {
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 1px;
    color: var(--text-muted);
    padding: 5px 14px;
    border: 1px solid var(--border);
    border-radius: 999px;
    transition: border-color 0.2s, color 0.2s;
  }
  .formats span:hover {
    border-color: var(--border-hover);
    color: var(--text-secondary);
  }

  /* ---- Footer ---- */
  .footer {
    margin-top: auto;
    padding-top: 40px;
    font-size: 12px;
    color: var(--text-faint);
    text-align: center;
    line-height: 1.5;
  }
  .footer .lock {
    display: inline-block;
    margin-right: 4px;
    opacity: 0.5;
  }

  /* ============================================================
     UPPY OVERRIDES — make Dashboard feel native to the app
     ============================================================ */

  /* Outer frame */
  [data-uppy-theme="dark"] .uppy-Dashboard-inner,
  .uppy-Dashboard-inner {
    background: var(--surface) !important;
    border: 1px solid var(--border) !important;
    border-radius: 16px !important;
    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif !important;
  }

  /* Drop area */
  [data-uppy-theme="dark"] .uppy-Dashboard-AddFiles,
  .uppy-Dashboard-AddFiles {
    border: none !important;
  }

  /* "Drop files here or" title */
  [data-uppy-theme="dark"] .uppy-Dashboard-AddFiles-title,
  .uppy-Dashboard-AddFiles-title {
    color: var(--text-secondary) !important;
    font-size: 16px !important;
    font-weight: 400 !important;
  }

  /* "browse" link */
  [data-uppy-theme="dark"] .uppy-Dashboard-AddFiles-title button,
  [data-uppy-theme="dark"] .uppy-Dashboard-browse,
  .uppy-Dashboard-browse {
    color: var(--accent) !important;
    font-weight: 500 !important;
  }

  /* Note text */
  [data-uppy-theme="dark"] .uppy-Dashboard-note,
  .uppy-Dashboard-note {
    color: var(--text-faint) !important;
    font-size: 12px !important;
  }

  /* Drop hint overlay */
  .uppy-Dashboard-dropFilesHereHint {
    color: var(--accent) !important;
    border: 2px dashed var(--accent) !important;
    background: var(--accent-dim) !important;
    border-radius: 12px !important;
  }

  /* Top bar (when files are added) */
  [data-uppy-theme="dark"] .uppy-DashboardContent-bar,
  .uppy-DashboardContent-bar {
    background: var(--surface) !important;
    border-color: var(--border) !important;
  }
  [data-uppy-theme="dark"] .uppy-DashboardContent-title,
  .uppy-DashboardContent-title {
    color: var(--text-primary) !important;
    font-weight: 500 !important;
  }
  [data-uppy-theme="dark"] .uppy-DashboardContent-back,
  .uppy-DashboardContent-back {
    color: var(--accent) !important;
    font-weight: 500 !important;
  }
  [data-uppy-theme="dark"] .uppy-DashboardContent-addMore,
  .uppy-DashboardContent-addMore {
    color: var(--accent) !important;
  }
  .uppy-DashboardContent-addMore svg {
    fill: var(--accent) !important;
  }

  /* File list panel */
  [data-uppy-theme="dark"] .uppy-Dashboard-files,
  .uppy-Dashboard-files {
    background: var(--surface) !important;
  }

  /* Individual file cards */
  [data-uppy-theme="dark"] .uppy-Dashboard-Item,
  .uppy-Dashboard-Item {
    border-color: var(--border) !important;
  }
  [data-uppy-theme="dark"] .uppy-Dashboard-Item-name,
  .uppy-Dashboard-Item-name {
    color: var(--text-primary) !important;
  }
  [data-uppy-theme="dark"] .uppy-Dashboard-Item-statusSize,
  .uppy-Dashboard-Item-statusSize {
    color: var(--text-muted) !important;
  }

  /* File preview placeholder */
  .uppy-Dashboard-Item-previewImg {
    border-radius: 8px !important;
  }

  /* Status bar (progress) */
  [data-uppy-theme="dark"] .uppy-StatusBar,
  .uppy-StatusBar {
    background: var(--surface) !important;
    border-color: var(--border) !important;
    border-bottom-left-radius: 16px !important;
    border-bottom-right-radius: 16px !important;
  }
  .uppy-StatusBar-progress {
    background: var(--accent) !important;
  }
  [data-uppy-theme="dark"] .uppy-StatusBar-statusPrimary,
  .uppy-StatusBar-statusPrimary {
    color: var(--text-secondary) !important;
    font-weight: 400 !important;
  }
  [data-uppy-theme="dark"] .uppy-StatusBar-statusSecondary,
  .uppy-StatusBar-statusSecondary {
    color: var(--text-muted) !important;
  }

  /* Upload button */
  .uppy-StatusBar-actionBtn--upload {
    background: var(--accent) !important;
    color: var(--black) !important;
    font-weight: 600 !important;
    border-radius: 999px !important;
    padding: 8px 24px !important;
    font-size: 13px !important;
    letter-spacing: 0.3px !important;
    border: none !important;
    transition: opacity 0.2s !important;
  }
  .uppy-StatusBar-actionBtn--upload:hover {
    opacity: 0.85 !important;
  }

  /* Retry / pause buttons */
  .uppy-StatusBar-actionBtn--retry {
    color: var(--accent) !important;
  }

  /* Provider buttons (Google Drive, Dropbox) */
  [data-uppy-theme="dark"] .uppy-DashboardTab-btn,
  .uppy-DashboardTab-btn {
    color: var(--text-secondary) !important;
    font-weight: 400 !important;
  }
  [data-uppy-theme="dark"] .uppy-DashboardTab-btn:hover,
  .uppy-DashboardTab-btn:hover {
    color: var(--accent) !important;
  }

  /* Informer (success/error toasts) */
  .uppy-Informer {
    bottom: 60px !important;
  }
  [data-uppy-theme="dark"] .uppy-Informer-animated,
  .uppy-Informer-animated {
    background: var(--accent) !important;
    color: var(--black) !important;
    font-weight: 500 !important;
    border-radius: 999px !important;
    padding: 8px 20px !important;
    font-size: 13px !important;
  }

  /* Scrollbar */
  .uppy-Dashboard-files::-webkit-scrollbar { width: 4px; }
  .uppy-Dashboard-files::-webkit-scrollbar-track { background: transparent; }
  .uppy-Dashboard-files::-webkit-scrollbar-thumb {
    background: var(--border-hover);
    border-radius: 2px;
  }
</style>
</head>
<body>

  <div class="header">
    <div class="brand">MDNT BRWK</div>
    <h1 class="title">Upload Music</h1>
    <p class="subtitle">
      Drag &amp; drop audio files or browse to add tracks to your library
    </p>
  </div>

  <div id="uppy-container"></div>

  <div class="formats">
    <span>MP3</span>
    <span>M4A</span>
    <span>WAV</span>
    <span>AAC</span>
    <span>OGG</span>
    <span>FLAC</span>
    <span>OPUS</span>
  </div>

  <div class="footer">
    <span class="lock">&#x1f512;</span>
    Files transfer directly over your local network &mdash; nothing leaves your WiFi.
  </div>

<script type="module">
  import {
    Uppy,
    Dashboard,
    XHRUpload,
    ${cloud?.googleDrive ? "GoogleDrivePicker," : ""}
    ${cloud ? "Dropbox," : ""}
  } from "https://releases.transloadit.com/uppy/v5.2.1/uppy.min.mjs";

  const uppy = new Uppy({
    restrictions: {
      allowedFileTypes: [
        '.mp3', '.m4a', '.wav', '.aac', '.ogg', '.flac', '.opus',
        'audio/*',
      ],
    },
  });

  uppy.use(Dashboard, {
    inline: true,
    target: '#uppy-container',
    theme: 'dark',
    proudlyDisplayPoweredByUppy: false,
    showProgressDetails: true,
    width: '100%',
    height: 380,
    note: 'Audio files only',
  });

  uppy.use(XHRUpload, {
    endpoint: '/upload',
    fieldName: 'file',
    limit: 1,
    headers: (file) => ({
      'X-Original-Filename': file.name,
    }),
  });

  ${googleDrivePlugin}
  ${dropboxPlugin}
</script>
</body>
</html>`;
}
