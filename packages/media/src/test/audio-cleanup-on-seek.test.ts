import {ALL_FORMATS, Input, UrlSource} from 'mediabunny';
import {expect, test} from 'vitest';
import {makeAudioIterator} from '../audio/audio-preview-iterator';
import {makePrewarmedAudioIteratorCache} from '../prewarm-iterator-for-looping';
import type {SharedAudioContextForMediaPlayer} from '../shared-audio-context-for-media-player';

const makeCache = async () => {
	const input = new Input({
		source: new UrlSource('https://remotion.media/video.mp4'),
		formats: ALL_FORMATS,
	});
	const audioTrack = await input.getPrimaryAudioTrack();
	if (!audioTrack) {
		throw new Error('No audio track found');
	}

	const {audioBufferSink} = audioTrack;
	return makePrewarmedAudioIteratorCache(audioBufferSink);
};

const makeMockNode = () => {
	let stopped = false;
	const node = {
		stop: () => {
			stopped = true;
		},
	} as unknown as AudioBufferSourceNode;

	return {
		node,
		wasStopped: () => stopped,
	};
};

const makeMockBuffer = (duration: number) => {
	return {
		duration,
	} as unknown as AudioBuffer;
};

test('destroy should NOT stop nodes that are already playing with the same anchor', async () => {
	const cache = await makeCache();
	const iterator = makeAudioIterator(0, Infinity, cache, false);

	const mock1 = makeMockNode();
	const mock2 = makeMockNode();

	// Add nodes scheduled at anchor 0, with scheduledTime in the past
	iterator.addQueuedAudioNode({
		node: mock1.node,
		timestamp: 0,
		buffer: makeMockBuffer(0.021),
		scheduledTime: 0.1, // in the past relative to currentTime=1.0
		playbackRate: 1,
		scheduledAtAnchor: 0,
	});
	iterator.addQueuedAudioNode({
		node: mock2.node,
		timestamp: 0.021,
		buffer: makeMockBuffer(0.021),
		scheduledTime: 0.121,
		playbackRate: 1,
		scheduledAtAnchor: 0,
	});

	// Destroy with same anchor (0) and currentTime well past scheduledTime
	const sharedAudioContext: SharedAudioContextForMediaPlayer = {
		audioContext: {
			currentTime: 1.0,
			getOutputTimestamp: () => ({contextTime: 1.0}),
		} as unknown as AudioContext,
		audioSyncAnchor: {value: 0},
		scheduleAudioNode: () => ({type: 'started', scheduledTime: 0}),
	};

	iterator.destroy(sharedAudioContext);

	// Nodes should NOT have been stopped because they are already playing
	// and were scheduled for the current anchor
	expect(mock1.wasStopped()).toBe(false);
	expect(mock2.wasStopped()).toBe(false);
});

test('destroy should stop nodes when the audio anchor changed (seek to different position)', async () => {
	const cache = await makeCache();
	const iterator = makeAudioIterator(0, Infinity, cache, false);

	const mock1 = makeMockNode();
	const mock2 = makeMockNode();

	// Add nodes scheduled at anchor 0
	iterator.addQueuedAudioNode({
		node: mock1.node,
		timestamp: 0,
		buffer: makeMockBuffer(0.021),
		scheduledTime: 0.1,
		playbackRate: 1,
		scheduledAtAnchor: 0,
	});
	iterator.addQueuedAudioNode({
		node: mock2.node,
		timestamp: 0.021,
		buffer: makeMockBuffer(0.021),
		scheduledTime: 0.121,
		playbackRate: 1,
		scheduledAtAnchor: 0,
	});

	// Destroy with a DIFFERENT anchor (simulating a seek happened)
	// Even though nodes are "already playing" (currentTime > scheduledTime),
	// they should be stopped because the anchor changed
	const sharedAudioContext: SharedAudioContextForMediaPlayer = {
		audioContext: {
			currentTime: 1.0,
			getOutputTimestamp: () => ({contextTime: 1.0}),
		} as unknown as AudioContext,
		audioSyncAnchor: {value: 1}, // different anchor!
		scheduleAudioNode: () => ({type: 'started', scheduledTime: 0}),
	};

	iterator.destroy(sharedAudioContext);

	// Nodes SHOULD be stopped because the anchor changed (seek happened)
	expect(mock1.wasStopped()).toBe(true);
	expect(mock2.wasStopped()).toBe(true);
});
