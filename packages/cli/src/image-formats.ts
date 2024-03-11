import type {VideoImageFormat} from '@remotion/renderer';
import {RenderInternals} from '@remotion/renderer';
import {ConfigInternals} from './config';
import {parsedCli} from './parse-command-line';

export const getVideoImageFormat = ({
	codec,
	uiImageFormat,
}: {
	codec: ReturnType<typeof ConfigInternals.getOutputCodecOrUndefined>;
	uiImageFormat: VideoImageFormat | null;
}): VideoImageFormat => {
	if (uiImageFormat !== null) {
		return uiImageFormat;
	}

	if (typeof parsedCli['image-format'] !== 'undefined') {
		if (
			!(RenderInternals.validVideoImageFormats as readonly string[]).includes(
				parsedCli['image-format'] as string,
			)
		) {
			throw new Error(`Invalid image format: ${parsedCli['image-format']}`);
		}

		return parsedCli['image-format'] as VideoImageFormat;
	}

	const configFileOption = ConfigInternals.getUserPreferredVideoImageFormat();

	if (typeof configFileOption !== 'undefined') {
		return configFileOption;
	}

	if (RenderInternals.isAudioCodec(codec)) {
		return 'none';
	}

	if (
		codec === 'h264' ||
		codec === 'h264-mkv' ||
		codec === 'h264-ts' ||
		codec === 'h265' ||
		codec === 'vp8' ||
		codec === 'vp9' ||
		codec === 'prores' ||
		codec === 'gif'
	) {
		return 'jpeg';
	}

	if (codec === undefined) {
		return 'png';
	}

	throw new Error('Unrecognized codec ' + codec);
};
