import path from "path";
import execa from "execa";
import { expect, test } from "vitest";
import { RenderInternals, openBrowser } from "@remotion/renderer";

test("Bundle studio", async () => {
  await execa("pnpm", ["exec", "remotion", "bundle"], {
    cwd: path.join(process.cwd(), "..", "example"),
  });

  const browser = openBrowser("chrome");

  const tab = await (await browser).newPage(() => null, "info", false);
  const { port, close } = await RenderInternals.serveStatic(
    path.join(process.cwd(), "..", "example", "build"),
    {
      port: null,
      concurrency: 1,
      downloadMap: RenderInternals.makeDownloadMap(),
      indent: false,
      logLevel: "info",
      offthreadVideoCacheSizeInBytes: null,
      remotionRoot: path.join(process.cwd(), "..", "example"),
      binariesDirectory: null,
      forceIPv4: false,
    }
  );
  await tab.goto({
    url: `http://localhost:${port}`,
    timeout: 10000,
    options: {},
  });
  await new Promise((resolve) => {
    setTimeout(() => {
      resolve(null);
    }, 3000);
  });
  const result = await tab.evaluateHandle(() => {
    return document.querySelectorAll(".css-reset").length;
  });
  expect(result.toString()).toBeGreaterThan(1);

  await (await browser).close(false, "info", false);
  await close();
});
