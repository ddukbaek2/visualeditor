#!/usr/bin/env node
//==============================================================================
// 프로퍼티/메서드명 망글링 도구.
// esbuild 번들링 후 남아있는 긴 프로퍼티명을 짧게 치환한다.
//
// 사용법:
//   node tools/mangle.cjs <입력파일> <출력파일> [추가제외이름...]
//
// 예시:
//   node tools/mangle.cjs build/bundle.js build/bundle.min.js images x y width height
//==============================================================================
'use strict';

const fs = require('fs');

//==============================================================================
// 제외 목록. (브라우저/JS 내장 API - 치환하면 깨짐)
//==============================================================================
const EXCLUDED = new Set([
	// JS 기본
	'constructor', 'prototype', '__proto__', 'length', 'name', 'caller', 'arguments',
	'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable',
	'apply', 'call', 'bind',
	'get', 'set', 'has', 'delete', 'add', 'clear', 'size',
	'next', 'return', 'throw', 'done', 'value',
	// Promise / async
	'then', 'catch', 'finally', 'resolve', 'reject', 'all', 'race', 'allSettled', 'any',
	// Array
	'push', 'pop', 'shift', 'unshift', 'splice', 'slice', 'indexOf', 'lastIndexOf',
	'findIndex', 'find', 'filter', 'map', 'reduce', 'reduceRight', 'forEach',
	'some', 'every', 'sort', 'reverse', 'includes', 'join', 'concat',
	'flat', 'flatMap', 'fill', 'copyWithin', 'from', 'of', 'isArray', 'at',
	'keys', 'values', 'entries',
	// Object
	'assign', 'create', 'freeze', 'seal', 'fromEntries',
	'defineProperty', 'defineProperties', 'getOwnPropertyNames', 'getOwnPropertyDescriptor',
	'getPrototypeOf', 'setPrototypeOf', 'is', 'ownKeys',
	// String
	'split', 'match', 'matchAll', 'search', 'replace', 'replaceAll',
	'trim', 'trimStart', 'trimEnd', 'padStart', 'padEnd',
	'toUpperCase', 'toLowerCase', 'charAt', 'charCodeAt', 'codePointAt',
	'startsWith', 'endsWith', 'repeat', 'normalize', 'substring', 'substr',
	// Math
	'floor', 'ceil', 'round', 'abs', 'min', 'max', 'sqrt', 'pow', 'log', 'exp',
	'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'sign', 'trunc',
	'random', 'hypot', 'clz32', 'imul', 'fround', 'cbrt',
	'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh', 'log2', 'log10', 'expm1', 'log1p',
	'PI', 'E', 'LN2', 'LN10', 'LOG2E', 'LOG10E', 'SQRT2',
	// JSON
	'stringify', 'parse',
	// Error
	'message', 'stack', 'cause',
	// DOM
	'addEventListener', 'removeEventListener', 'dispatchEvent',
	'getElementById', 'getElementsByClassName', 'getElementsByTagName',
	'querySelector', 'querySelectorAll',
	'appendChild', 'removeChild', 'insertBefore', 'replaceChild', 'cloneNode',
	'getAttribute', 'setAttribute', 'removeAttribute', 'hasAttribute',
	'closest', 'matches', 'contains',
	'createElement', 'createTextNode', 'createDocumentFragment', 'createComment',
	'importNode', 'adoptNode',
	'preventDefault', 'stopPropagation', 'stopImmediatePropagation',
	'focus', 'blur', 'click', 'submit', 'reset',
	'getBoundingClientRect', 'getComputedStyle',
	'scrollIntoView', 'scrollTo', 'scroll',
	'requestAnimationFrame', 'cancelAnimationFrame',
	'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
	'postMessage', 'close', 'terminate',
	// DOM 프로퍼티
	'id', 'className', 'classList', 'style', 'dataset',
	'innerHTML', 'outerHTML', 'textContent', 'innerText',
	'nodeType', 'nodeName', 'nodeValue', 'tagName',
	'parentNode', 'parentElement', 'childNodes', 'children',
	'firstChild', 'lastChild', 'firstElementChild', 'lastElementChild',
	'nextSibling', 'previousSibling', 'nextElementSibling', 'previousElementSibling',
	'src', 'href', 'alt', 'title', 'type', 'value', 'checked', 'disabled',
	'selected', 'hidden', 'readOnly', 'required', 'multiple', 'tabIndex',
	'width', 'height', 'offsetWidth', 'offsetHeight', 'scrollWidth', 'scrollHeight',
	'clientWidth', 'clientHeight', 'offsetLeft', 'offsetTop', 'scrollLeft', 'scrollTop',
	'naturalWidth', 'naturalHeight', 'complete',
	'currentSrc', 'currentTime', 'duration', 'paused', 'ended', 'muted', 'volume',
	'files', 'size', 'lastModified',
	// 이벤트 프로퍼티
	'target', 'currentTarget', 'relatedTarget', 'bubbles', 'cancelable',
	'detail', 'data', 'key', 'code', 'keyCode', 'charCode', 'which',
	'clientX', 'clientY', 'pageX', 'pageY', 'screenX', 'screenY',
	'offsetX', 'offsetY', 'movementX', 'movementY',
	'button', 'buttons', 'altKey', 'ctrlKey', 'shiftKey', 'metaKey',
	'touches', 'targetTouches', 'changedTouches', 'identifier', 'force',
	'deltaX', 'deltaY', 'deltaZ', 'deltaMode',
	'timeStamp', 'isTrusted',
	// Canvas 2D
	'getContext', 'toDataURL', 'toBlob', 'transferToImageBitmap',
	'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo',
	'bezierCurveTo', 'quadraticCurveTo', 'rect', 'roundRect', 'ellipse',
	'fill', 'stroke', 'clip',
	'fillRect', 'strokeRect', 'clearRect',
	'fillText', 'strokeText', 'measureText',
	'drawImage', 'putImageData', 'getImageData', 'createImageData',
	'save', 'restore', 'translate', 'rotate', 'scale',
	'transform', 'setTransform', 'resetTransform',
	'createLinearGradient', 'createRadialGradient', 'createConicGradient', 'createPattern',
	'addColorStop', 'setLineDash', 'getLineDash',
	'isPointInPath', 'isPointInStroke',
	// Canvas 프로퍼티
	'fillStyle', 'strokeStyle', 'lineWidth', 'lineCap', 'lineJoin', 'miterLimit',
	'globalAlpha', 'globalCompositeOperation',
	'font', 'textAlign', 'textBaseline', 'direction',
	'imageSmoothingEnabled', 'imageSmoothingQuality',
	'shadowColor', 'shadowBlur', 'shadowOffsetX', 'shadowOffsetY',
	// Audio
	'createGain', 'createBufferSource', 'createOscillator', 'createAnalyser',
	'createBiquadFilter', 'createConvolver', 'createDelay', 'createDynamicsCompressor',
	'createMediaElementSource', 'createMediaStreamSource', 'createMediaStreamDestination',
	'decodeAudioData', 'connect', 'disconnect',
	'start', 'stop', 'resume', 'suspend',
	'gain', 'frequency', 'buffer', 'loop', 'loopStart', 'loopEnd',
	'onended', 'context', 'destination', 'state', 'sampleRate', 'currentTime',
	// FontFace
	'load', 'loaded', 'check', 'ready',
	'family', 'weight', 'stretch', 'unicodeRange', 'variant', 'featureSettings',
	// Fetch / Response
	'json', 'text', 'blob', 'arrayBuffer', 'formData',
	'ok', 'status', 'statusText', 'headers', 'url', 'redirected', 'body',
	// Storage
	'getItem', 'setItem', 'removeItem',
	// Observer
	'observe', 'unobserve',
	// Image
	'onload', 'onerror', 'onabort', 'decode',
	// URL
	'createObjectURL', 'revokeObjectURL',
	// Performance
	'now', 'timeOrigin', 'mark', 'measure',
	// CSS 프로퍼티
	'display', 'position', 'top', 'left', 'right', 'bottom',
	'margin', 'padding', 'border', 'outline',
	'background', 'backgroundColor', 'backgroundImage',
	'color', 'fontSize', 'fontFamily', 'fontWeight', 'lineHeight',
	'opacity', 'visibility', 'overflow',
	'zIndex', 'cursor', 'pointerEvents',
	'transform', 'transition', 'animation',
	'flex', 'flexDirection', 'flexWrap', 'justifyContent', 'alignItems', 'alignSelf',
	'boxSizing', 'borderRadius', 'boxShadow',
	// 짧은 이름 (이미 충분히 짧음)
	'x', 'y', 'z', 'w', 'r', 'g', 'b', 'a', 'i', 'j', 'k', 'n',
]);

