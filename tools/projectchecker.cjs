#!/usr/bin/env node
//==============================================================================
// 프로젝트 자산 현황 체크 도구.
//
// 사용법:
//   node tools/projectchecker
//
// 기능:
//   - assets/sprites/ 하위 이미지 파일 전수 조사
//   - 게임별 이미지 수, 텍스처 크기, 파일 크기 출력
//   - 아틀라스(.json) 존재 여부 확인
//   - 전체 합산 통계 출력
//==============================================================================
'use strict';

const fs = require('fs');
const path = require('path');
const { loadImage } = require('canvas');


//==============================================================================
// 전역 상수 목록.
//==============================================================================
const PROJECT_ROOT = path.resolve(__dirname, '..');
const SPRITES_DIR = path.join(PROJECT_ROOT, 'assets', 'sprites');
const LARGE_TEXTURE_THRESHOLD = 512; // 이 픽셀 초과 시 경고 표시
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg'];


//==============================================================================
// 바이트를 읽기 좋은 단위로 변환.
//==============================================================================
/**
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	else if (bytes < 1024 * 1024) {
		const kilobytes = (bytes / 1024).toFixed(1);
		return `${kilobytes} KB`;
	}
	else {
		const megabytes = (bytes / (1024 * 1024)).toFixed(2);
		return `${megabytes} MB`;
	}
}


//==============================================================================
// 디렉토리를 재귀적으로 탐색하여 이미지 파일 경로 목록 반환.
// - .buildignore 폴더는 제외.
//==============================================================================
/**
 * @param {string} directory
 * @param {string[]} result
 * @returns {string[]}
 */
function collectImageFiles(directory, result) {
	if (!result) {
		result = [];
	}

	const entries = fs.readdirSync(directory, { withFileTypes: true });
	for (const entry of entries) {
		if (entry.isDirectory()) {
			if (entry.name === '.buildignore') {
				continue;
			}
			const subdirectory = path.join(directory, entry.name);
			collectImageFiles(subdirectory, result);
		}
		else {
			const extension = path.extname(entry.name).toLowerCase();
			const isImage = IMAGE_EXTENSIONS.includes(extension);
			if (isImage) {
				result.push(path.join(directory, entry.name));
			}
		}
	}

	return result;
}


//==============================================================================
// 게임 이름 추출.
// - sprites/ 바로 아래 폴더 이름을 게임 이름으로 사용.
// - sprites/ 루트에 직접 위치한 파일은 '(공통)' 으로 분류.
//==============================================================================
/**
 * @param {string} fileFullPath
 * @returns {string}
 */
function extractGameName(fileFullPath) {
	const relativePath = path.relative(SPRITES_DIR, fileFullPath);
	const segments = relativePath.split(path.sep);
	if (segments.length === 1) {
		return '(공통)';
	}
	return segments[0];
}


//==============================================================================
// 이미지 정보 수집.
//==============================================================================
/**
 * @param {string[]} imageFilePaths
 * @returns {Promise<Object[]>}
 */
async function collectImageInfoList(imageFilePaths) {
	const imageInfoList = [];

	for (const imageFilePath of imageFilePaths) {
		const stat = fs.statSync(imageFilePath);
		const fileSize = stat.size;

		let imageWidth = 0;
		let imageHeight = 0;
		try {
			const image = await loadImage(imageFilePath);
			imageWidth = image.width;
			imageHeight = image.height;
		}
		catch (error) {
			console.warn(`  [경고] 이미지 로드 실패: ${imageFilePath}`);
		}

		const gameName = extractGameName(imageFilePath);
		const relativePath = path.relative(SPRITES_DIR, imageFilePath);
		const isLarge = imageWidth > LARGE_TEXTURE_THRESHOLD || imageHeight > LARGE_TEXTURE_THRESHOLD;

		imageInfoList.push({
			gameName: gameName,
			relativePath: relativePath,
			fileFullPath: imageFilePath,
			fileSize: fileSize,
			imageWidth: imageWidth,
			imageHeight: imageHeight,
			isLarge: isLarge
		});
	}

	return imageInfoList;
}


//==============================================================================
// 아틀라스 JSON 파일 목록 수집.
//==============================================================================
/**
 * @returns {Object[]}
 */
function collectAtlasInfoList() {
	const atlasInfoList = [];

	const gameEntries = fs.readdirSync(SPRITES_DIR, { withFileTypes: true });
	for (const gameEntry of gameEntries) {
		if (!gameEntry.isDirectory()) {
			continue;
		}

		const gameName = gameEntry.name;
		const gameDirectory = path.join(SPRITES_DIR, gameName);
		const fileEntries = fs.readdirSync(gameDirectory, { withFileTypes: true });

		for (const fileEntry of fileEntries) {
			if (fileEntry.isDirectory()) {
				continue;
			}

			const extension = path.extname(fileEntry.name).toLowerCase();
			if (extension !== '.json') {
				continue;
			}

			const jsonFilePath = path.join(gameDirectory, fileEntry.name);
			let atlasData = null;
			try {
				const jsonText = fs.readFileSync(jsonFilePath, 'utf-8');
				atlasData = JSON.parse(jsonText);
			}
			catch (error) {
				continue;
			}

			const isAtlas = atlasData && atlasData.meta && atlasData.images;
			if (!isAtlas) {
				continue;
			}

			atlasInfoList.push({
				gameName: gameName,
				fileName: fileEntry.name,
				atlasWidth: atlasData.meta.width,
				atlasHeight: atlasData.meta.height,
				frameCount: atlasData.meta.count
			});
		}
	}

	return atlasInfoList;
}


