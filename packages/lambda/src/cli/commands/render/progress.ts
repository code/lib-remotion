import {CliInternals} from '@remotion/cli';
import type {LogLevel} from '@remotion/renderer';
import {RenderInternals} from '@remotion/renderer';
import {NoReactInternals} from 'remotion/no-react';
import type {
	CleanupInfo,
	EncodingProgress,
	RenderProgress,
} from '../../../defaults';
import type {ChunkRetry} from '../../../functions/helpers/get-retry-stats';
import {truthy} from '../../../shared/truthy';

type LambdaInvokeProgress = {
	totalLambdas: number | null;
	lambdasInvoked: number;
};

type ChunkProgress = {
	doneIn: number | null;
	framesRendered: number;
	totalFrames: number | null;
	totalChunks: number | null;
	chunksEncoded: number;
};

type MultiRenderProgress = {
	lambdaInvokeProgress: LambdaInvokeProgress;
	chunkProgress: ChunkProgress;
	encodingProgress: EncodingProgress;
	cleanupInfo: CleanupInfo | null;
};

const makeInvokeProgress = (
	invokeProgress: LambdaInvokeProgress,
	totalSteps: number,
	retriesInfo: ChunkRetry[],
) => {
	const {lambdasInvoked, totalLambdas} = invokeProgress;
	const progress = totalLambdas === null ? 0 : lambdasInvoked / totalLambdas;
	return [
		`(1/${totalSteps})`,
		CliInternals.makeProgressBar(progress),
		`${progress === 0 ? 'Invoked' : 'Invoking'} lambdas`,
		progress === 1
			? CliInternals.chalk.gray('100%')
			: `${Math.round(progress * 100)}%`,
		retriesInfo.length > 0 ? `(+${retriesInfo.length} retries)` : [],
	].join(' ');
};

const makeRenderProgress = ({
	chunkProgress,
	totalSteps,
}: {
	chunkProgress: ChunkProgress;
	totalSteps: number;
}) => {
	const {chunksEncoded, totalChunks, doneIn} = chunkProgress;
	const renderProgress =
		chunkProgress.totalFrames === null
			? 0
			: chunkProgress.framesRendered / chunkProgress.totalFrames;
	const encodingProgress =
		totalChunks === null ? 0 : chunksEncoded / totalChunks;

	const frames =
		chunkProgress.totalFrames === null
			? null
			: `(${chunkProgress.framesRendered}/${chunkProgress.totalFrames})`;

	const first = [
		`(2/${totalSteps})`,
		CliInternals.makeProgressBar(renderProgress),
		doneIn === null ? 'Rendering frames' : 'Rendered frames',
		doneIn === null ? frames : CliInternals.chalk.gray(`${doneIn}ms`),
	]
		.filter(truthy)
		.join(' ');

	const second = [
		`(3/${totalSteps})`,
		CliInternals.makeProgressBar(encodingProgress),
		`${doneIn === null ? 'Encoding' : 'Encoded'} chunks`,
		doneIn === null
			? `${Math.round(encodingProgress * 100)}%`
			: CliInternals.chalk.gray(`${doneIn}ms`),
	].join(' ');

	return [first, second];
};

const makeEncodingProgress = ({
	encodingProgress,
	chunkProgress,
	totalSteps,
	totalFrames,
	timeToEncode,
}: {
	encodingProgress: EncodingProgress;
	chunkProgress: ChunkProgress;
	totalSteps: number;
	totalFrames: number | null;
	timeToEncode: number | null;
}) => {
	const {framesEncoded} = encodingProgress;
	const progress = totalFrames === null ? 0 : framesEncoded / totalFrames;
	const chunksDone = chunkProgress.doneIn !== null;
	const shouldShow = progress > 0 || chunksDone;
	if (!shouldShow) {
		return '';
	}

	return [
		`(4/${totalSteps})`,
		CliInternals.makeProgressBar(progress),
		`${timeToEncode === null ? 'Combining' : 'Combined'} videos`,
		timeToEncode === null
			? `${Math.round(progress * 100)}%`
			: CliInternals.chalk.gray(`${timeToEncode}ms`),
	].join(' ');
};

