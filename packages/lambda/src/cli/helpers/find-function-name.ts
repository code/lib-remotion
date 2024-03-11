import type {LogLevel, LogOptions} from '@remotion/renderer';
import {VERSION} from 'remotion/version';
import {getFunctions} from '../../api/get-functions';
import {BINARY_NAME} from '../../shared/constants';
import {parsedLambdaCli} from '../args';
import {FUNCTIONS_COMMAND} from '../commands/functions';
import {FUNCTIONS_DEPLOY_SUBCOMMAND} from '../commands/functions/deploy';
import {FUNCTIONS_LS_SUBCOMMAND} from '../commands/functions/ls';
import {FUNCTIONS_RM_SUBCOMMAND} from '../commands/functions/rm';
import {getAwsRegion} from '../get-aws-region';
import {Log} from '../log';
import {quit} from './quit';

export const findFunctionName = async (logLevel: LogLevel) => {
	const remotionLambdas = await getFunctions({
		region: getAwsRegion(),
		compatibleOnly: false,
	});
	let lambdasWithMatchingVersion = remotionLambdas.filter(
		(l) => l.version === VERSION,
	);
	const logOptions: LogOptions = {
		indent: false,
		logLevel,
	};

	if (lambdasWithMatchingVersion.length === 0) {
		Log.error(
			{indent: false, logLevel},
			`No Lambda functions with version ${VERSION} found in your account.`,
		);
		if (remotionLambdas.length > 0) {
			Log.error(
				{indent: false, logLevel},
				'Other functions were found, but are not compatible with this version of the CLI.',
			);
		}

		Log.info(logOptions, 'Run');
		Log.info(
			logOptions,
			`  npx ${BINARY_NAME} ${FUNCTIONS_COMMAND} ${FUNCTIONS_DEPLOY_SUBCOMMAND}`,
		);
		Log.info(logOptions, `to deploy a new Lambda function.`);
		quit(1);
	}

	if (lambdasWithMatchingVersion.length > 1) {
		if (parsedLambdaCli['function-name']) {
			const prevFunctions = [...lambdasWithMatchingVersion];
			lambdasWithMatchingVersion = lambdasWithMatchingVersion.filter(
				(l) => l.functionName === parsedLambdaCli['function-name'],
			);
			if (lambdasWithMatchingVersion.length === 0) {
				Log.error(
					{indent: false, logLevel},
					`No Lambda function with name "${parsedLambdaCli['function-name']}" and version ${VERSION} found in your account.`,
				);
				Log.info(logOptions);

				if (prevFunctions.length === 0) {
					Log.info(
						logOptions,
						`No functions for version ${VERSION} were found, deploy one using:`,
					);
					Log.info(
						logOptions,
						`  npx ${BINARY_NAME} ${FUNCTIONS_COMMAND} ${FUNCTIONS_DEPLOY_SUBCOMMAND}`,
					);
					quit(1);
				}

				Log.info(logOptions, 'The following functions were found:');
				for (const l of prevFunctions) {
					Log.info(logOptions, `- ${l.functionName} (v${l.version})`);
				}

				Log.info(
					logOptions,
					'Remove the `--function-name` parameter use one of them.',
				);

				quit(1);
			}
		} else {
			Log.error(
				{indent: false, logLevel},
				'More than 1 lambda function found in your account. Unsure which one to use.',
			);
			Log.info(logOptions);
			Log.info(logOptions, 'Possible solutions:');
			Log.info(
				logOptions,
				'- Define using `--function-name` which function you want to use.',
			);
			Log.info(
				logOptions,
				`- Delete extraneous lambda functions in your AWS console or using:`,
			);
			Log.info(
				logOptions,
				`    npx ${BINARY_NAME} ${FUNCTIONS_COMMAND} ${FUNCTIONS_RM_SUBCOMMAND} $(npx ${BINARY_NAME} ${FUNCTIONS_COMMAND} ${FUNCTIONS_LS_SUBCOMMAND} -q) -y`,
			);
			Log.info(logOptions);
			Log.info(
				logOptions,
				`The following functions were found (only showing v${VERSION}):`,
			);
			for (const l of lambdasWithMatchingVersion) {
				Log.info(logOptions, `- ${l.functionName}`);
			}

			quit(1);
		}
	}

	const {functionName} = lambdasWithMatchingVersion[0];

	return functionName;
};
