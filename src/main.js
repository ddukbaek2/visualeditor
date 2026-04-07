//==============================================================================
// 포함 모듈 목록.
//==============================================================================
const System = globalThis;
import { Colors } from "../libs/vanilla.js/src/base/colors.js";
import { Object } from "../libs/vanilla.js/src/base/object.js";
import { Vector2 } from "../libs/vanilla.js/src/base/vector2.js";
import { Rect } from "../libs/vanilla.js/src/base/rect.js";
import { Engine, EngineConfiguration } from "../libs/vanilla.js/src/core/engine.js";
import { Scene } from "../libs/vanilla.js/src/core/scene.js";
import { ViewScaleMode, ViewManager } from "../libs/vanilla.js/src/core/viewmanager.js";
import { Color } from "../libs/vanilla.js/src/base/color.js";
import { Graphic } from "../libs/vanilla.js/src/core/graphic.js";
import { Camera } from "../libs/vanilla.js/src/experimental/camera.js";
import { Pane, PaneStyle, PaneTheme } from "../libs/vanilla.js/src/web/pane.js";


//==============================================================================
// 게임뷰.
//==============================================================================
class GameView extends Scene {
	//==============================================================================
	// 멤버 변수 목록.
	//==============================================================================
	/** @type { Function } */ #drawEvent;
	/** @type { Camera } */ #camera;

	//==============================================================================
	// 생성.
	//==============================================================================
	/**
	 * @constructor
	 */
	constructor() {
		super();
		this.#drawEvent = null;
		this.#camera = new Camera();
	}

	//==============================================================================
	// 초기화.
	//==============================================================================
	/**
	 * @param { Engine } engine
	 */
	initialize(engine) {
		super.initialize(engine);
		const viewManager = engine.getViewManager();
		viewManager.setViewScaleMode(ViewScaleMode.none);
	}

	//==============================================================================
	// 출력.
	//==============================================================================
	/**
	 * @param { Graphic } graphic
	 */
	draw(graphic) {
		super.draw(graphic);
		const drawEvent = this.getDrawEvent();
		if (drawEvent !== null) {
			drawEvent(graphic);
		}
	}

	//==============================================================================
	// 출력 설정.
	//==============================================================================
	/**
	 * @param { function(Graphic): void } callback
	 */
	setDrawEvent(callback) {
		this.#drawEvent = callback;
	}

	//==============================================================================
	// 출력 반환.
	//==============================================================================
	/**
	 * @returns { function(Graphic): void }
	 */
	getDrawEvent() {
		return this.#drawEvent;
	}
}


//==============================================================================
// 비주얼 에디터.
//==============================================================================
class VisualEditor extends Object {
	//==============================================================================
	// 멤버 변수 목록.
	//==============================================================================
	/** @type { System.Object } */ #inspector;
	/** @type { Engine } */ #engine;
	/** @type { GameView } */ #gameView;
	/** @type { Function } */ #scripting;
	/** @type { Proxy } */ #properties;
	/** @type { HTMLElement } */ #editor;
	/** @type { HTMLElement} */ #consolePane;
	/** @type { HTMLElement } */ #inspectorPropsContainer;
	/** @type { HTMLElement } */ #statusBarPane;
	/** @type { HTMLElement } */ #statusBarLabel;
	/** @type { Array } */ #particles;
	/** @type { boolean } */ #isPlaying;
	/** @type { HTMLElement } */ #consoleSelectedItem;

	//==============================================================================
	// 생성.
	//==============================================================================
	constructor() {
		super();
		this.#inspector = { };
		this.#engine = null;
		this.#gameView = null;
		this.#scripting = null;
		this.#properties = null;
		this.#editor = null;
		this.#consolePane = null;
		this.#inspectorPropsContainer = null;
		this.#statusBarPane = null;
		this.#statusBarLabel = null;
		this.#particles = [];
		this.#isPlaying = true;
		this.#consoleSelectedItem = null;
	}

