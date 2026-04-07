#!/usr/bin/env node
//==============================================================================
// 게임 빌드 도구.
//
// 사용법:
//   node tools/build <게임이름>
//
// 예시:
//   node tools/build gomoku
//==============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');


//==============================================================================
// 디렉토리 락 해제 대기 (임시 이름 변경을 통한 물리적 락 해제 확인)
//==============================================================================
async function waitUntilUnlocked(targetPath, maxRetries = 50, intervalMs = 200) {
    const tempPath = targetPath + '_temp_lock_check';
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            fs.renameSync(targetPath, tempPath);
            fs.renameSync(tempPath, targetPath);
            return;
        }
        catch (error) {
            if (error.code !== 'EPERM' && error.code !== 'EBUSY' && error.code !== 'ENOENT') {
                throw error;
            }
            await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
    }
}

//==============================================================================
// 읽기전용 해제.
//==============================================================================
function removeReadOnlyRecursive(targetPath) {
    if (!fs.existsSync(targetPath)) {
        return;
    }

	const stats = fs.statSync(targetPath);

    if (stats.isDirectory()) {
        fs.chmodSync(targetPath, 0o777);
        const entries = fs.readdirSync(targetPath);
        for (const entry of entries) {
            removeReadOnlyRecursive(path.join(targetPath, entry));
        }
    }
	else {
        fs.chmodSync(targetPath, 0o666);
    }

	// console.log(targetPath);
    // fs.chmodSync(targetPath, 0o666);

    // const stats = fs.statSync(targetPath);
    // if (stats.isDirectory()) {
    //     const entries = fs.readdirSync(targetPath);
    //     for (const entry of entries) {
    //         removeReadOnlyRecursive(path.join(targetPath, entry));
    //     }
    // }
}

//==============================================================================
// 디렉토리를 재귀적으로 복사.
//==============================================================================
function copyDir(src, dest) {
	if (!fs.existsSync(src)) {
		return;
	}
	fs.mkdirSync(dest, { recursive: true });
	const entries = fs.readdirSync(src, { withFileTypes: true });
	for (const entry of entries) {
		const srcPath = path.join(src, entry.name);
		const destPath = path.join(dest, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === '.buildignore') {
				continue;
			}
			copyDir(srcPath, destPath);
		}
		else {
			fs.copyFileSync(srcPath, destPath);
		}
	}
}

//==============================================================================
// 특정 확장자 파일만 복사. (재귀 없음, 단일 디렉토리)
//==============================================================================
function copyFilesByExtension(src, dest, ext) {
	if (!fs.existsSync(src)) {
		return 0;
	}
	fs.mkdirSync(dest, { recursive: true });
	const entries = fs.readdirSync(src, { withFileTypes: true });
	let count = 0;
	for (const entry of entries) {
		if (entry.isFile() && entry.name.endsWith(ext)) {
			fs.copyFileSync(path.join(src, entry.name), path.join(dest, entry.name));
			count++;
		}
	}
	return count;
}

