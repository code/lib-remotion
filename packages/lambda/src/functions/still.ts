import type {StillImageFormat} from '@remotion/renderer';
import {RenderInternals} from '@remotion/renderer';
import fs from 'node:fs';
import path from 'node:path';
import {NoReactInternals} from 'remotion/no-react';
import {VERSION} from 'remotion/version';
import {estimatePrice} from '../api/estimate-price';
import {internalGetOrCreateBucket} from '../api/get-or-create-bucket';
import {callLambda} from '../shared/call-lambda';
import {cleanupSerializedInputProps} from '../shared/cleanup-serialized-input-props';
import {decompressInputProps} from '../shared/compress-props';
import type {
	CostsInfo,
	LambdaPayload,
	LambdaPayloads,
	RenderMetadata,
} from '../shared/constants';
import {
	LambdaRoutines,
	MAX_EPHEMERAL_STORAGE_IN_MB,
	renderMetadataKey,
} from '../shared/constants';
import {convertToServeUrl} from '../shared/convert-to-serve-url';
import {isFlakyError} from '../shared/is-flaky-error';
import {validateDownloadBehavior} from '../shared/validate-download-behavior';
import {validateOutname} from '../shared/validate-outname';
import {validatePrivacy} from '../shared/validate-privacy';
import {
	getCredentialsFromOutName,
	getExpectedOutName,
} from './helpers/expected-out-name';
import {formatCostsInfo} from './helpers/format-costs-info';
import {
	forgetBrowserEventLoop,
	getBrowserInstance,
} from './helpers/get-browser-instance';
import {executablePath} from './helpers/get-chromium-executable-path';
import {getCurrentRegionInFunction} from './helpers/get-current-region';
import {getOutputUrlFromMetadata} from './helpers/get-output-url-from-metadata';
import {lambdaWriteFile} from './helpers/io';
import {onDownloadsHelper} from './helpers/on-downloads-logger';
import {validateComposition} from './helpers/validate-composition';
import {
	getTmpDirStateIfENoSp,
	writeLambdaError,
} from './helpers/write-lambda-error';

type Options = {
	params: LambdaPayload;
	renderId: string;
	expectedBucketOwner: string;
};

