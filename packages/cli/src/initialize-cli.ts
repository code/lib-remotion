import type {LogLevel} from '@remotion/renderer';
import {BrowserSafeApis} from '@remotion/renderer/client';
import {loadConfig} from './get-config-file-name';
import {Log} from './log';
import {parseCommandLine, parsedCli} from './parse-command-line';

export const initializeCli = async (
	remotionRoot: string,
): Promise<LogLevel> => {
	const appliedName = await loadConfig(remotionRoot);

	parseCommandLine();
	const logLevel = BrowserSafeApis.options.logLevelOption.getValue({
		commandLine: parsedCli,
	}).value;
	// Only now Log.verbose is available
	Log.verbose(
		{indent: false, logLevel},
		'Remotion root directory:',
		remotionRoot,
	);
	if (remotionRoot !== process.cwd()) {
		Log.warn(
			{indent: false, logLevel},
			`Warning: The root directory of your project is ${remotionRoot}, but you are executing this command from ${process.cwd()}. The recommendation is to execute commands from the root directory.`,
		);
	}

	if (appliedName) {
		Log.verbose(
			{indent: false, logLevel},
			`Applied configuration from ${appliedName}.`,
		);
	} else {
		Log.verbose({indent: false, logLevel}, 'No config file loaded.');
	}

	return logLevel;
};