//==============================================================================
// 현황 출력.
//==============================================================================
/**
 * @param {Object[]} imageInfoList
 * @param {Object[]} atlasInfoList
 */
function printReport(imageInfoList, atlasInfoList) {
	// 게임별 그룹화
	const gameMap = {};
	for (const imageInfo of imageInfoList) {
		const gameName = imageInfo.gameName;
		if (!gameMap[gameName]) {
			gameMap[gameName] = [];
		}
		gameMap[gameName].push(imageInfo);
	}

	// 아틀라스 게임별 그룹화
	const atlasMap = {};
	for (const atlasInfo of atlasInfoList) {
		const gameName = atlasInfo.gameName;
		if (!atlasMap[gameName]) {
			atlasMap[gameName] = [];
		}
		atlasMap[gameName].push(atlasInfo);
	}

	const separatorLine = '='.repeat(72);
	const thinSeparatorLine = '-'.repeat(72);

	console.log('');
	console.log(separatorLine);
	console.log(' 프로젝트 자산 현황 리포트');
	console.log(separatorLine);

	let totalImageCount = 0;
	let totalFileSize = 0;
	let totalLargeCount = 0;

	const gameNames = Object.keys(gameMap).sort();
	for (const gameName of gameNames) {
		const gameImageInfoList = gameMap[gameName];
		const gameAtlasInfoList = atlasMap[gameName] || [];

		const gameImageCount = gameImageInfoList.length;
		const gameFileSize = gameImageInfoList.reduce((sum, info) => sum + info.fileSize, 0);
		const gameLargeCount = gameImageInfoList.filter(info => info.isLarge).length;

		totalImageCount += gameImageCount;
		totalFileSize += gameFileSize;
		totalLargeCount += gameLargeCount;

		console.log('');
		console.log(`[ ${gameName} ]  이미지 ${gameImageCount}개  /  ${formatBytes(gameFileSize)}`);
		console.log(thinSeparatorLine);

		// 이미지 목록
		for (const imageInfo of gameImageInfoList) {
			const sizeText = `${imageInfo.imageWidth}x${imageInfo.imageHeight}`;
			const fileSizeText = formatBytes(imageInfo.fileSize);
			const warningMark = imageInfo.isLarge ? ' !' : '  ';
			const relativePath = imageInfo.relativePath;
			const paddedSizeText = sizeText.padStart(10);
			const paddedFileSizeText = fileSizeText.padStart(8);
			console.log(`  ${warningMark} ${paddedSizeText}  ${paddedFileSizeText}  ${relativePath}`);
		}

		// 아틀라스 목록
		if (gameAtlasInfoList.length > 0) {
			console.log('');
			console.log('  [아틀라스]');
			for (const atlasInfo of gameAtlasInfoList) {
				const atlasSizeText = `${atlasInfo.atlasWidth}x${atlasInfo.atlasHeight}`;
				const frameText = `${atlasInfo.frameCount}프레임`;
				console.log(`    ${atlasInfo.fileName.padEnd(24)} ${atlasSizeText.padStart(10)}  ${frameText}`);
			}
		}
	}

	// 전체 합산
	console.log('');
	console.log(separatorLine);
	console.log(' 전체 합산');
	console.log(thinSeparatorLine);
	console.log(`  총 이미지 수  : ${totalImageCount}개`);
	console.log(`  총 파일 크기  : ${formatBytes(totalFileSize)}`);
	console.log(`  총 아틀라스   : ${atlasInfoList.length}개`);
	if (totalLargeCount > 0) {
		console.log(`  대형 텍스처   : ${totalLargeCount}개  (! 표시, ${LARGE_TEXTURE_THRESHOLD}px 초과)`);
	}
	console.log(separatorLine);
	console.log('');
}


//==============================================================================
// 진입점.
//==============================================================================
async function main() {
	// canvas 패키지 로드 가능 여부 사전 체크
	try {
		require.resolve('canvas');
	}
	catch (error) {
		console.error("[ProjectChecker] 오류: 'canvas' 패키지가 설치되어 있지 않습니다.");
		console.error("다음 명령어를 실행하여 패키지를 설치해주세요: npm install canvas");
		process.exit(1);
	}

	if (!fs.existsSync(SPRITES_DIR)) {
		console.error(`[ProjectChecker] 오류: sprites 폴더를 찾을 수 없습니다: ${SPRITES_DIR}`);
		process.exit(1);
	}

	console.log('[ProjectChecker] 이미지 파일을 스캔하는 중...');

	const imageFilePaths = collectImageFiles(SPRITES_DIR, []);
	const imageInfoList = await collectImageInfoList(imageFilePaths);
	const atlasInfoList = collectAtlasInfoList();

	printReport(imageInfoList, atlasInfoList);
}

main().catch(error => {
	console.error('[ProjectChecker] 오류: 작업 중 예기치 않은 오류가 발생했습니다:', error);
});