	//==============================================================================
	// 초기화.
	//==============================================================================
	initialize() {
		const styleElement = System.document.createElement('style');
		styleElement.innerHTML = `
			::-webkit-scrollbar { width: 10px; height: 10px; }
			::-webkit-scrollbar-track { background: ${PaneTheme.color.background}; }
			::-webkit-scrollbar-thumb { background: #424242; }
			::-webkit-scrollbar-thumb:hover { background: #4f4f4f; }
			::-webkit-scrollbar-corner { background: ${PaneTheme.color.background}; }
		`;
		System.document.head.appendChild(styleElement);


		// 1. 레이아웃 조립
		const rootPane = new Pane({ direction: 'vertical' });

		// --- 툴바 영역 ---
		const toolbarPane = new Pane({ size: 50, isResizable: false, resizableEdges: { bottom: false } });
		const toolbarDiv = PaneStyle.create('div', 'toolbar', { style: { justifyContent: 'space-between', padding: '0 15px' } });

		const leftSpacer = PaneStyle.create('div', '', { style: { position: 'relative', flex: '1' } });
		const centerBtnGroup = PaneStyle.create('div', '', { style: { position: 'relative', display: 'flex', gap: '10px', width: 'auto', alignItems: 'center', justifyContent: 'center' } });
		const playButton = PaneStyle.create('button', 'button', { id: 'btn-play', text: 'Play', accent: true });
		const pauseButton = PaneStyle.create('button', 'button', { id: 'btn-pause', text: 'Pause' });
		const stopButton = PaneStyle.create('button', 'button', { id: 'btn-stop', text: 'Stop' });
		centerBtnGroup.append(playButton, pauseButton, stopButton);

		const rightBtnGroup = PaneStyle.create('div', '', { style: { position: 'relative', display: 'flex', gap: '10px', flex: '1', alignItems: 'center', justifyContent: 'flex-end' } });
		const resetLayoutButton = PaneStyle.create('button', 'button', { id: 'btn-reset-layout', text: 'Reset Layout', warning: true });
		rightBtnGroup.append(resetLayoutButton);
		toolbarDiv.append(leftSpacer, centerBtnGroup, rightBtnGroup);
		toolbarPane.getContainer().appendChild(toolbarDiv);

		// --- 메인 편집 영역 (가로) ---
		const mainEditorPane = new Pane({ direction: 'horizontal', size: 'flex' });

		// [왼쪽 영역] 탐색기 + 하이어라키
		const leftSidePane = new Pane({ direction: 'vertical', size: 250, minSize: 150 });

		// 탐색기 (Explorer)
		const explorerPane = new Pane({ size: '50%', minSize: 100 });
		const explorerDiv = PaneStyle.create('div', 'panel', { style: { display: 'flex', flexDirection: 'column' } });
		explorerDiv.append(PaneStyle.create('div', 'label', { text: 'EXPLORER', style: { fontSize: '11px', color: '#888', marginBottom: '15px', borderBottom: `1px solid ${PaneTheme.color.border}`, paddingBottom: '5px' } }));
		const explorerTree = PaneStyle.create('div', '', { style: { flex: '1', overflowY: 'auto', position: 'relative' } });
		let explorerSelectedRow = null;
		const createTreeItem = (text, isFolder = false) => {
			const wrapper = document.createElement('div');
			wrapper.dataset.type = 'tree-item';
			wrapper.dataset.label = text;

			const row = document.createElement('div');
			row.style.padding = '4px 8px';
			row.style.cursor = 'pointer';
			row.style.fontSize = '13px';
			row.style.display = 'flex';
			row.style.alignItems = 'center';
			row.style.gap = '4px';
			wrapper.appendChild(row);

			const foldArrow = document.createElement('span');
			foldArrow.style.fontSize = '9px';
			foldArrow.style.color = '#888';
			foldArrow.style.width = '12px';
			foldArrow.style.flexShrink = '0';
			foldArrow.style.display = 'inline-block';
			foldArrow.style.userSelect = 'none';
			row.appendChild(foldArrow);

			const iconSpan = document.createElement('span');
			iconSpan.style.color = isFolder ? '#dcb67a' : '#519aba';
			iconSpan.innerText = isFolder ? '📁' : '📄';
			row.appendChild(iconSpan);

			const labelSpan = document.createElement('span');
			labelSpan.dataset.role = 'label';
			labelSpan.innerText = text;
			row.appendChild(labelSpan);

			if (isFolder) {
				foldArrow.innerText = '▶';
				foldArrow.style.cursor = 'pointer';
				const childContainer = document.createElement('div');
				childContainer.style.paddingLeft = '16px';
				childContainer.style.display = 'none';
				wrapper.appendChild(childContainer);
				wrapper._childContainer = childContainer;
				foldArrow.addEventListener('click', (mouseEvent) => {
					mouseEvent.stopPropagation();
					const isOpen = childContainer.style.display !== 'none';
					childContainer.style.display = isOpen ? 'none' : 'block';
					foldArrow.innerText = isOpen ? '▶' : '▼';
				});
			}

			row.addEventListener('mouseenter', () => {
				if (row !== explorerSelectedRow) {
					row.style.backgroundColor = '#2a2d2e';
				}
			});
			row.addEventListener('mouseleave', () => {
				if (row !== explorerSelectedRow) {
					row.style.backgroundColor = 'transparent';
				}
			});
			row.addEventListener('click', (mouseEvent) => {
				mouseEvent.stopPropagation();
				if (explorerSelectedRow) {
					explorerSelectedRow.style.backgroundColor = 'transparent';
				}
				explorerSelectedRow = row;
				row.style.backgroundColor = PaneTheme.color.accent;
				this.#statusBarLabel.innerText = `Explorer  ›  ${text}`;
			});

			return wrapper;
		};
		const assetsItem = createTreeItem('assets', true);
		assetsItem._childContainer.appendChild(createTreeItem('audio'));
		assetsItem._childContainer.appendChild(createTreeItem('images'));
		assetsItem._childContainer.appendChild(createTreeItem('fonts'));
		const srcItem = createTreeItem('src', true);
		srcItem._childContainer.appendChild(createTreeItem('utils.js'));
		srcItem._childContainer.appendChild(createTreeItem('config.js'));
		explorerTree.append(assetsItem, srcItem, createTreeItem('main.js'), createTreeItem('suika.js'), createTreeItem('Suika_Visual.json'));
		explorerTree.addEventListener('click', (mouseEvent) => {
			if (!mouseEvent.target.closest('[data-type="tree-item"]')) {
				if (explorerSelectedRow) {
					explorerSelectedRow.style.backgroundColor = 'transparent';
					explorerSelectedRow = null;
				}
				this.#statusBarLabel.innerText = 'No selection';
			}
		});
		explorerDiv.append(explorerTree);
		explorerPane.getContainer().appendChild(explorerDiv);

		// 하이어라키.
		const hierarchyPane = new Pane({ size: 'flex', minSize: 100 });
		const hierarchyDiv = PaneStyle.create('div', 'panel', { style: { display: 'flex', flexDirection: 'column', borderTop: '1px solid #333' } });
		hierarchyDiv.append(PaneStyle.create('div', 'label', { text: 'HIERARCHY', style: { fontSize: '11px', color: '#888', marginBottom: '15px', borderBottom: `1px solid ${PaneTheme.color.border}`, paddingBottom: '5px' } }));
		const hierarchyTree = PaneStyle.create('div', '', { style: { flex: '1', overflowY: 'auto', position: 'relative' } });

		let hierarchySelectedRow = null;
		const createHierarchyItem = (text) => {
			const wrapper = document.createElement('div');
			wrapper.dataset.type = 'hierarchy-item';
			wrapper.dataset.label = text;

			const row = document.createElement('div');
			row.style.padding = '3px 8px';
			row.style.cursor = 'pointer';
			row.style.fontSize = '13px';
			row.style.display = 'flex';
			row.style.alignItems = 'center';
			row.style.gap = '4px';
			wrapper.appendChild(row);

			const foldArrow = document.createElement('span');
			foldArrow.innerText = '▶';
			foldArrow.style.fontSize = '9px';
			foldArrow.style.color = '#888';
			foldArrow.style.width = '12px';
			foldArrow.style.flexShrink = '0';
			foldArrow.style.display = 'inline-block';
			foldArrow.style.userSelect = 'none';
			foldArrow.style.visibility = 'hidden';
			row.appendChild(foldArrow);

			const iconSpan = document.createElement('span');
			iconSpan.style.color = '#ccc';
			iconSpan.innerText = '◈';
			row.appendChild(iconSpan);

			const labelSpan = document.createElement('span');
			labelSpan.dataset.role = 'label';
			labelSpan.style.flex = '1';
			labelSpan.innerText = text;
			row.appendChild(labelSpan);

			const activeButton = document.createElement('button');
			activeButton.innerText = 'Active';
			activeButton.dataset.active = 'true';
			activeButton.style.fontSize = '10px';
			activeButton.style.padding = '1px 6px';
			activeButton.style.border = 'none';
			activeButton.style.borderRadius = '3px';
			activeButton.style.cursor = 'pointer';
			activeButton.style.backgroundColor = PaneTheme.color.success;
			activeButton.style.color = 'white';
			activeButton.style.fontFamily = PaneTheme.font.family;
			activeButton.style.flexShrink = '0';
			activeButton.addEventListener('click', (mouseEvent) => {
				mouseEvent.stopPropagation();
				const isActive = activeButton.dataset.active === 'true';
				activeButton.dataset.active = isActive ? 'false' : 'true';
				activeButton.innerText = isActive ? 'Inactive' : 'Active';
				activeButton.style.backgroundColor = isActive ? PaneTheme.color.resizer : PaneTheme.color.success;
				activeButton.style.color = isActive ? PaneTheme.color.textDim : 'white';
				iconSpan.style.color = isActive ? '#555' : '#ccc';
				labelSpan.style.color = isActive ? PaneTheme.color.textDim : '';
			});
			row.appendChild(activeButton);

			const childContainer = document.createElement('div');
			childContainer.style.paddingLeft = '16px';
			childContainer.style.display = 'block';
			wrapper.appendChild(childContainer);

			foldArrow.style.cursor = 'pointer';
			foldArrow.addEventListener('click', (mouseEvent) => {
				mouseEvent.stopPropagation();
				const isOpen = childContainer.style.display !== 'none';
				childContainer.style.display = isOpen ? 'none' : 'block';
				foldArrow.innerText = isOpen ? '▶' : '▼';
			});

			wrapper.addChild = (childItem) => {
				childContainer.appendChild(childItem);
				foldArrow.style.visibility = 'visible';
			};

			row.addEventListener('mouseenter', () => {
				if (row !== hierarchySelectedRow) {
					row.style.backgroundColor = '#2a2d2e';
				}
			});
			row.addEventListener('mouseleave', () => {
				if (row !== hierarchySelectedRow) {
					row.style.backgroundColor = 'transparent';
				}
			});
			row.addEventListener('click', (mouseEvent) => {
				mouseEvent.stopPropagation();
				if (hierarchySelectedRow) {
					hierarchySelectedRow.style.backgroundColor = 'transparent';
				}
				hierarchySelectedRow = row;
				row.style.backgroundColor = PaneTheme.color.accent;
				this.#statusBarLabel.innerText = `Hierarchy  ›  ${text}`;
			});

			return wrapper;
		};

		const visualRoot = createHierarchyItem('Visual Root');
		const bgLayer = createHierarchyItem('Background Layer');
		const particleEmitter = createHierarchyItem('Particle Emitter');
		const mainParticle = createHierarchyItem('Main Particle');
		const subParticle = createHierarchyItem('Sub Particle');
		const uiLayer = createHierarchyItem('UI Layer');
		particleEmitter.addChild(mainParticle);
		particleEmitter.addChild(subParticle);
		visualRoot.addChild(bgLayer);
		visualRoot.addChild(particleEmitter);
		visualRoot.addChild(uiLayer);
		hierarchyTree.appendChild(visualRoot);
		hierarchyTree.addEventListener('click', (mouseEvent) => {
			if (!mouseEvent.target.closest('[data-type="hierarchy-item"]')) {
				if (hierarchySelectedRow) {
					hierarchySelectedRow.style.backgroundColor = 'transparent';
					hierarchySelectedRow = null;
				}
				this.#statusBarLabel.innerText = 'No selection';
			}
		});
		hierarchyDiv.append(hierarchyTree);
		hierarchyPane.getContainer().appendChild(hierarchyDiv);

		leftSidePane.addPane(explorerPane);
		leftSidePane.addPane(hierarchyPane);

		// [중앙] 코드 에디터
		const codeEditorPane = new Pane({ size: 640, minSize: 150 });
		const codeEditorTitleBar = PaneStyle.create('div', '', { style: { height: '30px', backgroundColor: PaneTheme.color.panel, borderBottom: `1px solid ${PaneTheme.color.border}`, display: 'flex', alignItems: 'center', padding: '0 10px' } });
		const codeEditorTitleLabel = PaneStyle.create('span', '', { text: 'SCRIPT', style: { position: 'relative', width: 'auto', height: 'auto', fontSize: '11px', color: '#888', fontWeight: 'bold' } });
		codeEditorTitleBar.appendChild(codeEditorTitleLabel);
		this.#editor = PaneStyle.create('textarea', 'textarea', { id: 'code-editor', style: { top: '30px', height: 'calc(100% - 30px)' } });
		codeEditorPane.getContainer().appendChild(codeEditorTitleBar);
		codeEditorPane.getContainer().appendChild(this.#editor);

		// [중앙-우측] 게임 화면
		const gameCanvasPane = new Pane({ size: 'flex' });
		const gameCanvasTitleBar = PaneStyle.create('div', '', { style: { height: '30px', backgroundColor: PaneTheme.color.panel, borderBottom: `1px solid ${PaneTheme.color.border}`, display: 'flex', alignItems: 'center', padding: '0 10px' } });
		const gameCanvasTitleLabel = PaneStyle.create('span', '', { text: 'GAME VIEW', style: { position: 'relative', width: 'auto', height: 'auto', fontSize: '11px', color: '#888', fontWeight: 'bold' } });
		gameCanvasTitleBar.appendChild(gameCanvasTitleLabel);
		const canvasDiv = PaneStyle.create('div', '', { style: { top: '30px', height: 'calc(100% - 30px)', backgroundColor: '#000' } });
		const canvasElement = PaneStyle.create('canvas', '', { id: 'game-canvas' });
		canvasDiv.appendChild(canvasElement);
		gameCanvasPane.getContainer().appendChild(gameCanvasTitleBar);
		gameCanvasPane.getContainer().appendChild(canvasDiv);

		// [오른쪽] 인스펙터
		const inspectorSidePane = new Pane({ size: 350, minSize: 150 });
		const inspectorDiv = PaneStyle.create('div', 'panel', { style: { display: 'flex', flexDirection: 'column' } });
		inspectorDiv.append(PaneStyle.create('div', 'label', { text: 'INSPECTOR', style: { fontSize: '11px', color: '#888', marginBottom: '15px', borderBottom: '1px solid #444', paddingBottom: '5px' } }));
		this.#inspectorPropsContainer = PaneStyle.create('div', '', { id: 'inspector-props', style: { flex: '1', overflowY: 'auto', position: 'relative' } });
		const addPropRow = PaneStyle.create('div', '', { style: { display: 'flex', gap: '5px', marginTop: '15px', borderTop: '1px solid #444', paddingTop: '15px', position: 'relative', height: 'auto' } });
		const inpPropName = PaneStyle.create('input', 'input', { placeholder: 'Name', style: { flex: '1' } });
		const inpPropVal = PaneStyle.create('input', 'input', { placeholder: 'Value', style: { width: '60px' } });
		const btnAddProp = PaneStyle.create('button', 'button', { text: 'Add', accent: true, style: { padding: '4px 8px' } });
		addPropRow.append(inpPropName, inpPropVal, btnAddProp);
		inspectorDiv.append(this.#inspectorPropsContainer, addPropRow);
		inspectorSidePane.getContainer().appendChild(inspectorDiv);

		// --- 하단 콘솔 영역 ---
		const consoleBottomPane = new Pane({ size: 200, minSize: 50, resizableEdges: { top: true } });
		const consolePanelDiv = PaneStyle.create('div', 'panel', { style: { display: 'flex', flexDirection: 'column' } });
		consolePanelDiv.append(PaneStyle.create('div', 'label', { text: 'CONSOLE', style: { fontSize: '11px', color: '#888', marginBottom: '15px', borderBottom: `1px solid ${PaneTheme.color.border}`, paddingBottom: '5px' } }));
		this.#consolePane = PaneStyle.create('div', '', { id: 'console-pane', style: { position: 'relative', flex: '1', overflowY: 'auto', fontFamily: PaneTheme.font.mono, fontSize: '13px', color: PaneTheme.color.success } });
		consolePanelDiv.appendChild(this.#consolePane);
		consoleBottomPane.getContainer().appendChild(consolePanelDiv);

		// 컨텍스트 메뉴.
		const contextMenuElement = System.document.createElement('div');
		contextMenuElement.style.position = 'fixed';
		contextMenuElement.style.backgroundColor = '#3c3c3c';
		contextMenuElement.style.border = `1px solid ${PaneTheme.color.border}`;
		contextMenuElement.style.zIndex = '99999';
		contextMenuElement.style.padding = '4px 0';
		contextMenuElement.style.minWidth = '160px';
		contextMenuElement.style.boxShadow = '2px 4px 12px rgba(0,0,0,0.5)';
		contextMenuElement.style.display = 'none';
		contextMenuElement.style.fontFamily = PaneTheme.font.family;
		contextMenuElement.style.fontSize = '13px';

		const showContextMenu = (clientX, clientY, menuItems) => {
			contextMenuElement.innerHTML = '';
			for (const menuItemData of menuItems) {
				const menuItemElement = System.document.createElement('div');
				menuItemElement.innerText = menuItemData.label;
				menuItemElement.style.padding = '6px 16px';
				menuItemElement.style.cursor = 'pointer';
				menuItemElement.style.color = PaneTheme.color.text;
				menuItemElement.style.whiteSpace = 'nowrap';
				menuItemElement.addEventListener('mouseenter', () => {
					menuItemElement.style.backgroundColor = PaneTheme.color.accent;
					menuItemElement.style.color = 'white';
				});
				menuItemElement.addEventListener('mouseleave', () => {
					menuItemElement.style.backgroundColor = 'transparent';
					menuItemElement.style.color = PaneTheme.color.text;
				});
				menuItemElement.addEventListener('click', () => {
					menuItemData.action();
					contextMenuElement.style.display = 'none';
				});
				contextMenuElement.appendChild(menuItemElement);
			}
			contextMenuElement.style.display = 'block';
			contextMenuElement.style.left = `${clientX}px`;
			contextMenuElement.style.top = `${clientY}px`;
		};

		System.document.addEventListener('click', () => {
			contextMenuElement.style.display = 'none';
		});

		// 컨텍스트 타겟 탐색.
		const findContextTarget = (mouseEventTarget, dataType) => {
			let target = mouseEventTarget;
			while (target && target.dataset.type !== dataType) {
				target = target.parentElement;
			}
			return target || null;
		};

		// Explorer 컨텍스트 메뉴.
		let explorerContextTarget = null;
		explorerTree.addEventListener('contextmenu', (mouseEvent) => {
			mouseEvent.preventDefault();
			explorerContextTarget = findContextTarget(mouseEvent.target, 'tree-item');
			showContextMenu(mouseEvent.clientX, mouseEvent.clientY, [
				{
					label: 'Add',
					action: () => {
						const newName = System.prompt('Item name:', '');
						if (newName) {
							explorerTree.appendChild(createTreeItem(newName));
						}
					}
				},
				{
					label: 'Rename',
					action: () => {
						if (!explorerContextTarget) {
							return;
						}
						const currentName = explorerContextTarget.dataset.label;
						const newName = System.prompt('New name:', currentName);
						if (newName) {
							explorerContextTarget.querySelector('[data-role="label"]').innerText = newName;
							explorerContextTarget.dataset.label = newName;
						}
					}
				},
				{
					label: 'Remove',
					action: () => {
						if (explorerContextTarget) {
							explorerContextTarget.remove();
						}
					}
				}
			]);
		});

		// Hierarchy 컨텍스트 메뉴.
		let hierarchyContextTarget = null;
		hierarchyTree.addEventListener('contextmenu', (mouseEvent) => {
			mouseEvent.preventDefault();
			hierarchyContextTarget = findContextTarget(mouseEvent.target, 'hierarchy-item');
			showContextMenu(mouseEvent.clientX, mouseEvent.clientY, [
				{
					label: 'Add',
					action: () => {
						const newName = System.prompt('Item name:', '');
						if (newName) {
							hierarchyTree.appendChild(createHierarchyItem(newName));
						}
					}
				},
				{
					label: 'Rename',
					action: () => {
						if (!hierarchyContextTarget) {
							return;
						}
						const currentName = hierarchyContextTarget.dataset.label;
						const newName = System.prompt('New name:', currentName);
						if (newName) {
							hierarchyContextTarget.querySelector('[data-role="label"]').innerText = newName;
							hierarchyContextTarget.dataset.label = newName;
						}
					}
				},
				{
					label: 'Remove',
					action: () => {
						if (hierarchyContextTarget) {
							hierarchyContextTarget.remove();
						}
					}
				}
			]);
		});

		// Console 빈공간 선택해제.
		this.#consolePane.addEventListener('click', (mouseEvent) => {
			if (mouseEvent.target === this.#consolePane) {
				if (this.#consoleSelectedItem) {
					this.#consoleSelectedItem.style.backgroundColor = 'transparent';
					this.#consoleSelectedItem = null;
				}
				this.#statusBarLabel.innerText = 'No selection';
			}
		});

		// Console 컨텍스트 메뉴.
		this.#consolePane.addEventListener('contextmenu', (mouseEvent) => {
			mouseEvent.preventDefault();
			showContextMenu(mouseEvent.clientX, mouseEvent.clientY, [
				{
					label: 'Clear All',
					action: () => {
						this.#consolePane.innerHTML = '';
					}
				}
			]);
		});

