import type {GitSource} from '@remotion/studio-shared';
import {getProjectName, SOURCE_MAP_ENDPOINT} from '@remotion/studio-shared';
import fs, {promises} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';
import {isMainThread} from 'node:worker_threads';
import webpack from 'webpack';
import {copyDir} from './copy-dir';
import {indexHtml} from './index-html';
import {readRecursively} from './read-recursively';
import type {WebpackOverrideFn} from './webpack-config';
import {webpackConfig} from './webpack-config';

const promisified = promisify(webpack);

const prepareOutDir = async (specified: string | null) => {
	if (specified) {
		await fs.promises.mkdir(specified, {recursive: true});
		return specified;
	}

	return fs.promises.mkdtemp(
		path.join(os.tmpdir(), 'remotion-webpack-bundle-'),
	);
};

const trimLeadingSlash = (p: string): string => {
	if (p.startsWith('/')) {
		return trimLeadingSlash(p.substr(1));
	}

	return p;
};

const trimTrailingSlash = (p: string): string => {
	if (p.endsWith('/')) {
		return trimTrailingSlash(p.substr(0, p.length - 1));
	}

	return p;
};

export type LegacyBundleOptions = {
	webpackOverride?: WebpackOverrideFn;
	outDir?: string;
	enableCaching?: boolean;
	publicPath?: string;
	rootDir?: string;
	publicDir?: string | null;
	onPublicDirCopyProgress?: (bytes: number) => void;
	onSymlinkDetected?: (path: string) => void;
};

export const getConfig = ({
	entryPoint,
	outDir,
	resolvedRemotionRoot,
	onProgress,
	options,
	bufferStateDelayInMilliseconds,
	maxTimelineTracks,
}: {
	outDir: string;
	entryPoint: string;
	resolvedRemotionRoot: string;
	bufferStateDelayInMilliseconds: number | null;
	maxTimelineTracks: number | null;
	onProgress?: (progress: number) => void;
	options?: LegacyBundleOptions;
}) => {
	const entry = path.resolve(__dirname, '..', './renderEntry.tsx');

	return webpackConfig({
		entry,
		userDefinedComponent: entryPoint,
		outDir,
		environment: 'production',
		webpackOverride: options?.webpackOverride ?? ((f) => f),
		onProgress,
		enableCaching: options?.enableCaching ?? true,
		maxTimelineTracks,
		remotionRoot: resolvedRemotionRoot,
		keyboardShortcutsEnabled: true,
		bufferStateDelayInMilliseconds,
		poll: null,
	});
};

export type BundleOptions = {
	entryPoint: string;
	onProgress?: (progress: number) => void;
	ignoreRegisterRootWarning?: boolean;
	onDirectoryCreated?: (dir: string) => void;
	gitSource?: GitSource | null;
	maxTimelineTracks?: number;
	bufferStateDelayInMilliseconds?: number;
} & LegacyBundleOptions;

type Arguments =
	| [options: BundleOptions]
	| [
			entryPoint: string,
			onProgress?: (progress: number) => void,
			options?: LegacyBundleOptions,
	  ];

const convertArgumentsIntoOptions = (args: Arguments): BundleOptions => {
	if ((args.length as number) === 0) {
		throw new TypeError('bundle() was called without arguments');
	}

	const firstArg = args[0];
	if (typeof firstArg === 'string') {
		return {
			entryPoint: firstArg,
			onProgress: args[1],
			...(args[2] ?? {}),
		};
	}

	if (typeof firstArg.entryPoint !== 'string') {
		throw new TypeError('bundle() was called without the `entryPoint` option');
	}

	return firstArg;
};

const recursionLimit = 5;

export const findClosestFolderWithItem = (
	currentDir: string,
	file: string,
): string | null => {
	let possibleFile = '';
	for (let i = 0; i < recursionLimit; i++) {
		possibleFile = path.join(currentDir, file);
		const exists = fs.existsSync(possibleFile);
		if (exists) {
			return path.dirname(possibleFile);
		}

		currentDir = path.dirname(currentDir);
	}

	return null;
};

const findClosestPackageJsonFolder = (currentDir: string): string | null => {
	return findClosestFolderWithItem(currentDir, 'package.json');
};

const validateEntryPoint = async (entryPoint: string) => {
	const contents = await promises.readFile(entryPoint, 'utf8');
	if (!contents.includes('registerRoot')) {
		throw new Error(
			[
				`You passed ${entryPoint} as your entry point, but this file does not contain "registerRoot".`,
				'You should use the file that calls registerRoot() as the entry point.',
				'To ignore this error, pass "ignoreRegisterRootWarning" to bundle().',
				'This error cannot be ignored on the CLI.',
			].join(' '),
		);
	}
};