//==============================================================================
// 짧은 이름 생성. ($a, $b, ..., $z, $aa, ...)
//==============================================================================
function generateName(index) {
	const chars = 'abcdefghijklmnopqrstuvwxyz';
	let result = '';
	let n = index + 1;
	while (n > 0) {
		result = chars[(n - 1) % 26] + result;
		n = Math.floor((n - 1) / 26);
	}
	return '$' + result;
}

//==============================================================================
// 문자열/주석 마스킹. (치환 대상에서 제외)
//==============================================================================
function maskStrings(code) {
	const masked = [];
	let result = '';
	let i = 0;

	while (i < code.length) {
		// 줄 주석.
		if (code[i] === '/' && code[i + 1] === '/') {
			let j = i;
			while (j < code.length && code[j] !== '\n') {
				j++;
			}
			masked.push(code.substring(i, j));
			result += `\x00M${masked.length - 1}\x00`;
			i = j;
			continue;
		}
		// 블록 주석.
		if (code[i] === '/' && code[i + 1] === '*') {
			let j = i + 2;
			while (j < code.length && !(code[j] === '*' && code[j + 1] === '/')) {
				j++;
			}
			j += 2;
			masked.push(code.substring(i, j));
			result += `\x00M${masked.length - 1}\x00`;
			i = j;
			continue;
		}
		// 문자열 리터럴 (따옴표).
		if (code[i] === '"' || code[i] === "'") {
			const quote = code[i];
			let j = i + 1;
			while (j < code.length) {
				if (code[j] === '\\') {
					j += 2;
					continue;
				}
				if (code[j] === quote) {
					j++;
					break;
				}
				j++;
			}
			masked.push(code.substring(i, j));
			result += `\x00M${masked.length - 1}\x00`;
			i = j;
			continue;
		}
		// 템플릿 리터럴.
		if (code[i] === '`') {
			let j = i + 1;
			while (j < code.length) {
				if (code[j] === '\\') {
					j += 2;
					continue;
				}
				if (code[j] === '`') {
					j++;
					break;
				}
				j++;
			}
			masked.push(code.substring(i, j));
			result += `\x00M${masked.length - 1}\x00`;
			i = j;
			continue;
		}
		result += code[i++];
	}

	return { masked: result, strings: masked };
}

