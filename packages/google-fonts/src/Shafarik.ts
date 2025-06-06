import {loadFonts} from './base';

export const getInfo = () => ({
	fontFamily: 'Shafarik',
	importName: 'Shafarik',
	version: 'v3',
	url: 'https://fonts.googleapis.com/css2?family=Shafarik:ital,wght@0,400',
	unicodeRanges: {
		'cyrillic-ext':
			'U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F',
		cyrillic: 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116',
		glagolitic:
			'U+0303, U+0305, U+0484, U+0487, U+0589, U+10FB, U+205A, U+2C00-2C5F, U+2E43, U+A66F, U+1E000-1E006, U+1E008-1E018, U+1E01B-1E021, U+1E023-1E024, U+1E026-1E02A',
		'latin-ext':
			'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF',
		latin:
			'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
	},
	fonts: {
		normal: {
			'400': {
				'cyrillic-ext':
					'https://fonts.gstatic.com/s/shafarik/v3/RWmLoKaF7PojpZXlW62mZMD6qA.woff2',
				cyrillic:
					'https://fonts.gstatic.com/s/shafarik/v3/RWmLoKaF7PojpZXlW62vZMD6qA.woff2',
				glagolitic:
					'https://fonts.gstatic.com/s/shafarik/v3/RWmLoKaF7PojpZXlW60tReXHkaA.woff2',
				'latin-ext':
					'https://fonts.gstatic.com/s/shafarik/v3/RWmLoKaF7PojpZXlW62lZMD6qA.woff2',
				latin:
					'https://fonts.gstatic.com/s/shafarik/v3/RWmLoKaF7PojpZXlW62rZMA.woff2',
			},
		},
	},
	subsets: ['cyrillic', 'cyrillic-ext', 'glagolitic', 'latin', 'latin-ext'],
});

export const fontFamily = 'Shafarik' as const;

type Variants = {
	normal: {
		weights: '400';
		subsets: 'cyrillic' | 'cyrillic-ext' | 'glagolitic' | 'latin' | 'latin-ext';
	};
};

export const loadFont = <T extends keyof Variants>(
	style?: T,
	options?: {
		weights?: Variants[T]['weights'][];
		subsets?: Variants[T]['subsets'][];
		document?: Document;
		ignoreTooManyRequestsWarning?: boolean;
	},
) => {
	return loadFonts(getInfo(), style, options);
};
