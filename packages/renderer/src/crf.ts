import type {Codec} from './codec';
import {isAudioCodec} from './options/audio-codec';

export type Crf = number | undefined;

export const getDefaultCrfForCodec = (codec: Codec): number => {
	if (isAudioCodec(codec)) {
		return 0;
	}

	if (codec === 'h264' || codec === 'h264-mkv' || codec === 'h264-ts') {
		return 18; // FFMPEG default 23
	}

	if (codec === 'h265') {
		return 23; // FFMPEG default 28
	}

	if (codec === 'vp8') {
		return 9; // FFMPEG default 10
	}

	if (codec === 'vp9') {
		return 28; // FFMPEG recommendation 31
	}

	if (codec === 'prores') {
		return 0;
	}

	if (codec === 'gif') {
		return 0;
	}

	throw new TypeError(`Got unexpected codec "${codec}"`);
};

export const getValidCrfRanges = (codec: Codec): [number, number] => {
	if (isAudioCodec(codec)) {
		return [0, 0];
	}

	if (codec === 'prores') {
		return [0, 0];
	}

	if (codec === 'gif') {
		return [0, 0];
	}

	if (codec === 'h264' || codec === 'h264-mkv' || codec === 'h264-ts') {
		return [1, 51];
	}

	if (codec === 'h265') {
		return [0, 51];
	}

	if (codec === 'vp8') {
		return [4, 63];
	}

	if (codec === 'vp9') {
		return [0, 63];
	}

	throw new TypeError(`Got unexpected codec "${codec}"`);
};

export const validateQualitySettings = ({
	codec,
	crf,
	videoBitrate,
	encodingMaxRate,
	encodingBufferSize,
}: {
	crf: unknown;
	codec: Codec;
	videoBitrate: string | null;
	encodingMaxRate: string | null;
	encodingBufferSize: string | null;
}): string[] => {
	if (crf && videoBitrate) {
		throw new Error(
			'"crf" and "videoBitrate" can not both be set. Choose one of either.',
		);
	}

	if (encodingMaxRate && !encodingBufferSize) {
		throw new Error(
			'"encodingMaxRate" can not be set without also setting "encodingBufferSize".',
		);
	}

	const bufSizeArray = encodingBufferSize
		? ['-bufsize', encodingBufferSize]
		: [];
	const maxRateArray = encodingMaxRate ? ['-maxrate', encodingMaxRate] : [];

	if (videoBitrate) {
		if (codec === 'prores') {
			console.warn('ProRes does not support videoBitrate. Ignoring.');
			return [];
		}

		if (isAudioCodec(codec)) {
			console.warn(`${codec} does not support videoBitrate. Ignoring.`);
			return [];
		}

		return ['-b:v', videoBitrate, ...bufSizeArray, ...maxRateArray];
	}

	if (crf === null || typeof crf === 'undefined') {
		const actualCrf = getDefaultCrfForCodec(codec);
		return ['-crf', String(actualCrf), ...bufSizeArray, ...maxRateArray];
	}

	if (typeof crf !== 'number') {
		throw new TypeError(
			'Expected CRF to be a number, but is ' + JSON.stringify(crf),
		);
	}

	const range = getValidCrfRanges(codec);
	if (crf === 0 && (codec === 'h264' || codec === 'h264-mkv')) {
		throw new TypeError(
			"Setting the CRF to 0 with a H264 codec is not supported anymore because of it's inconsistencies between platforms. Videos with CRF 0 cannot be played on iOS/macOS. 0 is a extreme value with inefficient settings which you probably do not want. Set CRF to a higher value to fix this error.",
		);
	}

	if (crf < range[0] || crf > range[1]) {
		if (range[0] === 0 && range[1] === 0) {
			throw new TypeError(
				`The "${codec}" codec does not support the --crf option.`,
			);
		}

		throw new TypeError(
			`CRF must be between ${range[0]} and ${range[1]} for codec ${codec}. Passed: ${crf}`,
		);
	}

	if (codec === 'prores') {
		console.warn('ProRes does not support the "crf" option. Ignoring.');
		return [];
	}

	if (isAudioCodec(codec)) {
		console.warn(`${codec} does not support the "crf" option. Ignoring.`);
		return [];
	}

	return ['-crf', String(crf), ...bufSizeArray, ...maxRateArray];
};