//==============================================================================
// 마스킹 복원.
//==============================================================================
function unmaskStrings(code, strings) {
	return code.replace(/\x00M(\d+)\x00/g, (_, i) => strings[parseInt(i)]);
}

//==============================================================================
// 프로퍼티명 수집. (.identifier 패턴에서 추출)
//==============================================================================
function collectPropertyNames(maskedCode) {
	const names = new Set();
	const regex = /\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
	let m;
	while ((m = regex.exec(maskedCode)) !== null) {
		const name = m[1];
		if (name.length > 2 && !EXCLUDED.has(name)) {
			names.add(name);
		}
	}
	return names;
}

//==============================================================================
// 메인 망글링.
//==============================================================================
function mangle(inputFile, outputFile, extraExcludes) {
	const code = fs.readFileSync(inputFile, 'utf8');

	for (const name of extraExcludes) {
		EXCLUDED.add(name);
	}

	// 문자열/주석 마스킹.
	const { masked, strings } = maskStrings(code);

	// 프로퍼티명 수집.
	const propertyNames = collectPropertyNames(masked);
	console.log(`프로퍼티 ${propertyNames.size}개 발견\n`);

	// 매핑 생성 (알파벳 순 정렬로 결정론적 결과).
	const mapping = new Map();
	let nameIndex = 0;
	for (const name of [...propertyNames].sort()) {
		let shortName;
		do {
			shortName = generateName(nameIndex++);
		} while (EXCLUDED.has(shortName));
		mapping.set(name, shortName);
		console.log(`  ${name.padEnd(40)} -> ${shortName}`);
	}

	// 긴 이름부터 치환 (부분 매칭 방지).
	const sorted = [...mapping.entries()].sort((a, b) => b[0].length - a[0].length);
	let result = masked;
	for (const [original, replacement] of sorted) {
		const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		result = result.replace(new RegExp(`\\b${escaped}\\b`, 'g'), replacement);
	}

	// 마스킹 복원 후 저장.
	const final = unmaskStrings(result, strings);
	fs.writeFileSync(outputFile, final);

	// 용량 비교 출력.
	const originalSize = Buffer.byteLength(code, 'utf8');
	const resultSize = Buffer.byteLength(final, 'utf8');
	const saved = originalSize - resultSize;
	const ratio = ((1 - resultSize / originalSize) * 100).toFixed(1);
	console.log(`\n원본:   ${(originalSize / 1024).toFixed(1)} KB`);
	console.log(`결과:   ${(resultSize / 1024).toFixed(1)} KB`);
	console.log(`절약:   ${(saved / 1024).toFixed(1)} KB (${ratio}%)`);

	// 매핑 파일 저장 (디버깅용).
	const mapPath = outputFile + '.map.json';
	fs.writeFileSync(mapPath, JSON.stringify(Object.fromEntries(mapping), null, 2));
	console.log(`\n매핑 파일: ${mapPath}`);
}

//==============================================================================
// CLI 진입점.
//==============================================================================
const args = process.argv.slice(2);
if (args.length < 2) {
	console.log('사용법: node tools/mangle.cjs <입력파일> <출력파일> [추가제외이름...]');
	console.log('예시:   node tools/mangle.cjs build/bundle.js build/bundle.min.js images width height');
	process.exit(1);
}

mangle(args[0], args[1], args.slice(2));
