import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

// This development-only reader extracts chat data, never settings or API credentials.
// Snapshots remain in ignored artifacts/private with owner-only permissions.
const project = fileURLToPath(new URL('../', import.meta.url));
const self = fileURLToPath(import.meta.url);
const workerFlag = process.argv.indexOf('--cdp-worker');

async function readWebView(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('无法读取 WebView 调试连接');
  const targets = await response.json();
  const target = targets.find((item) => item.type === 'page' && item.webSocketDebuggerUrl);
  if (!target) throw new Error('请在手机上打开知心，再重试读取');
  return new Promise((resolveSnapshot, reject) => {
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('读取聊天记录超时'));
    }, 15_000);
    const finish = (error, value) => {
      clearTimeout(timer);
      socket.close();
      if (error) reject(error);
      else resolveSnapshot(value);
    };
    socket.addEventListener('error', () => finish(new Error('WebView 调试连接失败')));
    socket.addEventListener('open', () => {
      socket.send(
        JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: {
            expression: "localStorage.getItem('zhixin.data.v1')",
            returnByValue: true,
          },
        }),
      );
    });
    socket.addEventListener('message', (event) => {
      try {
        const result = JSON.parse(String(event.data));
        if (result.id !== 1) return;
        if (result.error || result.result?.exceptionDetails)
          throw new Error('无法读取应用本机聊天记录');
        const value = result.result?.result?.value;
        if (typeof value !== 'string') throw new Error('本机尚未保存聊天记录');
        finish(undefined, JSON.parse(value));
      } catch {
        finish(new Error('本机聊天记录暂时无法解析，原始数据未修改'));
      }
    });
  });
}

function execute(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    const name = basename(command === '/init' ? args[0] : command);
    throw new Error(`本机读取工具 ${name} 执行失败（${result.error?.code ?? result.status}）`);
  }
  return result.stdout.trim();
}

function adbInvoke(adb, args) {
  const port = process.env.ADB_PORT;
  if (port && (!/^\d{1,5}$/u.test(port) || Number(port) < 1 || Number(port) > 65535))
    throw new Error('ADB_PORT 必须是有效端口号');
  const adbArgs = port ? ['-P', port, ...args] : args;
  return adb.endsWith('.exe') && process.platform !== 'win32' && existsSync('/init')
    ? execute('/init', [adb, basename(adb), ...adbArgs])
    : execute(adb, adbArgs);
}

async function snapshotDevice() {
  const cachedAdb = join(
    homedir(),
    '.cache',
    'ai-lover-tools',
    'android-sdk',
    'platform-tools',
    'adb',
  );
  const adb = process.env.ADB || (existsSync(cachedAdb) ? cachedAdb : 'adb');
  const devices = adbInvoke(adb, ['devices'])
    .split(/\r?\n/u)
    .map((line) => /^(\S+)\s+device$/u.exec(line))
    .filter(Boolean);
  const requested = process.env.ANDROID_SERIAL;
  const device = requested ? devices.find((item) => item[1] === requested) : devices[0];
  if (!device) throw new Error('未发现已授权设备；请连接 OPPO 并允许 USB 调试');
  if (devices.length > 1 && !requested) throw new Error('连接了多台设备，请设置 ANDROID_SERIAL');
  const selected = ['-s', device[1]];
  // OPPO may pause background WebViews; bring the owned application to the foreground.
  adbInvoke(adb, [...selected, 'shell', 'am', 'start', '-n', 'com.zhixin.ailover/.MainActivity']);
  const pid = adbInvoke(adb, [...selected, 'shell', 'pidof', 'com.zhixin.ailover']);
  const sockets = adbInvoke(adb, [...selected, 'shell', 'cat', '/proc/net/unix']);
  const socket = `webview_devtools_remote_${pid}`;
  if (!sockets.includes(socket)) throw new Error('手机应用未开放 WebView 调试，请使用测试安装包');
  const port = adbInvoke(adb, [...selected, 'forward', 'tcp:0', `localabstract:${socket}`]);
  try {
    let data;
    if (adb.endsWith('.exe') && process.platform !== 'win32') {
      const windowsNode = process.env.WINDOWS_NODE || '/mnt/c/Program Files/nodejs/node.exe';
      if (!existsSync(windowsNode)) throw new Error('需设置 WINDOWS_NODE 为宿主机 Node.js 路径');
      const hostScript = execute('wslpath', ['-w', self]);
      data = JSON.parse(
        execute('/init', [windowsNode, basename(windowsNode), hostScript, '--cdp-worker', port]),
      );
    } else data = await readWebView(port);
    const destination = resolve(project, 'artifacts/private/android-conversations.json');
    mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
    chmodSync(dirname(destination), 0o700);
    writeFileSync(destination, JSON.stringify(data, null, 2), { mode: 0o600 });
    chmodSync(destination, 0o600);
    const count = Object.values(data.conversations ?? {}).reduce(
      (sum, messages) => sum + messages.length,
      0,
    );
    console.log(
      `已读取 ${data.companions?.length ?? 0} 位对象、${count} 条消息；私密快照仅保存在本机 artifacts/private。`,
    );
  } finally {
    adbInvoke(adb, [...selected, 'forward', '--remove', `tcp:${port}`]);
  }
}

try {
  if (workerFlag >= 0)
    process.stdout.write(JSON.stringify(await readWebView(process.argv[workerFlag + 1])));
  else await snapshotDevice();
} catch (error) {
  console.error(error instanceof Error ? error.message : '读取失败；原始记录未修改');
  process.exitCode = 1;
}
