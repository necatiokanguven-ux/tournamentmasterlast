import { spawn } from "child_process";
import fs from "fs";
import path from "path";

/** Cache-bust via hash fragment — safe for cmd.exe and Edge/Chrome CLIs. */
export function buildFreshDirectorUrl(baseUrl: string): string {
  const parsed = new URL(baseUrl);
  parsed.hash = `tm=${Date.now()}`;
  return parsed.toString();
}

function launchExecutable(exePath: string, args: string[]): boolean {
  if (!fs.existsSync(exePath)) {
    return false;
  }

  try {
    const child = spawn(exePath, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

function openWindowsBrowser(url: string): void {
  const edgePaths = [
    path.join(process.env["ProgramFiles(x86)"] ?? "", "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(process.env.ProgramFiles ?? "", "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(process.env.LOCALAPPDATA ?? "", "Microsoft", "Edge", "Application", "msedge.exe"),
  ];

  for (const edgePath of edgePaths) {
    if (launchExecutable(edgePath, ["-inprivate", url])) {
      return;
    }
  }

  const chromePaths = [
    path.join(process.env.ProgramFiles ?? "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env["ProgramFiles(x86)"] ?? "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env.LOCALAPPDATA ?? "", "Google", "Chrome", "Application", "chrome.exe"),
  ];

  for (const chromePath of chromePaths) {
    if (launchExecutable(chromePath, ["--incognito", url])) {
      return;
    }
  }

  spawn("cmd.exe", ["/c", "start", "", url], { detached: true, stdio: "ignore", windowsHide: true }).unref();
}

function openMacBrowser(url: string): void {
  const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (launchExecutable(chromePath, ["--incognito", url])) {
    return;
  }

  spawn("open", ["-a", "Safari", url], { detached: true, stdio: "ignore" }).unref();
}

export function openDirectorBrowser(baseUrl: string): void {
  if (process.env.TM_AUTO_OPEN_BROWSER === "0") {
    return;
  }

  const url = buildFreshDirectorUrl(baseUrl);
  console.log(`Opening director UI: ${url}`);

  if (process.platform === "win32") {
    openWindowsBrowser(url);
    return;
  }

  if (process.platform === "darwin") {
    openMacBrowser(url);
    return;
  }

  spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
}
