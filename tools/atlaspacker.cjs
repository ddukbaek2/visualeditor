//==============================================================================
// 포함 모듈 목록.
//==============================================================================
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');


//==============================================================================
// 전역 상수 목록.
//==============================================================================
const MAX_TEXTURE_SIZE = 4096; // 텍스처 최대 크기
const PADDING = 2; // 이미지 간 간격


//==============================================================================
// 아틀라스 묶기.
// - 지정된 폴더의 모든 이미지를 아틀라스 이미지 1장과 JSON 메타데이터로 패킹.
//==============================================================================
/**
 * @param {string} targetDirectory
 */
async function packAtlas(targetDirectory) {
	if (!fs.existsSync(targetDirectory) || !fs.statSync(targetDirectory).isDirectory()) {
		console.error(`[AltasPacker] 오류: 입력 폴더가 존재하지 않거나 폴더가 아닙니다: ${targetDirectory}`);
		process.exit(1);
	}

	// 폴더 이름을 결과물의 이름으로 사용 (입력 폴더와 동일 계층)
	const folderName = path.basename(targetDirectory);
	const parentDir = path.dirname(targetDirectory);
	const atlasImageFileName = `${folderName}.png`;
	const atlasDataFileName = `${folderName}.json`;
	const atlasImageFileFullName = path.join(parentDir, atlasImageFileName);
	const altasDataFileFullName = path.join(parentDir, atlasDataFileName);

	// 이미지 파일 필터링
	const fileNames = fs.readdirSync(targetDirectory).filter(file => {
		const ext = path.extname(file).toLowerCase();
		return ext === '.png' || ext === '.jpg' || ext === '.jpeg';
	});

	if (fileNames.length === 0) {
		console.log("[AltasPacker] 해당 폴더에 이미지 파일이 없습니다.");
		return;
	}

	console.log(`[AltasPacker] 총 ${fileNames.length}개의 이미지 파일을 로드하는 중...`);

	// 이미지 파일 불러오기.
	const atlasData = [];
	let index = 0;
	for (const fileName of fileNames) {
		const fileFullName = path.join(targetDirectory, fileName);
		const extension = path.extname(fileName);
		const name = path.basename(fileName, extension);

		console.log(`- ${fileFullName}`);
		try {
			const image = await loadImage(fileFullName);
			atlasData.push({
				index: index,
				name: name,
				fileName: fileName,
				img: image,
				width: image.width,
				height: image.height
			});
		}
		catch (error) {
			console.error(`[AltasPacker] 이미지 로드 실패: ${fileName}`, error);
		}

		++index;
	}

	if (atlasData.length === 0) {
		console.log("[AltasPacker] 처리할 수 있는 이미지가 없습니다.");
		return;
	}

	// 간단한 선반(Shelf) 패킹 알고리즘을 위해 높이를 기준으로 내림차순 정렬.
	atlasData.sort((a, b) => b.height - a.height);

	// 작은 POT 크기부터 시도하여 가장 최적화된 크기를 찾음 (최소 16부터 최대 4096까지).
	const potSizes = [];
	for (let w = 16; w <= MAX_TEXTURE_SIZE; w *= 2) {
		for (let h = 16; h <= MAX_TEXTURE_SIZE; h *= 2) {
			potSizes.push({ w, h });
		}
	}
	// 면적이 작은 순서대로 정렬하되, 면적이 같으면 정사각형에 가까운 것(너비와 높이의 차이가 작은 것)을 우선
	// 직사각형일 경우 세로보다 가로가 더 긴 것을 우선
	potSizes.sort((a, b) => {
		const areaA = a.w * a.h;
		const areaB = b.w * b.h;
		if (areaA !== areaB) return areaA - areaB;

		const diffA = Math.abs(a.w - a.h);
		const diffB = Math.abs(b.w - b.h);
		if (diffA !== diffB) return diffA - diffB;

		return b.w - a.w;
	});

	function tryPack(images, targetWidth, targetHeight) {
		let currentX = 0;
		let currentY = 0;
		let rowHeight = 0;

		for (const obj of images) {
			// 이미지가 대상 너비나 높이보다 크면 실패
			if (obj.width > targetWidth || obj.height > targetHeight) return false;

			// 가로 한계치를 초과하면 다음 줄(Shelf)로 이동.
			if (currentX + obj.width + PADDING > targetWidth) {
				currentY += rowHeight + PADDING;
				currentX = 0;
				rowHeight = 0;
			}

			// 세로 한계치를 초과하면 실패
			if (currentY + obj.height + PADDING > targetHeight) {
				return false;
			}

			// 위치 할당
			obj.x = currentX;
			obj.y = currentY;

			currentX += obj.width + PADDING;
			rowHeight = Math.max(rowHeight, obj.height);
		}
		return true;
	}

	let atlasWidth = MAX_TEXTURE_SIZE;
	let atlasHeight = MAX_TEXTURE_SIZE;
	let packSuccess = false;

	for (const size of potSizes) {
		if (tryPack(atlasData, size.w, size.h)) {
			atlasWidth = size.w;
			atlasHeight = size.h;
			packSuccess = true;
			break;
		}
	}

	if (!packSuccess) {
		console.error(`[AltasPacker] 오류: 이미지가 너무 많거나 커서 최대 크기(${MAX_TEXTURE_SIZE}x${MAX_TEXTURE_SIZE}) 안에 패킹할 수 없습니다.`);
		return;
	}

	// 실제 필요한 크기만큼의 캔버스 생성
	const canvas = createCanvas(atlasWidth, atlasHeight);
	const canvasRenderingContext = canvas.getContext('2d');

	const jsonOutput = {
		images: {},
		meta: {
			imageFileName: atlasImageFileName,
			width: atlasWidth,
			height: atlasHeight,
			count: atlasData.length
		}
	};

	// 캔버스에 이미지 그리고 JSON 구조체 작성.
	for (const image of atlasData) {
		canvasRenderingContext.drawImage(image.img, image.x, image.y);

		jsonOutput.images[image.fileName] = {
			x: image.x,
			y: image.y,
			width: image.width,
			height: image.height
		};
	}

	// 1. 캔버스를 아틀라스 이미지 파일로 저장.
	const buffer = canvas.toBuffer('image/png');
	fs.writeFileSync(atlasImageFileFullName, buffer);
	
	// 2. 오프셋 정보가 담긴 JSON 파일로 저장.
	fs.writeFileSync(altasDataFileFullName, JSON.stringify(jsonOutput, null, '\t'));

	console.log(`[AltasPacker] 완료: ${atlasImageFileFullName}`);
}


//==============================================================================
// 진입점.
//==============================================================================
function main() {
	const args = process.argv.slice(2);
	if (args.length === 0) {
		console.log("[AltasPacker] 사용법: node atlaspacker.js <폴더경로>");
		process.exit(1);
	}

	const targetDir = path.resolve(args[0]);

	// canvas 패키지 로드 가능 여부 사전 체크
	try {
		require.resolve('canvas');
	} catch (e) {
		console.error("[AltasPacker] 오류: 'canvas' 패키지가 설치되어 있지 않습니다.");
		console.error("다음 명령어를 실행하여 패키지를 설치해주세요: npm install canvas");
		process.exit(1);
	}

	packAtlas(targetDir).catch(err => {
		console.error("[AltasPacker] 오류: 작업 중 예기치 않은 오류가 발생했습니다:", err);
	});
}

main();