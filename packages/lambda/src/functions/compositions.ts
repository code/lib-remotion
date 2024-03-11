import {RenderInternals} from '@remotion/renderer';
import {VERSION} from 'remotion/version';
import {internalGetOrCreateBucket} from '../api/get-or-create-bucket';
import type {LambdaPayload} from '../defaults';
import {LambdaRoutines} from '../defaults';
import {decompressInputProps} from '../shared/compress-props';
import {convertToServeUrl} from '../shared/convert-to-serve-url';
import {
	forgetBrowserEventLoop,
	getBrowserInstance,
} from './helpers/get-browser-instance';
import {getCurrentRegionInFunction} from './helpers/get-current-region';

type Options = {
	expectedBucketOwner: string;
};

export const compositionsHandler = async (
	lambdaParams: LambdaPayload,
	options: Options,
) => {
	if (lambdaParams.type !== LambdaRoutines.compositions) {
		throw new TypeError('Expected info compositions');
	}

	if (lambdaParams.version !== VERSION) {
		if (!lambdaParams.version) {
			throw new Error(
				`Version mismatch: When calling getCompositionsOnLambda(), you called the function ${process.env.AWS_LAMBDA_FUNCTION_NAME} which has the version ${VERSION} but the @remotion/lambda package is an older version. Deploy a new function and use it to call getCompositionsOnLambda(). See: https://www.remotion.dev/docs/lambda/upgrading`,
			);
		}

		throw new Error(
			`Version mismatch: When calling getCompositionsOnLambda(), you passed ${process.env.AWS_LAMBDA_FUNCTION_NAME} as the function, which has the version ${VERSION}, but the @remotion/lambda package you used to invoke the function has version ${lambdaParams.version}. Deploy a new function and use it to call getCompositionsOnLambda(). See: https://www.remotion.dev/docs/lambda/upgrading`,
		);
	}

	try {
		const region = getCurrentRegionInFunction();

		const browserInstancePromise = getBrowserInstance(
			lambdaParams.logLevel,
			false,
			lambdaParams.chromiumOptions,
		);
		const bucketNamePromise = lambdaParams.bucketName
			? Promise.resolve(lambdaParams.bucketName)
			: internalGetOrCreateBucket({
					region,
					enableFolderExpiry: null,
					customCredentials: null,
				}).then((b) => b.bucketName);

		const bucketName = await bucketNamePromise;
		const serializedInputPropsWithCustomSchema = await decompressInputProps({
			bucketName: await bucketNamePromise,
			expectedBucketOwner: options.expectedBucketOwner,
			region: getCurrentRegionInFunction(),
			serialized: lambdaParams.inputProps,
			propsType: 'input-props',
		});

		const realServeUrl = convertToServeUrl({
			urlOrId: lambdaParams.serveUrl,
			region,
			bucketName,
		});

		const compositions = await RenderInternals.internalGetCompositions({
			serveUrlOrWebpackUrl: realServeUrl,
			puppeteerInstance: (await browserInstancePromise).instance,
			serializedInputPropsWithCustomSchema,
			envVariables: lambdaParams.envVariables ?? {},
			timeoutInMilliseconds: lambdaParams.timeoutInMilliseconds,
			chromiumOptions: lambdaParams.chromiumOptions,
			port: null,
			server: undefined,
			logLevel: lambdaParams.logLevel,
			indent: false,
			browserExecutable: null,
			onBrowserLog: null,
			offthreadVideoCacheSizeInBytes:
				lambdaParams.offthreadVideoCacheSizeInBytes,
			binariesDirectory: null,
		});

		return Promise.resolve({
			compositions,
			type: 'success' as const,
		});
	} finally {
		forgetBrowserEventLoop(lambdaParams.logLevel);
	}
};
