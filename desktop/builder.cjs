// The staging directory is assembled from this exact list, never the workspace.
module.exports = {
  appId: 'cn.zhixin.ailover',
  productName: 'AI Lover',
  directories: { app: 'desktop-build', output: 'artifacts/windows' },
  files: [
    'main.cjs',
    'package.json',
    'web/index.html',
    'web/assets/*.js',
    'web/assets/*.css',
    'web/icon.svg',
    'web/icon-192.png',
    'web/icon-512.png',
    'web/manifest.webmanifest',
    '!node_modules/**/*',
  ],
  asar: true,
  npmRebuild: false,
  publish: null,
  win: {
    target: [
      { target: 'nsis', arch: ['x64'] },
      { target: 'zip', arch: ['x64'] },
    ],
    icon: 'public/icon-512.png',
    artifactName: 'AI-Lover-${version}-Windows-${arch}.${ext}',
    // No signing credentials or executable resource rewrite are needed.
    signAndEditExecutable: false,
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    deleteAppDataOnUninstall: false,
    artifactName: 'AI-Lover-${version}-Windows-${arch}-Setup.${ext}',
  },
};
