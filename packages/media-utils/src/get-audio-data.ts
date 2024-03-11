import {isRemoteAsset} from './is-remote-asset';
import {pLimit} from './p-limit';
import type {AudioData} from './types';

const metadataCache: {[key: string]: AudioData} = {};

const limit = pLimit(3);

const fetchWithCorsCatch = async (src: string) => {
	try {
		const response = await fetch(src, {
			mode: 'cors',
			referrerPolicy: 'no-referrer-when-downgrade',
		});
		return response;
	} catch (err) {
		const error = err as Error;
		if (
			// Chrome
			error.message.includes('Failed to fetch') ||
			// Safari
			error.message.includes('Load failed') ||
			// Firefox
			error.message.includes('NetworkError when attempting to fetch resource')
		) {
			throw new TypeError(
				`Failed to read from ${src}: ${error.message}. Does the resource support CORS?`,
			);
		}

		throw err;
	}
};

type Options = {
	sampleRate?: number;
};

const fn = async (src: string, options?: Options): Promise<AudioData> => {
	if (metadataCache[src]) {
		return metadataCache[src];
	}

	if (typeof document === 'undefined') {
		throw new Error('getAudioData() is only available in the browser.');
	}

	const audioContext = new AudioContext({
		sampleRate: options?.sampleRate ?? 48000,
	});

	const response = await fetchWithCorsCatch(src);
	const arrayBuffer = await response.arrayBuffer();

	const wave = await audioContext.decodeAudioData(arrayBuffer);

	const channelWaveforms = new Array(wave.numberOfChannels)
		.fill(true)
		.map((_, channel) => {
			return wave.getChannelData(channel);
		});

	const metadata: AudioData = {
		channelWaveforms,
		sampleRate: wave.sampleRate,
		durationInSeconds: wave.duration,
		numberOfChannels: wave.numberOfChannels,
		resultId: String(Math.random()),
		isRemote: isRemoteAsset(src),
	};
	metadataCache[src] = metadata;
	return metadata;
};

/**
 * @description Takes an audio src, loads it and returns data and metadata for the specified source.
 * @see [Documentation](https://www.remotion.dev/docs/get-audio-data)
 */
export const getAudioData = (src: string, options?: Options) => {
	return limit(fn, src, options);
};