//==============================================================================
// 메인 빌드.
//==============================================================================
async function build(gameName) {
	const projectRoot = path.resolve(__dirname, '..');
	const outputDir = path.join(projectRoot, 'build', gameName);

	console.log(`빌드 시작: ${gameName}`);
	console.log(`출력 디렉토리: ${outputDir}\n`);

	// 출력 디렉토리 초기화 (기존 내용 제거 후 재생성).
	if (fs.existsSync(outputDir)) {
		fs.rmSync(outputDir, { recursive: true, force: true });
	}
	fs.mkdirSync(outputDir, { recursive: true });

	// 1. tools/buildtemplate 복사.
	const templateSrc = path.join(projectRoot, 'tools', 'buildtemplate');
	if (fs.existsSync(templateSrc)) {
		copyDir(templateSrc, outputDir);
		console.log(`[1] 템플릿 복사 완료: ${templateSrc} -> ${outputDir}`);
	}
	else {
		console.warn(`[1] 템플릿 없음 (건너뜀): ${templateSrc}`);
	}

	// 2. 리소스 복사.
	// 2-1. assets/sprites/<gameName> 복사.
	const assetsSpritesSrc = path.join(projectRoot, 'assets', 'sprites', gameName);
	const assetsSpritesDest = path.join(outputDir, 'assets', 'sprites', gameName);
	if (fs.existsSync(assetsSpritesSrc)) {
		copyDir(assetsSpritesSrc, assetsSpritesDest);
		console.log(`[2] 스프라이트 복사 완료: ${assetsSpritesSrc} -> ${assetsSpritesDest}`);
	}
	else {
		console.warn(`[2] 스프라이트 없음 (건너뜀): ${assetsSpritesSrc}`);
	}

	// 2-2. assets/fonts/<gameName> 에서 .woff2 파일만 복사.
	const assetsFontsSrc = path.join(projectRoot, 'assets', 'fonts', gameName);
	const assetsFontsDest = path.join(outputDir, 'assets', 'fonts', gameName);
	const fontCount = copyFilesByExtension(assetsFontsSrc, assetsFontsDest, '.woff2');
	if (fontCount > 0) {
		console.log(`[2] 폰트 복사 완료: ${fontCount}개 (.woff2) -> ${assetsFontsDest}`);
	}
	else {
		console.warn(`[2] 폰트 없음 (건너뜀): ${assetsFontsSrc}`);
	}

	// 2-3. assets/audio/<gameName> 에서 .webm 파일만 복사.
	const assetsAudioSrc = path.join(projectRoot, 'assets', 'audio', gameName);
	const assetsAudioDest = path.join(outputDir, 'assets', 'audio', gameName);
	const audioCount = copyFilesByExtension(assetsAudioSrc, assetsAudioDest, '.webm');
	if (audioCount > 0) {
		console.log(`[2] 오디오 복사 완료: ${audioCount}개 (.webm) -> ${assetsAudioDest}`);
	}
	else {
		console.warn(`[2] 오디오 없음 (건너뜀): ${assetsAudioSrc}`);
	}

	// 3. esbuild 번들링 후 복사.
	const entryFile = path.join(projectRoot, 'main.js');
	const bundleDest = path.join(outputDir, 'js', 'bundle.min.js');

	if (!fs.existsSync(entryFile)) {
		console.error(`[3] 진입 파일 없음: ${entryFile}`);
		process.exit(1);
	}

	fs.mkdirSync(path.dirname(bundleDest), { recursive: true });
	const esbuildCommand = `esbuild ${entryFile} --bundle --outfile=${bundleDest} --format=iife --minify`;
	console.log(`[3] esbuild 실행 중...`);
	console.log(`    ${esbuildCommand}`);
	execSync(esbuildCommand, { stdio: 'inherit' });
	console.log(`[3] 번들 완료: ${bundleDest}`);


	// 파일시스템 락 풀릴때까지 대기.
	// await new Promise(resolve => setTimeout(resolve, 2000));
	// await waitUntilAccessible(bundleDest);
	
	// // 서드파티 CLI가 변경을 시도할 assets 폴더의 락이 완전히 풀릴 때까지 대기.
    // const assetsDir = path.join(outputDir, 'assets');
    // if (fs.existsSync(assetsDir)) {
    //     await waitUntilUnlocked(assetsDir);
    // }

	// try {
	// 	// console.log(projectRoot);
	// 	removeReadOnlyRecursive(outputDir);
	// 	// execSync('npx ait build', { stdio: 'inherit', cwd: projectRoot });
	// }
	// catch (error) {
    //     process.exit(1);
    // }
	
	console.log(`[4] ait build 완료`);
	console.log(`\n빌드 완료: ${outputDir}`);

	// 4. NAS 배포.
	// const deployDest = path.join('\\\\DS216PLUSII', 'web', 'com.ddukbaek2.playable', gameName);
	// console.log(`\n[4] NAS 배포 중: ${outputDir} -> ${deployDest}`);
	// if (fs.existsSync(deployDest)) {
	// 	fs.rmSync(deployDest, { recursive: true, force: true });
	// }
	// copyDir(outputDir, deployDest);
	// console.log(`[4] NAS 배포 완료: ${deployDest}`);
}

//==============================================================================
// CLI 진입점.
//==============================================================================
const args = process.argv.slice(2);
if (args.length < 1) {
	console.log('사용법: node tools/build <게임이름>');
	console.log('예시:   node tools/build gomoku');
	process.exit(1);
}

build(args[0]);