const innerStillHandler = async ({
	params: lambdaParams,
	expectedBucketOwner,
	renderId,
}: Options) => {
	if (lambdaParams.type !== LambdaRoutines.still) {
		throw new TypeError('Expected still type');
	}

	if (lambdaParams.version !== VERSION) {
		if (!lambdaParams.version) {
			throw new Error(
				`Version mismatch: When calling renderStillOnLambda(), you called the function ${process.env.AWS_LAMBDA_FUNCTION_NAME} which has the version ${VERSION} but the @remotion/lambda package is an older version. Deploy a new function and use it to call renderStillOnLambda(). See: https://www.remotion.dev/docs/lambda/upgrading`,
			);
		}

		throw new Error(
			`Version mismatch: When calling renderStillOnLambda(), you passed ${process.env.AWS_LAMBDA_FUNCTION_NAME} as the function, which has the version ${VERSION}, but the @remotion/lambda package you used to invoke the function has version ${lambdaParams.version}. Deploy a new function and use it to call renderStillOnLambda(). See: https://www.remotion.dev/docs/lambda/upgrading`,
		);
	}

	validateDownloadBehavior(lambdaParams.downloadBehavior);
	validatePrivacy(lambdaParams.privacy, true);
	validateOutname({
		outName: lambdaParams.outName,
		codec: null,
		audioCodecSetting: null,
		separateAudioTo: null,
	});

	const start = Date.now();

	const browserInstancePromise = getBrowserInstance(
		lambdaParams.logLevel,
		false,
		lambdaParams.chromiumOptions,
	);
	const bucketNamePromise =
		lambdaParams.bucketName ??
		internalGetOrCreateBucket({
			region: getCurrentRegionInFunction(),
			enableFolderExpiry: null,
			customCredentials: null,
		}).then((b) => b.bucketName);

	const outputDir = RenderInternals.tmpDir('remotion-render-');

	const outputPath = path.join(outputDir, 'output');

	const region = getCurrentRegionInFunction();
	const bucketName = await bucketNamePromise;
	const serializedInputPropsWithCustomSchema = await decompressInputProps({
		bucketName,
		expectedBucketOwner,
		region,
		serialized: lambdaParams.inputProps,
		propsType: 'input-props',
	});

	const serveUrl = convertToServeUrl({
		urlOrId: lambdaParams.serveUrl,
		region,
		bucketName,
	});

	const server = await RenderInternals.prepareServer({
		concurrency: 1,
		indent: false,
		port: null,
		remotionRoot: process.cwd(),
		logLevel: lambdaParams.logLevel,
		webpackConfigOrServeUrl: serveUrl,
		offthreadVideoCacheSizeInBytes: lambdaParams.offthreadVideoCacheSizeInBytes,
		binariesDirectory: null,
		forceIPv4: false,
	});

	const browserInstance = await browserInstancePromise;
	const composition = await validateComposition({
		serveUrl,
		browserInstance: browserInstance.instance,
		composition: lambdaParams.composition,
		serializedInputPropsWithCustomSchema,
		envVariables: lambdaParams.envVariables ?? {},
		chromiumOptions: lambdaParams.chromiumOptions,
		timeoutInMilliseconds: lambdaParams.timeoutInMilliseconds,
		port: null,
		forceHeight: lambdaParams.forceHeight,
		forceWidth: lambdaParams.forceWidth,
		logLevel: lambdaParams.logLevel,
		server,
		offthreadVideoCacheSizeInBytes: lambdaParams.offthreadVideoCacheSizeInBytes,
	});

	const renderMetadata: RenderMetadata = {
		startedDate: Date.now(),
		videoConfig: composition,
		codec: null,
		compositionId: lambdaParams.composition,
		estimatedTotalLambdaInvokations: 1,
		estimatedRenderLambdaInvokations: 1,
		siteId: serveUrl,
		totalChunks: 1,
		type: 'still',
		imageFormat: lambdaParams.imageFormat,
		inputProps: lambdaParams.inputProps,
		lambdaVersion: VERSION,
		framesPerLambda: 1,
		memorySizeInMb: Number(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE),
		region: getCurrentRegionInFunction(),
		renderId,
		outName: lambdaParams.outName ?? undefined,
		privacy: lambdaParams.privacy,
		audioCodec: null,
		deleteAfter: lambdaParams.deleteAfter,
		numberOfGifLoops: null,
		downloadBehavior: lambdaParams.downloadBehavior,
		audioBitrate: null,
	};

	await lambdaWriteFile({
		bucketName,
		key: renderMetadataKey(renderId),
		body: JSON.stringify(renderMetadata),
		region: getCurrentRegionInFunction(),
		privacy: 'private',
		expectedBucketOwner,
		downloadBehavior: null,
		customCredentials: null,
	});
	await RenderInternals.internalRenderStill({
		composition,
		output: outputPath,
		serveUrl,
		envVariables: lambdaParams.envVariables ?? {},
		frame: RenderInternals.convertToPositiveFrameIndex({
			frame: lambdaParams.frame,
			durationInFrames: composition.durationInFrames,
		}),
		imageFormat: lambdaParams.imageFormat as StillImageFormat,
		serializedInputPropsWithCustomSchema,
		overwrite: false,
		puppeteerInstance: browserInstance.instance,
		jpegQuality:
			lambdaParams.jpegQuality ?? RenderInternals.DEFAULT_JPEG_QUALITY,
		chromiumOptions: lambdaParams.chromiumOptions,
		scale: lambdaParams.scale,
		timeoutInMilliseconds: lambdaParams.timeoutInMilliseconds,
		browserExecutable: executablePath(),
		cancelSignal: null,
		indent: false,
		onBrowserLog: null,
		onDownload: onDownloadsHelper(),
		port: null,
		server,
		logLevel: lambdaParams.logLevel,
		serializedResolvedPropsWithCustomSchema:
			NoReactInternals.serializeJSONWithDate({
				indent: undefined,
				staticBase: null,
				data: composition.props,
			}).serializedString,
		offthreadVideoCacheSizeInBytes: lambdaParams.offthreadVideoCacheSizeInBytes,
		binariesDirectory: null,
	});

	const {key, renderBucketName, customCredentials} = getExpectedOutName(
		renderMetadata,
		bucketName,
		getCredentialsFromOutName(lambdaParams.outName),
	);

	const {size} = await fs.promises.stat(outputPath);

	await lambdaWriteFile({
		bucketName: renderBucketName,
		key,
		privacy: lambdaParams.privacy,
		body: fs.createReadStream(outputPath),
		expectedBucketOwner,
		region: getCurrentRegionInFunction(),
		downloadBehavior: lambdaParams.downloadBehavior,
		customCredentials,
	});

	await Promise.all([
		fs.promises.rm(outputPath, {recursive: true}),
		cleanupSerializedInputProps({
			bucketName,
			region: getCurrentRegionInFunction(),
			serialized: lambdaParams.inputProps,
		}),
		server.closeServer(true),
	]);

	const estimatedPrice = estimatePrice({
		durationInMilliseconds: Date.now() - start + 100,
		memorySizeInMb: Number(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE),
		region: getCurrentRegionInFunction(),
		lambdasInvoked: 1,
		// We cannot determine the ephemeral storage size, so we
		// overestimate the price, but will only have a miniscule effect (~0.2%)
		diskSizeInMb: MAX_EPHEMERAL_STORAGE_IN_MB,
	});

	return {
		type: 'success' as const,
		output: getOutputUrlFromMetadata(
			renderMetadata,
			bucketName,
			customCredentials,
		),
		size,
		bucketName,
		estimatedPrice: formatCostsInfo(estimatedPrice),
		renderId,
	};
};

