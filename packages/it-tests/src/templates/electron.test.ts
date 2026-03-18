import {expect, test} from 'bun:test';
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import execa from 'execa';

const repoRoot = path.join(process.cwd(), '..', '..');
const templateRoot = path.join(process.cwd(), '..', 'template-electron');
const remotionVersion = JSON.parse(
	readFileSync(path.join(repoRoot, 'packages/core/package.json'), 'utf8'),
).version as string;

function getPackageRoot(workingDir: string): string {
	return path.join(
		workingDir,
		'out',
		`template-electron-${process.platform}-${process.arch}`,
	);
}

function getPackagedResourcesPath(workingDir: string): string {
	const packageRoot = getPackageRoot(workingDir);

	if (process.platform === 'darwin') {
		return path.join(
			packageRoot,
			'template-electron.app',
			'Contents',
			'Resources',
		);
	}

	return path.join(packageRoot, 'resources');
}

function getLaunchPath(workingDir: string): string {
	const packageRoot = getPackageRoot(workingDir);

	if (process.platform === 'darwin') {
		return path.join(
			packageRoot,
			'template-electron.app',
			'Contents',
			'MacOS',
			'template-electron',
		);
	}

	if (process.platform === 'win32') {
		return path.join(packageRoot, 'template-electron.exe');
	}

	return path.join(packageRoot, 'template-electron');
}

async function copyTemplateForPublishCheck(workingDir: string): Promise<void> {
	const {stdout} = await execa(
		'git',
		['ls-files', '--cached', '--others', '--exclude-standard'],
		{
			cwd: templateRoot,
		},
	);

	for (const file of stdout.split('\n').filter(Boolean)) {
		const src = path.join(templateRoot, file);
		const dst = path.join(workingDir, file);
		mkdirSync(path.dirname(dst), {recursive: true});
		cpSync(src, dst);
	}

	const packageJsonPath = path.join(workingDir, 'package.json');
	const contents = readFileSync(packageJsonPath, 'utf8');
	writeFileSync(
		packageJsonPath,
		contents.replaceAll('workspace:*', `^${remotionVersion}`),
	);

	const forgeConfigPath = path.join(workingDir, 'forge.config.ts');
	const forgeConfig = readFileSync(forgeConfigPath, 'utf8');
	writeFileSync(
		forgeConfigPath,
		forgeConfig
			.replace(
				'// unpackDir: "{node_modules/@remotion/compositor-*,remotion-browser}",',
				'unpackDir: "{node_modules/@remotion/compositor-*,remotion-browser}",',
			)
			.replace(
				'unpackDir: "node_modules/@remotion/compositor-*",',
				'// unpackDir: "node_modules/@remotion/compositor-*",',
			)
			.replace(
				`// await stageBrowser({
      //   arch,
      //   buildPath,
      //   platform,
      // });`,
				`await stageBrowser({
        arch,
        buildPath,
        platform,
      });`,
			),
	);
}

async function packagePublishedTemplate(workingDir: string): Promise<void> {
	await copyTemplateForPublishCheck(workingDir);
	await execa('bun', ['install'], {
		cwd: workingDir,
		stdio: 'inherit',
	});
	await execa('bun', ['run', 'package'], {
		cwd: workingDir,
		stdio: 'inherit',
	});
}

function getPackagedProjectRoot(workingDir: string): string {
	return path.join(getPackagedResourcesPath(workingDir), 'app.asar');
}

