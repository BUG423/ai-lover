# Windows 桌面端

桌面版支持 Windows 10/11 x64，提供安装程序和 ZIP 便携包。安装后可独立启动，不需要另装 Node.js 或启动网页服务器。首次使用在设置中填写自己的 MiMo 或硅基流动国内站密钥。

## 构建

开发环境需要 Node.js 24：

```sh
npm ci
npm run desktop:build
```

产物位于 `artifacts/windows/`：

- `AI-Lover-0.2.0-Windows-x64-Setup.exe`：安装程序。
- `AI-Lover-0.2.0-Windows-x64.zip`：解压后运行 `AI Lover.exe`。

版本号随 `package.json` 自动更新。`npm run desktop:start` 用于本机预览；`npm run desktop:smoke` 验证启动、本机 API、网络隔离和跨进程数据留存，需要先执行 `npm run desktop:prepare`。

GitHub 的 Windows runner 会原生构建并执行桌面 smoke。Linux 开发机交叉构建完整 Windows 安装程序还需要 Wine；Linux 不作为交付平台。安装程序未配置代码签名，Windows 可能显示未知发布者提示。

## 数据与安全

桌面使用固定安全 origin `ai-lover://app/` 和独立持久会话，聊天、对象及加密密钥位于当前操作系统用户的应用数据目录。升级保留数据，卸载默认也保留数据；在应用设置中可主动清除。

模型调用由桌面主进程通过仅监听 `127.0.0.1` 的随机端口网关转发；网关每次启动生成随机访问凭证。渲染进程启用 sandbox、context isolation，并禁止 Node.js、任意外部网络请求和任意新窗口。只有官方服务商帮助链接可以交给系统浏览器打开。

打包先创建 `desktop-build/`，仅写入应用运行文件与网页构建产物。`.env`、用户资料、聊天记录、截图、测试及源码文档均不进入应用包。构建对 staging 和实际 `app.asar` 执行文件允许名单与密钥检查；发布工作流另扫描 Git 历史和解包后的安装载荷。

## 发布

推送与 `package.json` 一致的 `v版本号` tag 会触发 `.github/workflows/release.yml`。全部检查完成后，工作流发布 Windows EXE、Windows ZIP、Android APK 及 `SHA256SUMS.txt`。Android 使用仓库 Secret `ANDROID_TEST_KEYSTORE` 恢复已有测试签名，以便直接覆盖已安装测试版；签名文件不会提交到源码。

发布说明来自 `docs/release-版本号.md`。发布构建不需要、也不接受任何模型 API Key。
