import {RenderInternals} from '@remotion/renderer';
import type {CopyStillToClipboardRequest} from '@remotion/studio-shared';
import path from 'path';
import type {ApiHandler} from '../api-types';

export const handleCopyStillToClipboard: ApiHandler<
	CopyStillToClipboardRequest,
	void
> = ({input: {outName, binariesDirectory}, remotionRoot}) => {
	const resolved = path.resolve(remotionRoot, outName);

	const relativeToProcessCwd = path.relative(remotionRoot, resolved);
	if (relativeToProcessCwd.startsWith('..')) {
		throw new Error(`Not allowed to open ${relativeToProcessCwd}`);
	}

	return RenderInternals.copyImageToClipboard(
		resolved,
		'info',
		binariesDirectory,
	);
};
