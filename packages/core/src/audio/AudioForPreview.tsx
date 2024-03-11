import React, {
	forwardRef,
	useContext,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from 'react';
import {usePreload} from '../prefetch.js';
import {random} from '../random.js';
import {SequenceContext} from '../SequenceContext.js';
import {SequenceVisibilityToggleContext} from '../SequenceManager.js';
import {useMediaBuffering} from '../use-media-buffering.js';
import {useMediaInTimeline} from '../use-media-in-timeline.js';
import {
	DEFAULT_ACCEPTABLE_TIMESHIFT,
	useMediaPlayback,
} from '../use-media-playback.js';
import {useMediaTagVolume} from '../use-media-tag-volume.js';
import {useSyncVolumeWithMediaTag} from '../use-sync-volume-with-media-tag.js';
import {
	useMediaMutedState,
	useMediaVolumeState,
} from '../volume-position-state.js';
import type {RemotionAudioProps} from './props.js';
import {useSharedAudio} from './shared-audio-tags.js';
import {useFrameForVolumeProp} from './use-audio-frame.js';

type AudioForPreviewProps = RemotionAudioProps & {
	shouldPreMountAudioTags: boolean;
	onDuration: (src: string, durationInSeconds: number) => void;
	pauseWhenBuffering: boolean;
	_remotionInternalNativeLoopPassed: boolean;
	_remotionInternalStack: string | null;
	showInTimeline: boolean;
};

const AudioForDevelopmentForwardRefFunction: React.ForwardRefRenderFunction<
	HTMLAudioElement,
	AudioForPreviewProps
> = (props, ref) => {
	const [initialShouldPreMountAudioElements] = useState(
		props.shouldPreMountAudioTags,
	);
	if (props.shouldPreMountAudioTags !== initialShouldPreMountAudioElements) {
		throw new Error(
			'Cannot change the behavior for pre-mounting audio tags dynamically.',
		);
	}

	const [mediaVolume] = useMediaVolumeState();
	const [mediaMuted] = useMediaMutedState();

	const volumePropFrame = useFrameForVolumeProp();

	const {
		volume,
		muted,
		playbackRate,
		shouldPreMountAudioTags,
		src,
		onDuration,
		acceptableTimeShiftInSeconds,
		_remotionInternalNeedsDurationCalculation,
		_remotionInternalNativeLoopPassed,
		_remotionInternalStack,
		allowAmplificationDuringRender,
		name,
		pauseWhenBuffering,
		showInTimeline,
		...nativeProps
	} = props;
	const {hidden} = useContext(SequenceVisibilityToggleContext);

	if (!src) {
		throw new TypeError("No 'src' was passed to <Audio>.");
	}

	const preloadedSrc = usePreload(src);

	const sequenceContext = useContext(SequenceContext);

	const [timelineId] = useState(() => String(Math.random()));

	const isSequenceHidden = hidden[timelineId] ?? false;

	const propsToPass = useMemo((): RemotionAudioProps => {
		return {
			muted: muted || mediaMuted || isSequenceHidden,
			src: preloadedSrc,
			loop: _remotionInternalNativeLoopPassed,
			...nativeProps,
		};
	}, [
		_remotionInternalNativeLoopPassed,
		isSequenceHidden,
		mediaMuted,
		muted,
		nativeProps,
		preloadedSrc,
	]);
	// Generate a string that's as unique as possible for this asset
	// but at the same time deterministic. We use it to combat strict mode issues.
	const id = useMemo(
		() =>
			`audio-${random(
				src ?? '',
			)}-${sequenceContext?.relativeFrom}-${sequenceContext?.cumulatedFrom}-${sequenceContext?.durationInFrames}-muted:${
				props.muted
			}-loop:${props.loop}`,
		[
			src,
			sequenceContext?.relativeFrom,
			sequenceContext?.cumulatedFrom,
			sequenceContext?.durationInFrames,
			props.muted,
			props.loop,
		],
	);

	const audioRef = useSharedAudio(propsToPass, id).el;

	const actualVolume = useMediaTagVolume(audioRef);

	useSyncVolumeWithMediaTag({
		volumePropFrame,
		actualVolume,
		volume,
		mediaVolume,
		mediaRef: audioRef,
	});

	useMediaInTimeline({
		volume,
		mediaVolume,
		mediaRef: audioRef,
		src,
		mediaType: 'audio',
		playbackRate: playbackRate ?? 1,
		displayName: name ?? null,
		id: timelineId,
		stack: _remotionInternalStack,
		showInTimeline,
	});

	useMediaPlayback({
		mediaRef: audioRef,
		src,
		mediaType: 'audio',
		playbackRate: playbackRate ?? 1,
		onlyWarnForMediaSeekingError: false,
		acceptableTimeshift:
			acceptableTimeShiftInSeconds ?? DEFAULT_ACCEPTABLE_TIMESHIFT,
	});

	useMediaBuffering(audioRef, pauseWhenBuffering);

	useImperativeHandle(
		ref,
		() => {
			return audioRef.current as HTMLAudioElement;
		},
		[audioRef],
	);

	const currentOnDurationCallback =
		useRef<AudioForPreviewProps['onDuration']>();
	currentOnDurationCallback.current = onDuration;

	useEffect(() => {
		const {current} = audioRef;
		if (!current) {
			return;
		}

		if (current.duration) {
			currentOnDurationCallback.current?.(current.src, current.duration);
			return;
		}

		const onLoadedMetadata = () => {
			currentOnDurationCallback.current?.(current.src, current.duration);
		};

		current.addEventListener('loadedmetadata', onLoadedMetadata);
		return () => {
			current.removeEventListener('loadedmetadata', onLoadedMetadata);
		};
	}, [audioRef, src]);

	if (initialShouldPreMountAudioElements) {
		return null;
	}

	return <audio ref={audioRef} preload="metadata" {...propsToPass} />;
};

export const AudioForPreview = forwardRef(
	AudioForDevelopmentForwardRefFunction,
);
