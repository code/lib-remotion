import type {_Object} from '@aws-sdk/client-s3';
import {estimatePrice} from '../../api/estimate-price';
import type {AwsRegion} from '../../pricing/aws-regions';
import type {PostRenderData, RenderMetadata} from '../../shared/constants';
import {
	lambdaTimingsPrefix,
	MAX_EPHEMERAL_STORAGE_IN_MB,
} from '../../shared/constants';
import {
	getMostExpensiveChunks,
	OVERHEAD_TIME_PER_LAMBDA,
} from '../../shared/get-most-expensive-chunks';
import {parseLambdaTimingsKey} from '../../shared/parse-lambda-timings-key';
import {calculateChunkTimes} from './calculate-chunk-times';
import type {OutputFileMetadata} from './find-output-file-in-bucket';
import {getFilesToDelete} from './get-files-to-delete';
import {getRetryStats} from './get-retry-stats';
import {getTimeToFinish} from './get-time-to-finish';
import {lambdaRenderHasAudioVideo} from './render-has-audio-video';
import type {EnhancedErrorInfo} from './write-lambda-error';

export const createPostRenderData = ({
	renderId,
	region,
	memorySizeInMb,
	renderMetadata,
	contents,
	timeToEncode,
	errorExplanations,
	timeToDelete,
	outputFile,
}: {
	renderId: string;
	expectedBucketOwner: string;
	region: AwsRegion;
	memorySizeInMb: number;
	renderMetadata: RenderMetadata;
	contents: _Object[];
	timeToEncode: number;
	timeToDelete: number;
	errorExplanations: EnhancedErrorInfo[];
	outputFile: OutputFileMetadata;
}): PostRenderData => {
	const initializedKeys = contents.filter(
		(c) => c.Key?.startsWith(lambdaTimingsPrefix(renderId)),
	);

	const parsedTimings = initializedKeys.map(({Key}) =>
		parseLambdaTimingsKey(Key as string),
	);

	const estimatedBillingDurationInMilliseconds = parsedTimings
		.map((p) => p.rendered - p.start + OVERHEAD_TIME_PER_LAMBDA)
		.reduce((a, b) => a + b);

	const cost = estimatePrice({
		durationInMilliseconds: estimatedBillingDurationInMilliseconds,
		memorySizeInMb,
		region,
		lambdasInvoked: renderMetadata.estimatedTotalLambdaInvokations,
		// We cannot determine the ephemeral storage size, so we
		// overestimate the price, but will only have a miniscule effect (~0.2%)
		diskSizeInMb: MAX_EPHEMERAL_STORAGE_IN_MB,
	});

	if (!outputFile) {
		throw new Error('Cannot wrap up without an output file in the S3 bucket.');
	}

	const endTime = Date.now();

	const timeToFinish = getTimeToFinish({
		renderMetadata,
		lastModified: endTime,
	});

	if (!timeToFinish) {
		throw new TypeError(`Cannot calculate timeToFinish value`);
	}

	const renderSize = contents
		.map((c) => c.Size ?? 0)
		.reduce((a, b) => a + b, 0);

	const retriesInfo = getRetryStats({
		contents,
		renderId,
	});

	const {hasAudio, hasVideo} = lambdaRenderHasAudioVideo(renderMetadata);

	return {
		cost: {
			currency: 'USD',
			disclaimer:
				'Estimated cost for lambda invocations only. Does not include cost for S3 storage and data transfer.',
			estimatedCost: cost,
			estimatedDisplayCost: new Intl.NumberFormat('en-US', {
				currency: 'USD',
				currencyDisplay: 'narrowSymbol',
			}).format(cost),
		},
		outputFile: outputFile.url,
		timeToFinish,
		errors: errorExplanations,
		startTime: renderMetadata.startedDate,
		endTime,
		outputSize: outputFile.size,
		renderSize,
		renderMetadata,
		filesCleanedUp: getFilesToDelete({
			chunkCount: renderMetadata.totalChunks,
			renderId,
			hasAudio,
			hasVideo,
		}).length,
		timeToEncode,
		timeToCleanUp: timeToDelete,
		timeToRenderChunks: calculateChunkTimes({
			contents,
			renderId,
			type: 'absolute-time',
		}),
		retriesInfo,
		mostExpensiveFrameRanges:
			renderMetadata.type === 'still'
				? []
				: getMostExpensiveChunks(
						parsedTimings,
						renderMetadata.framesPerLambda,
						renderMetadata.frameRange[0],
						renderMetadata.frameRange[1],
					),
		deleteAfter: renderMetadata.deleteAfter,
		estimatedBillingDurationInMilliseconds,
	};
};