const makeCleanupProgress = (
	cleanupInfo: CleanupInfo | null,
	totalSteps: number,
	skipped: boolean,
) => {
	if (!cleanupInfo) {
		return '';
	}

	if (skipped) {
		return [
			`(5/${totalSteps})`,
			CliInternals.chalk.blueBright(
				`Not cleaning up because --log=verbose was set`,
			),
		].join(' ');
	}

	const {doneIn, filesDeleted, minFilesToDelete} = cleanupInfo;
	const progress = filesDeleted / minFilesToDelete;
	return [
		`(5/${totalSteps})`,
		CliInternals.makeProgressBar(progress),
		`${doneIn === null ? 'Cleaning up' : 'Cleaned up'} artifacts`,
		doneIn === null
			? `${Math.round(progress * 100)}%`
			: CliInternals.chalk.gray(`${doneIn}ms`),
	].join(' ');
};

const makeDownloadProgress = (
	downloadInfo: DownloadedInfo,
	totalSteps: number,
) => {
	return [
		`(6/${totalSteps})`,
		downloadInfo.totalSize === null
			? CliInternals.getFileSizeDownloadBar(downloadInfo.downloaded)
			: CliInternals.makeProgressBar(
					downloadInfo.downloaded / downloadInfo.totalSize,
				),
		`${downloadInfo.doneIn === null ? 'Downloading' : 'Downloaded'} video`,
		downloadInfo.doneIn === null
			? [
					`${CliInternals.formatBytes(downloadInfo.downloaded)}`,
					downloadInfo.totalSize === null
						? null
						: `${CliInternals.formatBytes(downloadInfo.totalSize)}`,
				]
					.filter(NoReactInternals.truthy)
					.join('/')
			: CliInternals.chalk.gray(`${downloadInfo.doneIn}ms`),
	].join(' ');
};

export const makeMultiProgressFromStatus = (
	status: RenderProgress,
): MultiRenderProgress => {
	return {
		chunkProgress: {
			chunksEncoded: status.chunks,
			totalChunks: status.renderMetadata?.totalChunks ?? null,
			doneIn: status.timeToFinishChunks,
			framesRendered: status.framesRendered,
			totalFrames:
				status.renderMetadata && status.renderMetadata.type === 'video'
					? RenderInternals.getFramesToRender(
							status.renderMetadata.frameRange,
							status.renderMetadata.everyNthFrame,
						).length
					: null,
		},
		encodingProgress: {
			framesEncoded: status.encodingStatus?.framesEncoded ?? 0,
		},
		lambdaInvokeProgress: {
			lambdasInvoked: status.lambdasInvoked,
			totalLambdas:
				status.renderMetadata?.estimatedRenderLambdaInvokations ?? null,
		},
		cleanupInfo: status.cleanup,
	};
};

type DownloadedInfo = {
	totalSize: number | null;
	downloaded: number;
	doneIn: number | null;
};

export const makeProgressString = ({
	progress,
	steps,
	downloadInfo,
	retriesInfo,
	logLevel,
	timeToEncode,
	totalFrames,
}: {
	progress: MultiRenderProgress;
	steps: number;
	downloadInfo: DownloadedInfo | null;
	retriesInfo: ChunkRetry[];
	logLevel: LogLevel;
	timeToEncode: number | null;
	totalFrames: number | null;
}) => {
	return [
		makeInvokeProgress(progress.lambdaInvokeProgress, steps, retriesInfo),
		...makeRenderProgress({
			chunkProgress: progress.chunkProgress,
			totalSteps: steps,
		}),
		makeEncodingProgress({
			encodingProgress: progress.encodingProgress,
			chunkProgress: progress.chunkProgress,
			totalSteps: steps,
			timeToEncode,
			totalFrames,
		}),
		makeCleanupProgress(progress.cleanupInfo, steps, logLevel === 'verbose'),
		downloadInfo ? makeDownloadProgress(downloadInfo, steps) : null,
	]
		.filter(NoReactInternals.truthy)
		.join('\n');
};
