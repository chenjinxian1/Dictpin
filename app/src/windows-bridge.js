'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const MAX_TEXT_LENGTH = 50000;
const TOKEN_RE = /^[a-f0-9]{32}$/;
const COPY_MESSAGE = '未自动回填，请点击复制后手动粘贴。';

/**
 * The helper never receives shell commands or strings in command arguments.
 * Transcript/opaque target tokens travel only as JSON over anonymous stdin.
 * Dependency injection is for Node-only protocol tests; do not expose it to IPC.
 */
function createWindowsBridge(options = {}) {
  const platform = options.platform || process.platform;
  const spawnProcess = options.spawn || spawn;
  const fsPromises = options.fs || fsp;
  const exists = options.existsSync || fs.existsSync;
  const root = options.nativeDir || (
    process.resourcesPath && exists(path.join(process.resourcesPath, 'native', 'WindowsBridge.cs'))
      ? path.join(process.resourcesPath, 'native')
      : path.resolve(__dirname, '..', 'native')
  );
  const timeout = options.requestTimeoutMs || 10000;
  let child = null;
  let warmPromise = null;
  let ready = false;
  let disposed = false;
  let temporaryDirectory = null;
  let nextId = 1;
  let pending = null;
  let buffer = '';
  let busy = false;
  let failureMessage = COPY_MESSAGE;
  const usedTokens = new Set();

  const fallback = (message = failureMessage) => ({ status: 'fallback', message });

  function stop(reason) {
    ready = false;
    failureMessage = reason || COPY_MESSAGE;
    if (pending) {
      clearTimeout(pending.timer);
      const error = new Error(failureMessage);
      error.attempted = pending.attempted === true;
      pending.reject(error);
      pending = null;
    }
    const previous = child;
    child = null;
    if (previous) {
      previous.stdin?.destroy();
      previous.kill();
    }
  }

  function runCompiler(executable, args) {
    return new Promise((resolve, reject) => {
      const compiler = spawnProcess(executable, args, {
        windowsHide: true,
        shell: false,
        stdio: ['ignore', 'ignore', 'ignore']
      });
      const timer = setTimeout(() => {
        compiler.kill();
        reject(new Error('Windows 辅助程序准备超时。' + COPY_MESSAGE));
      }, options.compileTimeoutMs || 20000);
      compiler.once('error', () => {
        clearTimeout(timer);
        reject(new Error('Windows 辅助程序无法启动。' + COPY_MESSAGE));
      });
      compiler.once('exit', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error('系统未允许编译 Windows 辅助程序。' + COPY_MESSAGE));
      });
    });
  }

  function launch(executable) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => fail('Windows 辅助程序没有及时就绪。' + COPY_MESSAGE), 10000);
      const fail = (message) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error(message));
        }
        stop(message);
      };
      try {
        child = spawnProcess(executable, [], {
          windowsHide: true,
          shell: false,
          stdio: ['pipe', 'pipe', 'ignore']
        });
      } catch {
        fail('Windows 辅助程序无法启动。' + COPY_MESSAGE);
        return;
      }
      child.once('error', () => fail('系统阻止了 Windows 辅助程序。' + COPY_MESSAGE));
      child.once('exit', () => fail('Windows 辅助程序已退出。' + COPY_MESSAGE));
      child.stdin.on('error', () => fail('Windows 辅助程序通信中断。' + COPY_MESSAGE));
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        buffer += chunk;
        if (buffer.length > 262144) return fail('Windows 辅助程序返回异常。' + COPY_MESSAGE);
        let end;
        while ((end = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, end).trim();
          buffer = buffer.slice(end + 1);
          if (!line) continue;
          let message;
          try { message = JSON.parse(line); }
          catch { return fail('Windows 辅助程序返回异常。' + COPY_MESSAGE); }
          if (!settled && message.type === 'ready' && message.protocol === 1) {
            settled = true;
            clearTimeout(timer);
            ready = true;
            resolve(true);
          } else if (ready && pending && message.id === pending.id) {
            if (message.progress === 'paste-started') {
              pending.attempted = true;
              clearTimeout(pending.timer);
              pending.timer = setTimeout(() => stop('已尝试写入原输入框，但等待结果超时；请先检查输入框。'), options.deliveryTimeoutMs || 4000);
              continue;
            }
            const request = pending;
            pending = null;
            clearTimeout(request.timer);
            if (message.error || (request.attempted && message.result?.status !== 'attempted')) {
              const error = new Error('无法安全回填。' + COPY_MESSAGE);
              error.attempted = request.attempted === true;
              request.reject(error);
            } else request.resolve(message.result);
          } else {
            return fail('Windows 辅助程序返回了意外响应。' + COPY_MESSAGE);
          }
        }
      });
    });
  }

  async function warmUp() {
    if (disposed || platform !== 'win32') return false;
    if (ready) return true;
    if (warmPromise) return warmPromise;
    warmPromise = (async () => {
      try {
        const bundledExecutable = path.join(root, 'WindowsBridge.exe');
        if (exists(bundledExecutable)) {
          // A denied bundled binary must never trigger a compilation workaround.
          return await launch(bundledExecutable);
        }
        if (options.allowDevelopmentCompile !== true) {
          throw new Error('随包 Windows 辅助程序缺失，已停止自动回填；请检查安装或手动复制。');
        }
        const windows = options.windowsDir || process.env.SystemRoot;
        if (!windows || !/^[A-Za-z]:[\\/]/.test(windows) || windows.includes('\0')) throw new Error('无法定位 Windows 系统组件。' + COPY_MESSAGE);
        const framework = path.win32.join(windows, 'Microsoft.NET', 'Framework64', 'v4.0.30319');
        const compiler = path.win32.join(framework, 'csc.exe');
        if (!exists(compiler)) throw new Error('系统缺少 .NET Framework 编译组件。' + COPY_MESSAGE);
        temporaryDirectory = await fsPromises.mkdtemp(path.join(options.tmpdir || os.tmpdir(), 'local-dictation-bridge-'));
        const executable = path.join(temporaryDirectory, 'WindowsBridge.exe');
        const refs = [
          path.win32.join(framework, 'System.Web.Extensions.dll'),
          path.win32.join(framework, 'WPF', 'UIAutomationClient.dll'),
          path.win32.join(framework, 'WPF', 'UIAutomationTypes.dll'),
          path.win32.join(framework, 'WPF', 'WindowsBase.dll')
        ];
        const args = [
          '/nologo', '/target:exe', '/platform:x64', '/optimize+', '/utf8output',
          '/out:' + executable,
          ...refs.map((reference) => '/reference:' + reference),
          path.join(root, 'WindowsBridge.cs')
        ];
        await runCompiler(compiler, args);
        if (disposed) return false;
        return await launch(executable);
      } catch (error) {
        stop(error.message || COPY_MESSAGE);
        return false;
      }
    })();
    return warmPromise;
  }

  function request(operation, data) {
    if (!ready || !child || pending) return Promise.reject(new Error(COPY_MESSAGE));
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending = {
        id, resolve, reject,
        timer: setTimeout(() => stop('Windows 回填处理超时；请先检查输入框，再决定是否手动粘贴。'), timeout)
      };
      child.stdin.write(JSON.stringify({ id, operation, ...data }) + '\n', 'utf8', (error) => {
        if (error) stop('Windows 辅助程序通信中断。' + COPY_MESSAGE);
      });
    });
  }

  async function captureTarget() {
    // Never start a late capture after compilation: focus might have changed.
    // Call warmUp() at application startup; a not-yet-ready capture safely fails.
    if (!ready || disposed || busy || platform !== 'win32') return null;
    busy = true;
    try {
      const target = await request('capture', { excludeProcessId: process.pid });
      if (!target || typeof target.token !== 'string' || !TOKEN_RE.test(target.token)) return null;
      usedTokens.clear();
      return Object.freeze(target);
    } catch { return null; }
    finally { busy = false; }
  }

  async function paste(target, text, { signal } = {}) {
    if (signal?.aborted) return fallback('回填已取消，可按需要手动复制结果。');
    if (platform !== 'win32') return fallback('当前系统仅支持复制，请手动粘贴。');
    if (!ready || disposed) return fallback();
    if (typeof text !== 'string' || text.length === 0 || text.length > MAX_TEXT_LENGTH || text.includes('\0')) {
      return fallback('文本为空、过长或含不支持的字符。' + COPY_MESSAGE);
    }
    if (!target || typeof target.token !== 'string' || !TOKEN_RE.test(target.token)) {
      return fallback('未捕获到受支持的原生输入框；浏览器和其他应用请点击复制后手动粘贴。');
    }
    if (usedTokens.has(target.token)) return fallback('此目标已尝试过一次；请先检查输入框，再决定是否手动粘贴。');
    if (busy) return fallback('正在处理其他回填。' + COPY_MESSAGE);
    usedTokens.add(target.token);
    busy = true;
    try {
      // Once submitted, let the bounded native operation finish. Aborting
      // cannot retract a Windows message that has already been dispatched.
      if (signal?.aborted) return fallback('回填已取消，可按需要手动复制结果。');
      const result = await request('paste', { token: target.token, text });
      if (!result || !['attempted', 'fallback'].includes(result.status) || typeof result.message !== 'string') {
        return fallback('无法确认回填结果；请先检查输入框，再决定是否手动粘贴。');
      }
      return { status: result.status, message: result.message };
    } catch (error) {
      if (error.attempted) {
        return { status: 'attempted', message: '已尝试写入原输入框，但无法确认最终结果；请先检查，避免重复粘贴。剪贴板未改动。' };
      }
      return fallback('无法确认是否已回填；请先检查输入框，再决定是否手动粘贴。');
    } finally { busy = false; }
  }

  async function dispose() {
    disposed = true;
    // Allow an in-flight native message to report its outcome before terminating.
    if (busy) {
      const started = Date.now();
      while (busy && Date.now() - started < timeout + (options.deliveryTimeoutMs || 4000) + 500) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    stop();
    if (warmPromise) await warmPromise;
    if (temporaryDirectory) {
      await fsPromises.rm(temporaryDirectory, { recursive: true, force: true, maxRetries: 4, retryDelay: 150 }).catch(() => {});
    }
  }

  return { warmUp, captureTarget, paste, dispose };
}

const singleton = createWindowsBridge();
module.exports = { ...singleton, createWindowsBridge, MAX_TEXT_LENGTH };