function getPackagedBrowserExecutableRelativePath(): string | null {
	// There is no public API that exposes the downloaded browser layout.
	// This test intentionally asserts the current packaged folder structure so we
	// notice if `ensureBrowser()` changes where Headless Shell is placed. We keep
	// the expectation local to the test instead of importing renderer internals.
	switch (process.platform) {
		case 'darwin':
			if (process.arch === 'arm64') {
				return path.join(
					'remotion-browser',
					'mac-arm64',
					'chrome-headless-shell-mac-arm64',
					'chrome-headless-shell',
				);
			}

			if (process.arch === 'x64') {
				return path.join(
					'remotion-browser',
					'mac-x64',
					'chrome-headless-shell-mac-x64',
					'chrome-headless-shell',
				);
			}

			return null;
		case 'linux':
			if (process.arch === 'arm64') {
				return path.join(
					'remotion-browser',
					'linux-arm64',
					'chrome-headless-shell-linux-arm64',
					'headless_shell',
				);
			}

			if (process.arch === 'x64') {
				return path.join(
					'remotion-browser',
					'linux64',
					'chrome-headless-shell-linux64',
					'chrome-headless-shell',
				);
			}

			return null;
		case 'win32':
			if (process.arch === 'x64') {
				return path.join(
					'remotion-browser',
					'win64',
					'chrome-headless-shell-win64',
					'chrome-headless-shell.exe',
				);
			}

			return null;
		default:
			return null;
	}
}

function getPackagedBrowserExecutablePath(workingDir: string): string | null {
	const relativePath = getPackagedBrowserExecutableRelativePath();

	if (!relativePath) {
		return null;
	}

	return path.join(
		path.dirname(getPackagedProjectRoot(workingDir)),
		'app.asar.unpacked',
		relativePath,
	);
}

async function runPackagedRender(
	workingDir: string,
	outputPath: string,
): Promise<string> {
	const launchPath = getLaunchPath(workingDir);
	const commonOptions = {
		cwd: path.dirname(launchPath),
		timeout: 240000,
		all: true as const,
	};
	const linuxLaunchArgs =
		process.platform === 'linux'
			? [
					'--no-sandbox',
					'--disable-setuid-sandbox',
					'--headless',
					'--disable-gpu',
					'--ozone-platform=headless',
					'--ozone-platform-hint=headless',
				]
			: [];
	const launchArgs = [
		...linuxLaunchArgs,
		'--integration-render-test',
		outputPath,
	];

	if (
		process.platform === 'linux' &&
		!process.env.DISPLAY &&
		!process.env.WAYLAND_DISPLAY
	) {
		try {
			const {all} = await execa(
				'xvfb-run',
				['-a', launchPath, ...launchArgs],
				commonOptions,
			);
			return all ?? '';
		} catch (error) {
			const execaError = error as {code?: string};
			if (execaError.code !== 'ENOENT') {
				throw error;
			}
			// `xvfb-run` may not be present in all environments.
			// Fall back to direct headless launch flags.
		}
	}

	const {all} = await execa(launchPath, launchArgs, commonOptions);
	return all ?? '';
}

test('Electron template should package and render after publish-style dependency rewriting', async () => {
	const workingDir = mkdtempSync(path.join(tmpdir(), 'remotion-electron-'));
	const outputPath = path.join(workingDir, 'integration-render.mp4');

	try {
		await packagePublishedTemplate(workingDir);

		const resourcesPath = getPackagedResourcesPath(workingDir);

		expect(existsSync(path.join(resourcesPath, 'app.asar'))).toBe(true);

		const packagedBrowserExecutable =
			getPackagedBrowserExecutablePath(workingDir);

		expect(packagedBrowserExecutable).toBeTruthy();

		if (!packagedBrowserExecutable) {
			throw new Error(
				'Expected packaged browser executable path to be resolvable',
			);
		}

		expect(existsSync(packagedBrowserExecutable)).toBe(true);

		const output = await runPackagedRender(workingDir, outputPath);

		expect(output).not.toContain('Downloading Chrome');
		expect(output).not.toContain('Downloading Chrome Headless Shell');
		expect(existsSync(outputPath)).toBe(true);
		expect(statSync(outputPath).size).toBeGreaterThan(0);
	} finally {
		rmSync(workingDir, {recursive: true, force: true});
	}
}, 360000);