type RenderStillLambdaResponsePayload = {
	type: 'success';
	output: string;
	size: number;
	bucketName: string;
	estimatedPrice: CostsInfo;
	renderId: string;
};

export const stillHandler = async (
	options: Options,
): Promise<RenderStillLambdaResponsePayload> => {
	const {params} = options;

	if (params.type !== LambdaRoutines.still) {
		throw new Error('Params must be renderer');
	}

	try {
		return await innerStillHandler(options);
	} catch (err) {
		// If this error is encountered, we can just retry as it
		// is a very rare error to occur
		const isBrowserError = isFlakyError(err as Error);
		const willRetry = isBrowserError || params.maxRetries > 0;

		if (!willRetry) {
			throw err;
		}

		const retryPayload: LambdaPayloads[LambdaRoutines.still] = {
			...params,
			maxRetries: params.maxRetries - 1,
			attempt: params.attempt + 1,
		};

		const res = await callLambda({
			functionName: process.env.AWS_LAMBDA_FUNCTION_NAME as string,
			payload: retryPayload,
			region: getCurrentRegionInFunction(),
			type: LambdaRoutines.still,
			receivedStreamingPayload: () => undefined,
			timeoutInTest: 120000,
			retriesRemaining: 0,
		});
		const bucketName =
			params.bucketName ??
			(
				await internalGetOrCreateBucket({
					region: getCurrentRegionInFunction(),
					enableFolderExpiry: null,
					customCredentials: null,
				})
			).bucketName;

		// `await` elided on purpose here; using `void` to mark it as intentional
		// eslint-disable-next-line no-void
		void writeLambdaError({
			bucketName,
			errorInfo: {
				chunk: null,
				frame: null,
				isFatal: false,
				name: (err as Error).name,
				message: (err as Error).message,
				stack: (err as Error).stack as string,
				type: 'browser',
				tmpDir: getTmpDirStateIfENoSp((err as Error).stack as string),
				attempt: params.attempt,
				totalAttempts: params.attempt + params.maxRetries,
				willRetry,
			},
			expectedBucketOwner: options.expectedBucketOwner,
			renderId: options.renderId,
		});

		return res;
	} finally {
		forgetBrowserEventLoop(
			options.params.type === LambdaRoutines.still
				? options.params.logLevel
				: 'error',
		);
	}
};
