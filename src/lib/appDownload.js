// Settings for the public senior download page (https://scia-osca.site/SCIA-APP-DOWNLOAD).
// Edit this file when a new version of the app is uploaded; nothing else needs to change.
export const APP_DOWNLOAD = {
  // >>> PASTE YOUR GOOGLE DRIVE LINK HERE <<<
  // In Google Drive: right-click the SCIA .apk file > Share > "General access" > "Anyone with the
  // link" (Viewer) > Copy link. If the file is not shared with "Anyone with the link", seniors will
  // see "You need access" instead of the download. The green button on the page opens this link.
  // While it is empty the page shows a friendly "coming soon" message instead of the button.
  driveUrl: 'https://drive.google.com/drive/folders/1Apec8mAtJMhegMS6qG1ymxE5hW1GCi3c?usp=drive_link',

  version: '1.1.5',  // shown under the button (leave '' to hide)
  sizeMb: '147',        // e.g. '78'  (leave '' to hide)
  released: 'October 2026',      // e.g. 'Nobyembre 2026' (leave '' to hide)

  // The address the QR code opens. Keep it equal to the real page address.
  pageUrl: 'https://scia-osca.site/SCIA-APP-DOWNLOAD',

  // OSCA office phone shown in the help section (leave empty to hide the call button).
  oscaPhone: '',
};