/**
 * @description The method bundles a Remotion project using Webpack and prepares it for rendering using renderMedia()
 * @see [Documentation](https://www.remotion.dev/docs/bundle)
 */
export async function bundle(...args: Arguments): Promise<string> {
	const actualArgs = convertArgumentsIntoOptions(args);
	const entryPoint = path.resolve(process.cwd(), actualArgs.entryPoint);
	const resolvedRemotionRoot =
		actualArgs?.rootDir ??
		findClosestPackageJsonFolder(entryPoint) ??
		process.cwd();

	if (!actualArgs.ignoreRegisterRootWarning) {
		await validateEntryPoint(entryPoint);
	}

	const outDir = await prepareOutDir(actualArgs?.outDir ?? null);
	actualArgs.onDirectoryCreated?.(outDir);

	// The config might use an override which might use
	// `process.cwd()`. The context should always be the Remotion root.
	// This is not supported in worker threads (used for tests)
	const currentCwd = process.cwd();
	if (isMainThread) {
		process.chdir(resolvedRemotionRoot);
	}

	const {onProgress, ...options} = actualArgs;
	const [, config] = await getConfig({
		outDir,
		entryPoint,
		resolvedRemotionRoot,
		onProgress,
		options,
		// Should be null to keep cache hash working
		bufferStateDelayInMilliseconds:
			actualArgs.bufferStateDelayInMilliseconds ?? null,
		maxTimelineTracks: actualArgs.maxTimelineTracks ?? null,
	});

	const output = await promisified([config]);
	if (isMainThread) {
		process.chdir(currentCwd);
	}

	if (!output) {
		throw new Error('Expected webpack output');
	}

	const {errors} = output.toJson();
	if (errors !== undefined && errors.length > 0) {
		throw new Error(errors[0].message + '\n' + errors[0].details);
	}

	const baseDir = actualArgs?.publicPath ?? '/';
	const staticHash =
		'/' +
		[trimTrailingSlash(trimLeadingSlash(baseDir)), 'public']
			.filter(Boolean)
			.join('/');

	const from = options?.publicDir
		? path.resolve(resolvedRemotionRoot, options.publicDir)
		: path.join(resolvedRemotionRoot, 'public');
	const to = path.join(outDir, 'public');

	let symlinkWarningShown = false;
	const showSymlinkWarning = (ent: fs.Dirent, src: string) => {
		if (symlinkWarningShown) {
			return;
		}

		const absolutePath = path.join(src, ent.name);
		if (options.onSymlinkDetected) {
			options.onSymlinkDetected(absolutePath);
			return;
		}

		symlinkWarningShown = true;
		console.warn(
			`\nFound a symbolic link in the public folder (${absolutePath}). The symlink will be forwarded into the bundle.`,
		);
	};

	if (fs.existsSync(from)) {
		await copyDir({
			src: from,
			dest: to,
			onSymlinkDetected: showSymlinkWarning,
			onProgress: (prog) => options.onPublicDirCopyProgress?.(prog),
			copiedBytes: 0,
			lastReportedProgress: 0,
		});
	}

	const html = indexHtml({
		staticHash,
		baseDir,
		editorName: null,
		inputProps: null,
		remotionRoot: resolvedRemotionRoot,
		studioServerCommand: null,
		renderQueue: null,
		numberOfAudioTags: 0,
		publicFiles: readRecursively({
			folder: '.',
			startPath: from,
			staticHash,
			limit: 10000,
		}).map((f) => {
			return {
				...f,
				name: f.name.split(path.sep).join('/'),
			};
		}),
		includeFavicon: false,
		title: 'Remotion Bundle',
		renderDefaults: undefined,
		publicFolderExists: `${baseDir + (baseDir.endsWith('/') ? '' : '/')}public`,
		gitSource: actualArgs.gitSource ?? null,
		projectName: getProjectName({
			gitSource: actualArgs.gitSource ?? null,
			resolvedRemotionRoot,
			basename: path.basename,
		}),
	});

	fs.writeFileSync(path.join(outDir, 'index.html'), html);
	fs.copyFileSync(
		path.join(__dirname, '../favicon.ico'),
		path.join(outDir, 'favicon.ico'),
	);
	fs.copyFileSync(
		path.resolve(require.resolve('source-map'), '..', 'lib', 'mappings.wasm'),
		path.join(outDir, SOURCE_MAP_ENDPOINT.replace('/', '')),
	);
	return outDir;
}
