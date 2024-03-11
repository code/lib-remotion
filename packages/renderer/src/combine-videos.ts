// Combine multiple video chunks, useful for decentralized rendering

import {rmSync} from 'node:fs';
import {join} from 'node:path';
import type {Codec} from './codec';
import {createCombinedAudio} from './combine-audio';
import {combineVideoStreams} from './combine-video-streams';
import {combineVideoStreamsSeamlessly} from './combine-video-streams-seamlessly';
import {getFileExtensionFromCodec} from './get-extension-from-codec';
import type {LogLevel} from './log-level';
import {Log} from './logger';
import type {CancelSignal} from './make-cancel-signal';
import {muxVideoAndAudio} from './mux-video-and-audio';
import type {AudioCodec} from './options/audio-codec';
import {getExtensionFromAudioCodec, isAudioCodec} from './options/audio-codec';
import {truthy} from './truthy';

type Options = {
	files: string[];
	filelistDir: string;
	output: string;
	onProgress: (p: number) => void;
	numberOfFrames: number;
	codec: Codec;
	fps: number;
	numberOfGifLoops: number | null;
	resolvedAudioCodec: AudioCodec | null;
	audioBitrate: string | null;
	indent: boolean;
	logLevel: LogLevel;
	chunkDurationInSeconds: number;
	binariesDirectory: string | null;
	cancelSignal: CancelSignal | undefined;
	seamlessAudio: boolean;
	seamlessVideo: boolean;
};

export const combineVideos = async ({
	files,
	filelistDir,
	output,
	onProgress,
	numberOfFrames,
	codec,
	fps,
	numberOfGifLoops,
	resolvedAudioCodec,
	audioBitrate,
	indent,
	logLevel,
	chunkDurationInSeconds,
	binariesDirectory,
	cancelSignal,
	seamlessAudio,
	seamlessVideo,
}: Options) => {
	const shouldCreateAudio = resolvedAudioCodec !== null;
	const shouldCreateVideo = !isAudioCodec(codec);

	const videoOutput = join(
		filelistDir,
		`video.${getFileExtensionFromCodec(codec, resolvedAudioCodec)}`,
	);

	const audioOutput = shouldCreateAudio
		? join(
				filelistDir,
				`audio.${getExtensionFromAudioCodec(resolvedAudioCodec)}`,
			)
		: null;

	const audioFiles = files.filter((f) => f.endsWith('audio'));
	const videoFiles = files.filter((f) => f.endsWith('video'));

	let concatenatedAudio = 0;
	let concatenatedVideo = 0;
	let muxing = 0;

	const updateProgress = () => {
		const totalFrames =
			(shouldCreateAudio ? numberOfFrames : 0) +
			(shouldCreateVideo ? numberOfFrames : 0) +
			numberOfFrames;
		const actualProgress = concatenatedAudio + concatenatedVideo + muxing;

		onProgress((actualProgress / totalFrames) * numberOfFrames);
	};

	Log.verbose(
		{indent, logLevel},
		`Combining chunks, audio = ${
			seamlessAudio ? 'seamlessly' : 'normally'
		}, video = ${seamlessVideo ? 'seamlessly' : 'normally'}`,
	);
	await Promise.all(
		[
			shouldCreateAudio
				? createCombinedAudio({
						audioBitrate,
						filelistDir,
						files: audioFiles,
						indent,
						logLevel,
						output: shouldCreateVideo ? (audioOutput as string) : output,
						resolvedAudioCodec,
						seamless: seamlessAudio,
						chunkDurationInSeconds,
						addRemotionMetadata: !shouldCreateVideo,
						binariesDirectory,
						fps,
						cancelSignal,
						onProgress: (frames) => {
							concatenatedAudio = frames;
							updateProgress();
						},
					})
				: null,

			shouldCreateVideo && !seamlessVideo
				? combineVideoStreams({
						codec,
						filelistDir,
						fps,
						indent,
						logLevel,
						numberOfGifLoops,
						output: shouldCreateAudio ? videoOutput : output,
						files: videoFiles,
						addRemotionMetadata: !shouldCreateAudio,
						binariesDirectory,
						cancelSignal,
						onProgress: (frames) => {
							concatenatedVideo = frames;
							updateProgress();
						},
					})
				: null,
		].filter(truthy),
	);

	if (!(audioOutput && shouldCreateVideo)) {
		rmSync(filelistDir, {recursive: true});
		return;
	}

	try {
		await muxVideoAndAudio({
			audioOutput,
			indent,
			logLevel,
			onProgress: (frames) => {
				muxing = frames;
				updateProgress();
			},
			output,
			videoOutput: seamlessVideo
				? combineVideoStreamsSeamlessly({files: videoFiles})
				: videoOutput,
			binariesDirectory,
			fps,
			cancelSignal,
		});
		onProgress(numberOfFrames);
		rmSync(filelistDir, {recursive: true});
	} catch (err) {
		rmSync(filelistDir, {recursive: true});
		throw err;
	}
};
