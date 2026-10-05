import { app, BrowserWindow, dialog, Menu, protocol, session, shell } from 'electron';
import { join } from 'node:path';
import { startGateway } from './gateway';

const SCHEME = 'ai-lover';
const APP_URL = `${SCHEME}://app/`;
// A stable secure origin keeps chats and encrypted settings across restarts.
protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);
app.enableSandbox();
app.setName('AI Lover');
if (!app.isPackaged && process.env.AI_LOVER_SMOKE_PROFILE)
  app.setPath('userData', process.env.AI_LOVER_SMOKE_PROFILE);

let window: BrowserWindow | undefined;
let gateway: Awaited<ReturnType<typeof startGateway>> | undefined;

function ownUrl(raw: string) {
  try {
    const url = new URL(raw);
    return url.protocol === `${SCHEME}:` && url.host === 'app' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function trustedExternal(raw: string) {
  try {
    const url = new URL(raw);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      [
        'platform.xiaomimimo.com',
        'mimo.mi.com',
        'cloud.siliconflow.cn',
        'docs.siliconflow.cn',
        'api-docs.siliconflow.cn',
      ].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

function openGuide(raw: string) {
  if (trustedExternal(raw)) void shell.openExternal(raw).catch(() => undefined);
}

async function createWindow() {
  window = new BrowserWindow({
    title: 'AI Lover · 知心',
    width: 1100,
    height: 780,
    minWidth: 360,
    minHeight: 580,
    backgroundColor: '#f8f6f2',
    icon: join(app.getAppPath(), 'renderer', 'icon-512.png'),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      partition: 'persist:ai-lover',
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      devTools: !app.isPackaged,
    },
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    openGuide(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!ownUrl(url)) {
      event.preventDefault();
      openGuide(url);
    }
  });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.once('ready-to-show', () => window?.show());
  window.on('closed', () => {
    window = undefined;
  });
  await window.loadURL(APP_URL);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (window?.isMinimized()) window.restore();
    window?.focus();
  });
  void app
    .whenReady()
    .then(async () => {
      Menu.setApplicationMenu(null);
      gateway = await startGateway(join(app.getAppPath(), 'renderer'));
      const applicationSession = session.fromPartition('persist:ai-lover');
      applicationSession.setPermissionRequestHandler((_contents, _permission, callback) =>
        callback(false),
      );
      applicationSession.setPermissionCheckHandler(() => false);
      // The renderer can only reach packaged app content. Model calls run in Node.
      applicationSession.webRequest.onBeforeRequest((details, callback) => {
        callback({ cancel: !ownUrl(details.url) });
      });
      applicationSession.protocol.handle(SCHEME, async (request) => {
        if (!ownUrl(request.url) || !gateway) return new Response('Forbidden', { status: 403 });
        const url = new URL(request.url);
        const isApi = url.pathname.startsWith('/api/');
        if (
          (isApi &&
            !['/api/health', '/api/test', '/api/models', '/api/chat'].includes(url.pathname)) ||
          (!isApi && !['GET', 'HEAD'].includes(request.method)) ||
          (isApi && url.pathname !== '/api/health' && request.method !== 'POST')
        )
          return new Response('Unsupported request', { status: 405 });
        // Do not forward cookies, credentials, or arbitrary caller headers to localhost.
        const headers: Record<string, string> = { 'x-ai-lover-capability': gateway.token };
        let body: ArrayBuffer | undefined;
        if (!['GET', 'HEAD'].includes(request.method)) {
          const length = Number(request.headers.get('content-length') || 0);
          if (length > 256 * 1024) return new Response('Too large', { status: 413 });
          body = await request.arrayBuffer();
          if (body.byteLength > 256 * 1024) return new Response('Too large', { status: 413 });
          headers['Content-Type'] = 'application/json';
        }
        try {
          const response = await fetch(`${gateway.url}${url.pathname}${url.search}`, {
            method: request.method,
            headers,
            body,
            signal: request.signal,
            redirect: 'error',
          });
          // HTTP transport headers and Origin-Agent-Cluster do not belong to our
          // custom scheme. Electron 44 crashes when loading a custom-scheme
          // document with Origin-Agent-Cluster: ?1; keep CSP and COOP intact.
          const responseHeaders = new Headers(response.headers);
          for (const name of [
            'origin-agent-cluster',
            'connection',
            'keep-alive',
            'transfer-encoding',
          ])
            responseHeaders.delete(name);
          return new Response(response.body, { status: response.status, headers: responseHeaders });
        } catch {
          return Response.json(
            { error: '本机模型服务暂时不可用，请重新打开应用' },
            { status: 503 },
          );
        }
      });
      await createWindow();
      app.on('activate', () => {
        if (!window) void createWindow();
      });
    })
    .catch(() => {
      dialog.showErrorBox('AI Lover 无法启动', '请重新打开应用，或重新安装最新版本。');
      app.quit();
    });
}
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => gateway?.close());
