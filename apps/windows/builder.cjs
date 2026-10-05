// The staging directory is assembled from this exact list, never the workspace.
module.exports = {
  appId: 'cn.zhixin.ailover',
  productName: 'AI Lover',
  directories: { app: '.build/windows', output: 'artifacts/windows' },
  files: [
    'main.cjs',
    'package.json',
    'renderer/index.html',
    'renderer/assets/*.js',
    'renderer/assets/*.css',
    'renderer/icon.svg',
    'renderer/icon-512.png',
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
    icon: 'packages/ui/public/icon-512.png',
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