		// --- 스테이터스바 영역 ---
		const statusBarBottomPane = new Pane({ size: 25, minSize: 25, isResizable: false, resizableEdges: { top: false } });
		this.#statusBarPane = PaneStyle.create('div', '', {
			id: 'status-bar',
			style: {
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'space-between',
				padding: '0 12px',
				backgroundColor: PaneTheme.color.accent,
				color: 'white',
				fontFamily: PaneTheme.font.family,
				fontSize: '12px',
				userSelect: 'none',
				overflow: 'hidden'
			}
		});
		this.#statusBarLabel = PaneStyle.create('span', '', { style: { position: 'relative', width: 'auto', height: 'auto', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } });
		this.#statusBarLabel.innerText = 'No selection';
		this.#statusBarPane.appendChild(this.#statusBarLabel);
		statusBarBottomPane.getContainer().appendChild(this.#statusBarPane);

		// 조립
		mainEditorPane.addPane(leftSidePane);
		mainEditorPane.addPane(codeEditorPane);
		mainEditorPane.addPane(gameCanvasPane);
		mainEditorPane.addPane(inspectorSidePane);
		rootPane.addPane(toolbarPane);
		rootPane.addPane(mainEditorPane);
		rootPane.addPane(consoleBottomPane);
		rootPane.addPane(statusBarBottomPane);

		rootPane.setCallback(() => {
			if (this.#engine) {
				// const gameCanvasPaneContainer = gameCanvasPane.getContainer();
				// canvasElement.style.width = gameCanvasPaneContainer.style.width;
				// canvasElement.style.height = gameCanvasPaneContainer.style.height;
				// const clientRect = canvasElement.getBoundingClientRect();
				// console.log(clientRect);
				const graphic = this.#engine.getGraphic();
				this.#engine.resize();
				this.#gameView.draw(graphic);
			}
		});
		System.document.body.innerHTML = '';
		rootPane.attachTo(System.document.body);
		System.document.body.appendChild(contextMenuElement);

		// 엔진 설정.
		const engineConfiguration = new EngineConfiguration();
		engineConfiguration.referenceResolutionSize = Vector2.create(1280, 800);
		engineConfiguration.canvasId = "game-canvas";
		engineConfiguration.autoResizeOnWindowResize = false;
		engineConfiguration.useStatistics = true;
		this.#engine = new Engine(engineConfiguration);
		this.#gameView = new GameView();
		this.#engine.run(this.#gameView);

		// 이벤트 연동
		resetLayoutButton.addEventListener('click', () => {
			rootPane.resetLayout();
			rootPane.refresh();
			if (this.#engine) {
				// const gameCanvasPaneContainer = gameCanvasPane.getContainer();
				// canvasElement.style.width = gameCanvasPaneContainer.style.width;
				// canvasElement.style.height = gameCanvasPaneContainer.style.height;
				// const clientRect = canvasElement.getBoundingClientRect();
				// console.log(clientRect);
				const graphic = this.#engine.getGraphic();
				this.#engine.resize();
				this.#gameView.draw(graphic);
			}
		});
		btnAddProp.addEventListener('click', () => {
			const name = inpPropName.value.trim();
			const valRaw = inpPropVal.value;
			const trimmed = valRaw.trim();
			let val = valRaw;
			if (trimmed === 'true') {
				val = true;
			}
			else if (trimmed === 'false') {
				val = false;
			}
			else if (trimmed !== '' && !isNaN(Number(trimmed))) {
				val = Number(trimmed);
			}
			if (name && !this.#properties.hasOwnProperty(name)) {
				this.addProperty(name, val);
				inpPropName.value = '';
				inpPropVal.value = '';
			}
		});

		this.setupGlobalEvents();
		this.setupDataBinding();
		this.addProperty('speed', 1.0);
		this.addProperty('gravity', 0.1);

		this.#editor.addEventListener('input', () => {
			this.compileCode();
		});
		const updateButtonState = (activeId) => {
			[playButton, pauseButton, stopButton].forEach(btn => {
				const isSelected = btn.id === activeId;
				btn.style.backgroundColor = isSelected ? PaneTheme.color.accent : PaneTheme.color.resizer;
				btn.style.color = isSelected ? 'white' : PaneTheme.color.textDim;
			});
		};
		playButton.addEventListener('click', () => {
			this.compileCode();
			this.initParticles();
			this.#isPlaying = true;
			updateButtonState('btn-play');
			this.#gameView.setDrawEvent(this.drawOnPlayState.bind(this));
			this.printConsole('Playback started.');
		});
		pauseButton.addEventListener('click', () => {
			this.#isPlaying = false;
			updateButtonState('btn-pause');
			this.printConsole('Playback paused.');
		});
		stopButton.addEventListener('click', () => {
			this.#isPlaying = false;
			this.initParticles();
			updateButtonState('btn-stop');
			this.#gameView.setDrawEvent(this.drawOnStopState.bind(this));
			this.printConsole('Playback stopped.');
		});
		this.updateButtonState = updateButtonState;
	}

	//==============================================================================
	// 이벤트 설정.
	//==============================================================================
	setupGlobalEvents() {
		System.window.addEventListener('keydown', (keyboardEvent) => {
			if (keyboardEvent.ctrlKey && ['=', '-', '+', '0'].includes(keyboardEvent.key)) {
				keyboardEvent.preventDefault();
			}
		});
		System.window.addEventListener('wheel', (wheelEvent) => {
			if (wheelEvent.ctrlKey) {
				wheelEvent.preventDefault();
			}
		}, { passive: false });
	}

	//==============================================================================
	// 프로퍼티 데이터 초기화.
	//==============================================================================
	setupDataBinding() {
		const self = this;
		this.#properties = new Proxy({}, {
			set: function(target, key, value) {
				if (target[key] !== value) {
					target[key] = value;
					const ui = self.getInspectorUI();
					if (ui[key] && document.activeElement !== ui[key]) {
						ui[key].value = value;
					}
				}
				return true;
			}
		});
	}

	//==============================================================================
	// 인스펙터 프로퍼티 추가.
	//==============================================================================
	addProperty(name, value) {
		this.#properties[name] = value;
		const container = this.#inspectorPropsContainer;
		if (!container) {
			return;
		}
		const row = PaneStyle.create('div', '', { id: `prop-row-${name}`, style: { position: 'relative', height: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' } });
		const label = PaneStyle.create('span', 'label', { text: name });
		const input = PaneStyle.create('input', 'input', { type: 'text', style: { width: '80px', outline: 'none' } });
		input.value = value;
		input.addEventListener('input', (event) => {
			const valRaw = event.target.value;
			const trimmed = valRaw.trim();
			let parsed = valRaw;
			if (trimmed === 'true') {
				parsed = true;
			}
			else if (trimmed === 'false') {
				parsed = false;
			}
			else if (trimmed !== '' && !isNaN(Number(trimmed))) {
				parsed = Number(trimmed);
			}
			this.#properties[name] = parsed;
		});
		const btnRemove = PaneStyle.create('button', 'button', { text: 'X', style: { padding: '2px 6px', background: PaneTheme.color.error, marginLeft: '5px' } });
		btnRemove.addEventListener('click', () => {
			this.removeProperty(name);
		});
		const inputContainer = PaneStyle.create('div', '', { style: { position: 'relative', width: 'auto', height: 'auto', display: 'flex', alignItems: 'center' } });
		inputContainer.append(input, btnRemove);
		row.append(label, inputContainer);
		container.appendChild(row);

		// 추가.
		this.#inspector[name] = input;
	}

	//==============================================================================
	// 인스펙터 프로퍼티 제거.
	//==============================================================================
	removeProperty(name) {
		const row = document.getElementById(`prop-row-${name}`);
		if (row) {
			row.remove();
		}
		delete this.#properties[name];
		delete this.#inspector[name];
	}

	//==============================================================================
	// 파티클 목록 초기화.
	//==============================================================================
	initParticles() {
		const viewManager = this.#engine.getViewManager();
		const canvasNativeSize = viewManager.getCanvasNativeSize();
		this.#particles = [];
		for (let i = 0; i < 200; ++i) {
			this.#particles.push({
				x: canvasNativeSize.x / 2,
				y: canvasNativeSize.y / 2,
				vx: (Math.random() - 0.5) * 10,
				vy: (Math.random() - 0.5) * 10,
				color: `hsl(${Math.random() * 360}, 100%, 60%)`
			});
		}
	}

	//==============================================================================
	// 콘솔 출력.
	//==============================================================================
	printConsole(message, isError = false) {
		const now = new Date();
		const hours = String(now.getHours()).padStart(2, '0');
		const minutes = String(now.getMinutes()).padStart(2, '0');
		const seconds = String(now.getSeconds()).padStart(2, '0');
		const timestamp = `[${hours}:${minutes}:${seconds}]`;
		const textColor = isError ? PaneTheme.color.error : PaneTheme.color.success;
		const line = document.createElement('div');
		line.style.color = textColor;
		line.style.marginBottom = '2px';
		line.style.padding = '2px 6px';
		line.style.whiteSpace = 'pre-wrap';
		line.style.cursor = 'pointer';
		line.style.borderRadius = '2px';
		line.innerText = `${timestamp} ${message}`;
		line.addEventListener('mouseenter', () => {
			if (line !== this.#consoleSelectedItem) {
				line.style.backgroundColor = '#2a2d2e';
			}
		});
		line.addEventListener('mouseleave', () => {
			if (line !== this.#consoleSelectedItem) {
				line.style.backgroundColor = 'transparent';
			}
		});
		line.addEventListener('click', (mouseEvent) => {
			mouseEvent.stopPropagation();
			if (this.#consoleSelectedItem) {
				this.#consoleSelectedItem.style.backgroundColor = 'transparent';
			}
			this.#consoleSelectedItem = line;
			line.style.backgroundColor = PaneTheme.color.accent;
			line.style.color = 'white';
			this.#statusBarLabel.innerText = `Console  ›  ${timestamp} ${message}`;
		});
		this.#consolePane.appendChild(line);
		this.#consolePane.scrollTop = this.#consolePane.scrollHeight;
	}

	//==============================================================================
	// 코드 확인.
	//==============================================================================
	compileCode() {
		try {
			const buildFunction = new Function(this.#editor.value + '\nreturn tick;');
			this.#scripting = buildFunction();
			if (typeof this.#scripting !== 'function') {
				throw new Error('tick function is not defined.');
			}
			this.printConsole('Compiled successfully.');
		}
		catch (error) {
			this.printConsole('Compile error:\n' + error.message, true);
		}
	}

	//==============================================================================
	// 재생 상태 출력.
	//==============================================================================
	/**
	 * @param { Graphic } graphic
	 */
	drawOnPlayState(graphic) {
		const canvasRenderingContext = graphic.getCanvasRenderingContext();
		const viewManager = this.#engine.getViewManager();
		const canvasNativeSize = viewManager.getCanvasNativeSize();
		viewManager.applyCanvasNativeRect(canvasRenderingContext);
		graphic.setFillColor(Colors.darkVanilla);
		graphic.drawRect(Rect.create(0, 0, canvasNativeSize.x, canvasNativeSize.y));
		const gridSize = 50, subGridSize = 10;
		canvasRenderingContext.beginPath();
		canvasRenderingContext.strokeStyle = 'rgba(0, 0, 0, 0.05)';
		canvasRenderingContext.lineWidth = 0.5;
		for (let x = 0; x <= canvasNativeSize.x; x += subGridSize) {
			canvasRenderingContext.moveTo(x, 0);
			canvasRenderingContext.lineTo(x, canvasNativeSize.y);
		}
		for (let y = 0; y <= canvasNativeSize.y; y += subGridSize) {
			canvasRenderingContext.moveTo(0, y);
			canvasRenderingContext.lineTo(canvasNativeSize.x, y);
		}
		canvasRenderingContext.stroke();
		canvasRenderingContext.beginPath();
		canvasRenderingContext.strokeStyle = 'rgba(0, 0, 0, 0.08)';
		canvasRenderingContext.lineWidth = 1;
		for (let x = 0; x <= canvasNativeSize.x; x += gridSize) {
			canvasRenderingContext.moveTo(x, 0);
			canvasRenderingContext.lineTo(x, canvasNativeSize.y);
		}
		for (let y = 0; y <= canvasNativeSize.y; y += gridSize) {
			canvasRenderingContext.moveTo(0, y);
			canvasRenderingContext.lineTo(canvasNativeSize.x, y);
		}
		canvasRenderingContext.stroke();
		for (const particle of this.#particles) {
			if (this.#isPlaying && this.#scripting !== null) {
				try {
					this.#scripting(particle, this.#properties, canvasNativeSize);
				}
				catch (error) {
					this.printConsole('Runtime error:\n' + error.message, true);
					this.#isPlaying = false;
				}
			}
			graphic.setFillColor(particle.color);
			canvasRenderingContext.beginPath();
			canvasRenderingContext.arc(particle.x, particle.y, 3, 0, Math.PI * 2);
			canvasRenderingContext.fill();
		}
	}

	//==============================================================================
	// 정지 상태 출력.
	//==============================================================================
	/**
	 * @param { Graphic } graphic
	 */
	drawOnStopState(graphic) {
		const canvasRenderingContext = graphic.getCanvasRenderingContext();
		const viewManager = this.#engine.getViewManager();
		const canvasNativeSize = viewManager.getCanvasNativeSize();
		viewManager.applyCanvasNativeRect(canvasRenderingContext);
		graphic.setFillColor(Colors.darkVanilla);
		graphic.drawRect(Rect.create(0, 0, canvasNativeSize.x, canvasNativeSize.y));
		const gridSize = 50, subGridSize = 10;
		canvasRenderingContext.beginPath();
		canvasRenderingContext.strokeStyle = 'rgba(0, 0, 0, 0.05)';
		canvasRenderingContext.lineWidth = 0.5;
		for (let x = 0; x <= canvasNativeSize.x; x += subGridSize) {
			canvasRenderingContext.moveTo(x, 0);
			canvasRenderingContext.lineTo(x, canvasNativeSize.y);
		}
		for (let y = 0; y <= canvasNativeSize.y; y += subGridSize) {
			canvasRenderingContext.moveTo(0, y);
			canvasRenderingContext.lineTo(canvasNativeSize.x, y);
		}
		canvasRenderingContext.stroke();
		canvasRenderingContext.beginPath();
		canvasRenderingContext.strokeStyle = 'rgba(0, 0, 0, 0.08)';
		canvasRenderingContext.lineWidth = 1;
		for (let x = 0; x <= canvasNativeSize.x; x += gridSize) {
			canvasRenderingContext.moveTo(x, 0);
			canvasRenderingContext.lineTo(x, canvasNativeSize.y);
		}
		for (let y = 0; y <= canvasNativeSize.y; y += gridSize) {
			canvasRenderingContext.moveTo(0, y);
			canvasRenderingContext.lineTo(canvasNativeSize.x, y);
		}
		canvasRenderingContext.stroke();
	}

	//==============================================================================
	// 실행.
	//==============================================================================
	run() {
		this.initialize();
		this.#editor.value = `
function tick(particle, properties, canvasSize) {
	particle.x += particle.vx * properties.speed;
	particle.y += particle.vy * properties.speed;
	particle.vy += properties.gravity;
	if (particle.x < 0 || particle.x > canvasSize.x) {
		particle.vx *= -1; particle.x = particle.x < 0 ? 0 : canvasSize.x;
	}
	if (particle.y < 0 || particle.y > canvasSize.y) {
		particle.vy *= -1;
		particle.y = particle.y < 0 ? 0 : canvasSize.y;
	}
}`;
		this.initParticles();
		this.compileCode();
		this.#gameView.setDrawEvent(this.drawOnStopState.bind(this));
		this.updateButtonState('btn-stop');
	}

	//==============================================================================
	// 인스펙터 목록 반환.
	//==============================================================================
	getInspectorUI() {
		return this.#inspector;
	}
}

// 실행.
var visualEditor = new VisualEditor();
visualEditor.run();
