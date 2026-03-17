import {cp, mkdir} from "node:fs/promises";
import path from "node:path";
import {VitePlugin} from "@electron-forge/plugin-vite";
import {getCompositorPackage} from "./src/compositor-package";
import {bundleRemotionProject, getPrebuiltRemotionBundlePath} from "./src/remotion-bundle";

const DARWIN_COMPOSITOR_PACKAGES = [
  "@remotion/compositor-darwin-x64",
  "@remotion/compositor-darwin-arm64",
];

const DARWIN_UNIVERSAL_X64_ARCH_FILES =
  "Contents/Resources/app.asar.unpacked/node_modules/@remotion/compositor-darwin-*/**";

function getCompositorPackagesForPackaging({
  arch,
  platform,
}: {
  arch: string;
  platform: string;
}): string[] {
  if (platform === "darwin") {
    return DARWIN_COMPOSITOR_PACKAGES;
  }

  return [getCompositorPackage({arch, platform})];
}

async function stageCompositorPackage({
  buildPath,
  compositorPackage,
}: {
  buildPath: string;
  compositorPackage: string;
}): Promise<void> {
  const compositorPackageJson = require.resolve(`${compositorPackage}/package.json`, {
    paths: [process.cwd()],
  });

  const compositorSource = path.dirname(compositorPackageJson);
  
  const compositorDestination = path.join(
    buildPath,
    "node_modules",
    compositorPackage,
  );

  await mkdir(path.dirname(compositorDestination), {recursive: true});
  await cp(compositorSource, compositorDestination, {recursive: true});
}

const config = {
  packagerConfig: {
    asar: {
      unpackDir: "node_modules/@remotion/compositor-*",
    },
    osxUniversal: {
      // These compositor binaries are already architecture-specific and should not be
      // merged with lipo during universal packaging.
      x64ArchFiles: DARWIN_UNIVERSAL_X64_ARCH_FILES,
    },
  },
  rebuildConfig: {},
  hooks: {
    packageAfterCopy: async (
      _forgeConfig: unknown,
      buildPath: string,
      _electronVersion: string,
      platform: string,
      arch: string,
    ) => {
      await bundleRemotionProject({
        projectRoot: process.cwd(),
        outDir: getPrebuiltRemotionBundlePath(buildPath),
      });

      // Electron Forge's Vite packaging does not materialize this optional runtime binary
      // into the packaged app automatically, so stage the required compositor packages explicitly.
      const compositorPackages = getCompositorPackagesForPackaging({
        arch,
        platform,
      });

      for (const compositorPackage of compositorPackages) {
        await stageCompositorPackage({
          buildPath,
          compositorPackage,
        });
      }

    },
  },
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: "src/main.ts",
          config: "vite.main.config.ts",
          target: "main",
        },
        {
          entry: "src/preload.ts",
          config: "vite.preload.config.ts",
          target: "preload",
        },
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.ts",
        },
      ],
    }),
  ],
};

export default config;
