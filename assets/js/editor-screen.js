( function() {
	'use strict';

	var config = window.artEditorScreenConfig || {};
	var i18n = config.i18n || {};

	var editorState = {
		blocks: Array.isArray( config.htmlBlocks ) ? config.htmlBlocks.slice() : [],
		selectedId: null,
		renamingBlockId: null,
		selectedElementLocator: null,
	};

	var structureDragState = {
		draggedId: null,
		suppressClick: false,
	};

	var historyState = {
		past: [],
		future: [],
		recording: true,
		codeChangeTimer: null,
		codeChangePending: false,
	};

	var styleHistoryState = {
		changePending: false,
		changeTimer: null,
	};

	var undoButton = document.getElementById( 'art-editor-undo-button' );
	var redoButton = document.getElementById( 'art-editor-redo-button' );

	var codeInput = document.getElementById( 'art-editor-code-input' );
	var previewFrame = document.getElementById( 'art-editor-preview-frame' );
	var pagePreviewFrame = document.getElementById( 'art-editor-page-preview-frame' );
	var previewStatusBanner = document.getElementById( 'art-editor-preview-status' );
	var previewStatusText = document.getElementById( 'art-editor-preview-status-text' );
	var previewStatusRetry = document.getElementById( 'art-editor-preview-status-retry' );
	var structureList = document.getElementById( 'art-editor-structure-list' );
	var structureEmpty = document.getElementById( 'art-editor-structure-empty' );
	var createHtmlButton = document.getElementById( 'art-editor-create-html' );
	var createAnchorButton = document.getElementById( 'art-editor-create-anchor' );
	var anchorIdInput = document.getElementById( 'art-editor-anchor-id' );
	var codeEditorInstance = null;

	var visualEditCommitState = {
		resolve: null,
		timer: null,
	};

	var codeElementHighlightMark = null;

	var elementEditorController = null;
	var activateCanvasTab = null;
	var pendingElementSelectionPath = null;
	var pendingElementSelectionGeneration = 0;
	var previewRestoreGeneration = 0;
	var previewRequestGeneration = 0;
	var pagePreviewRequestGeneration = 0;
	var stylePreviewRefreshTimer = null;
	var suppressNextEditPreviewRefresh = false;
	var suppressNextViewPreviewRefresh = false;
	var suppressCodeChangeEvents = false;
	var STYLE_INPUT_DEBOUNCE_MS = 120;
	var STYLE_PREVIEW_REFRESH_MS = 450;

	var previewLoadingUi = {
		edit: {
			stage: null,
			overlay: null,
		},
		view: {
			stage: null,
			overlay: null,
		},
	};

	var previewLoadingWait = {
		edit: 0,
		view: 0,
	};

	var editorUiState = {
		deviceMode: 'desktop',
		mobileFrameWidth: 375,
	};

	var devicePreviewLimits = {
		mobileWidthDefault: 375,
		mobileWidthMin: 320,
		mobileWidthMax: 520,
	};

	function clampMobilePreviewWidth( width ) {
		return Math.min(
			devicePreviewLimits.mobileWidthMax,
			Math.max( devicePreviewLimits.mobileWidthMin, Math.round( width ) )
		);
	}

	function getPreviewViewportMetaContent() {
		if ( 'mobile' === editorUiState.deviceMode ) {
			return 'width=' + clampMobilePreviewWidth( editorUiState.mobileFrameWidth ) + ', initial-scale=1';
		}

		return 'width=device-width, initial-scale=1';
	}

	function applyPreviewViewportToDocument( documentHtml ) {
		var html = String( documentHtml || '' );
		var viewportMeta = '<meta name="viewport" content="' + getPreviewViewportMetaContent() + '">';

		if ( /\<meta\s+name=["']viewport["']/i.test( html ) ) {
			return html.replace(
				/\<meta\s+name=["']viewport["']\s+content=["'][^"']*["']\s*\/?>/i,
				viewportMeta
			);
		}

		return html;
	}

	function refreshPreviewForDeviceMode() {
		var activeTab = getActiveCanvasTabName();
		var loadingOptions = { showLoading: true };

		if ( 'edit' === activeTab ) {
			updatePreview( loadingOptions );
			return;
		}

		if ( 'view' === activeTab ) {
			updatePagePreview( loadingOptions );
		}
	}

	function initPreviewLoadingUi() {
		previewLoadingUi.edit.stage = document.getElementById( 'art-editor-edit-preview-stage' );
		previewLoadingUi.edit.overlay = document.getElementById( 'art-editor-edit-preview-loading' );
		previewLoadingUi.view.stage = document.getElementById( 'art-editor-view-preview-stage' );
		previewLoadingUi.view.overlay = document.getElementById( 'art-editor-view-preview-loading' );
	}

	function setPreviewLoadingVisible( target, isVisible ) {
		var ui = previewLoadingUi[ target ];

		if ( ! ui || ! ui.stage || ! ui.overlay ) {
			return;
		}

		ui.stage.classList.toggle( 'is-preview-loading', isVisible );
		ui.overlay.hidden = ! isVisible;
		ui.overlay.setAttribute( 'aria-hidden', isVisible ? 'false' : 'true' );

		if ( isVisible ) {
			ui.stage.setAttribute( 'aria-busy', 'true' );
		} else {
			ui.stage.removeAttribute( 'aria-busy' );
		}
	}

	function beginPreviewLoading( target, generation ) {
		previewLoadingWait[ target ] = generation;
		setPreviewLoadingVisible( target, true );
	}

	function finishPreviewLoading( target, generation ) {
		if ( generation !== previewLoadingWait[ target ] ) {
			return;
		}

		previewLoadingWait[ target ] = 0;
		setPreviewLoadingVisible( target, false );
	}

	function assignPreviewFrameDocument( target, frame, html, generation ) {
		var loadHandler;
		var timeoutId;

		function cleanup() {
			if ( loadHandler && frame ) {
				frame.removeEventListener( 'load', loadHandler );
			}

			loadHandler = null;

			if ( timeoutId ) {
				window.clearTimeout( timeoutId );
				timeoutId = null;
			}
		}

		if ( ! frame || generation !== previewLoadingWait[ target ] ) {
			if ( frame ) {
				frame.srcdoc = html;
			}

			return;
		}

		loadHandler = function() {
			cleanup();
			finishPreviewLoading( target, generation );
		};

		frame.addEventListener( 'load', loadHandler );
		timeoutId = window.setTimeout( function() {
			cleanup();
			finishPreviewLoading( target, generation );
		}, 20000 );
		frame.srcdoc = html;
	}

	var persistenceState = {
		savedBlocksSnapshot: '',
		savedSettingsSnapshot: '',
		saveInFlight: 0,
	};

	var unsavedIndicatorTimer = null;

	var previewHealth = {
		edit: '',
		view: '',
	};

	function isAnchorBlock( block ) {
		return !! ( block && 'anchor' === block.type );
	}

	function normalizeAnchorId( value ) {
		var normalized = String( value || '' ).trim().toLowerCase();

		if ( ! normalized ) {
			return '';
		}

		normalized = normalized.replace( /^#+/, '' );
		normalized = normalized.replace( /[^a-z0-9\-_]+/g, '-' );
		normalized = normalized.replace( /-+/g, '-' );
		normalized = normalized.replace( /^-+|-+$/g, '' );

		return normalized;
	}

	function getAnchorIdFromBlock( block ) {
		if ( ! block ) {
			return '';
		}

		return normalizeAnchorId( block.anchorId || parseAnchorIdFromContent( block.content || '' ) );
	}

	function buildAnchorBlockContent( anchorId ) {
		if ( ! anchorId ) {
			return '<div class="art-editor-anchor" aria-hidden="true"></div>';
		}

		return '<div id="' + anchorId + '" class="art-editor-anchor" aria-hidden="true"></div>';
	}

	function parseAnchorIdFromContent( content ) {
		var doc;
		var target;

		if ( ! content || ! window.DOMParser ) {
			return '';
		}

		try {
			doc = new window.DOMParser().parseFromString( content, 'text/html' );
			target = doc.querySelector( 'div.art-editor-anchor[id]' );

			if ( ! target || ! target.id ) {
				return '';
			}

			return normalizeAnchorId( target.id );
		} catch ( error ) {
			return '';
		}
	}

	function getAnchorBlockTitle( anchorId ) {
		if ( ! anchorId ) {
			return i18n.emptyAnchor || 'Пустой якорь';
		}

		return ( i18n.anchorBlock || 'Якорь' ) + ': ' + anchorId;
	}

	function normalizeLoadedBlock( block, index ) {
		block.type = block.type || 'html';

		if ( 'anchor' === block.type ) {
			block.anchorId = normalizeAnchorId( block.anchorId || parseAnchorIdFromContent( block.content || '' ) );
			block.content = buildAnchorBlockContent( block.anchorId );
			block.title = getAnchorBlockTitle( block.anchorId );
			block.titleLocked = true;
			return block;
		}

		block.type = 'html';
		block.titleLocked = !! block.titleLocked;
		block.title = block.title || getBlockTitle( block.content, index );

		return block;
	}

	function mapBlockForSave( block ) {
		var payload = {
			content: block.content || '',
			title: block.titleLocked ? ( block.title || '' ) : '',
		};

		if ( isAnchorBlock( block ) ) {
			payload.type = 'anchor';
			payload.anchorId = block.anchorId || '';
		}

		return payload;
	}

	function mapBlockForSnapshot( block ) {
		var snapshot = {
			id: block.id,
			title: block.title,
			titleLocked: !! block.titleLocked,
			content: block.content || '',
			type: block.type || 'html',
		};

		if ( isAnchorBlock( block ) ) {
			snapshot.anchorId = block.anchorId || '';
		}

		return snapshot;
	}

	function getPageSettingsFromDom() {
		var titleInput = document.getElementById( 'art-editor-page-title' );
		var slugInput = document.getElementById( 'art-editor-page-slug' );
		var statusInput = document.getElementById( 'art-editor-page-status' );
		var layoutInput = document.getElementById( 'art-editor-layout-mode' );
		var styleInput = document.getElementById( 'art-editor-style-mode' );

		return {
			title: titleInput ? titleInput.value : ( config.postTitle || '' ),
			slug: slugInput ? slugInput.value : ( config.postSlug || '' ),
			status: statusInput ? statusInput.value : ( config.postStatus || 'draft' ),
			layoutMode: layoutInput ? layoutInput.value : ( config.layoutMode || 'canvas' ),
			styleMode: styleInput ? styleInput.value : ( config.styleMode || 'editor' ),
		};
	}

	function isPageSettingsPanelOpen() {
		var settingsPanel = document.getElementById( 'art-editor-settings-panel' );

		return !! ( settingsPanel && ! settingsPanel.hidden );
	}

	function isPublishedLikeStatus( status ) {
		return 'publish' === status || 'private' === status;
	}

	function shouldShowPublishButton() {
		return !! config.canPublish && ! isPublishedLikeStatus( config.postStatus || 'draft' );
	}

	function updatePublishButtonVisibility() {
		var publishButton = document.getElementById( 'art-editor-publish-button' );
		var saveButton = document.getElementById( 'art-editor-save-button' );
		var showPublishButton = shouldShowPublishButton();

		if ( publishButton ) {
			publishButton.hidden = ! showPublishButton;
		}

		if ( saveButton ) {
			saveButton.classList.toggle( 'art-editor-screen__save-button--secondary', showPublishButton );
		}

		updateSaveStateUi();
	}

	function syncStatusInputFromConfig() {
		var statusInput = document.getElementById( 'art-editor-page-status' );

		if ( statusInput && config.postStatus ) {
			statusInput.value = config.postStatus;
		}

		updatePermalinkHint( config.postStatus );
	}

	function updateDocumentSaveUi( status ) {
		if ( status ) {
			config.postStatus = status;
		}

		updateDocumentHeader( config.postTitle, config.postStatus );
		syncStatusInputFromConfig();
		updatePublishButtonVisibility();
	}

	function updatePermalinkHint( status ) {
		var hintNode = document.getElementById( 'art-editor-permalink-hint' );

		if ( ! hintNode ) {
			return;
		}

		hintNode.hidden = ! isPublishedLikeStatus( status );
	}

	function applyPermalinkSettings( data ) {
		var slugInput = document.getElementById( 'art-editor-page-slug' );
		var prefixNode = document.getElementById( 'art-editor-permalink-prefix' );

		if ( data && 'string' === typeof data.slug ) {
			config.postSlug = data.slug;

			if ( slugInput ) {
				slugInput.value = data.slug;
			}
		}

		if ( data && 'string' === typeof data.permalinkPrefix && prefixNode ) {
			config.permalinkPrefix = data.permalinkPrefix;
			prefixNode.textContent = data.permalinkPrefix;
			prefixNode.title = ( data.permalinkPrefix || '' ) + ( data.slug || '' );
		}

		if ( data && 'string' === typeof data.permalink ) {
			config.permalink = data.permalink;
		}

		if ( data && 'string' === typeof data.previewUrl ) {
			config.previewUrl = data.previewUrl;
		}
	}

	function getDocumentTitleLabel( title ) {
		var normalized = String( title || '' ).replace( /\s+/g, ' ' ).trim();

		if ( normalized ) {
			return normalized;
		}

		return i18n.untitled || 'Без названия';
	}

	function updateDocumentHeader( title, status ) {
		var titleNode = document.getElementById( 'art-editor-document-title' );
		var statusNode = document.getElementById( 'art-editor-document-status' );

		if ( titleNode ) {
			titleNode.textContent = getDocumentTitleLabel( title );
		}

		if ( statusNode && status ) {
			statusNode.textContent = '(' + getStatusLabel( status ) + ')';
		}
	}

	function getStatusLabel( status ) {
		if ( config.statusLabels && config.statusLabels[ status ] ) {
			return config.statusLabels[ status ];
		}

		return status;
	}

	function savePageSettings( pageSettings, options ) {
		if ( ! config.saveSettingsUrl || ! config.nonce ) {
			return Promise.resolve( pageSettings );
		}

		var settings = options || {};
		var manageSaveLock = false !== settings.manageSaveLock;
		var payload = {
			title: pageSettings.title,
			slug: pageSettings.slug,
			layoutMode: pageSettings.layoutMode,
			styleMode: pageSettings.styleMode,
		};

		if ( settings.includeStatus ) {
			payload.status = settings.status || pageSettings.status;
		}

		if ( manageSaveLock ) {
			beginSaving();
		}

		return window.fetch( config.saveSettingsUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-WP-Nonce': config.nonce,
			},
			body: JSON.stringify( payload ),
		} )
			.then( function( response ) {
				if ( ! response.ok ) {
					throw new Error( 'settings_save_failed' );
				}

				return response.json();
			} )
			.then( function( data ) {
				if ( data && 'string' === typeof data.title ) {
					config.postTitle = data.title;
				}

				if ( data && data.status ) {
					config.postStatus = data.status;
				}

				if ( data && data.layoutMode ) {
					config.layoutMode = data.layoutMode;
				}

				if ( data && data.styleMode ) {
					config.styleMode = data.styleMode;
				}

				applyPermalinkSettings( data );
				updateDocumentSaveUi( config.postStatus );
				updateSavedSettingsBaseline();

				return data;
			} )
			.finally( function() {
				if ( manageSaveLock ) {
					endSaving();
				}
			} );
	}

	function getCodeValue() {
		if ( codeEditorInstance && codeEditorInstance.codemirror ) {
			return codeEditorInstance.codemirror.getValue();
		}

		return codeInput ? codeInput.value : '';
	}

	function setCodeValue( value, options ) {
		var nextValue = value || '';
		var settings = options || {};
		var cm;

		if ( codeEditorInstance && codeEditorInstance.codemirror ) {
			cm = codeEditorInstance.codemirror;

			if ( cm.getValue() !== nextValue ) {
				if ( settings.silent ) {
					suppressCodeChangeEvents = true;
				}

				cm.setValue( nextValue );

				if ( settings.silent ) {
					if ( typeof cm.clearHistory === 'function' ) {
						cm.clearHistory();
					}

					suppressCodeChangeEvents = false;
				}
			} else if ( settings.silent && typeof cm.clearHistory === 'function' ) {
				// Keep CodeMirror native undo from resurrecting cleared content.
				cm.clearHistory();
			}

			window.setTimeout( function() {
				codeEditorInstance.codemirror.refresh();
			}, 0 );

			return;
		}

		if ( codeInput ) {
			codeInput.value = nextValue;
		}
	}

	function refreshCodeEditor() {
		if ( codeEditorInstance && codeEditorInstance.codemirror ) {
			codeEditorInstance.codemirror.refresh();
		}
	}

	function codeHasPersistableContent() {
		return !! String( getCodeValue() || '' ).trim();
	}

	function setCodeEditorEnabled( enabled ) {
		if ( codeEditorInstance && codeEditorInstance.codemirror ) {
			codeEditorInstance.codemirror.setOption( 'readOnly', ! enabled );
		}

		if ( codeInput ) {
			codeInput.disabled = ! enabled;
		}
	}

	function ensureBlockForCode( options ) {
		var settings = options || {};
		var block;
		var code;
		var index;
		var created = false;

		if ( editorState.blocks.length ) {
			if ( ! editorState.selectedId || ! getBlockById( editorState.selectedId ) ) {
				editorState.selectedId = editorState.blocks[ 0 ].id;

				if ( settings.syncUi ) {
					renderStructure();
				}
			}

			return getBlockById( editorState.selectedId );
		}

		code = getCodeValue();

		if ( ! String( code || '' ).trim() && ! settings.allowEmpty ) {
			return null;
		}

		index = 0;
		block = {
			id: 'html-' + Date.now(),
			type: 'html',
			title: getBlockTitle( code, index ),
			titleLocked: false,
			content: code || '',
		};

		editorState.blocks.push( block );
		editorState.selectedId = block.id;
		created = true;

		if ( created ) {
			renderStructure();
			setCodeEditorEnabled( true );
		}

		return block;
	}

	function applyCodeChangeToBlock() {
		var block = getBlockById( editorState.selectedId );

		if ( isAnchorBlock( block ) ) {
			return;
		}

		if ( ! block ) {
			block = ensureBlockForCode();
		}

		if ( ! block ) {
			return;
		}

		block.content = getCodeValue();

		if ( ! block.titleLocked ) {
			block.title = getBlockTitle( block.content, getBlockIndex( block.id ) );
		}
	}

	function clearCodeElementHighlight() {
		if ( codeElementHighlightMark ) {
			codeElementHighlightMark.clear();
			codeElementHighlightMark = null;
		}
	}

	function isSelectedElementLocatorForCurrentBlock() {
		return !! (
			editorState.selectedElementLocator &&
			editorState.selectedId &&
			editorState.selectedElementLocator.blockId === editorState.selectedId
		);
	}

	function invalidatePreviewElementRestore() {
		previewRestoreGeneration += 1;
		pendingElementSelectionPath = null;
		pendingElementSelectionGeneration = 0;
	}

	function clearSelectedElementLocator( options ) {
		var settings = options || {};

		editorState.selectedElementLocator = null;
		invalidatePreviewElementRestore();
		clearCodeElementHighlight();

		if ( elementEditorController && ! settings.skipPanel ) {
			elementEditorController.closePanel();
		}

		if ( ! settings.skipIframe && previewFrame && previewFrame.contentWindow ) {
			previewFrame.contentWindow.postMessage( {
				source: 'art-editor-parent',
				type: 'clearElementSelection',
			}, '*' );
		}
	}

	function handleElementSelection( locator ) {
		var block;
		var nextPath;
		var previousLocator;
		var isSameSelection;
		var keepPendingEdits;

		if ( ! locator || ! Array.isArray( locator.path ) || ! locator.path.length ) {
			if ( elementEditorController && elementEditorController.cancelPendingLinkApply ) {
				elementEditorController.cancelPendingLinkApply();
			}

			if ( elementEditorController && elementEditorController.cancelPendingTextStyleApply ) {
				elementEditorController.cancelPendingTextStyleApply();
			}

			clearSelectedElementLocator( { skipIframe: true } );
			return;
		}

		if ( ! editorState.selectedId ) {
			return;
		}

		block = getBlockById( editorState.selectedId );
		nextPath = normalizePreviewElementPathToBlockContent( locator.path, block ? block.content || '' : '' );
		previousLocator = editorState.selectedElementLocator;
		isSameSelection = !! (
			previousLocator &&
			previousLocator.blockId === editorState.selectedId &&
			elementPathsEqual( previousLocator.path, nextPath )
		);
		keepPendingEdits = isSameSelection && elementEditorController &&
			typeof elementEditorController.isPanelTypingFocus === 'function' &&
			elementEditorController.isPanelTypingFocus();

		if ( ! isSameSelection ) {
			if ( elementEditorController && elementEditorController.cancelPendingLinkApply ) {
				elementEditorController.cancelPendingLinkApply();
			}

			if ( elementEditorController && elementEditorController.cancelPendingTextStyleApply ) {
				elementEditorController.cancelPendingTextStyleApply();
			}
		}

		editorState.selectedElementLocator = {
			blockId: editorState.selectedId,
			path: nextPath,
			tag: locator.tag || '',
			outerHtml: locator.outerHtml || '',
			textContent: locator.textContent || '',
		};

		highlightSelectedElementInCode();

		// Preview restore re-selects the same node — do not wipe in-progress inputs.
		if ( keepPendingEdits ) {
			return;
		}

		if ( elementEditorController && 'edit' === getActiveCanvasTabName() && isSelectedElementLocatorForCurrentBlock() ) {
			elementEditorController.openPanel( editorState.selectedElementLocator );
		}
	}

	function initElementEditorPanel() {
		var elementPanel = document.getElementById( 'art-editor-element-panel' );
		var elementClose = document.getElementById( 'art-editor-element-close' );
		var structureView = document.getElementById( 'art-editor-structure-view' );
		var settingsPanel = document.getElementById( 'art-editor-settings-panel' );
		var settingsToggle = document.getElementById( 'art-editor-settings-toggle' );
		var elementSummary = document.getElementById( 'art-editor-element-summary' );
		var elementParentButton = document.getElementById( 'art-editor-element-parent' );
		var styleControls = document.getElementById( 'art-editor-element-style-controls' );
		var fontSizeRow = document.getElementById( 'art-editor-element-font-size-row' );
		var lineHeightRow = document.getElementById( 'art-editor-element-line-height-row' );
		var textColorRow = document.getElementById( 'art-editor-element-text-color-row' );
		var fontWeightRow = document.getElementById( 'art-editor-element-font-weight-row' );
		var textDecorationRow = document.getElementById( 'art-editor-element-text-decoration-row' );
		var backgroundColorRow = document.getElementById( 'art-editor-element-background-color-row' );
		var paddingTopRow = document.getElementById( 'art-editor-element-padding-top-row' );
		var paddingBottomRow = document.getElementById( 'art-editor-element-padding-bottom-row' );
		var blockSpacingDivider = document.getElementById( 'art-editor-element-block-spacing-divider' );
		var paddingGroupTitle = document.getElementById( 'art-editor-element-padding-group-title' );
		var externalMarginDivider = document.getElementById( 'art-editor-element-external-margin-divider' );
		var marginGroupTitle = document.getElementById( 'art-editor-element-margin-group-title' );
		var marginTopRow = document.getElementById( 'art-editor-element-margin-top-row' );
		var marginBottomRow = document.getElementById( 'art-editor-element-margin-bottom-row' );
		var fontSizeInput = document.getElementById( 'art-editor-element-font-size' );
		var fontSizeResetButton = document.getElementById( 'art-editor-element-font-size-reset' );
		var lineHeightInput = document.getElementById( 'art-editor-element-line-height' );
		var lineHeightUnitInput = document.getElementById( 'art-editor-element-line-height-unit' );
		var lineHeightResetButton = document.getElementById( 'art-editor-element-line-height-reset' );
		var textColorInput = document.getElementById( 'art-editor-element-text-color' );
		var textColorResetButton = document.getElementById( 'art-editor-element-text-color-reset' );
		var fontWeightInput = document.getElementById( 'art-editor-element-font-weight' );
		var fontWeightResetButton = document.getElementById( 'art-editor-element-font-weight-reset' );
		var italicToggle = document.getElementById( 'art-editor-element-italic-toggle' );
		var underlineToggle = document.getElementById( 'art-editor-element-underline-toggle' );
		var lineThroughToggle = document.getElementById( 'art-editor-element-line-through-toggle' );
		var backgroundColorInput = document.getElementById( 'art-editor-element-background-color' );
		var backgroundColorResetButton = document.getElementById( 'art-editor-element-background-color-reset' );
		var paddingTopInput = document.getElementById( 'art-editor-element-padding-top' );
		var paddingTopResetButton = document.getElementById( 'art-editor-element-padding-top-reset' );
		var paddingBottomInput = document.getElementById( 'art-editor-element-padding-bottom' );
		var paddingBottomResetButton = document.getElementById( 'art-editor-element-padding-bottom-reset' );
		var marginTopInput = document.getElementById( 'art-editor-element-margin-top' );
		var marginTopResetButton = document.getElementById( 'art-editor-element-margin-top-reset' );
		var marginBottomInput = document.getElementById( 'art-editor-element-margin-bottom' );
		var marginBottomResetButton = document.getElementById( 'art-editor-element-margin-bottom-reset' );
		var linkDivider = document.getElementById( 'art-editor-element-link-divider' );
		var imageControls = document.getElementById( 'art-editor-element-image-controls' );
		var imagePickerButton = document.getElementById( 'art-editor-element-image-picker' );
		var elementControls = document.getElementById( 'art-editor-element-controls' );
		var linkUrlInput = document.getElementById( 'art-editor-element-link-url' );
		var linkBlankCheckbox = document.getElementById( 'art-editor-element-link-blank' );
		var linkSettingsToggle = document.getElementById( 'art-editor-element-link-settings' );
		var linkOptions = document.getElementById( 'art-editor-element-link-options' );
		var isSyncingLinkControls = false;
		var isSyncingTextStyleControls = false;
		var linkApplyTimer = null;
		var textStyleApplyTimer = null;
		var lastSyncedTextStyleState = {
			fontSize: '',
			lineHeight: '',
			lineHeightUnit: 'unitless',
			color: '',
			fontWeight: '',
			fontStyle: '',
			textDecorationUnderline: false,
			textDecorationLineThrough: false,
			backgroundColor: '',
			paddingTop: '',
			paddingBottom: '',
			marginTop: '',
			marginBottom: '',
		};

		function setTextDecorationToggleState( button, isActive ) {
			if ( ! button ) {
				return;
			}

			button.classList.toggle( 'is-active', !! isActive );
			button.setAttribute( 'aria-pressed', isActive ? 'true' : 'false' );
		}

		function syncTextDecorationToggleControls( textStyleState ) {
			setTextDecorationToggleState( italicToggle, !! ( textStyleState && 'italic' === textStyleState.fontStyle ) );
			setTextDecorationToggleState( underlineToggle, !! ( textStyleState && textStyleState.textDecorationUnderline ) );
			setTextDecorationToggleState( lineThroughToggle, !! ( textStyleState && textStyleState.textDecorationLineThrough ) );
		}

		if ( ! elementPanel || ! structureView ) {
			return null;
		}

		function updateLastSyncedTextStyleState( textStyleState ) {
			lastSyncedTextStyleState = {
				fontSize: textStyleState && textStyleState.fontSize ? textStyleState.fontSize : '',
				lineHeight: textStyleState && textStyleState.lineHeight ? textStyleState.lineHeight : '',
				lineHeightUnit: textStyleState && textStyleState.lineHeightUnit ? sanitizeLineHeightUnit( textStyleState.lineHeightUnit ) : 'unitless',
				color: textStyleState && textStyleState.color ? textStyleState.color : '',
				fontWeight: textStyleState && textStyleState.fontWeight ? textStyleState.fontWeight : '',
				fontStyle: textStyleState && textStyleState.fontStyle ? textStyleState.fontStyle : '',
				textDecorationUnderline: !! ( textStyleState && textStyleState.textDecorationUnderline ),
				textDecorationLineThrough: !! ( textStyleState && textStyleState.textDecorationLineThrough ),
				backgroundColor: textStyleState && textStyleState.backgroundColor ? textStyleState.backgroundColor : '',
				paddingTop: textStyleState && textStyleState.paddingTop ? textStyleState.paddingTop : '',
				paddingBottom: textStyleState && textStyleState.paddingBottom ? textStyleState.paddingBottom : '',
				marginTop: textStyleState && textStyleState.marginTop ? textStyleState.marginTop : '',
				marginBottom: textStyleState && textStyleState.marginBottom ? textStyleState.marginBottom : '',
			};
		}

		function shouldApplyTextStyleProperty( property, inputValue, syncedValue ) {
			var normalizedInput;
			var normalizedSynced;

			if ( 'fontSize' === property || 'paddingTop' === property || 'paddingBottom' === property ) {
				normalizedInput = normalizeFontSizeInput( inputValue );
				normalizedSynced = normalizeFontSizeInput( syncedValue );
				return normalizedInput !== normalizedSynced;
			}

			if ( 'marginTop' === property || 'marginBottom' === property ) {
				normalizedInput = normalizeMarginInput( inputValue );
				normalizedSynced = normalizeMarginInput( syncedValue );
				return normalizedInput !== normalizedSynced;
			}

			if ( 'fontWeight' === property ) {
				normalizedInput = normalizeFontWeightInput( inputValue );
				normalizedSynced = normalizeFontWeightInput( syncedValue );
				return normalizedInput !== normalizedSynced;
			}

			if ( 'fontStyle' === property ) {
				normalizedInput = formatFontStyleForInput( inputValue );
				normalizedSynced = formatFontStyleForInput( syncedValue );
				return normalizedInput !== normalizedSynced;
			}

			if ( 'textDecorationUnderline' === property || 'textDecorationLineThrough' === property ) {
				return !! inputValue !== !! syncedValue;
			}

			if ( 'color' === property ) {
				normalizedInput = cssColorToHex( inputValue );
				normalizedSynced = cssColorToHex( syncedValue || '' );

				if ( ! syncedValue && '#000000' === normalizedInput ) {
					return false;
				}

				return normalizedInput !== normalizedSynced;
			}

			if ( 'backgroundColor' === property ) {
				normalizedInput = cssColorToHex( inputValue );
				normalizedSynced = cssColorToHex( syncedValue || '' );

				if ( ! syncedValue && '#ffffff' === normalizedInput ) {
					return false;
				}

				return normalizedInput !== normalizedSynced;
			}

			return true;
		}

		function getEffectiveChangedTextStyleProperties( changedProperties, overrides, values ) {
			var effective = {};

			if ( overrides ) {
				return changedProperties || {
					fontSize: true,
					lineHeight: true,
					lineHeightUnit: true,
					color: true,
					fontWeight: true,
					fontStyle: true,
					textDecorationUnderline: true,
					textDecorationLineThrough: true,
					backgroundColor: true,
					paddingTop: true,
					paddingBottom: true,
					marginTop: true,
					marginBottom: true,
				};
			}

			if ( ! changedProperties || changedProperties.fontSize ) {
				if ( shouldApplyTextStyleProperty( 'fontSize', values.fontSize, lastSyncedTextStyleState.fontSize ) ) {
					effective.fontSize = true;
				}
			}

			if ( ! changedProperties || changedProperties.lineHeight || changedProperties.lineHeightUnit ) {
				if ( buildLineHeightCSSValue( values.lineHeight, values.lineHeightUnit ) !== buildLineHeightCSSValue( lastSyncedTextStyleState.lineHeight, lastSyncedTextStyleState.lineHeightUnit ) ) {
					effective.lineHeight = true;
					effective.lineHeightUnit = true;
				}
			}

			if ( ! changedProperties || changedProperties.color ) {
				if ( shouldApplyTextStyleProperty( 'color', values.color, lastSyncedTextStyleState.color ) ) {
					effective.color = true;
				}
			}

			if ( ! changedProperties || changedProperties.fontWeight ) {
				if ( shouldApplyTextStyleProperty( 'fontWeight', values.fontWeight, lastSyncedTextStyleState.fontWeight ) ) {
					effective.fontWeight = true;
				}
			}

			if ( ! changedProperties || changedProperties.fontStyle ) {
				if ( shouldApplyTextStyleProperty( 'fontStyle', values.fontStyle, lastSyncedTextStyleState.fontStyle ) ) {
					effective.fontStyle = true;
				}
			}

			if ( ! changedProperties || changedProperties.textDecorationUnderline ) {
				if ( shouldApplyTextStyleProperty( 'textDecorationUnderline', values.textDecorationUnderline, lastSyncedTextStyleState.textDecorationUnderline ) ) {
					effective.textDecorationUnderline = true;
				}
			}

			if ( ! changedProperties || changedProperties.textDecorationLineThrough ) {
				if ( shouldApplyTextStyleProperty( 'textDecorationLineThrough', values.textDecorationLineThrough, lastSyncedTextStyleState.textDecorationLineThrough ) ) {
					effective.textDecorationLineThrough = true;
				}
			}

			if ( ! changedProperties || changedProperties.backgroundColor ) {
				if ( shouldApplyTextStyleProperty( 'backgroundColor', values.backgroundColor, lastSyncedTextStyleState.backgroundColor ) ) {
					effective.backgroundColor = true;
				}
			}

			if ( ! changedProperties || changedProperties.paddingTop ) {
				if ( shouldApplyTextStyleProperty( 'paddingTop', values.paddingTop, lastSyncedTextStyleState.paddingTop ) ) {
					effective.paddingTop = true;
				}
			}

			if ( ! changedProperties || changedProperties.paddingBottom ) {
				if ( shouldApplyTextStyleProperty( 'paddingBottom', values.paddingBottom, lastSyncedTextStyleState.paddingBottom ) ) {
					effective.paddingBottom = true;
				}
			}

			if ( ! changedProperties || changedProperties.marginTop ) {
				if ( shouldApplyTextStyleProperty( 'marginTop', values.marginTop, lastSyncedTextStyleState.marginTop ) ) {
					effective.marginTop = true;
				}
			}

			if ( ! changedProperties || changedProperties.marginBottom ) {
				if ( shouldApplyTextStyleProperty( 'marginBottom', values.marginBottom, lastSyncedTextStyleState.marginBottom ) ) {
					effective.marginBottom = true;
				}
			}

			return Object.keys( effective ).length ? effective : null;
		}

		function setLinkOptionsOpen( isOpen ) {
			if ( ! linkOptions || ! linkSettingsToggle ) {
				return;
			}

			linkOptions.classList.toggle( 'is-open', isOpen );
			linkSettingsToggle.classList.toggle( 'is-active', isOpen );
			linkSettingsToggle.setAttribute( 'aria-expanded', isOpen ? 'true' : 'false' );
		}

		function closeLinkOptions() {
			setLinkOptionsOpen( false );
		}

		function toggleLinkOptions() {
			if ( ! linkOptions ) {
				return;
			}

			setLinkOptionsOpen( ! linkOptions.classList.contains( 'is-open' ) );
		}

		function closePageSettingsPanel() {
			if ( ! settingsPanel || settingsPanel.hidden ) {
				return;
			}

			settingsPanel.hidden = true;

			if ( settingsToggle ) {
				settingsToggle.setAttribute( 'aria-expanded', 'false' );
				settingsToggle.classList.remove( 'is-active' );
			}
		}

		function updateElementSummary( locator ) {
			var tagLabel;
			var tagName;
			var canSelectParent;

			if ( ! elementSummary ) {
				return;
			}

			if ( ! locator || ! locator.tag ) {
				elementSummary.hidden = true;
				elementSummary.textContent = '';

				if ( elementParentButton ) {
					elementParentButton.hidden = true;
					elementParentButton.disabled = true;
				}

				return;
			}

			tagLabel = i18n.elementEditorTag || 'Тег';
			tagName = String( locator.tag ).toLowerCase();
			canSelectParent = !!( locator.path && locator.path.length > 1 );
			elementSummary.textContent = '';
			elementSummary.appendChild( document.createElement( 'strong' ) ).textContent = tagLabel + ':';
			elementSummary.appendChild( document.createTextNode( ' <' + tagName + '>' ) );
			elementSummary.hidden = false;

			if ( elementParentButton ) {
				elementParentButton.hidden = false;
				elementParentButton.disabled = ! canSelectParent;
				elementParentButton.title = i18n.elementEditorSelectParentTitle || 'Выбрать родительский элемент';
			}
		}

		function selectParentElement() {
			var locator;
			var block;
			var parentPath;
			var pageSettings;
			var expandedPath;

			if ( ! isSelectedElementLocatorForCurrentBlock() ) {
				return;
			}

			locator = editorState.selectedElementLocator;

			if ( ! locator || ! locator.path || locator.path.length <= 1 ) {
				return;
			}

			if ( ! previewFrame || ! previewFrame.contentWindow ) {
				return;
			}

			block = getBlockById( editorState.selectedId );
			parentPath = cloneElementPath( locator.path.slice( 0, -1 ) );
			pageSettings = getPageSettingsFromDom();
			expandedPath = expandBlockContentPathForPreviewIframe(
				parentPath,
				block ? block.content || '' : '',
				pageSettings.layoutMode
			);

			previewFrame.contentWindow.postMessage( {
				source: 'art-editor-parent',
				type: 'selectElementByPath',
				path: expandedPath,
			}, '*' );
		}

		function updateTextStyleResetButtons( textStyleState ) {
			var hasFontSize = !! ( textStyleState && textStyleState.fontSize );
			var hasLineHeight = !! ( textStyleState && textStyleState.lineHeight );
			var hasColor = !! ( textStyleState && textStyleState.color );
			var hasFontWeight = !! ( textStyleState && textStyleState.fontWeight );
			var hasBackgroundColor = !! ( textStyleState && textStyleState.backgroundColor );
			var hasPaddingTop = !! ( textStyleState && textStyleState.paddingTop );
			var hasPaddingBottom = !! ( textStyleState && textStyleState.paddingBottom );
			var hasMarginTop = !! ( textStyleState && textStyleState.marginTop );
			var hasMarginBottom = !! ( textStyleState && textStyleState.marginBottom );

			if ( fontSizeResetButton ) {
				fontSizeResetButton.disabled = ! hasFontSize;
			}

			if ( lineHeightResetButton ) {
				lineHeightResetButton.disabled = ! hasLineHeight;
			}

			if ( textColorResetButton ) {
				textColorResetButton.disabled = ! hasColor;
			}

			if ( fontWeightResetButton ) {
				fontWeightResetButton.disabled = ! hasFontWeight;
			}

			if ( backgroundColorResetButton ) {
				backgroundColorResetButton.disabled = ! hasBackgroundColor;
			}

			if ( paddingTopResetButton ) {
				paddingTopResetButton.disabled = ! hasPaddingTop;
			}

			if ( paddingBottomResetButton ) {
				paddingBottomResetButton.disabled = ! hasPaddingBottom;
			}

			if ( marginTopResetButton ) {
				marginTopResetButton.disabled = ! hasMarginTop;
			}

			if ( marginBottomResetButton ) {
				marginBottomResetButton.disabled = ! hasMarginBottom;
			}
		}

		function setBlockSpacingSectionVisible( isVisible ) {
			if ( blockSpacingDivider ) {
				blockSpacingDivider.hidden = ! isVisible;
			}

			if ( paddingGroupTitle ) {
				paddingGroupTitle.hidden = ! isVisible;
			}

			if ( paddingTopRow ) {
				paddingTopRow.hidden = ! isVisible;
			}

			if ( paddingBottomRow ) {
				paddingBottomRow.hidden = ! isVisible;
			}

			if ( linkDivider ) {
				linkDivider.hidden = ! isVisible;
			}

			if ( elementControls ) {
				elementControls.classList.toggle( 'art-editor-screen__element-editor-controls--with-link-divider', isVisible );
			}
		}

		function setExternalMarginSectionVisible( isVisible ) {
			if ( externalMarginDivider ) {
				externalMarginDivider.hidden = ! isVisible;
			}

			if ( marginGroupTitle ) {
				marginGroupTitle.hidden = ! isVisible;
			}

			if ( marginTopRow ) {
				marginTopRow.hidden = ! isVisible;
			}

			if ( marginBottomRow ) {
				marginBottomRow.hidden = ! isVisible;
			}
		}

		function isBackgroundStyleableLocator( locator ) {
			return !! ( locator && locator.path && locator.path.length && ! isImageElementLocator( locator ) );
		}

		function syncElementControls( locator ) {
			var block;
			var linkState;
			var textStyleState;
			var isImage = isImageElementLocator( locator );
			var isInlineTextStyleable = isInlineTextStyleableLocator( locator );
			var canSetBackground = isBackgroundStyleableLocator( locator );
			var canSetBlockSpacing = isBlockSpacingStyleableLocator( locator );
			var canSetMargin = isMarginStyleableLocator( locator );

			if ( imageControls ) {
				imageControls.hidden = ! isImage;
			}

			if ( fontSizeRow ) {
				fontSizeRow.hidden = ! isInlineTextStyleable;
			}

			if ( lineHeightRow ) {
				lineHeightRow.hidden = ! isInlineTextStyleable;
			}

			if ( textColorRow ) {
				textColorRow.hidden = ! isInlineTextStyleable;
			}

			if ( fontWeightRow ) {
				fontWeightRow.hidden = ! isInlineTextStyleable;
			}

			if ( textDecorationRow ) {
				textDecorationRow.hidden = ! isInlineTextStyleable;
			}

			if ( backgroundColorRow ) {
				backgroundColorRow.hidden = ! canSetBackground;
			}

			setBlockSpacingSectionVisible( canSetBlockSpacing );
			setExternalMarginSectionVisible( canSetMargin );

			if ( styleControls ) {
				styleControls.hidden = ! isInlineTextStyleable && ! canSetBackground && ! canSetBlockSpacing;
			}

			if ( ! locator || ! locator.path || ! locator.path.length ) {
				if ( fontSizeRow ) {
					fontSizeRow.hidden = true;
				}

				if ( lineHeightRow ) {
					lineHeightRow.hidden = true;
				}

				if ( textColorRow ) {
					textColorRow.hidden = true;
				}

				if ( fontWeightRow ) {
					fontWeightRow.hidden = true;
				}

				if ( textDecorationRow ) {
					textDecorationRow.hidden = true;
				}

				if ( backgroundColorRow ) {
					backgroundColorRow.hidden = true;
				}

				setBlockSpacingSectionVisible( false );
				setExternalMarginSectionVisible( false );

				if ( styleControls ) {
					styleControls.hidden = true;
				}
				if ( elementControls ) {
					elementControls.hidden = true;
					elementControls.classList.remove( 'art-editor-screen__element-editor-controls--after-image' );
				}

				if ( linkUrlInput ) {
					linkUrlInput.value = '';
				}

				if ( linkBlankCheckbox ) {
					linkBlankCheckbox.checked = false;
				}

				if ( fontSizeInput ) {
					fontSizeInput.value = '';
				}

				if ( lineHeightInput ) {
					lineHeightInput.value = '';
				}

				if ( lineHeightUnitInput ) {
					lineHeightUnitInput.value = 'unitless';
				}

				if ( textColorInput ) {
					textColorInput.value = '#000000';
				}

				if ( fontWeightInput ) {
					fontWeightInput.value = '';
				}

				syncTextDecorationToggleControls( null );

				if ( backgroundColorInput ) {
					backgroundColorInput.value = '#ffffff';
				}

				if ( paddingTopInput ) {
					paddingTopInput.value = '';
				}

				if ( paddingBottomInput ) {
					paddingBottomInput.value = '';
				}

				if ( marginTopInput ) {
					marginTopInput.value = '';
				}

				if ( marginBottomInput ) {
					marginBottomInput.value = '';
				}

				updateLastSyncedTextStyleState( null );
				updateTextStyleResetButtons( null );
				closeLinkOptions();
				return;
			}

			block = getBlockById( editorState.selectedId );

			if ( ( isInlineTextStyleable && fontSizeInput && lineHeightInput && textColorInput && fontWeightInput ) || ( canSetBackground && backgroundColorInput ) || ( canSetBlockSpacing && paddingTopInput && paddingBottomInput ) || ( canSetMargin && marginTopInput && marginBottomInput ) ) {
				textStyleState = getElementTextStyleStateFromHtml( block ? block.content || '' : '', locator.path );

				isSyncingTextStyleControls = true;

				if ( isInlineTextStyleable && fontSizeInput && lineHeightInput && textColorInput && fontWeightInput ) {
					fontSizeInput.value = textStyleState.fontSize || '';
					lineHeightInput.value = textStyleState.lineHeight || '';
					if ( lineHeightUnitInput ) {
						lineHeightUnitInput.value = textStyleState.lineHeightUnit || 'unitless';
					}
					textColorInput.value = textStyleState.color || '#000000';
					fontWeightInput.value = textStyleState.fontWeight || '';
					syncTextDecorationToggleControls( textStyleState );
				}

				if ( canSetBackground && backgroundColorInput ) {
					backgroundColorInput.value = textStyleState.backgroundColor || '#ffffff';
				}

				if ( canSetBlockSpacing && paddingTopInput && paddingBottomInput ) {
					paddingTopInput.value = textStyleState.paddingTop || '';
					paddingBottomInput.value = textStyleState.paddingBottom || '';
				}

				if ( canSetMargin && marginTopInput && marginBottomInput ) {
					marginTopInput.value = textStyleState.marginTop || '';
					marginBottomInput.value = textStyleState.marginBottom || '';
				}

				isSyncingTextStyleControls = false;
				updateLastSyncedTextStyleState( textStyleState );
				updateTextStyleResetButtons( textStyleState );
			}

			if ( ! linkUrlInput || ! linkBlankCheckbox ) {
				return;
			}

			linkState = getElementLinkStateFromHtml( block ? block.content || '' : '', locator.path );

			isSyncingLinkControls = true;
			linkUrlInput.value = linkState.href || '';
			linkBlankCheckbox.checked = linkState.openInNew;

			if ( elementControls ) {
				elementControls.hidden = false;
				elementControls.classList.toggle( 'art-editor-screen__element-editor-controls--after-image', isImage );
			}

			isSyncingLinkControls = false;
		}

		function applyImageFromAttachment( attachment ) {
			var block;
			var locator;
			var result;
			var nextLocator;
			var imageUrl;
			var imageAlt;

			if ( ! editorState.selectedId || ! isSelectedElementLocatorForCurrentBlock() || ! isImageElementLocator( editorState.selectedElementLocator ) ) {
				return;
			}

			imageUrl = getAttachmentImageUrl( attachment );

			if ( ! imageUrl ) {
				return;
			}

			block = getBlockById( editorState.selectedId );

			if ( ! block ) {
				return;
			}

			imageAlt = getAttachmentAltText( attachment );
			locator = editorState.selectedElementLocator;
			result = applyElementImageSrcEdit( block.content || '', locator.path, imageUrl, imageAlt );

			if ( ! result || result.html === block.content ) {
				return;
			}

			pushHistory();
			block.content = result.html;
			setCodeValue( result.html, { silent: true } );
			nextLocator = buildLocatorFromHtml( result.html, result.selectionPath );

			if ( nextLocator ) {
				editorState.selectedElementLocator = nextLocator;
				updateElementSummary( nextLocator );
			}

			updatePreview();
			updatePagePreview();
			syncElementControls( editorState.selectedElementLocator );

			if ( editorState.selectedElementLocator ) {
				openPanel( editorState.selectedElementLocator );
			}

			scheduleUnsavedIndicatorUpdate();
		}

		function openImageMediaPicker() {
			var frame;

			if ( ! window.wp || ! window.wp.media ) {
				window.alert( i18n.elementEditorImageUnavailable || 'Медиабиблиотека WordPress недоступна.' );
				return;
			}

			frame = window.wp.media( {
				title: i18n.elementEditorImageTitle || 'Выберите изображение',
				button: {
					text: i18n.elementEditorImageButton || 'Использовать изображение',
				},
				library: {
					type: 'image',
				},
				multiple: false,
			} );

			frame.on( 'select', function() {
				var selection = frame.state().get( 'selection' );
				var attachment;

				if ( ! selection || ! selection.first ) {
					return;
				}

				attachment = selection.first();

				if ( ! attachment ) {
					return;
				}

				applyImageFromAttachment( attachment.toJSON() );
			} );

			frame.open();
		}

		function syncLinkControls( locator ) {
			syncElementControls( locator );
		}

		function applyLinkFromControls( options ) {
			var settings = options || {};
			var block;
			var locator;
			var result;
			var nextLocator;
			var rawHref;
			var normalizedHref;
			var openInNew;
			var isLiveApply;
			var hasExistingAnchor;

			cancelPendingTextStyleApply();

			if ( isSyncingLinkControls || ! editorState.selectedId || ! isSelectedElementLocatorForCurrentBlock() ) {
				return;
			}

			block = getBlockById( editorState.selectedId );

			if ( ! block ) {
				return;
			}

			locator = editorState.selectedElementLocator;
			rawHref = linkUrlInput ? linkUrlInput.value : '';
			isLiveApply = !! settings.live && ! settings.finalize;
			hasExistingAnchor = elementHasLinkAnchorInHtml( block.content || '', locator.path );
			normalizedHref = normalizeLinkHref( rawHref, { live: isLiveApply } );
			openInNew = linkBlankCheckbox ? linkBlankCheckbox.checked : false;

			if ( isLiveApply && ! hasExistingAnchor ) {
				return;
			}

			if ( linkUrlInput && linkUrlInput.value !== normalizedHref && ! isLiveApply ) {
				isSyncingLinkControls = true;
				linkUrlInput.value = normalizedHref;
				isSyncingLinkControls = false;
			}

			result = applyElementLinkEdit(
				block.content || '',
				locator.path,
				normalizedHref,
				openInNew,
				{ live: isLiveApply }
			);

			if ( ! result || result.html === block.content ) {
				return;
			}

			if ( ! settings.skipHistory ) {
				pushHistory();
			}

			block.content = result.html;
			setCodeValue( result.html, { silent: true } );
			nextLocator = buildLocatorFromHtml( result.html, result.selectionPath );

			if ( nextLocator ) {
				editorState.selectedElementLocator = nextLocator;
				updateElementSummary( nextLocator );
			}

			updatePreview();
			updatePagePreview();
			syncLinkControls( editorState.selectedElementLocator );

			if ( editorState.selectedElementLocator ) {
				openPanel( editorState.selectedElementLocator );
			}

			scheduleUnsavedIndicatorUpdate();
		}

		function scheduleLinkApply() {
			window.clearTimeout( linkApplyTimer );
			linkApplyTimer = window.setTimeout( function() {
				linkApplyTimer = null;
				applyLinkFromControls( { live: true } );
			}, 400 );
		}

		function cancelPendingLinkApply() {
			window.clearTimeout( linkApplyTimer );
			linkApplyTimer = null;
		}

		function applyTextStyleFromControls( changedProperties, overrides, options ) {
			var block;
			var locator;
			var result;
			var nextLocator;
			var fontSizeValue;
			var lineHeightValue;
			var lineHeightUnitValue;
			var colorValue;
			var fontWeightValue;
			var fontStyleValue;
			var textDecorationUnderlineValue;
			var textDecorationLineThroughValue;
			var backgroundColorValue;
			var paddingTopValue;
			var paddingBottomValue;
			var marginTopValue;
			var marginBottomValue;
			var isInlineTextStyleable;
			var canSetBackground;
			var canSetBlockSpacing;
			var canSetMargin;
			var touchesText;
			var touchesBackground;
			var touchesPadding;
			var touchesMargin;
			var effectiveChangedProperties;
			var styleValues;

			if ( isSyncingTextStyleControls || ! editorState.selectedId || ! isSelectedElementLocatorForCurrentBlock() ) {
				return;
			}

			isInlineTextStyleable = isInlineTextStyleableLocator( editorState.selectedElementLocator );
			canSetBackground = isBackgroundStyleableLocator( editorState.selectedElementLocator );
			canSetBlockSpacing = isBlockSpacingStyleableLocator( editorState.selectedElementLocator );
			canSetMargin = isMarginStyleableLocator( editorState.selectedElementLocator );
			touchesText = ! changedProperties || changedProperties.fontSize || changedProperties.lineHeight || changedProperties.lineHeightUnit || changedProperties.color || changedProperties.fontWeight || changedProperties.fontStyle || changedProperties.textDecorationUnderline || changedProperties.textDecorationLineThrough;
			touchesBackground = ! changedProperties || changedProperties.backgroundColor;
			touchesPadding = ! changedProperties || changedProperties.paddingTop || changedProperties.paddingBottom;
			touchesMargin = ! changedProperties || changedProperties.marginTop || changedProperties.marginBottom;

			if ( ! touchesText && ! touchesBackground && ! touchesPadding && ! touchesMargin ) {
				return;
			}

			block = getBlockById( editorState.selectedId );

			if ( ! block ) {
				return;
			}

			locator = editorState.selectedElementLocator;
			fontSizeValue = overrides && Object.prototype.hasOwnProperty.call( overrides, 'fontSize' ) ? overrides.fontSize : ( fontSizeInput ? fontSizeInput.value : '' );
			lineHeightValue = overrides && Object.prototype.hasOwnProperty.call( overrides, 'lineHeight' ) ? overrides.lineHeight : ( lineHeightInput ? lineHeightInput.value : '' );
			lineHeightUnitValue = overrides && Object.prototype.hasOwnProperty.call( overrides, 'lineHeightUnit' ) ? overrides.lineHeightUnit : ( lineHeightUnitInput ? lineHeightUnitInput.value : 'unitless' );
			colorValue = overrides && Object.prototype.hasOwnProperty.call( overrides, 'color' ) ? overrides.color : ( textColorInput ? textColorInput.value : '' );
			fontWeightValue = overrides && Object.prototype.hasOwnProperty.call( overrides, 'fontWeight' ) ? overrides.fontWeight : ( fontWeightInput ? fontWeightInput.value : '' );
			fontStyleValue = overrides && Object.prototype.hasOwnProperty.call( overrides, 'fontStyle' ) ? overrides.fontStyle : ( italicToggle && italicToggle.classList.contains( 'is-active' ) ? 'italic' : '' );
			textDecorationUnderlineValue = overrides && Object.prototype.hasOwnProperty.call( overrides, 'textDecorationUnderline' ) ? overrides.textDecorationUnderline : ( underlineToggle && underlineToggle.classList.contains( 'is-active' ) );
			textDecorationLineThroughValue = overrides && Object.prototype.hasOwnProperty.call( overrides, 'textDecorationLineThrough' ) ? overrides.textDecorationLineThrough : ( lineThroughToggle && lineThroughToggle.classList.contains( 'is-active' ) );
			backgroundColorValue = overrides && Object.prototype.hasOwnProperty.call( overrides, 'backgroundColor' ) ? overrides.backgroundColor : ( backgroundColorInput ? backgroundColorInput.value : '' );
			paddingTopValue = overrides && Object.prototype.hasOwnProperty.call( overrides, 'paddingTop' ) ? overrides.paddingTop : ( paddingTopInput ? paddingTopInput.value : '' );
			paddingBottomValue = overrides && Object.prototype.hasOwnProperty.call( overrides, 'paddingBottom' ) ? overrides.paddingBottom : ( paddingBottomInput ? paddingBottomInput.value : '' );
			marginTopValue = overrides && Object.prototype.hasOwnProperty.call( overrides, 'marginTop' ) ? overrides.marginTop : ( marginTopInput ? marginTopInput.value : '' );
			marginBottomValue = overrides && Object.prototype.hasOwnProperty.call( overrides, 'marginBottom' ) ? overrides.marginBottom : ( marginBottomInput ? marginBottomInput.value : '' );
			styleValues = {
				fontSize: fontSizeValue,
				lineHeight: lineHeightValue,
				lineHeightUnit: lineHeightUnitValue,
				color: colorValue,
				fontWeight: fontWeightValue,
				fontStyle: fontStyleValue,
				textDecorationUnderline: textDecorationUnderlineValue,
				textDecorationLineThrough: textDecorationLineThroughValue,
				backgroundColor: backgroundColorValue,
				paddingTop: paddingTopValue,
				paddingBottom: paddingBottomValue,
				marginTop: marginTopValue,
				marginBottom: marginBottomValue,
			};
			effectiveChangedProperties = getEffectiveChangedTextStyleProperties( changedProperties, overrides, styleValues );

			if ( ! effectiveChangedProperties ) {
				return;
			}

			if ( ! isInlineTextStyleable ) {
				delete effectiveChangedProperties.fontSize;
				delete effectiveChangedProperties.lineHeight;
				delete effectiveChangedProperties.lineHeightUnit;
				delete effectiveChangedProperties.color;
				delete effectiveChangedProperties.fontWeight;
				delete effectiveChangedProperties.fontStyle;
				delete effectiveChangedProperties.textDecorationUnderline;
				delete effectiveChangedProperties.textDecorationLineThrough;
			}

			if ( ! canSetBackground ) {
				delete effectiveChangedProperties.backgroundColor;
			}

			if ( ! canSetBlockSpacing ) {
				delete effectiveChangedProperties.paddingTop;
				delete effectiveChangedProperties.paddingBottom;
			}

			if ( ! canSetMargin ) {
				delete effectiveChangedProperties.marginTop;
				delete effectiveChangedProperties.marginBottom;
			}

			if ( ! Object.keys( effectiveChangedProperties ).length ) {
				return;
			}

			result = applyElementTextStyleEdit(
				block.content || '',
				locator.path,
				styleValues,
				effectiveChangedProperties
			);

			if ( ! result || result.html === block.content ) {
				return;
			}

			if ( ! options || ! options.skipHistory ) {
				ensureStyleHistoryCheckpoint();
			}

			block.content = result.html;
			setCodeValue( result.html, { silent: true } );
			nextLocator = buildLocatorFromHtml( result.html, result.selectionPath );

			if ( nextLocator ) {
				editorState.selectedElementLocator = nextLocator;
				updateElementSummary( nextLocator );
			}

			postOptimisticElementStyles( buildOptimisticCssStyles( styleValues, effectiveChangedProperties ) );
			scheduleStylePreviewRefresh();
			syncElementControls( editorState.selectedElementLocator );

			if ( editorState.selectedElementLocator ) {
				openPanel( editorState.selectedElementLocator );
			}

			scheduleUnsavedIndicatorUpdate();
		}

		function getDebouncedTextStyleChangeFlags() {
			return {
				fontSize: true,
				lineHeight: true,
				lineHeightUnit: true,
				paddingTop: true,
				paddingBottom: true,
				marginTop: true,
				marginBottom: true,
			};
		}

		function scheduleTextStyleApply() {
			window.clearTimeout( textStyleApplyTimer );
			textStyleApplyTimer = window.setTimeout( function() {
				textStyleApplyTimer = null;
				applyTextStyleFromControls( getDebouncedTextStyleChangeFlags() );
			}, STYLE_INPUT_DEBOUNCE_MS );
		}

		function cancelPendingTextStyleApply() {
			window.clearTimeout( textStyleApplyTimer );
			textStyleApplyTimer = null;
		}

		function flushPendingElementEdits( options ) {
			var settings = options || {};

			cancelPendingLinkApply();
			cancelPendingTextStyleApply();
			applyLinkFromControls( { skipHistory: !! settings.skipHistory, finalize: true } );
			applyTextStyleFromControls(
				{
					fontSize: true,
					lineHeight: true,
					lineHeightUnit: true,
					color: true,
					fontWeight: true,
					fontStyle: true,
					textDecorationUnderline: true,
					textDecorationLineThrough: true,
					backgroundColor: true,
					paddingTop: true,
					paddingBottom: true,
					marginTop: true,
					marginBottom: true,
				},
				null,
				{ skipHistory: !! settings.skipHistory }
			);
			flushStylePreviewRefresh();
		}

		function isPanelTypingFocus() {
			var activeEl = document.activeElement;

			if ( ! activeEl || ! elementPanel ) {
				return false;
			}

			if ( ! elementPanel.contains( activeEl ) ) {
				return false;
			}

			return !! (
				activeEl.matches &&
				activeEl.matches( 'input, textarea, select, button' )
			);
		}

		function resetFontSizeStyle() {
			cancelPendingTextStyleApply();
			flushStyleHistoryCheckpoint();

			if ( fontSizeInput ) {
				fontSizeInput.value = '';
			}

			pushHistory();
			applyTextStyleFromControls( { fontSize: true }, { fontSize: '' }, { skipHistory: true } );
		}

		function resetLineHeightStyle() {
			cancelPendingTextStyleApply();
			flushStyleHistoryCheckpoint();

			if ( lineHeightInput ) {
				lineHeightInput.value = '';
			}

			if ( lineHeightUnitInput ) {
				lineHeightUnitInput.value = 'unitless';
			}

			pushHistory();
			applyTextStyleFromControls(
				{ lineHeight: true, lineHeightUnit: true },
				{ lineHeight: '', lineHeightUnit: 'unitless' },
				{ skipHistory: true }
			);
		}

		function resetTextColorStyle() {
			flushStyleHistoryCheckpoint();
			pushHistory();

			if ( textColorInput ) {
				textColorInput.value = '#000000';
			}

			applyTextStyleFromControls( { color: true }, { color: '' }, { skipHistory: true } );
		}

		function resetFontWeightStyle() {
			cancelPendingTextStyleApply();
			flushStyleHistoryCheckpoint();

			if ( fontWeightInput ) {
				fontWeightInput.value = '';
			}

			pushHistory();
			applyTextStyleFromControls( { fontWeight: true }, { fontWeight: '' }, { skipHistory: true } );
		}

		function resetBackgroundColorStyle() {
			flushStyleHistoryCheckpoint();
			pushHistory();

			if ( backgroundColorInput ) {
				backgroundColorInput.value = '#ffffff';
			}

			applyTextStyleFromControls( { backgroundColor: true }, { backgroundColor: '' }, { skipHistory: true } );
		}

		function resetPaddingTopStyle() {
			cancelPendingTextStyleApply();
			flushStyleHistoryCheckpoint();

			if ( paddingTopInput ) {
				paddingTopInput.value = '';
			}

			pushHistory();
			applyTextStyleFromControls( { paddingTop: true }, { paddingTop: '' }, { skipHistory: true } );
		}

		function resetPaddingBottomStyle() {
			cancelPendingTextStyleApply();
			flushStyleHistoryCheckpoint();

			if ( paddingBottomInput ) {
				paddingBottomInput.value = '';
			}

			pushHistory();
			applyTextStyleFromControls( { paddingBottom: true }, { paddingBottom: '' }, { skipHistory: true } );
		}

		function resetMarginTopStyle() {
			cancelPendingTextStyleApply();
			flushStyleHistoryCheckpoint();

			if ( marginTopInput ) {
				marginTopInput.value = '';
			}

			pushHistory();
			applyTextStyleFromControls( { marginTop: true }, { marginTop: '' }, { skipHistory: true } );
		}

		function resetMarginBottomStyle() {
			cancelPendingTextStyleApply();
			flushStyleHistoryCheckpoint();

			if ( marginBottomInput ) {
				marginBottomInput.value = '';
			}

			pushHistory();
			applyTextStyleFromControls( { marginBottom: true }, { marginBottom: '' }, { skipHistory: true } );
		}

		function openPanel( locator ) {
			closePageSettingsPanel();
			closeLinkOptions();
			elementPanel.hidden = false;
			structureView.hidden = true;
			updateElementSummary( locator );
			syncElementControls( locator );
		}

		function closePanel() {
			cancelPendingLinkApply();
			cancelPendingTextStyleApply();
			closeLinkOptions();
			elementPanel.hidden = true;
			updateElementSummary( null );
			syncElementControls( null );

			if ( ! settingsPanel || settingsPanel.hidden ) {
				structureView.hidden = false;
			}
		}

		function clearActiveElement() {
			clearSelectedElementLocator();
		}

		if ( elementClose ) {
			elementClose.addEventListener( 'click', clearActiveElement );
		}

		if ( elementParentButton ) {
			elementParentButton.addEventListener( 'click', selectParentElement );
		}

		if ( linkSettingsToggle ) {
			linkSettingsToggle.addEventListener( 'click', function() {
				toggleLinkOptions();
			} );
		}

		if ( imagePickerButton ) {
			imagePickerButton.addEventListener( 'click', openImageMediaPicker );
		}

		if ( linkUrlInput ) {
			linkUrlInput.addEventListener( 'input', scheduleLinkApply );
			linkUrlInput.addEventListener( 'blur', function( event ) {
				var relatedTarget = event.relatedTarget;

				cancelPendingLinkApply();

				if ( isSyncingLinkControls ) {
					return;
				}

				if ( ! relatedTarget || ! elementPanel.contains( relatedTarget ) ) {
					return;
				}

				applyLinkFromControls( { finalize: true } );
			} );
		}

		if ( linkBlankCheckbox ) {
			linkBlankCheckbox.addEventListener( 'change', function() {
				applyLinkFromControls( { finalize: true } );
			} );
		}

		if ( fontSizeInput ) {
			fontSizeInput.addEventListener( 'input', scheduleTextStyleApply );
			fontSizeInput.addEventListener( 'change', function() {
				cancelPendingTextStyleApply();
				applyTextStyleFromControls( getDebouncedTextStyleChangeFlags() );
			} );
		}

		if ( lineHeightInput ) {
			lineHeightInput.addEventListener( 'input', scheduleTextStyleApply );
			lineHeightInput.addEventListener( 'change', function() {
				cancelPendingTextStyleApply();
				applyTextStyleFromControls( getDebouncedTextStyleChangeFlags() );
			} );
		}

		if ( lineHeightUnitInput ) {
			lineHeightUnitInput.addEventListener( 'change', function() {
				cancelPendingTextStyleApply();
				applyTextStyleFromControls( getDebouncedTextStyleChangeFlags() );
			} );
		}

		if ( textColorInput ) {
			textColorInput.addEventListener( 'input', function() {
				if ( isSyncingTextStyleControls ) {
					return;
				}

				applyTextStyleFromControls( { color: true } );
			} );
			textColorInput.addEventListener( 'change', function() {
				if ( isSyncingTextStyleControls ) {
					return;
				}

				applyTextStyleFromControls( { color: true } );
			} );
		}

		if ( fontWeightInput ) {
			fontWeightInput.addEventListener( 'change', function() {
				applyTextStyleFromControls( { fontWeight: true } );
			} );
		}

		if ( italicToggle ) {
			italicToggle.addEventListener( 'click', function() {
				var isActive;

				if ( isSyncingTextStyleControls ) {
					return;
				}

				isActive = italicToggle.classList.contains( 'is-active' );
				applyTextStyleFromControls(
					{ fontStyle: true },
					{ fontStyle: isActive ? '' : 'italic' }
				);
			} );
		}

		if ( underlineToggle ) {
			underlineToggle.addEventListener( 'click', function() {
				if ( isSyncingTextStyleControls ) {
					return;
				}

				applyTextStyleFromControls(
					{ textDecorationUnderline: true, textDecorationLineThrough: true },
					{
						textDecorationUnderline: ! underlineToggle.classList.contains( 'is-active' ),
						textDecorationLineThrough: lineThroughToggle && lineThroughToggle.classList.contains( 'is-active' ),
					}
				);
			} );
		}

		if ( lineThroughToggle ) {
			lineThroughToggle.addEventListener( 'click', function() {
				if ( isSyncingTextStyleControls ) {
					return;
				}

				applyTextStyleFromControls(
					{ textDecorationUnderline: true, textDecorationLineThrough: true },
					{
						textDecorationUnderline: underlineToggle && underlineToggle.classList.contains( 'is-active' ),
						textDecorationLineThrough: ! lineThroughToggle.classList.contains( 'is-active' ),
					}
				);
			} );
		}

		if ( backgroundColorInput ) {
			backgroundColorInput.addEventListener( 'input', function() {
				if ( isSyncingTextStyleControls ) {
					return;
				}

				applyTextStyleFromControls( { backgroundColor: true } );
			} );
			backgroundColorInput.addEventListener( 'change', function() {
				if ( isSyncingTextStyleControls ) {
					return;
				}

				applyTextStyleFromControls( { backgroundColor: true } );
			} );
		}

		if ( fontSizeResetButton ) {
			fontSizeResetButton.addEventListener( 'click', resetFontSizeStyle );
		}

		if ( lineHeightResetButton ) {
			lineHeightResetButton.addEventListener( 'click', resetLineHeightStyle );
		}

		if ( textColorResetButton ) {
			textColorResetButton.addEventListener( 'click', resetTextColorStyle );
		}

		if ( fontWeightResetButton ) {
			fontWeightResetButton.addEventListener( 'click', resetFontWeightStyle );
		}

		if ( backgroundColorResetButton ) {
			backgroundColorResetButton.addEventListener( 'click', resetBackgroundColorStyle );
		}

		if ( paddingTopInput ) {
			paddingTopInput.addEventListener( 'input', scheduleTextStyleApply );
			paddingTopInput.addEventListener( 'change', function() {
				cancelPendingTextStyleApply();
				applyTextStyleFromControls( getDebouncedTextStyleChangeFlags() );
			} );
		}

		if ( paddingBottomInput ) {
			paddingBottomInput.addEventListener( 'input', scheduleTextStyleApply );
			paddingBottomInput.addEventListener( 'change', function() {
				cancelPendingTextStyleApply();
				applyTextStyleFromControls( getDebouncedTextStyleChangeFlags() );
			} );
		}

		if ( paddingTopResetButton ) {
			paddingTopResetButton.addEventListener( 'click', resetPaddingTopStyle );
		}

		if ( paddingBottomResetButton ) {
			paddingBottomResetButton.addEventListener( 'click', resetPaddingBottomStyle );
		}

		if ( marginTopInput ) {
			marginTopInput.addEventListener( 'input', scheduleTextStyleApply );
			marginTopInput.addEventListener( 'change', function() {
				cancelPendingTextStyleApply();
				applyTextStyleFromControls( getDebouncedTextStyleChangeFlags() );
			} );
		}

		if ( marginBottomInput ) {
			marginBottomInput.addEventListener( 'input', scheduleTextStyleApply );
			marginBottomInput.addEventListener( 'change', function() {
				cancelPendingTextStyleApply();
				applyTextStyleFromControls( getDebouncedTextStyleChangeFlags() );
			} );
		}

		if ( marginTopResetButton ) {
			marginTopResetButton.addEventListener( 'click', resetMarginTopStyle );
		}

		if ( marginBottomResetButton ) {
			marginBottomResetButton.addEventListener( 'click', resetMarginBottomStyle );
		}

		return {
			openPanel: openPanel,
			closePanel: closePanel,
			clearActiveElement: clearActiveElement,
			cancelPendingLinkApply: cancelPendingLinkApply,
			cancelPendingTextStyleApply: cancelPendingTextStyleApply,
			flushPendingElementEdits: flushPendingElementEdits,
			syncElementControls: syncElementControls,
			isPanelTypingFocus: isPanelTypingFocus,
		};
	}

	function findAllSubstringIndices( haystack, needle ) {
		var indices = [];
		var position = 0;

		if ( ! haystack || ! needle ) {
			return indices;
		}

		position = haystack.indexOf( needle, position );

		while ( -1 !== position ) {
			indices.push( position );
			position = haystack.indexOf( needle, position + needle.length );
		}

		return indices;
	}

	function getDuplicateMatchIndex( doc, path ) {
		var target;
		var targetOuter;
		var matches = [];
		var walker;
		var node;

		target = findElementByPath( doc.body, path );

		if ( ! target ) {
			return 0;
		}

		targetOuter = target.outerHTML;
		walker = doc.createTreeWalker( doc.body, NodeFilter.SHOW_ELEMENT );

		while ( walker.nextNode() ) {
			node = walker.currentNode;

			if ( node.outerHTML === targetOuter ) {
				matches.push( node );
			}
		}

		node = matches.indexOf( target );

		return node < 0 ? 0 : node;
	}

	function findArtVslShortcodeRange( html ) {
		var match;

		if ( ! html ) {
			return null;
		}

		match = html.match( /\[art_vsl[^\]]*\]/i );

		if ( ! match || 'number' !== typeof match.index ) {
			return null;
		}

		return {
			start: match.index,
			end: match.index + match[ 0 ].length,
		};
	}

	function findIframeRangeInCode( html, outerHtml ) {
		var srcMatch;
		var src;
		var pattern;
		var tagMatch;
		var start;

		if ( ! html || ! outerHtml ) {
			return null;
		}

		srcMatch = outerHtml.match( /\ssrc=["']([^"']+)["']/i );

		if ( srcMatch && srcMatch[ 1 ] ) {
			src = srcMatch[ 1 ].replace( /[.*+?^${}()|[\]\\]/g, '\\$&' );
			pattern = new RegExp( '<iframe\\b[^>]*\\bsrc=["\']' + src + '["\'][^>]*>', 'i' );
			tagMatch = html.match( pattern );

			if ( tagMatch && 'number' === typeof tagMatch.index ) {
				start = tagMatch.index;

				return {
					start: start,
					end: start + tagMatch[ 0 ].length,
				};
			}
		}

		tagMatch = html.match( /<iframe\b[^>]*>/i );

		if ( ! tagMatch || 'number' !== typeof tagMatch.index ) {
			return null;
		}

		start = tagMatch.index;

		return {
			start: start,
			end: start + tagMatch[ 0 ].length,
		};
	}

	function findRangeByTextContent( html, tag, text ) {
		var textIndex;
		var start;
		var end;
		var closeTag;
		var closeIndex;
		var tagName;

		if ( ! html || ! text ) {
			return null;
		}

		textIndex = html.indexOf( text );

		if ( textIndex < 0 ) {
			return null;
		}

		tagName = String( tag || '' ).toLowerCase();

		if ( tagName ) {
			start = html.lastIndexOf( '<', textIndex );
			closeTag = '</' + tagName + '>';
			closeIndex = html.indexOf( closeTag, textIndex );

			if ( start >= 0 && closeIndex >= 0 ) {
				return {
					start: start,
					end: closeIndex + closeTag.length,
				};
			}
		}

		return {
			start: textIndex,
			end: textIndex + text.length,
		};
	}

	function absoluteIndexToCodeMirrorPos( cm, index ) {
		var line;
		var text;
		var remaining;
		var lastLine;

		remaining = Math.max( 0, index );

		for ( line = 0; line < cm.lineCount(); line++ ) {
			text = cm.getLine( line );

			if ( remaining <= text.length ) {
				return {
					line: line,
					ch: remaining,
				};
			}

			remaining -= text.length + 1;
		}

		lastLine = Math.max( 0, cm.lineCount() - 1 );

		return {
			line: lastLine,
			ch: cm.getLine( lastLine ).length,
		};
	}

	function findElementRangeInCode( html, locator ) {
		var doc;
		var element;
		var outerHtml;
		var indices;
		var matchIndex;
		var start;
		var range;

		if ( ! html || ! locator || ! Array.isArray( locator.path ) || ! locator.path.length ) {
			return null;
		}

		if ( ! window.DOMParser ) {
			return null;
		}

		try {
			doc = parseBlockHtmlDocument( html );
			element = findElementByPath( doc.body, locator.path );

			if ( element ) {
				outerHtml = element.outerHTML;
				matchIndex = getDuplicateMatchIndex( doc, locator.path );
				indices = findAllSubstringIndices( html, outerHtml );

				if ( ! indices.length && locator.outerHtml ) {
					outerHtml = locator.outerHtml;
					indices = findAllSubstringIndices( html, outerHtml );
				}

				if ( indices.length ) {
					start = indices[ Math.min( matchIndex, indices.length - 1 ) ];

					return {
						start: start,
						end: start + outerHtml.length,
					};
				}
			}

			if ( locator.tag && 'IFRAME' === String( locator.tag ).toUpperCase() ) {
				if ( /art-vsl-embed|art-vsl|wp-block-art-vsl/i.test( locator.outerHtml || '' ) ) {
					range = findArtVslShortcodeRange( html );

					if ( range ) {
						return range;
					}
				}

				range = findIframeRangeInCode( html, locator.outerHtml );

				if ( range ) {
					return range;
				}
			}

			if ( locator.tag && 'VIDEO' === String( locator.tag ).toUpperCase() && /art-vsl|wp-block-art-vsl/i.test( locator.outerHtml || '' ) ) {
				range = findArtVslShortcodeRange( html );

				if ( range ) {
					return range;
				}
			}

			range = findRangeByTextContent( html, locator.tag, locator.textContent );

			return range;
		} catch ( error ) {
			return null;
		}
	}

	function highlightSelectedElementInCode() {
		var cm;
		var html;
		var range;
		var fromPos;
		var toPos;

		clearCodeElementHighlight();

		if ( ! codeEditorInstance || ! codeEditorInstance.codemirror || ! isSelectedElementLocatorForCurrentBlock() ) {
			return;
		}

		cm = codeEditorInstance.codemirror;
		html = cm.getValue();
		range = findElementRangeInCode( html, editorState.selectedElementLocator );

		if ( ! range ) {
			return;
		}

		fromPos = absoluteIndexToCodeMirrorPos( cm, range.start );
		toPos = absoluteIndexToCodeMirrorPos( cm, range.end );

		codeElementHighlightMark = cm.markText( fromPos, toPos, {
			className: 'art-editor-code-element-mark',
		} );

		cm.setCursor( fromPos );
		cm.scrollIntoView( {
			from: fromPos,
			to: toPos,
		}, 40 );
	}

	function initCodeEditor() {
		if ( ! codeInput || ! config.codeEditorSettings || ! window.wp || ! wp.codeEditor ) {
			return;
		}

		codeEditorInstance = wp.codeEditor.initialize( codeInput, config.codeEditorSettings );

		if ( ! codeEditorInstance || ! codeEditorInstance.codemirror ) {
			codeEditorInstance = null;
			return;
		}

		codeEditorInstance.codemirror.setSize( '100%', '100%' );
	}

	function bindCodeChangeEvents() {
		if ( codeEditorInstance && codeEditorInstance.codemirror ) {
			codeEditorInstance.codemirror.on( 'change', function() {
				if ( suppressCodeChangeEvents ) {
					return;
				}

				applyCodeChangeToBlock();
				clearSelectedElementLocator();
				scheduleCodeHistory();
				scheduleUnsavedIndicatorUpdate();
				updatePreview();
				updatePagePreview();
			} );

			return;
		}

		if ( codeInput ) {
			codeInput.addEventListener( 'input', function() {
				applyCodeChangeToBlock();
				clearSelectedElementLocator();
				scheduleCodeHistory();
				scheduleUnsavedIndicatorUpdate();
				updatePreview();
				updatePagePreview();
			} );
		}
	}

	function getBlockIndex( blockId ) {
		var index;

		for ( index = 0; index < editorState.blocks.length; index++ ) {
			if ( editorState.blocks[ index ].id === blockId ) {
				return index;
			}
		}

		return -1;
	}

	function normalizeBlockTitle( title ) {
		return String( title || '' ).replace( /\s+/g, ' ' ).trim();
	}

	function syncBlockTitles() {
		var index;

		for ( index = 0; index < editorState.blocks.length; index++ ) {
			if ( isAnchorBlock( editorState.blocks[ index ] ) ) {
				editorState.blocks[ index ].title = getAnchorBlockTitle( editorState.blocks[ index ].anchorId || '' );
				continue;
			}

			if ( ! editorState.blocks[ index ].titleLocked ) {
				editorState.blocks[ index ].title = getBlockTitle( editorState.blocks[ index ].content, index );
			}
		}
	}

	function selectAllText( node ) {
		var range;
		var selection;

		if ( ! node || ! window.getSelection ) {
			return;
		}

		range = document.createRange();
		range.selectNodeContents( node );
		selection = window.getSelection();
		selection.removeAllRanges();
		selection.addRange( range );
	}

	function finishBlockRename( blockId, label, revert ) {
		var block = getBlockById( blockId );
		var index;
		var nextTitle;

		if ( ! label ) {
			editorState.renamingBlockId = null;
			return;
		}

		label.contentEditable = 'false';
		label.classList.remove( 'is-editing' );

		if ( ! block ) {
			editorState.renamingBlockId = null;
			return;
		}

		if ( revert ) {
			label.textContent = block.title;
			editorState.renamingBlockId = null;
			return;
		}

		pushHistory();

		nextTitle = normalizeBlockTitle( label.textContent );
		index = getBlockIndex( blockId );

		if ( ! nextTitle ) {
			block.titleLocked = false;
			block.title = getBlockTitle( block.content, index );
		} else {
			block.title = nextTitle;
			block.titleLocked = true;
		}

		label.textContent = block.title;

		if ( label.parentElement ) {
			label.parentElement.title = block.title;
		}

		editorState.renamingBlockId = null;
		scheduleUnsavedIndicatorUpdate();
	}

	function startBlockRename( blockId, label ) {
		var block = getBlockById( blockId );

		if ( isSaving() || ! block || ! label || editorState.renamingBlockId ) {
			return;
		}

		editorState.renamingBlockId = blockId;
		label.textContent = block.title;
		label.classList.add( 'is-editing' );
		label.contentEditable = 'true';

		window.setTimeout( function() {
			label.focus();
			selectAllText( label );
		}, 0 );
	}

	function reorderBlocks( draggedId, targetId ) {
		var draggedIndex;
		var targetIndex;
		var movedBlock;

		if ( isSaving() ) {
			return;
		}

		if ( ! draggedId || ! targetId || draggedId === targetId ) {
			return;
		}

		pushHistory();
		commitCodeToSelectedBlock();
		draggedIndex = getBlockIndex( draggedId );
		targetIndex = getBlockIndex( targetId );

		if ( draggedIndex < 0 || targetIndex < 0 ) {
			return;
		}

		movedBlock = editorState.blocks.splice( draggedIndex, 1 )[ 0 ];
		editorState.blocks.splice( targetIndex, 0, movedBlock );
		structureDragState.suppressClick = true;
		renderStructure();
		updatePagePreview();
		scheduleUnsavedIndicatorUpdate();
	}

	function deleteBlock( blockId ) {
		var index;
		var nextIndex;

		if ( isSaving() ) {
			return;
		}

		index = getBlockIndex( blockId );

		if ( index < 0 ) {
			return;
		}

		pushHistory();
		commitCodeToSelectedBlock();
		editorState.blocks.splice( index, 1 );

		if ( editorState.selectedId === blockId ) {
			if ( editorState.blocks.length ) {
				nextIndex = Math.min( index, editorState.blocks.length - 1 );
				editorState.selectedId = editorState.blocks[ nextIndex ].id;
			} else {
				editorState.selectedId = null;
			}
		}

		renderStructure();
		syncCodeFromSelection();

		if ( ! editorState.blocks.length ) {
			// Empty structure: open Code so the user can paste HTML immediately.
			switchToCodeTab();
			setCodeEditorEnabled( true );
		} else if ( editorState.selectedId && ! isAnchorBlock( getBlockById( editorState.selectedId ) ) && typeof activateCanvasTab === 'function' ) {
			activateCanvasTab( 'edit' );
		}

		scheduleUnsavedIndicatorUpdate();
	}

	function bindStructureItem( item, button, label, deleteButton, block ) {
		item.draggable = true;

		item.addEventListener( 'dragstart', function( event ) {
			if ( isSaving() || editorState.renamingBlockId ) {
				event.preventDefault();
				return;
			}

			structureDragState.draggedId = block.id;
			item.classList.add( 'is-dragging' );
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData( 'text/plain', block.id );
		} );

		item.addEventListener( 'dragend', function() {
			item.classList.remove( 'is-dragging' );
			structureDragState.draggedId = null;

			window.setTimeout( function() {
				structureDragState.suppressClick = false;
			}, 0 );
		} );

		item.addEventListener( 'dragover', function( event ) {
			if ( ! structureDragState.draggedId || structureDragState.draggedId === block.id ) {
				return;
			}

			event.preventDefault();
			event.dataTransfer.dropEffect = 'move';
			item.classList.add( 'is-drag-over' );
		} );

		item.addEventListener( 'dragleave', function() {
			item.classList.remove( 'is-drag-over' );
		} );

		item.addEventListener( 'drop', function( event ) {
			var draggedId = event.dataTransfer.getData( 'text/plain' );

			if ( isSaving() ) {
				event.preventDefault();
				return;
			}

			event.preventDefault();
			item.classList.remove( 'is-drag-over' );
			reorderBlocks( draggedId, block.id );
		} );

		button.addEventListener( 'click', function( event ) {
			var blockId = event.currentTarget.getAttribute( 'data-block-id' );

			if ( structureDragState.suppressClick || editorState.renamingBlockId ) {
				return;
			}

			if ( blockId ) {
				selectBlock( blockId );
			}
		} );

		button.addEventListener( 'dblclick', function( event ) {
			event.preventDefault();
			startBlockRename( block.id, label );
		} );

		label.addEventListener( 'dblclick', function( event ) {
			event.preventDefault();
			event.stopPropagation();
			startBlockRename( block.id, label );
		} );

		label.addEventListener( 'blur', function() {
			if ( editorState.renamingBlockId === block.id ) {
				finishBlockRename( block.id, label, false );
			}
		} );

		label.addEventListener( 'keydown', function( event ) {
			if ( editorState.renamingBlockId !== block.id ) {
				return;
			}

			if ( 'Enter' === event.key ) {
				event.preventDefault();
				label.blur();
			}

			if ( 'Escape' === event.key ) {
				event.preventDefault();
				finishBlockRename( block.id, label, true );
			}
		} );

		label.addEventListener( 'click', function( event ) {
			if ( editorState.renamingBlockId === block.id ) {
				event.stopPropagation();
			}
		} );

		deleteButton.addEventListener( 'click', function( event ) {
			event.preventDefault();
			event.stopPropagation();
			structureDragState.suppressClick = true;
			deleteBlock( block.id );

			window.setTimeout( function() {
				structureDragState.suppressClick = false;
			}, 0 );
		} );

		deleteButton.addEventListener( 'mousedown', function( event ) {
			event.stopPropagation();
		} );

		deleteButton.addEventListener( 'dragstart', function( event ) {
			event.preventDefault();
			event.stopPropagation();
		} );
	}

	function getBlockById( blockId ) {
		var index;

		for ( index = 0; index < editorState.blocks.length; index++ ) {
			if ( editorState.blocks[ index ].id === blockId ) {
				return editorState.blocks[ index ];
			}
		}

		return null;
	}

	function getBlockTitle( html, index ) {
		var doc;
		var heading;
		var title;

		if ( ! html || ! String( html ).trim() ) {
			return ( i18n.emptyBlock || 'Пустой HTML-блок' ) + ' ' + ( index + 1 );
		}

		if ( window.DOMParser ) {
			try {
				doc = new window.DOMParser().parseFromString( html, 'text/html' );
				heading = doc.querySelector( 'h1, h2, h3' );

				if ( heading && heading.textContent ) {
					title = heading.textContent.replace( /\s+/g, ' ' ).trim();

					if ( title ) {
						return title;
					}
				}
			} catch ( error ) {
				// Fall through to the default title.
			}
		}

		return ( i18n.htmlBlock || 'HTML-блок' ) + ' ' + ( index + 1 );
	}

	function flushPendingElementEdits( options ) {
		if ( elementEditorController && elementEditorController.flushPendingElementEdits ) {
			elementEditorController.flushPendingElementEdits( options );
		}
	}

	function commitAnchorToSelectedBlock( options ) {
		var settings = options || {};
		var block = getBlockById( editorState.selectedId );
		var fromInput;
		var anchorId;
		var storedAnchorId;

		if ( ! isAnchorBlock( block ) ) {
			return;
		}

		storedAnchorId = getAnchorIdFromBlock( block );
		fromInput = anchorIdInput ? normalizeAnchorId( anchorIdInput.value ) : '';

		if ( fromInput ) {
			anchorId = fromInput;
		} else if ( settings.allowEmpty ) {
			anchorId = '';
		} else if ( anchorIdInput && document.activeElement === anchorIdInput ) {
			anchorId = '';
		} else {
			anchorId = storedAnchorId;
		}

		if ( anchorIdInput && anchorIdInput.value !== anchorId ) {
			anchorIdInput.value = anchorId;
		}

		block.anchorId = anchorId;
		block.content = buildAnchorBlockContent( anchorId );
		block.title = getAnchorBlockTitle( anchorId );
		block.titleLocked = true;
	}

	function commitCodeToSelectedBlock() {
		var block = getBlockById( editorState.selectedId );

		if ( isAnchorBlock( block ) ) {
			commitAnchorToSelectedBlock();
			return;
		}

		block = ensureBlockForCode();

		if ( ! block ) {
			return;
		}

		block.content = getCodeValue();

		if ( ! block.titleLocked ) {
			block.title = getBlockTitle( block.content, getBlockIndex( block.id ) );
		}
	}

	function createBlocksSaveSnapshot() {
		commitCodeToSelectedBlock();

		return JSON.stringify(
			editorState.blocks.map( mapBlockForSnapshot )
		);
	}

	function createSettingsSaveSnapshot() {
		return JSON.stringify( getPageSettingsFromDom() );
	}

	function updateSavedBlocksBaseline() {
		persistenceState.savedBlocksSnapshot = createBlocksSaveSnapshot();
		updateUnsavedIndicator();
	}

	function updateSavedSettingsBaseline() {
		persistenceState.savedSettingsSnapshot = createSettingsSaveSnapshot();
		updateUnsavedIndicator();
	}

	function updateSavedBaseline() {
		updateSavedBlocksBaseline();
		updateSavedSettingsBaseline();
	}

	function updateUnsavedIndicator() {
		updateSaveStateUi();
	}

	function updateSaveStateUi() {
		var indicator = document.getElementById( 'art-editor-unsaved-indicator' );
		var saveButton = document.getElementById( 'art-editor-save-button' );
		var dirty = isDirty();

		if ( indicator ) {
			indicator.hidden = ! dirty;
		}

		if ( saveButton ) {
			saveButton.classList.toggle( 'art-editor-screen__save-button--idle', ! dirty && ! isSaving() );
		}
	}

	function scheduleUnsavedIndicatorUpdate() {
		window.clearTimeout( unsavedIndicatorTimer );
		unsavedIndicatorTimer = window.setTimeout( function() {
			unsavedIndicatorTimer = null;
			updateUnsavedIndicator();
		}, 0 );
	}

	function isDirty() {
		return createBlocksSaveSnapshot() !== persistenceState.savedBlocksSnapshot ||
			createSettingsSaveSnapshot() !== persistenceState.savedSettingsSnapshot;
	}

	function isSaving() {
		return persistenceState.saveInFlight > 0;
	}

	function setElementsDisabledForSave( elements, disabled ) {
		elements.forEach( function( element ) {
			if ( ! element ) {
				return;
			}

			if ( disabled ) {
				if ( undefined === element.dataset.artEditorSaveDisabled ) {
					element.dataset.artEditorSaveDisabled = element.disabled ? '1' : '0';
				}

				element.disabled = true;
				return;
			}

			if ( undefined !== element.dataset.artEditorSaveDisabled ) {
				element.disabled = '1' === element.dataset.artEditorSaveDisabled;
				delete element.dataset.artEditorSaveDisabled;
			}
		} );
	}

	function updateEditorSaveLock() {
		var locked = isSaving();
		var workspace = document.querySelector( '.art-editor-screen__workspace' );
		var previewFrames = document.querySelectorAll( '.art-editor-screen__preview-frame' );
		var interactiveElements = [
			document.getElementById( 'art-editor-settings-toggle' ),
			document.getElementById( 'art-editor-preview-button' ),
			document.getElementById( 'art-editor-create-html' ),
		].concat(
			Array.prototype.slice.call( document.querySelectorAll( '.art-editor-screen__history-button' ) ),
			Array.prototype.slice.call( document.querySelectorAll( '.art-editor-screen__canvas-tab' ) ),
			Array.prototype.slice.call( document.querySelectorAll( '.art-editor-screen__device-button' ) )
		);

		document.body.classList.toggle( 'art-editor-screen--saving', locked );

		if ( workspace ) {
			workspace.setAttribute( 'aria-busy', locked ? 'true' : 'false' );
		}

		setCodeEditorEnabled( ! locked && ! isAnchorBlock( getBlockById( editorState.selectedId ) ) );
		setElementsDisabledForSave( interactiveElements, locked );

		previewFrames.forEach( function( frame ) {
			frame.style.pointerEvents = locked ? 'none' : '';
		} );
	}

	function shouldWarnBeforeLeave() {
		return isDirty() || isSaving();
	}

	function beginSaving() {
		persistenceState.saveInFlight += 1;
		updateEditorSaveLock();
		updateSaveStateUi();
	}

	function endSaving() {
		persistenceState.saveInFlight = Math.max( 0, persistenceState.saveInFlight - 1 );
		updateEditorSaveLock();
		updateSaveStateUi();
	}

	function initUnsavedChangesGuard() {
		var exitLink = document.querySelector( '.art-editor-screen__site-icon-link' );

		window.addEventListener( 'beforeunload', function( event ) {
			if ( ! shouldWarnBeforeLeave() ) {
				return;
			}

			event.preventDefault();
			event.returnValue = '';
		} );

		if ( ! exitLink ) {
			return;
		}

		exitLink.addEventListener( 'click', function( event ) {
			if ( ! shouldWarnBeforeLeave() ) {
				return;
			}

			if ( ! window.confirm( i18n.unsavedChangesConfirm || 'Есть несохранённые изменения. Уйти без сохранения?' ) ) {
				event.preventDefault();
			}
		} );
	}

	function createHistorySnapshot() {
		commitCodeToSelectedBlock();

		return {
			selectedId: editorState.selectedId,
			blocks: editorState.blocks.map( mapBlockForSnapshot ),
		};
	}

	function flushStyleHistoryCheckpoint() {
		window.clearTimeout( styleHistoryState.changeTimer );
		styleHistoryState.changeTimer = null;
		styleHistoryState.changePending = false;
	}

	function ensureStyleHistoryCheckpoint() {
		if ( ! styleHistoryState.changePending ) {
			pushHistory();
			styleHistoryState.changePending = true;
		}

		window.clearTimeout( styleHistoryState.changeTimer );
		styleHistoryState.changeTimer = window.setTimeout( function() {
			styleHistoryState.changePending = false;
			styleHistoryState.changeTimer = null;
		}, 500 );
	}

	function historySnapshotsEqual( left, right ) {
		return JSON.stringify( left ) === JSON.stringify( right );
	}

	function updateHistoryButtons() {
		if ( undoButton ) {
			undoButton.disabled = historyState.past.length === 0;
		}

		if ( redoButton ) {
			redoButton.disabled = historyState.future.length === 0;
		}
	}

	function resetHistory() {
		historyState.past = [];
		historyState.future = [];
		historyState.codeChangePending = false;
		window.clearTimeout( historyState.codeChangeTimer );
		historyState.codeChangeTimer = null;
		flushStyleHistoryCheckpoint();
		updateHistoryButtons();
	}

	function pushHistory() {
		var snapshot;

		if ( ! historyState.recording ) {
			return;
		}

		snapshot = createHistorySnapshot();

		if ( historyState.past.length ) {
			if ( historySnapshotsEqual( historyState.past[ historyState.past.length - 1 ], snapshot ) ) {
				return;
			}
		}

		historyState.past.push( snapshot );
		historyState.future = [];
		updateHistoryButtons();
	}

	function scheduleCodeHistory() {
		if ( ! historyState.codeChangePending ) {
			pushHistory();
			historyState.codeChangePending = true;
		}

		window.clearTimeout( historyState.codeChangeTimer );
		historyState.codeChangeTimer = window.setTimeout( function() {
			historyState.codeChangePending = false;
			historyState.codeChangeTimer = null;
		}, 500 );
	}

	function applyHistorySnapshot( snapshot ) {
		if ( ! snapshot ) {
			return;
		}

		historyState.recording = false;
		editorState.selectedId = snapshot.selectedId;
		editorState.blocks = snapshot.blocks.map( function( block ) {
			var nextBlock = {
				id: block.id,
				title: block.title,
				titleLocked: !! block.titleLocked,
				content: block.content || '',
				type: block.type || 'html',
			};

			if ( isAnchorBlock( nextBlock ) ) {
				nextBlock.anchorId = block.anchorId || '';
			}

			return nextBlock;
		} );
		editorState.renamingBlockId = null;
		renderStructure();
		syncCodeFromSelection();

		if (
			elementEditorController &&
			elementEditorController.syncElementControls &&
			editorState.selectedElementLocator &&
			isSelectedElementLocatorForCurrentBlock()
		) {
			elementEditorController.syncElementControls( editorState.selectedElementLocator );
		}

		historyState.recording = true;
		scheduleUnsavedIndicatorUpdate();
	}

	function undoChange() {
		var previous;

		if ( isSaving() || ! historyState.past.length ) {
			return;
		}

		flushStyleHistoryCheckpoint();
		commitCodeToSelectedBlock();
		historyState.future.push( createHistorySnapshot() );
		previous = historyState.past.pop();
		applyHistorySnapshot( previous );
		updateHistoryButtons();
	}

	function redoChange() {
		var next;

		if ( isSaving() || ! historyState.future.length ) {
			return;
		}

		flushStyleHistoryCheckpoint();
		commitCodeToSelectedBlock();
		historyState.past.push( createHistorySnapshot() );
		next = historyState.future.pop();
		applyHistorySnapshot( next );
		updateHistoryButtons();
	}

	function isHistoryShortcutTarget( target ) {
		if ( ! target || ! target.closest ) {
			return true;
		}

		if ( target.closest( '#art-editor-settings-panel' ) ) {
			return false;
		}

		if ( target.isContentEditable ) {
			return false;
		}

		return true;
	}

	function isFormFieldElement( element ) {
		var tagName;

		if ( ! element || element === document.body || element === document.documentElement ) {
			return false;
		}

		if ( element.isContentEditable ) {
			return true;
		}

		tagName = element.tagName;

		if ( 'INPUT' === tagName || 'TEXTAREA' === tagName || 'SELECT' === tagName ) {
			return true;
		}

		if ( element.closest && element.closest( '.CodeMirror' ) ) {
			return true;
		}

		return false;
	}

	function isElementDeleteShortcutTarget( target ) {
		if ( isFormFieldElement( document.activeElement ) ) {
			return false;
		}

		if ( editorState.renamingBlockId ) {
			return false;
		}

		if ( ! target || ! target.closest ) {
			return true;
		}

		if ( target.isContentEditable ) {
			return false;
		}

		if ( target.closest( 'input, textarea, select' ) ) {
			return false;
		}

		if ( target.closest( '#art-editor-element-panel input, #art-editor-element-panel textarea, #art-editor-element-panel select' ) ) {
			return false;
		}

		if ( target.closest( '.CodeMirror' ) ) {
			return false;
		}

		if ( target.closest( '#art-editor-settings-panel' ) ) {
			return false;
		}

		return true;
	}

	function handleElementDeleteShortcut( event ) {
		if ( isSaving() ) {
			return;
		}

		if ( 'Delete' !== event.key ) {
			return;
		}

		if ( ! editorState.selectedElementLocator || ! isSelectedElementLocatorForCurrentBlock() ) {
			return;
		}

		if ( 'edit' !== getActiveCanvasTabName() ) {
			return;
		}

		if ( ! isElementDeleteShortcutTarget( event.target ) ) {
			return;
		}

		if ( deleteSelectedElement() ) {
			event.preventDefault();
		}
	}

	function handleElementPanelEscape( event ) {
		var elementPanel;

		if ( 'Escape' !== event.key ) {
			return;
		}

		if ( editorState.renamingBlockId ) {
			return;
		}

		if ( document.body.classList.contains( 'modal-open' ) ) {
			return;
		}

		elementPanel = document.getElementById( 'art-editor-element-panel' );

		if ( ! elementPanel || elementPanel.hidden || ! editorState.selectedElementLocator ) {
			return;
		}

		if ( ! elementEditorController ) {
			return;
		}

		event.preventDefault();
		elementEditorController.clearActiveElement();
	}

	function handleHistoryShortcut( event ) {
		var isMeta = event.ctrlKey || event.metaKey;

		if ( isSaving() || ! isMeta || editorState.renamingBlockId ) {
			return false;
		}

		// CodeMirror history keys are bound via extraKeys to avoid double undo.
		if ( event.target && event.target.closest && event.target.closest( '.CodeMirror' ) ) {
			return false;
		}

		if ( ! isHistoryShortcutTarget( event.target ) ) {
			return false;
		}

		if ( 'z' === event.key && ! event.shiftKey ) {
			event.preventDefault();
			event.stopPropagation();
			undoChange();
			return true;
		}

		if ( 'z' === event.key && event.shiftKey ) {
			event.preventDefault();
			event.stopPropagation();
			redoChange();
			return true;
		}

		if ( 'y' === event.key ) {
			event.preventDefault();
			event.stopPropagation();
			redoChange();
			return true;
		}

		return false;
	}

	function bindCodeMirrorHistoryKeys() {
		var cm;
		var extraKeys;

		if ( ! codeEditorInstance || ! codeEditorInstance.codemirror ) {
			return;
		}

		cm = codeEditorInstance.codemirror;
		extraKeys = cm.getOption( 'extraKeys' );

		if ( ! extraKeys || typeof extraKeys !== 'object' || Array.isArray( extraKeys ) ) {
			extraKeys = {};
		} else {
			extraKeys = Object.assign( {}, extraKeys );
		}

		extraKeys[ 'Ctrl-Z' ] = function() {
			undoChange();
		};
		extraKeys[ 'Cmd-Z' ] = function() {
			undoChange();
		};
		extraKeys[ 'Shift-Ctrl-Z' ] = function() {
			redoChange();
		};
		extraKeys[ 'Shift-Cmd-Z' ] = function() {
			redoChange();
		};
		extraKeys[ 'Ctrl-Y' ] = function() {
			redoChange();
		};
		extraKeys[ 'Cmd-Y' ] = function() {
			redoChange();
		};

		cm.setOption( 'extraKeys', extraKeys );
	}

	function initHistoryControls() {
		if ( undoButton ) {
			undoButton.addEventListener( 'click', undoChange );
		}

		if ( redoButton ) {
			redoButton.addEventListener( 'click', redoChange );
		}

		document.addEventListener( 'keydown', handleHistoryShortcut );
		document.addEventListener( 'keydown', handleElementDeleteShortcut );
		document.addEventListener( 'keydown', handleElementPanelEscape );

		bindCodeMirrorHistoryKeys();
	}

	function setPreviewHealth( target, message ) {
		if ( 'edit' === target ) {
			previewHealth.edit = message || '';
		} else if ( 'view' === target ) {
			previewHealth.view = message || '';
		}

		syncPreviewStatusBanner();
	}

	function syncPreviewStatusBanner() {
		var tab = getActiveCanvasTabName();
		var message = '';

		if ( ! previewStatusBanner || ! previewStatusText ) {
			return;
		}

		if ( 'edit' === tab ) {
			message = previewHealth.edit;
		} else if ( 'view' === tab ) {
			message = previewHealth.view;
		}

		if ( message ) {
			previewStatusText.textContent = message;
			previewStatusBanner.hidden = false;

			if ( previewStatusRetry ) {
				previewStatusRetry.hidden = false;
			}
		} else {
			previewStatusText.textContent = '';
			previewStatusBanner.hidden = true;

			if ( previewStatusRetry ) {
				previewStatusRetry.hidden = true;
			}
		}
	}

	function retryPreviewUpdate() {
		var tab = getActiveCanvasTabName();
		var loadingOptions = { showLoading: true };

		if ( 'edit' === tab ) {
			updatePreview( loadingOptions );
			return;
		}

		if ( 'view' === tab ) {
			updatePagePreview( loadingOptions );
		}
	}

	function initPreviewStatusBanner() {
		if ( previewStatusRetry ) {
			previewStatusRetry.addEventListener( 'click', retryPreviewUpdate );
		}
	}

	function cloneElementPath( path ) {
		if ( ! path || ! path.length ) {
			return [];
		}

		return path.map( function( step ) {
			return {
				tag: step.tag,
				index: step.index,
			};
		} );
	}

	function elementPathsEqual( left, right ) {
		var index;

		if ( left === right ) {
			return true;
		}

		if ( ! left || ! right || left.length !== right.length ) {
			return false;
		}

		for ( index = 0; index < left.length; index++ ) {
			if ( ! left[ index ] || ! right[ index ] ) {
				return false;
			}

			if ( left[ index ].tag !== right[ index ].tag || left[ index ].index !== right[ index ].index ) {
				return false;
			}
		}

		return true;
	}

	function countBlockBodyStylePrefixLength( blockHtml ) {
		var doc;
		var children;
		var index;

		if ( ! blockHtml || ! window.DOMParser ) {
			return 0;
		}

		try {
			doc = parseBlockHtmlDocument( blockHtml );

			if ( ! doc.body ) {
				return 0;
			}

			children = doc.body.children;

			for ( index = 0; index < children.length; index++ ) {
				if ( 'STYLE' === children[ index ].tagName || 'LINK' === children[ index ].tagName ) {
					continue;
				}

				return index;
			}

			return children.length;
		} catch ( error ) {
			return 0;
		}
	}

	/**
	 * Move <style>/<link rel=stylesheet> to the start of body.
	 *
	 * Preview scoping extracts styles, so element paths skip them. Nested
	 * styles inside parents must be hoisted. Leading styles from serialize
	 * land in <head> on reparse (HTML parser rules) — move those into body
	 * too, or path indices diverge and selection restore closes the panel.
	 *
	 * @param {Document} doc Parsed HTML document.
	 */
	function hoistNestedBlockStyleElements( doc ) {
		var nodes;
		var collected = [];
		var fragment;
		var index;
		var node;
		var rel;

		if ( ! doc || ! doc.body ) {
			return;
		}

		// Whole document: nested in body AND styles DOMParser placed in <head>.
		nodes = doc.querySelectorAll( 'style, link' );

		for ( index = 0; index < nodes.length; index++ ) {
			node = nodes[ index ];

			if ( 'STYLE' === node.tagName ) {
				collected.push( node );
				continue;
			}

			rel = String( node.getAttribute( 'rel' ) || '' ).toLowerCase();

			if ( 'LINK' === node.tagName && -1 !== rel.indexOf( 'stylesheet' ) ) {
				collected.push( node );
			}
		}

		if ( ! collected.length ) {
			return;
		}

		fragment = doc.createDocumentFragment();

		for ( index = 0; index < collected.length; index++ ) {
			node = collected[ index ];

			if ( node.parentNode ) {
				node.parentNode.removeChild( node );
			}

			fragment.appendChild( node );
		}

		doc.body.insertBefore( fragment, doc.body.firstChild );
	}

	/**
	 * Parse block HTML and hoist nested styles for path parity with preview.
	 *
	 * @param {string} html Block HTML.
	 * @return {Document|null}
	 */
	function parseBlockHtmlDocument( html ) {
		var doc;

		if ( ! window.DOMParser ) {
			return null;
		}

		doc = new window.DOMParser().parseFromString( String( html || '' ), 'text/html' );

		if ( ! doc || ! doc.body ) {
			return doc;
		}

		hoistNestedBlockStyleElements( doc );

		return doc;
	}

	function findElementPathInBlockHtml( blockHtml, path ) {
		var doc;

		if ( ! blockHtml || ! window.DOMParser || ! path || ! path.length ) {
			return null;
		}

		try {
			doc = parseBlockHtmlDocument( blockHtml );

			return findElementByPath( doc.body, path );
		} catch ( error ) {
			return null;
		}
	}

	function stripPreviewShellPrefixFromPath( path ) {
		var stripped = cloneElementPath( path );

		if ( stripped.length >= 3 && 'DIV' === stripped[ 0 ].tag && 'DIV' === stripped[ 1 ].tag && 'DIV' === stripped[ 2 ].tag ) {
			return stripped.slice( 3 );
		}

		if ( stripped.length >= 1 && 'DIV' === stripped[ 0 ].tag ) {
			return stripped.slice( 1 );
		}

		return stripped;
	}

	function applyStyleOffsetToElementPath( path, blockHtml ) {
		var adjusted = cloneElementPath( path );
		var styleOffset = countBlockBodyStylePrefixLength( blockHtml );

		if ( ! styleOffset || ! adjusted.length ) {
			return adjusted;
		}

		adjusted[ 0 ] = {
			tag: adjusted[ 0 ].tag,
			index: adjusted[ 0 ].index + styleOffset,
		};

		return adjusted;
	}

	function normalizePreviewElementPathToBlockContent( previewPath, blockHtml ) {
		var stripped;
		var adjusted;
		var shellStripped;

		if ( ! previewPath || ! previewPath.length ) {
			return previewPath || [];
		}

		if ( findElementPathInBlockHtml( blockHtml, previewPath ) ) {
			return cloneElementPath( previewPath );
		}

		stripped = stripPreviewShellPrefixFromPath( previewPath );
		shellStripped = stripped.length !== previewPath.length;

		if ( shellStripped ) {
			adjusted = applyStyleOffsetToElementPath( stripped, blockHtml );

			if ( findElementPathInBlockHtml( blockHtml, adjusted ) ) {
				return adjusted;
			}
		}

		adjusted = applyStyleOffsetToElementPath( previewPath, blockHtml );

		if ( findElementPathInBlockHtml( blockHtml, adjusted ) ) {
			return adjusted;
		}

		return cloneElementPath( previewPath );
	}

	function getPreviewHtmlBlockShellPath() {
		var doc;
		var htmlBlock;
		var path = [];
		var node;
		var parent;
		var index;

		if ( ! previewFrame || ! previewFrame.srcdoc || ! window.DOMParser ) {
			return null;
		}

		try {
			doc = new window.DOMParser().parseFromString( previewFrame.srcdoc, 'text/html' );

			if ( ! doc.body ) {
				return null;
			}

			htmlBlock = doc.querySelector( '.art-editor-html-block' );

			if ( ! htmlBlock ) {
				return null;
			}

			node = htmlBlock;

			while ( node && node !== doc.body ) {
				parent = node.parentElement;

				if ( ! parent ) {
					break;
				}

				index = Array.prototype.indexOf.call( parent.children, node );
				path.unshift( {
					tag: node.tagName,
					index: index,
				} );
				node = parent;
			}

			return path.length ? path : null;
		} catch ( error ) {
			return null;
		}
	}

	function previewUsesScopedBlockWrapper() {
		return !! ( previewFrame && previewFrame.srcdoc && -1 !== previewFrame.srcdoc.indexOf( 'art-editor-html-block' ) );
	}

	function expandBlockContentPathForPreviewIframe( blockPath, blockHtml, layoutMode ) {
		var path = cloneElementPath( blockPath );
		var shellPath;
		var styleOffset;

		if ( ! path.length ) {
			return path;
		}

		if ( ! previewUsesScopedBlockWrapper() ) {
			return path;
		}

		styleOffset = countBlockBodyStylePrefixLength( blockHtml );

		if ( styleOffset ) {
			path[ 0 ] = {
				tag: path[ 0 ].tag,
				index: path[ 0 ].index - styleOffset,
			};
		}

		shellPath = getPreviewHtmlBlockShellPath();

		if ( shellPath && shellPath.length ) {
			return shellPath.concat( path );
		}

		if ( 'canvas' === layoutMode ) {
			return [
				{ tag: 'DIV', index: 0 },
				{ tag: 'DIV', index: 0 },
				{ tag: 'DIV', index: 1 },
			].concat( path );
		}

		return [
			{ tag: 'DIV', index: 1 },
		].concat( path );
	}

	function findElementByPath( root, path ) {
		var node = root;
		var index;
		var step;
		var children;

		if ( ! root || ! path || ! path.length ) {
			return null;
		}

		for ( index = 0; index < path.length; index++ ) {
			step = path[ index ];

			if ( ! node || ! node.children ) {
				return null;
			}

			children = node.children;

			if ( step.index < 0 || step.index >= children.length ) {
				return null;
			}

			node = children[ step.index ];

			if ( step.tag && node.tagName !== step.tag ) {
				return null;
			}
		}

		return node;
	}

	function getElementPathFromNode( node, body ) {
		var path = [];
		var parent;
		var index;

		if ( ! node || ! body ) {
			return path;
		}

		while ( node && node !== body && node !== body.ownerDocument.documentElement ) {
			parent = node.parentElement;

			if ( ! parent ) {
				break;
			}

			index = Array.prototype.indexOf.call( parent.children, node );
			path.unshift( {
				tag: node.tagName,
				index: index,
			} );
			node = parent;
		}

		return path;
	}

	function findLinkAnchorForElement( target, body ) {
		var node = target;

		while ( node && node !== body ) {
			if ( 'A' === node.tagName ) {
				return node;
			}

			node = node.parentElement;
		}

		return null;
	}

	function elementHasLinkAnchorInHtml( html, path ) {
		var doc;
		var target;

		if ( ! html || ! window.DOMParser || ! path || ! path.length ) {
			return false;
		}

		try {
			doc = parseBlockHtmlDocument( html );
			target = findElementByPath( doc.body, path );

			return !! ( target && findLinkAnchorForElement( target, doc.body ) );
		} catch ( error ) {
			return false;
		}
	}

	function normalizeLinkHref( href, options ) {
		var settings = options || {};
		var trimmed;
		var schemeMatch;

		if ( 'string' !== typeof href ) {
			return '';
		}

		trimmed = href.trim();

		if ( ! trimmed ) {
			return '';
		}

		if ( '#' === trimmed.charAt( 0 ) ) {
			return trimmed;
		}

		if ( '/' === trimmed.charAt( 0 ) ) {
			return trimmed;
		}

		if ( 0 === trimmed.indexOf( '//' ) ) {
			return settings.live ? trimmed : 'https:' + trimmed;
		}

		schemeMatch = trimmed.match( /^([a-z][a-z0-9+.-]*):/i );

		if ( schemeMatch ) {
			return trimmed;
		}

		if ( settings.live ) {
			return trimmed;
		}

		return 'https://' + trimmed;
	}

	function getElementLinkStateFromHtml( html, path ) {
		var doc;
		var target;
		var anchor;

		if ( ! html || ! window.DOMParser || ! path || ! path.length ) {
			return {
				href: '',
				openInNew: false,
			};
		}

		try {
			doc = parseBlockHtmlDocument( html );
			target = findElementByPath( doc.body, path );

			if ( ! target ) {
				return {
					href: '',
					openInNew: false,
				};
			}

			anchor = findLinkAnchorForElement( target, doc.body );

			if ( ! anchor ) {
				return {
					href: '',
					openInNew: false,
				};
			}

			return {
				href: anchor.getAttribute( 'href' ) || '',
				openInNew: '_blank' === anchor.getAttribute( 'target' ),
			};
		} catch ( error ) {
			return {
				href: '',
				openInNew: false,
			};
		}
	}

	function buildLocatorFromHtml( html, path ) {
		var doc;
		var target;

		if ( ! html || ! window.DOMParser || ! path || ! path.length ) {
			return null;
		}

		try {
			doc = parseBlockHtmlDocument( html );
			target = findElementByPath( doc.body, path );

			if ( ! target ) {
				return null;
			}

			return {
				blockId: editorState.selectedId,
				path: path,
				tag: target.tagName,
				outerHtml: target.outerHTML,
				textContent: ( target.textContent || '' ).replace( /\s+/g, ' ' ).trim(),
			};
		} catch ( error ) {
			return null;
		}
	}

	function isImageElementLocator( locator ) {
		return !! ( locator && locator.tag && 'IMG' === String( locator.tag ).toUpperCase() );
	}

	function isTextElementLocator( locator ) {
		var tag;
		var nonTextTags;

		if ( ! locator || ! locator.tag || isImageElementLocator( locator ) ) {
			return false;
		}

		nonTextTags = {
			VIDEO: 1,
			IFRAME: 1,
			SVG: 1,
			HR: 1,
			BR: 1,
			INPUT: 1,
			TEXTAREA: 1,
			SELECT: 1,
			BUTTON: 1,
			CANVAS: 1,
			PICTURE: 1,
			SOURCE: 1,
		};
		tag = String( locator.tag ).toUpperCase();

		if ( nonTextTags[ tag ] ) {
			return false;
		}

		return !! ( locator.textContent && String( locator.textContent ).replace( /\s+/g, '' ).length );
	}

	function isInlineTextStyleableLocator( locator ) {
		var tag;

		if ( ! isTextElementLocator( locator ) ) {
			return false;
		}

		tag = String( locator.tag || '' ).toUpperCase();

		return 'DIV' !== tag && 'SECTION' !== tag;
	}

	function isBlockSpacingStyleableLocator( locator ) {
		var tag;

		if ( ! locator || ! locator.path || ! locator.path.length ) {
			return false;
		}

		tag = String( locator.tag || '' ).toUpperCase();

		return 'DIV' === tag || 'SECTION' === tag;
	}

	function isMarginStyleableLocator( locator ) {
		return !! ( locator && locator.path && locator.path.length && ! isImageElementLocator( locator ) );
	}

	function cssColorToHex( color ) {
		var rgbMatch;
		var hex;

		color = String( color || '' ).trim();

		if ( ! color ) {
			return '';
		}

		if ( '#' === color.charAt( 0 ) ) {
			if ( 4 === color.length ) {
				return ( '#' + color.charAt( 1 ) + color.charAt( 1 ) + color.charAt( 2 ) + color.charAt( 2 ) + color.charAt( 3 ) + color.charAt( 3 ) ).toLowerCase();
			}

			return color.slice( 0, 7 ).toLowerCase();
		}

		rgbMatch = color.match( /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i );

		if ( ! rgbMatch ) {
			return '';
		}

		hex = [ rgbMatch[1], rgbMatch[2], rgbMatch[3] ].map( function( channel ) {
			var value = parseInt( channel, 10 ).toString( 16 );

			return 1 === value.length ? '0' + value : value;
		} ).join( '' );

		return '#' + hex;
	}

	function formatFontSizeForInput( value ) {
		var match;

		if ( 'string' !== typeof value ) {
			return '';
		}

		match = /^([\d.]+)px$/i.exec( value.trim() );

		if ( ! match ) {
			return '';
		}

		return match[1].replace( /\.0+$/, '' );
	}

	function normalizeFontSizeInput( value ) {
		var normalized;

		if ( 'number' === typeof value ) {
			value = String( value );
		}

		if ( 'string' !== typeof value ) {
			return '';
		}

		normalized = value.trim();

		if ( ! normalized ) {
			return '';
		}

		normalized = normalized.replace( /[^\d.]/g, '' );

		if ( ! normalized || ! /^\d+(\.\d+)?$/.test( normalized ) ) {
			return '';
		}

		return normalized;
	}

	function formatPxSpacingForInput( value ) {
		var match;

		if ( 'string' !== typeof value ) {
			return '';
		}

		match = /^(-?[\d.]+)px$/i.exec( value.trim() );

		if ( ! match ) {
			return '';
		}

		return match[1].replace( /\.0+$/, '' );
	}

	function normalizeMarginInput( value ) {
		var normalized;
		var isNegative;

		if ( 'number' === typeof value ) {
			value = String( value );
		}

		if ( 'string' !== typeof value ) {
			return '';
		}

		normalized = value.trim();

		if ( ! normalized ) {
			return '';
		}

		isNegative = '-' === normalized.charAt( 0 );
		normalized = normalized.replace( /[^\d.]/g, '' );

		if ( ! normalized || ! /^\d+(\.\d+)?$/.test( normalized ) ) {
			return '';
		}

		return ( isNegative ? '-' : '' ) + normalized;
	}

	function parseLineHeightInlineValue( value ) {
		var pxMatch;
		var percentMatch;
		var normalized;

		normalized = String( value || '' ).trim().toLowerCase();

		if ( ! normalized || 'normal' === normalized ) {
			return {
				value: '',
				unit: 'unitless',
			};
		}

		pxMatch = /^([\d.]+)px$/.exec( normalized );

		if ( pxMatch ) {
			return {
				value: pxMatch[1].replace( /\.0+$/, '' ),
				unit: 'px',
			};
		}

		percentMatch = /^([\d.]+)%$/.exec( normalized );

		if ( percentMatch ) {
			return {
				value: percentMatch[1].replace( /\.0+$/, '' ),
				unit: 'percent',
			};
		}

		if ( /^[\d.]+$/.test( normalized ) ) {
			return {
				value: normalized.replace( /\.0+$/, '' ),
				unit: 'unitless',
			};
		}

		return {
			value: '',
			unit: 'unitless',
		};
	}

	function sanitizeLineHeightUnit( unit ) {
		if ( 'px' === unit || 'percent' === unit ) {
			return unit;
		}

		return 'unitless';
	}

	function buildLineHeightCSSValue( value, unit ) {
		var normalized;

		normalized = normalizeFontSizeInput( value );

		if ( ! normalized ) {
			return '';
		}

		unit = sanitizeLineHeightUnit( unit );

		if ( 'px' === unit ) {
			return normalized + 'px';
		}

		if ( 'percent' === unit ) {
			return normalized + '%';
		}

		return normalized;
	}

	function formatFontWeightForInput( value ) {
		var normalized;

		if ( 'number' === typeof value ) {
			value = String( value );
		}

		if ( 'string' !== typeof value ) {
			return '';
		}

		normalized = value.trim().toLowerCase();

		if ( ! normalized ) {
			return '';
		}

		if ( 'normal' === normalized ) {
			return '400';
		}

		if ( 'bold' === normalized ) {
			return '700';
		}

		return normalizeFontWeightInput( normalized );
	}

	function normalizeFontWeightInput( value ) {
		var weight;

		if ( 'number' === typeof value ) {
			value = String( value );
		}

		if ( 'string' !== typeof value ) {
			return '';
		}

		weight = parseInt( value.trim(), 10 );

		if ( ! weight || weight < 100 || weight > 900 || weight % 100 !== 0 ) {
			return '';
		}

		return String( weight );
	}

	function formatFontStyleForInput( value ) {
		var normalized;

		normalized = String( value || '' ).trim().toLowerCase();

		if ( 'italic' === normalized || 'oblique' === normalized ) {
			return 'italic';
		}

		return '';
	}

	function parseTextDecorationFlags( value ) {
		var normalized;

		normalized = String( value || '' ).trim().toLowerCase();

		return {
			underline: -1 !== normalized.indexOf( 'underline' ),
			lineThrough: -1 !== normalized.indexOf( 'line-through' ),
		};
	}

	function buildTextDecorationFromFlags( underline, lineThrough ) {
		var parts = [];

		if ( underline ) {
			parts.push( 'underline' );
		}

		if ( lineThrough ) {
			parts.push( 'line-through' );
		}

		return parts.join( ' ' );
	}

	function clearAncestorLinkDecorationSuppression( target ) {
		var node;

		if ( ! target ) {
			return;
		}

		node = target.parentElement;

		while ( node && 'BODY' !== node.tagName ) {
			if ( 'A' !== node.tagName || ! node.style ) {
				node = node.parentElement;
				continue;
			}

			if ( 'none' === String( node.style.textDecoration || '' ).trim().toLowerCase() ) {
				node.style.removeProperty( 'text-decoration' );
				node.style.removeProperty( 'text-decoration-line' );

				if ( ! node.getAttribute( 'style' ) ) {
					node.removeAttribute( 'style' );
				}
			}

			node = node.parentElement;
		}
	}

	function clearTextDecorationInlineStyles( target ) {
		if ( ! target || ! target.style ) {
			return;
		}

		target.style.removeProperty( 'text-decoration' );
		target.style.removeProperty( 'text-decoration-line' );
		target.style.removeProperty( 'text-decoration-style' );
		target.style.removeProperty( 'text-decoration-color' );
		target.style.removeProperty( 'text-decoration-thickness' );
	}

	function getElementTextStyleStateFromHtml( html, path ) {
		var doc;
		var target;
		var fontSize;
		var lineHeightParts;
		var color;
		var fontWeight;
		var backgroundColor;
		var paddingTop;
		var paddingBottom;
		var marginTop;
		var marginBottom;
		var fontStyle;
		var decorationFlags;

		if ( ! html || ! window.DOMParser || ! path || ! path.length ) {
			return {
				fontSize: '',
				lineHeight: '',
				lineHeightUnit: 'unitless',
				color: '',
				fontWeight: '',
				fontStyle: '',
				textDecorationUnderline: false,
				textDecorationLineThrough: false,
				backgroundColor: '',
				paddingTop: '',
				paddingBottom: '',
				marginTop: '',
				marginBottom: '',
			};
		}

		try {
			doc = parseBlockHtmlDocument( html );
			target = findElementByPath( doc.body, path );

			if ( ! target ) {
				return {
					fontSize: '',
					lineHeight: '',
					lineHeightUnit: 'unitless',
					color: '',
					fontWeight: '',
					fontStyle: '',
					textDecorationUnderline: false,
					textDecorationLineThrough: false,
					backgroundColor: '',
					paddingTop: '',
					paddingBottom: '',
					marginTop: '',
					marginBottom: '',
				};
			}

			fontSize = formatFontSizeForInput( target.style.getPropertyValue( 'font-size' ) );
			lineHeightParts = parseLineHeightInlineValue( target.style.getPropertyValue( 'line-height' ) );
			color = cssColorToHex( target.style.getPropertyValue( 'color' ) );
			fontWeight = formatFontWeightForInput( target.style.getPropertyValue( 'font-weight' ) );
			fontStyle = formatFontStyleForInput( target.style.getPropertyValue( 'font-style' ) );
			decorationFlags = parseTextDecorationFlags(
				target.style.getPropertyValue( 'text-decoration-line' ) || target.style.getPropertyValue( 'text-decoration' )
			);
			backgroundColor = cssColorToHex( target.style.getPropertyValue( 'background-color' ) );
			paddingTop = formatPxSpacingForInput( target.style.getPropertyValue( 'padding-top' ) );
			paddingBottom = formatPxSpacingForInput( target.style.getPropertyValue( 'padding-bottom' ) );
			marginTop = formatPxSpacingForInput( target.style.getPropertyValue( 'margin-top' ) );
			marginBottom = formatPxSpacingForInput( target.style.getPropertyValue( 'margin-bottom' ) );

			return {
				fontSize: fontSize,
				lineHeight: lineHeightParts.value,
				lineHeightUnit: lineHeightParts.unit,
				color: color,
				fontWeight: fontWeight,
				fontStyle: fontStyle,
				textDecorationUnderline: decorationFlags.underline,
				textDecorationLineThrough: decorationFlags.lineThrough,
				backgroundColor: backgroundColor,
				paddingTop: paddingTop,
				paddingBottom: paddingBottom,
				marginTop: marginTop,
				marginBottom: marginBottom,
			};
		} catch ( error ) {
			return {
				fontSize: '',
				lineHeight: '',
				lineHeightUnit: 'unitless',
				color: '',
				fontWeight: '',
				fontStyle: '',
				textDecorationUnderline: false,
				textDecorationLineThrough: false,
				backgroundColor: '',
				paddingTop: '',
				paddingBottom: '',
				marginTop: '',
				marginBottom: '',
			};
		}
	}

	function applyElementTextStyleEdit( html, path, textStyles, changedProperties ) {
		var doc;
		var target;
		var fontSize;
		var lineHeight;
		var color;
		var fontWeight;
		var backgroundColor;
		var paddingTop;
		var paddingBottom;
		var marginTop;
		var marginBottom;
		var fontStyle;
		var textDecorationUnderline;
		var textDecorationLineThrough;
		var textDecoration;
		var shouldUpdateFontSize;
		var shouldUpdateLineHeight;
		var shouldUpdateColor;
		var shouldUpdateFontWeight;
		var shouldUpdateFontStyle;
		var shouldUpdateTextDecoration;
		var shouldUpdateBackgroundColor;
		var shouldUpdatePaddingTop;
		var shouldUpdatePaddingBottom;
		var shouldUpdateMarginTop;
		var shouldUpdateMarginBottom;

		if ( ! html || ! window.DOMParser || ! path || ! path.length || ! textStyles ) {
			return null;
		}

		shouldUpdateFontSize = ! changedProperties || changedProperties.fontSize;
		shouldUpdateLineHeight = ! changedProperties || changedProperties.lineHeight || changedProperties.lineHeightUnit;
		shouldUpdateColor = ! changedProperties || changedProperties.color;
		shouldUpdateFontWeight = ! changedProperties || changedProperties.fontWeight;
		shouldUpdateFontStyle = ! changedProperties || changedProperties.fontStyle;
		shouldUpdateTextDecoration = ! changedProperties || changedProperties.textDecorationUnderline || changedProperties.textDecorationLineThrough;
		shouldUpdateBackgroundColor = ! changedProperties || changedProperties.backgroundColor;
		shouldUpdatePaddingTop = ! changedProperties || changedProperties.paddingTop;
		shouldUpdatePaddingBottom = ! changedProperties || changedProperties.paddingBottom;
		shouldUpdateMarginTop = ! changedProperties || changedProperties.marginTop;
		shouldUpdateMarginBottom = ! changedProperties || changedProperties.marginBottom;
		fontSize = normalizeFontSizeInput( textStyles.fontSize );
		lineHeight = buildLineHeightCSSValue( textStyles.lineHeight, textStyles.lineHeightUnit );
		color = cssColorToHex( textStyles.color );
		fontWeight = normalizeFontWeightInput( textStyles.fontWeight );
		fontStyle = formatFontStyleForInput( textStyles.fontStyle );
		textDecorationUnderline = !! textStyles.textDecorationUnderline;
		textDecorationLineThrough = !! textStyles.textDecorationLineThrough;
		textDecoration = buildTextDecorationFromFlags( textDecorationUnderline, textDecorationLineThrough );
		backgroundColor = cssColorToHex( textStyles.backgroundColor );
		paddingTop = normalizeFontSizeInput( textStyles.paddingTop );
		paddingBottom = normalizeFontSizeInput( textStyles.paddingBottom );
		marginTop = normalizeMarginInput( textStyles.marginTop );
		marginBottom = normalizeMarginInput( textStyles.marginBottom );

		try {
			doc = parseBlockHtmlDocument( html );
			target = findElementByPath( doc.body, path );

			if ( ! target ) {
				return null;
			}

			if ( shouldUpdateFontSize ) {
				if ( fontSize ) {
					target.style.setProperty( 'font-size', fontSize + 'px' );
				} else {
					target.style.removeProperty( 'font-size' );
				}
			}

			if ( shouldUpdateLineHeight ) {
				if ( lineHeight ) {
					target.style.setProperty( 'line-height', lineHeight );
				} else {
					target.style.removeProperty( 'line-height' );
				}
			}

			if ( shouldUpdateColor ) {
				if ( color ) {
					target.style.setProperty( 'color', color );
				} else {
					target.style.removeProperty( 'color' );
				}
			}

			if ( shouldUpdateFontWeight ) {
				if ( fontWeight ) {
					target.style.setProperty( 'font-weight', fontWeight );
				} else {
					target.style.removeProperty( 'font-weight' );
				}
			}

			if ( shouldUpdateFontStyle ) {
				if ( fontStyle ) {
					target.style.setProperty( 'font-style', fontStyle );
				} else {
					target.style.removeProperty( 'font-style' );
				}
			}

			if ( shouldUpdateTextDecoration ) {
				if ( textDecoration ) {
					clearAncestorLinkDecorationSuppression( target );
					clearTextDecorationInlineStyles( target );
					target.style.setProperty( 'text-decoration-line', textDecoration );
				} else {
					clearTextDecorationInlineStyles( target );
				}
			}

			if ( shouldUpdateBackgroundColor ) {
				if ( backgroundColor ) {
					target.style.setProperty( 'background-color', backgroundColor );
				} else {
					target.style.removeProperty( 'background-color' );
				}
			}

			if ( shouldUpdatePaddingTop ) {
				if ( paddingTop ) {
					target.style.setProperty( 'padding-top', paddingTop + 'px', 'important' );
				} else {
					target.style.removeProperty( 'padding-top' );
				}
			}

			if ( shouldUpdatePaddingBottom ) {
				if ( paddingBottom ) {
					target.style.setProperty( 'padding-bottom', paddingBottom + 'px', 'important' );
				} else {
					target.style.removeProperty( 'padding-bottom' );
				}
			}

			if ( shouldUpdateMarginTop ) {
				if ( marginTop ) {
					target.style.setProperty( 'margin-top', marginTop + 'px', 'important' );
				} else {
					target.style.removeProperty( 'margin-top' );
				}
			}

			if ( shouldUpdateMarginBottom ) {
				if ( marginBottom ) {
					target.style.setProperty( 'margin-bottom', marginBottom + 'px', 'important' );
				} else {
					target.style.removeProperty( 'margin-bottom' );
				}
			}

			if ( ! target.getAttribute( 'style' ) ) {
				target.removeAttribute( 'style' );
			}

			return resolveEditedBlockHtmlAndSelectionPath( doc, target );
		} catch ( error ) {
			return null;
		}
	}

	/**
	 * Serialize edited DOM and resolve selection path against the canonical
	 * reparsed document (styles may move head↔body on round-trip).
	 *
	 * @param {Document} doc Edited document (styles still in tree).
	 * @param {Element} target Edited element still attached to doc.
	 * @return {{html: string, selectionPath: Array}|null}
	 */
	function resolveEditedBlockHtmlAndSelectionPath( doc, target ) {
		var html;
		var canonical;
		var resolved;
		var marker = 'data-art-editor-sel';
		var selectionPath;

		if ( ! doc || ! target ) {
			return null;
		}

		target.setAttribute( marker, '1' );
		html = serializeBlockContentFromDocument( doc );
		canonical = parseBlockHtmlDocument( html );

		if ( ! canonical || ! canonical.body ) {
			return {
				html: String( html || '' ).replace( /\s*data-art-editor-sel=(["'])1\1/g, '' ),
				selectionPath: getElementPathFromNode( target, doc.body ),
			};
		}

		resolved = canonical.body.querySelector( '[' + marker + '="1"]' );

		if ( resolved ) {
			resolved.removeAttribute( marker );
			selectionPath = getElementPathFromNode( resolved, canonical.body );
			html = serializeBlockContentFromDocument( canonical );

			return {
				html: html,
				selectionPath: selectionPath,
			};
		}

		selectionPath = getElementPathFromNode( target, doc.body );

		return {
			html: String( html || '' ).replace( /\s*data-art-editor-sel=(["'])1\1/g, '' ),
			selectionPath: selectionPath,
		};
	}

	function getAttachmentImageUrl( attachment ) {
		if ( ! attachment ) {
			return '';
		}

		if ( attachment.url ) {
			return attachment.url;
		}

		if ( attachment.sizes && attachment.sizes.full && attachment.sizes.full.url ) {
			return attachment.sizes.full.url;
		}

		if ( attachment.sizes && attachment.sizes.large && attachment.sizes.large.url ) {
			return attachment.sizes.large.url;
		}

		return '';
	}

	function getAttachmentAltText( attachment ) {
		if ( ! attachment ) {
			return '';
		}

		if ( attachment.alt ) {
			return String( attachment.alt ).trim();
		}

		if ( attachment.title ) {
			return String( attachment.title ).trim();
		}

		return '';
	}

	function applyElementImageSrcEdit( html, path, src, alt ) {
		var doc;
		var target;

		if ( ! html || ! window.DOMParser || ! path || ! path.length || ! src ) {
			return null;
		}

		try {
			doc = parseBlockHtmlDocument( html );
			target = findElementByPath( doc.body, path );

			if ( ! target || 'IMG' !== target.tagName ) {
				return null;
			}

			target.setAttribute( 'src', src );

			if ( alt ) {
				target.setAttribute( 'alt', alt );
			}

			return resolveEditedBlockHtmlAndSelectionPath( doc, target );
		} catch ( error ) {
			return null;
		}
	}

	function applyElementLinkAttributes( anchor, href, openInNew ) {
		anchor.setAttribute( 'href', href );

		if ( openInNew ) {
			anchor.setAttribute( 'target', '_blank' );
			anchor.setAttribute( 'rel', 'noopener noreferrer' );
		} else {
			anchor.removeAttribute( 'target' );
			anchor.removeAttribute( 'rel' );
		}
	}

	function applyElementLinkEdit( html, path, href, openInNew, options ) {
		var doc;
		var target;
		var anchor;
		var newAnchor;
		var settings = options || {};

		if ( ! html || ! window.DOMParser || ! path || ! path.length ) {
			return null;
		}

		href = normalizeLinkHref( href, { live: !! settings.live } );

		try {
			doc = parseBlockHtmlDocument( html );
			target = findElementByPath( doc.body, path );

			if ( ! target ) {
				return null;
			}

			anchor = findLinkAnchorForElement( target, doc.body );

			if ( ! href ) {
				if ( anchor ) {
					applyElementLinkAttributes( anchor, '', openInNew );
					return resolveEditedBlockHtmlAndSelectionPath( doc, target );
				}

				return null;
			}

			if ( anchor ) {
				applyElementLinkAttributes( anchor, href, openInNew );
				return resolveEditedBlockHtmlAndSelectionPath( doc, target );
			}

			newAnchor = doc.createElement( 'a' );
			applyElementLinkAttributes( newAnchor, href, openInNew );

			if ( ! target.parentElement ) {
				return null;
			}

			target.parentElement.insertBefore( newAnchor, target );
			newAnchor.appendChild( target );
			return resolveEditedBlockHtmlAndSelectionPath( doc, target );
		} catch ( error ) {
			return null;
		}
	}

	function applyElementDelete( html, path ) {
		var doc;
		var target;

		if ( ! html || ! window.DOMParser || ! path || ! path.length ) {
			return null;
		}

		try {
			doc = parseBlockHtmlDocument( html );
			target = findElementByPath( doc.body, path );

			if ( ! target || ! target.parentElement ) {
				return null;
			}

			target.parentElement.removeChild( target );

			return {
				html: serializeBlockContentFromDocument( doc ),
			};
		} catch ( error ) {
			return null;
		}
	}

	function deleteSelectedElement() {
		var block;
		var locator;
		var result;

		if ( ! editorState.selectedId || ! isSelectedElementLocatorForCurrentBlock() ) {
			return false;
		}

		if ( 'edit' !== getActiveCanvasTabName() ) {
			return false;
		}

		block = getBlockById( editorState.selectedId );

		if ( ! block ) {
			return false;
		}

		locator = editorState.selectedElementLocator;
		result = applyElementDelete( block.content || '', locator.path );

		if ( ! result || result.html === block.content ) {
			return false;
		}

		pushHistory();
		block.content = result.html;
		setCodeValue( result.html, { silent: true } );
		clearSelectedElementLocator();
		updatePreview();
		updatePagePreview();
		scheduleUnsavedIndicatorUpdate();

		return true;
	}

	function serializeBlockContentFromDocument( doc ) {
		var styles = [];
		var nodes;
		var bodyHtml = '';
		var index;
		var node;
		var rel;

		if ( ! doc ) {
			return '';
		}

		nodes = doc.querySelectorAll( 'style, link' );

		for ( index = 0; index < nodes.length; index++ ) {
			node = nodes[ index ];

			if ( 'STYLE' === node.tagName ) {
				styles.push( node.outerHTML );

				if ( node.parentNode ) {
					node.parentNode.removeChild( node );
				}

				continue;
			}

			rel = String( node.getAttribute( 'rel' ) || '' ).toLowerCase();

			if ( 'LINK' === node.tagName && -1 !== rel.indexOf( 'stylesheet' ) ) {
				styles.push( node.outerHTML );

				if ( node.parentNode ) {
					node.parentNode.removeChild( node );
				}
			}
		}

		if ( doc.body ) {
			bodyHtml = doc.body.innerHTML;
		}

		if ( styles.length ) {
			return styles.join( '\n' ) + ( bodyHtml ? '\n' + bodyHtml : '' );
		}

		return bodyHtml;
	}

	function applyVisualTextEdit( html, path, innerHtml ) {
		var doc;
		var target;

		if ( ! html || ! window.DOMParser || ! path || ! path.length ) {
			return null;
		}

		try {
			doc = parseBlockHtmlDocument( html );
			target = findElementByPath( doc.body, path );

			if ( ! target ) {
				return null;
			}

			target.innerHTML = innerHtml;
			return serializeBlockContentFromDocument( doc );
		} catch ( error ) {
			return null;
		}
	}

	function applyVisualTextEditFromPreview( path, innerHtml ) {
		var block;
		var nextHtml;

		if ( ! editorState.selectedId ) {
			resolveVisualEditCommit();
			return;
		}

		block = getBlockById( editorState.selectedId );

		if ( ! block ) {
			resolveVisualEditCommit();
			return;
		}

		nextHtml = applyVisualTextEdit(
			block.content || '',
			normalizePreviewElementPathToBlockContent( path, block.content || '' ),
			innerHtml
		);

		if ( null !== nextHtml ) {
			pushHistory();
			block.content = nextHtml;
			setCodeValue( nextHtml );
			clearSelectedElementLocator();
			updatePreview();
			updatePagePreview();
			scheduleUnsavedIndicatorUpdate();
		}

		resolveVisualEditCommit();
	}

	function resolveVisualEditCommit() {
		var resolve;

		if ( ! visualEditCommitState.resolve ) {
			return;
		}

		window.clearTimeout( visualEditCommitState.timer );
		visualEditCommitState.timer = null;
		resolve = visualEditCommitState.resolve;
		visualEditCommitState.resolve = null;
		resolve();
	}

	function commitPendingVisualEdit() {
		return new Promise( function( resolve ) {
			if ( ! previewFrame || ! previewFrame.contentWindow ) {
				resolve();
				return;
			}

			visualEditCommitState.resolve = resolve;
			visualEditCommitState.timer = window.setTimeout( function() {
				resolveVisualEditCommit();
			}, 500 );

			previewFrame.contentWindow.postMessage( {
				source: 'art-editor-parent',
				type: 'commitPendingEdit',
			}, '*' );
		} );
	}

	function getActiveCanvasTabName() {
		var activeButton = document.querySelector( '.art-editor-screen__canvas-tab.is-active' );

		return activeButton ? activeButton.getAttribute( 'data-tab' ) : '';
	}

	function initVisualTextEditBridge() {
		if ( ! previewFrame ) {
			return;
		}

		previewFrame.addEventListener( 'load', function() {
			var restoreGeneration;
			var pageSettings;
			var restorePath;

			if ( ! pendingElementSelectionPath || ! previewFrame.contentWindow ) {
				return;
			}

			restoreGeneration = pendingElementSelectionGeneration;

			if ( restoreGeneration !== previewRestoreGeneration ) {
				pendingElementSelectionPath = null;
				pendingElementSelectionGeneration = 0;
				return;
			}

			pageSettings = getPageSettingsFromDom();
			restorePath = expandBlockContentPathForPreviewIframe(
				pendingElementSelectionPath,
				getCodeValue(),
				pageSettings.layoutMode
			);

			previewFrame.contentWindow.postMessage( {
				source: 'art-editor-parent',
				type: 'selectElementByPath',
				path: restorePath,
			}, '*' );
			pendingElementSelectionPath = null;
			pendingElementSelectionGeneration = 0;
		} );

		window.addEventListener( 'message', function( event ) {
			var data;

			if ( ! previewFrame.contentWindow || event.source !== previewFrame.contentWindow ) {
				return;
			}

			data = event.data;

			if ( ! data || 'art-editor-preview' !== data.source ) {
				return;
			}

			if ( 'editCommitDone' === data.type ) {
				resolveVisualEditCommit();
				return;
			}

			if ( 'elementSelect' === data.type ) {
				handleElementSelection( data.locator || null );
				return;
			}

			if ( 'deleteSelectedElement' === data.type ) {
				if ( isFormFieldElement( document.activeElement ) ) {
					return;
				}

				deleteSelectedElement();
				return;
			}

			if ( 'textEdit' !== data.type || ! Array.isArray( data.path ) ) {
				return;
			}

			applyVisualTextEditFromPreview( data.path, data.innerHtml || '' );
		} );
	}

	function getPreviewLinkGuardMarkup() {
		return [
			'<script id="art-editor-preview-link-guard">',
			'(function(){',
			'"use strict";',
			'function preventAnchorNavigation(event){',
			'var node=event.target;',
			'while(node&&node!==document.body){',
			'if(node.tagName==="A"){event.preventDefault();event.stopPropagation();return;}',
			'node=node.parentElement;',
			'}',
			'}',
			'document.addEventListener("mousedown",preventAnchorNavigation,true);',
			'document.addEventListener("click",preventAnchorNavigation,true);',
			'})();',
			'<\/script>',
		].join( '' );
	}

	function getEditInspectHeadMarkup() {
		return [
			'<style id="art-editor-inspect-style">',
			'.art-editor-inspect-highlight{outline:2px solid #e66a15!important;outline-offset:2px;}',
			'.art-editor-inspect-active{outline:2px solid #2271b1!important;outline-offset:2px;}',
			'.art-editor-inspect-editing{outline:2px solid #2271b1!important;outline-offset:2px;cursor:text!important;}',
			'</style>',
			'<script id="art-editor-inspect-script">',
			'(function(){',
			'"use strict";',
			'var hovered=null;',
			'var active=null;',
			'var editing=null;',
			'var editingOriginal="";',
			'var editingBlurHandler=null;',
			'var ignored={HTML:1,HEAD:1,BODY:1,SCRIPT:1,STYLE:1,META:1,LINK:1,TITLE:1};',
			'function getIframeAtPoint(x,y){',
			'var iframes=document.querySelectorAll(".art-editor-html-block iframe");',
			'var i,frame,rect;',
			'for(i=iframes.length-1;i>=0;i--){',
			'frame=iframes[i];',
			'rect=frame.getBoundingClientRect();',
			'if(x>=rect.left&&x<=rect.right&&y>=rect.top&&y<=rect.bottom){return frame;}',
			'}',
			'return null;',
			'}',
			'function getVideoAtPoint(x,y){',
			'var videos=document.querySelectorAll(".art-editor-html-block video");',
			'var i,video,rect;',
			'for(i=videos.length-1;i>=0;i--){',
			'video=videos[i];',
			'rect=video.getBoundingClientRect();',
			'if(x>=rect.left&&x<=rect.right&&y>=rect.top&&y<=rect.bottom){return video;}',
			'}',
			'return null;',
			'}',
			'function resolveInspectableTarget(node,x,y){',
			'var frame=getIframeAtPoint(x,y);',
			'if(frame){return frame;}',
			'var video=getVideoAtPoint(x,y);',
			'if(video){return video;}',
			'return getInspectableElement(node);',
			'}',
			'function freezeEmbeddedMedia(){',
			'document.querySelectorAll("video").forEach(function(video){',
			'try{video.pause();video.autoplay=false;video.removeAttribute("autoplay");}catch(e){}',
			'});',
			'document.querySelectorAll("iframe").forEach(function(frame){',
			'var src=frame.getAttribute("src")||"";',
			'if(!src){return;}',
			'try{',
			'var url=new URL(src,window.location.href);',
			'if(url.searchParams.get("autoplay")==="1"){url.searchParams.set("autoplay","0");frame.setAttribute("src",url.toString());}',
			'}catch(e){}',
			'});',
			'}',
			'function getInspectableElement(node){',
			'while(node&&node!==document.body&&node!==document.documentElement){',
			'if(!ignored[node.tagName]){return node;}',
			'node=node.parentElement;',
			'}',
			'return null;',
			'}',
			'function getInspectableParent(node){',
			'var htmlBlock=node&&node.closest?node.closest(".art-editor-html-block"):null;',
			'var parent=node?node.parentElement:null;',
			'while(parent&&parent!==document.body&&parent!==document.documentElement){',
			'if(htmlBlock&&parent===htmlBlock){return null;}',
			'if(!ignored[parent.tagName]){return parent;}',
			'parent=parent.parentElement;',
			'}',
			'return null;',
			'}',
			'function getInspectableAncestorChain(node){',
			'var chain=[];',
			'var current=getInspectableElement(node);',
			'while(current){',
			'chain.push(current);',
			'current=getInspectableParent(current);',
			'}',
			'return chain;',
			'}',
			'var lastPickX=null;',
			'var lastPickY=null;',
			'var lastPickChain=[];',
			'var lastPickIndex=0;',
			'function hasEditableText(node){',
			'return!!(node&&node.textContent&&node.textContent.replace(/\\s+/g,"").length);',
			'}',
			'function getElementPath(node){',
			'var path=[];',
			'var parent;',
			'var index;',
			'var htmlBlock=node&&node.closest?node.closest(".art-editor-html-block"):null;',
			'while(node&&node!==document.body&&node!==document.documentElement){',
			'if(htmlBlock&&node===htmlBlock){break;}',
			'parent=node.parentElement;',
			'if(!parent){break;}',
			'index=Array.prototype.indexOf.call(parent.children,node);',
			'path.unshift({tag:node.tagName,index:index});',
			'node=parent;',
			'}',
			'return path;',
			'}',
			'function clearHover(){',
			'if(hovered){hovered.classList.remove("art-editor-inspect-highlight");hovered=null;}',
			'}',
			'function setActive(target){',
			'if(active){active.classList.remove("art-editor-inspect-active");}',
			'active=target||null;',
			'if(active){active.classList.add("art-editor-inspect-active");}',
			'notifyElementSelected(active);',
			'}',
			'function notifyElementSelected(target){',
			'if(!target){window.parent.postMessage({source:"art-editor-preview",type:"elementSelect",locator:null},"*");return;}',
			'window.parent.postMessage({source:"art-editor-preview",type:"elementSelect",locator:{path:getElementPath(target),tag:target.tagName,outerHtml:target.outerHTML,textContent:(target.textContent||"").replace(/\\s+/g," ").trim()}},"*");',
			'}',
			'function findElementByPath(path){',
			'var node=document.body,i,step;',
			'if(!path||!path.length){return null;}',
			'for(i=0;i<path.length;i++){',
			'step=path[i];',
			'if(!node||!node.children||step.index<0||step.index>=node.children.length){return null;}',
			'node=node.children[step.index];',
			'if(step.tag&&node.tagName!==step.tag){return null;}',
			'}',
			'return node;',
			'}',
			'function finishEditing(commit){',
			'var path;',
			'if(!editing){return;}',
			'if(editingBlurHandler){editing.removeEventListener("blur",editingBlurHandler,true);editingBlurHandler=null;}',
			'editing.contentEditable="false";',
			'editing.classList.remove("art-editor-inspect-editing");',
			'if(commit){',
			'path=getElementPath(editing);',
			'window.parent.postMessage({source:"art-editor-preview",type:"textEdit",path:path,innerHtml:editing.innerHTML},"*");',
			'}else{',
			'editing.innerHTML=editingOriginal;',
			'}',
			'editing=null;',
			'editingOriginal="";',
			'}',
			'function placeCaretAtPoint(x,y){',
			'var range;',
			'var caret;',
			'var selection;',
			'if(document.caretRangeFromPoint){',
			'range=document.caretRangeFromPoint(x,y);',
			'}else if(document.caretPositionFromPoint){',
			'caret=document.caretPositionFromPoint(x,y);',
			'if(caret){',
			'range=document.createRange();',
			'range.setStart(caret.offsetNode,caret.offset);',
			'range.collapse(true);',
			'}',
			'}',
			'if(!range){return;}',
			'selection=window.getSelection();',
			'selection.removeAllRanges();',
			'selection.addRange(range);',
			'}',
			'function startEditing(target,x,y){',
			'if(!target||editing||!hasEditableText(target)){return;}',
			'setActive(target);',
			'clearHover();',
			'editing=target;',
			'editingOriginal=target.innerHTML;',
			'target.classList.add("art-editor-inspect-editing");',
			'target.contentEditable="true";',
			'editingBlurHandler=function(){finishEditing(true);};',
			'target.addEventListener("blur",editingBlurHandler,true);',
			'target.focus();',
			'if("number"===typeof x&&"number"===typeof y){placeCaretAtPoint(x,y);}',
			'}',
			'function highlightAt(x,y){',
			'var target;',
			'if(editing){return;}',
			'target=resolveInspectableTarget(document.elementFromPoint(x,y),x,y);',
			'if(target===hovered){return;}',
			'clearHover();',
			'hovered=target;',
			'if(target&&target!==active){target.classList.add("art-editor-inspect-highlight");}',
			'}',
			'document.addEventListener("mousemove",function(event){highlightAt(event.clientX,event.clientY);},true);',
			'document.documentElement.addEventListener("mouseleave",clearHover,true);',
			'function preventAnchorActivation(event){',
			'var node=event.target;',
			'while(node&&node!==document.body){',
			'if(node.tagName==="A"){event.preventDefault();return;}',
			'node=node.parentElement;',
			'}',
			'}',
			'document.addEventListener("mousedown",preventAnchorActivation,true);',
			'document.addEventListener("click",function(event){',
			'var target;',
			'var chain;',
			'var dx;',
			'var dy;',
			'var sameChain;',
			'var index;',
			'if(editing){return;}',
			'preventAnchorActivation(event);',
			'if(event.altKey){',
			'target=resolveInspectableTarget(event.target,event.clientX,event.clientY);',
			'target=target?getInspectableParent(target):null;',
			'lastPickX=null;',
			'lastPickY=null;',
			'lastPickChain=[];',
			'lastPickIndex=0;',
			'}else{',
			'chain=getInspectableAncestorChain(resolveInspectableTarget(event.target,event.clientX,event.clientY));',
			'dx=lastPickX===null?999:Math.abs(event.clientX-lastPickX);',
			'dy=lastPickY===null?999:Math.abs(event.clientY-lastPickY);',
			'sameChain=dx<4&&dy<4&&lastPickChain.length===chain.length;',
			'if(sameChain){',
			'for(index=0;index<chain.length;index++){',
			'if(chain[index]!==lastPickChain[index]){sameChain=false;break;}',
			'}',
			'}',
			'if(sameChain&&chain.length){',
			'lastPickIndex=(lastPickIndex+1)%chain.length;',
			'}else{',
			'lastPickIndex=0;',
			'}',
			'lastPickX=event.clientX;',
			'lastPickY=event.clientY;',
			'lastPickChain=chain;',
			'target=chain[lastPickIndex]||null;',
			'}',
			'event.preventDefault();',
			'event.stopPropagation();',
			'setActive(target);',
			'clearHover();',
			'},true);',
			'document.addEventListener("dblclick",function(event){',
			'var target;',
			'target=resolveInspectableTarget(event.target,event.clientX,event.clientY);',
			'if(!target){return;}',
			'event.preventDefault();',
			'event.stopPropagation();',
			'startEditing(target,event.clientX,event.clientY);',
			'},true);',
			'document.addEventListener("keydown",function(event){',
			'if(editing){',
			'if("Escape"===event.key){event.preventDefault();finishEditing(false);}',
			'if("Enter"===event.key&&!event.shiftKey){event.preventDefault();editing.blur();}',
			'return;',
			'}',
			'if(active&&"Escape"===event.key){',
			'event.preventDefault();',
			'setActive(null);',
			'clearHover();',
			'return;',
			'}',
			'if(!active){return;}',
			'if("Delete"===event.key){',
			'event.preventDefault();',
			'window.parent.postMessage({source:"art-editor-preview",type:"deleteSelectedElement"},"*");',
			'}',
			'},true);',
			'window.addEventListener("message",function(event){',
			'var data=event.data;',
			'if(!data||data.source!=="art-editor-parent"){return;}',
			'if("commitPendingEdit"===data.type){',
			'if(editing){finishEditing(true);return;}',
			'window.parent.postMessage({source:"art-editor-preview",type:"editCommitDone"},"*");',
			'return;',
			'}',
			'if("clearElementSelection"===data.type){',
			'if(editing){finishEditing(true);return;}',
			'setActive(null);',
			'clearHover();',
			'return;',
			'}',
			'if("selectElementByPath"===data.type){',
			'if(editing){finishEditing(true);return;}',
			'var restored=findElementByPath(data.path||[]);',
			'if(restored){setActive(restored);}',
			'clearHover();',
			'return;',
			'}',
			'if("applyElementStyles"===data.type){',
			'var styleTarget=active;',
			'var styleKey,styleVal,importantSpacing;',
			'if((!styleTarget||!document.contains(styleTarget))&&data.path){styleTarget=findElementByPath(data.path||[]);}',
			'if(!styleTarget||!data.styles){return;}',
			'importantSpacing={ "margin-top":1,"margin-bottom":1,"padding-top":1,"padding-bottom":1 };',
			'for(styleKey in data.styles){',
			'if(!Object.prototype.hasOwnProperty.call(data.styles,styleKey)){continue;}',
			'styleVal=data.styles[styleKey];',
			'if(styleVal===null||styleVal===""){styleTarget.style.removeProperty(styleKey);}',
			'else if(importantSpacing[styleKey]){styleTarget.style.setProperty(styleKey,String(styleVal),"important");}',
			'else{styleTarget.style.setProperty(styleKey,String(styleVal));}',
			'}',
			'if(!styleTarget.getAttribute("style")){styleTarget.removeAttribute("style");}',
			'return;',
			'}',
			'},false);',
			'document.body.classList.add("art-editor-edit-preview");',
			'freezeEmbeddedMedia();',
			'setTimeout(freezeEmbeddedMedia,300);',
			'setTimeout(freezeEmbeddedMedia,1500);',
			'new MutationObserver(function(){freezeEmbeddedMedia();}).observe(document.body,{childList:true,subtree:true});',
			'})();',
			'<\/script>',
		].join( '' );
	}

	function injectEditInspectIntoDocument( documentHtml ) {
		var html = applyPreviewViewportToDocument( documentHtml );
		var extras = [
			'<style id="art-editor-edit-base">',
			'body.art-editor-edit-preview iframe,',
			'body.art-editor-edit-preview video{pointer-events:none!important;}',
			'body a{color:inherit;font-size:inherit;font-weight:inherit;font-family:inherit;background-color:transparent;}',
			'</style>',
			getEditInspectHeadMarkup(),
		].join( '' );

		if ( -1 !== html.indexOf( '</head>' ) ) {
			return html.replace( '</head>', extras + '</head>' );
		}

		return html;
	}

	function cancelStylePreviewRefresh() {
		window.clearTimeout( stylePreviewRefreshTimer );
		stylePreviewRefreshTimer = null;
	}

	function flushStylePreviewRefresh() {
		if ( ! stylePreviewRefreshTimer ) {
			return;
		}

		cancelStylePreviewRefresh();
		updatePreview();
	}

	/**
	 * Coalesce full edit-preview rebuilds while the user types styles.
	 * Instant feedback comes from applyElementStyles postMessage.
	 */
	function scheduleStylePreviewRefresh() {
		cancelStylePreviewRefresh();
		stylePreviewRefreshTimer = window.setTimeout( function() {
			stylePreviewRefreshTimer = null;
			updatePreview();
		}, STYLE_PREVIEW_REFRESH_MS );
	}

	function buildOptimisticCssStyles( styleValues, changedProperties ) {
		var styles = {};
		var fontSize;
		var lineHeight;
		var color;
		var fontWeight;
		var fontStyle;
		var textDecoration;
		var backgroundColor;
		var paddingTop;
		var paddingBottom;
		var marginTop;
		var marginBottom;

		if ( ! styleValues || ! changedProperties ) {
			return styles;
		}

		if ( changedProperties.fontSize ) {
			fontSize = normalizeFontSizeInput( styleValues.fontSize );
			styles[ 'font-size' ] = fontSize ? fontSize + 'px' : '';
		}

		if ( changedProperties.lineHeight || changedProperties.lineHeightUnit ) {
			lineHeight = buildLineHeightCSSValue( styleValues.lineHeight, styleValues.lineHeightUnit );
			styles[ 'line-height' ] = lineHeight || '';
		}

		if ( changedProperties.color ) {
			color = cssColorToHex( styleValues.color );
			styles.color = color || '';
		}

		if ( changedProperties.fontWeight ) {
			fontWeight = normalizeFontWeightInput( styleValues.fontWeight );
			styles[ 'font-weight' ] = fontWeight || '';
		}

		if ( changedProperties.fontStyle ) {
			fontStyle = formatFontStyleForInput( styleValues.fontStyle );
			styles[ 'font-style' ] = fontStyle || '';
		}

		if ( changedProperties.textDecorationUnderline || changedProperties.textDecorationLineThrough ) {
			textDecoration = buildTextDecorationFromFlags(
				!! styleValues.textDecorationUnderline,
				!! styleValues.textDecorationLineThrough
			);
			styles[ 'text-decoration-line' ] = textDecoration || '';
		}

		if ( changedProperties.backgroundColor ) {
			backgroundColor = cssColorToHex( styleValues.backgroundColor );
			styles[ 'background-color' ] = backgroundColor || '';
		}

		if ( changedProperties.paddingTop ) {
			paddingTop = normalizeFontSizeInput( styleValues.paddingTop );
			styles[ 'padding-top' ] = paddingTop ? paddingTop + 'px' : '';
		}

		if ( changedProperties.paddingBottom ) {
			paddingBottom = normalizeFontSizeInput( styleValues.paddingBottom );
			styles[ 'padding-bottom' ] = paddingBottom ? paddingBottom + 'px' : '';
		}

		if ( changedProperties.marginTop ) {
			marginTop = normalizeMarginInput( styleValues.marginTop );
			styles[ 'margin-top' ] = marginTop ? marginTop + 'px' : '';
		}

		if ( changedProperties.marginBottom ) {
			marginBottom = normalizeMarginInput( styleValues.marginBottom );
			styles[ 'margin-bottom' ] = marginBottom ? marginBottom + 'px' : '';
		}

		return styles;
	}

	function postOptimisticElementStyles( cssStyles ) {
		var pageSettings;
		var path = null;

		if ( ! previewFrame || ! previewFrame.contentWindow || ! cssStyles || ! Object.keys( cssStyles ).length ) {
			return;
		}

		if ( isSelectedElementLocatorForCurrentBlock() && editorState.selectedElementLocator.path ) {
			pageSettings = getPageSettingsFromDom();
			path = expandBlockContentPathForPreviewIframe(
				editorState.selectedElementLocator.path,
				getCodeValue(),
				pageSettings.layoutMode
			);
		}

		previewFrame.contentWindow.postMessage( {
			source: 'art-editor-parent',
			type: 'applyElementStyles',
			path: path,
			styles: cssStyles,
		}, '*' );
	}

	function updatePreview( options ) {
		if ( ! previewFrame ) {
			return;
		}

		var settings = options || {};
		var showLoading = !! settings.showLoading;

		previewRestoreGeneration += 1;
		previewRequestGeneration += 1;

		var requestGeneration = previewRequestGeneration;
		var pageSettings = getPageSettingsFromDom();

		if ( showLoading ) {
			beginPreviewLoading( 'edit', requestGeneration );
		}

		if ( isSelectedElementLocatorForCurrentBlock() && editorState.selectedElementLocator.path ) {
			pendingElementSelectionPath = cloneElementPath( editorState.selectedElementLocator.path );
			pendingElementSelectionGeneration = previewRestoreGeneration;
		} else {
			pendingElementSelectionPath = null;
			pendingElementSelectionGeneration = 0;
		}

		if ( ! config.previewEditBlockUrl || ! config.nonce ) {
			setPreviewHealth( 'edit', i18n.previewEditUnavailable || 'Серверное превью блока недоступно. Обновите страницу или проверьте REST API.' );
			pendingElementSelectionPath = null;
			pendingElementSelectionGeneration = 0;
			clearSelectedElementLocator( { skipIframe: true } );

			if ( showLoading ) {
				finishPreviewLoading( 'edit', requestGeneration );
			}

			return;
		}

		window.fetch( config.previewEditBlockUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-WP-Nonce': config.nonce,
			},
			body: JSON.stringify( {
				html: getCodeValue(),
				layoutMode: pageSettings.layoutMode,
			} ),
		} )
			.then( function( response ) {
				if ( ! response.ok ) {
					throw new Error( 'edit_preview_failed' );
				}

				return response.json();
			} )
			.then( function( data ) {
				if ( requestGeneration !== previewRequestGeneration ) {
					return;
				}

				if ( data && 'string' === typeof data.document && data.document ) {
					if ( showLoading ) {
						assignPreviewFrameDocument( 'edit', previewFrame, injectEditInspectIntoDocument( data.document ), requestGeneration );
					} else {
						previewFrame.srcdoc = injectEditInspectIntoDocument( data.document );
					}

					setPreviewHealth( 'edit', '' );
					return;
				}

				throw new Error( 'edit_preview_empty' );
			} )
			.catch( function() {
				if ( requestGeneration !== previewRequestGeneration ) {
					return;
				}

				pendingElementSelectionPath = null;
				pendingElementSelectionGeneration = 0;
				clearSelectedElementLocator( { skipIframe: true } );
				setPreviewHealth( 'edit', i18n.previewEditError || 'Не удалось обновить превью блока. Показана последняя рабочая версия.' );

				if ( showLoading ) {
					finishPreviewLoading( 'edit', requestGeneration );
				}
			} );
	}

	function updatePagePreview( options ) {
		if ( ! pagePreviewFrame ) {
			return;
		}

		var settings = options || {};
		var showLoading = !! settings.showLoading;

		commitCodeToSelectedBlock();

		pagePreviewRequestGeneration += 1;

		var requestGeneration = pagePreviewRequestGeneration;

		if ( showLoading ) {
			beginPreviewLoading( 'view', requestGeneration );
		}

		if ( ! config.previewDocumentUrl || ! config.nonce ) {
			setPreviewHealth( 'view', i18n.previewViewUnavailable || 'Серверный просмотр страницы недоступен. Обновите страницу или проверьте REST API.' );

			if ( showLoading ) {
				finishPreviewLoading( 'view', requestGeneration );
			}

			return;
		}

		var pageSettings = getPageSettingsFromDom();

		window.fetch( config.previewDocumentUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-WP-Nonce': config.nonce,
			},
			body: JSON.stringify( {
				blocks: editorState.blocks.map( function( block ) {
					return {
						content: block.content || '',
					};
				} ),
				layoutMode: pageSettings.layoutMode,
				styleMode: pageSettings.styleMode,
			} ),
		} )
			.then( function( response ) {
				if ( ! response.ok ) {
					throw new Error( 'page_preview_failed' );
				}

				return response.json();
			} )
			.then( function( data ) {
				if ( requestGeneration !== pagePreviewRequestGeneration ) {
					return;
				}

				if ( data && 'string' === typeof data.document && data.document ) {
					if ( showLoading ) {
						assignPreviewFrameDocument( 'view', pagePreviewFrame, applyPreviewViewportToDocument( data.document ), requestGeneration );
					} else {
						pagePreviewFrame.srcdoc = applyPreviewViewportToDocument( data.document );
					}

					setPreviewHealth( 'view', '' );
					return;
				}

				throw new Error( 'page_preview_empty' );
			} )
			.catch( function() {
				if ( requestGeneration !== pagePreviewRequestGeneration ) {
					return;
				}

				setPreviewHealth( 'view', i18n.previewViewError || 'Не удалось обновить просмотр страницы. Показана последняя рабочая версия.' );

				if ( showLoading ) {
					finishPreviewLoading( 'view', requestGeneration );
				}
			} );
	}

	function applyCanvasTabState( tabName ) {
		var codeTab = document.getElementById( 'art-editor-tab-code' );
		var editTab = document.getElementById( 'art-editor-tab-edit' );
		var viewTab = document.getElementById( 'art-editor-tab-view' );
		var codePanel = document.getElementById( 'art-editor-panel-code' );
		var editPanel = document.getElementById( 'art-editor-panel-edit' );
		var viewPanel = document.getElementById( 'art-editor-panel-view' );
		var deviceToggle = document.getElementById( 'art-editor-device-toggle' );
		var tabButtons = [ codeTab, editTab, viewTab ];
		var panels = [ codePanel, editPanel, viewPanel ];
		var index;

		for ( index = 0; index < tabButtons.length; index++ ) {
			if ( ! tabButtons[ index ] ) {
				continue;
			}

			tabButtons[ index ].classList.toggle(
				'is-active',
				tabButtons[ index ].getAttribute( 'data-tab' ) === tabName
			);
			tabButtons[ index ].setAttribute(
				'aria-selected',
				tabButtons[ index ].getAttribute( 'data-tab' ) === tabName ? 'true' : 'false'
			);
		}

		for ( index = 0; index < panels.length; index++ ) {
			if ( ! panels[ index ] ) {
				continue;
			}

			panels[ index ].classList.toggle(
				'is-active',
				panels[ index ].id === 'art-editor-panel-' + tabName
			);

			if ( panels[ index ].id === 'art-editor-panel-' + tabName ) {
				panels[ index ].removeAttribute( 'hidden' );
			} else {
				panels[ index ].setAttribute( 'hidden', 'hidden' );
			}
		}

		if ( deviceToggle ) {
			deviceToggle.hidden = 'edit' !== tabName && 'view' !== tabName;
		}
	}

	function syncEditPanelContent( block ) {
		var isAnchor = isAnchorBlock( block );
		var editPanel = document.getElementById( 'art-editor-panel-edit' );
		var anchorSettings = document.getElementById( 'art-editor-edit-anchor-settings' );
		var previewStage = document.getElementById( 'art-editor-edit-preview-stage' );

		if ( editPanel ) {
			editPanel.classList.toggle( 'art-editor-screen__edit-panel--anchor', !! isAnchor );
		}

		if ( anchorSettings ) {
			anchorSettings.hidden = ! isAnchor;
		}

		if ( previewStage ) {
			previewStage.hidden = !! isAnchor;
		}

		if ( isAnchor && previewFrame ) {
			previewFrame.srcdoc = '';
		}
	}

	function setCanvasTabVisibilityForBlock( block ) {
		var viewTab = document.getElementById( 'art-editor-tab-view' );
		var codeTab = document.getElementById( 'art-editor-tab-code' );
		var editTab = document.getElementById( 'art-editor-tab-edit' );
		var isAnchor = isAnchorBlock( block );

		if ( viewTab ) {
			viewTab.hidden = !! isAnchor;
		}

		if ( codeTab ) {
			codeTab.disabled = !! isAnchor;
		}

		if ( editTab ) {
			editTab.disabled = false;
		}
	}

	function updateCanvasModeForBlock( block ) {
		var currentTab = getActiveCanvasTabName();
		var targetTab = currentTab;
		var isAnchor = isAnchorBlock( block );

		setCanvasTabVisibilityForBlock( block );
		syncEditPanelContent( block );

		if ( isAnchor ) {
			if ( elementEditorController ) {
				elementEditorController.closePanel();
			}

			targetTab = 'edit';
		} else if ( ! currentTab ) {
			targetTab = 'edit';
		}

		if ( targetTab && targetTab !== currentTab && typeof activateCanvasTab === 'function' ) {
			activateCanvasTab( targetTab );
			return;
		}

		if ( targetTab ) {
			applyCanvasTabState( targetTab );
		}

		if ( isAnchor ) {
			hideDeviceToggle();
		}
	}

	function hideDeviceToggle() {
		var deviceToggle = document.getElementById( 'art-editor-device-toggle' );

		if ( deviceToggle ) {
			deviceToggle.hidden = true;
		}
	}

	function syncAnchorEditorFromBlock( block ) {
		var anchorId;

		if ( ! anchorIdInput ) {
			return;
		}

		anchorId = getAnchorIdFromBlock( block );

		if ( block && anchorId && ! block.anchorId ) {
			block.anchorId = anchorId;
			block.content = buildAnchorBlockContent( anchorId );
			block.title = getAnchorBlockTitle( anchorId );
			block.titleLocked = true;
		}

		anchorIdInput.value = anchorId;
	}

	function syncSelectionFromBlock( options ) {
		var settings = options || {};
		var showLoading = !! settings.showLoading;
		var activeTab = getActiveCanvasTabName();
		var block = getBlockById( editorState.selectedId );
		var previewOptions = showLoading ? { showLoading: true } : undefined;

		clearSelectedElementLocator();
		updateCanvasModeForBlock( block );

		if ( isAnchorBlock( block ) ) {
			syncAnchorEditorFromBlock( block );
			setCodeEditorEnabled( false );
			updatePagePreview( previewOptions );
			suppressNextViewPreviewRefresh = !! showLoading;
			return;
		}

		if ( block ) {
			setCodeValue( block.content || '', { silent: true } );
			setCodeEditorEnabled( true );
		} else {
			setCodeValue( '', { silent: true } );
			setCodeEditorEnabled( true );
		}

		if ( 'edit' === activeTab ) {
			updatePreview( previewOptions );
			suppressNextEditPreviewRefresh = true;
		} else if ( 'view' === activeTab ) {
			updatePagePreview( previewOptions );
			suppressNextViewPreviewRefresh = true;
		}
	}

	function syncCodeFromSelection() {
		syncSelectionFromBlock();
	}

	function renderStructure() {
		var index;
		var block;
		var item;
		var button;
		var label;
		var deleteButton;
		var activeLabel;

		if ( ! structureList || ! structureEmpty ) {
			return;
		}

		if ( editorState.renamingBlockId ) {
			activeLabel = structureList.querySelector( '.art-editor-screen__structure-button-label.is-editing' );

			if ( activeLabel ) {
				finishBlockRename( editorState.renamingBlockId, activeLabel, false );
			} else {
				editorState.renamingBlockId = null;
			}
		}

		structureList.innerHTML = '';

		if ( ! editorState.blocks.length ) {
			structureEmpty.hidden = false;
			editorState.selectedId = null;
			syncCodeFromSelection();
			return;
		}

		structureEmpty.hidden = true;
		syncBlockTitles();

		for ( index = 0; index < editorState.blocks.length; index++ ) {
			block = editorState.blocks[ index ];

			item = document.createElement( 'li' );
			item.className = 'art-editor-screen__structure-item';

			if ( isAnchorBlock( block ) ) {
				item.classList.add( 'art-editor-screen__structure-item--anchor' );
			}

			button = document.createElement( 'button' );
			button.type = 'button';
			button.className = 'art-editor-screen__structure-button';
			button.title = block.title;
			button.setAttribute( 'data-block-id', block.id );

			label = document.createElement( 'span' );
			label.className = 'art-editor-screen__structure-button-label';
			label.textContent = block.title;
			button.appendChild( label );

			if ( block.id === editorState.selectedId ) {
				button.classList.add( 'is-active' );
			}

			deleteButton = document.createElement( 'button' );
			deleteButton.type = 'button';
			deleteButton.className = 'art-editor-screen__structure-delete';
			deleteButton.setAttribute( 'aria-label', i18n.deleteBlock || 'Удалить блок' );
			deleteButton.title = i18n.deleteBlock || 'Удалить блок';
			deleteButton.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><path d="M3 6h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path><path d="M8 6V4h8v2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path><path d="M19 6l-1 14H6L5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path><path d="M10 11v6M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path></svg>';

			bindStructureItem( item, button, label, deleteButton, block );

			item.appendChild( button );
			item.appendChild( deleteButton );
			structureList.appendChild( item );
		}
	}

	function showStructureSidebar() {
		var structureView = document.getElementById( 'art-editor-structure-view' );
		var settingsPanel = document.getElementById( 'art-editor-settings-panel' );
		var elementPanel = document.getElementById( 'art-editor-element-panel' );

		invalidatePreviewElementRestore();

		if ( elementEditorController ) {
			elementEditorController.closePanel();
		} else if ( elementPanel ) {
			elementPanel.hidden = true;
		}

		if ( structureView && ( ! settingsPanel || settingsPanel.hidden ) ) {
			structureView.hidden = false;
		}
	}

	function selectBlock( blockId ) {
		var isSameBlock = editorState.selectedId === blockId;
		var previousBlock = getBlockById( editorState.selectedId );
		var nextBlock;
		var wasOnEditTab = 'edit' === getActiveCanvasTabName();

		if ( isSaving() ) {
			return;
		}

		showStructureSidebar();

		if ( isSameBlock ) {
			if ( editorState.selectedElementLocator ) {
				clearSelectedElementLocator();
			}

			return;
		}

		clearSelectedElementLocator();
		flushPendingElementEdits( { skipHistory: true } );
		pushHistory();
		commitCodeToSelectedBlock();
		editorState.selectedId = blockId;
		nextBlock = getBlockById( blockId );
		renderStructure();
		syncSelectionFromBlock( { showLoading: wasOnEditTab } );

		if ( isAnchorBlock( nextBlock ) ) {
			if ( typeof activateCanvasTab === 'function' ) {
				activateCanvasTab( 'edit' );
			}
		} else if ( wasOnEditTab || 'view' === getActiveCanvasTabName() || isAnchorBlock( previousBlock ) ) {
			if ( typeof activateCanvasTab === 'function' ) {
				activateCanvasTab( 'edit' );
			}
		}
	}

	function switchToEditTab() {
		if ( typeof activateCanvasTab === 'function' ) {
			activateCanvasTab( 'edit' );
		}
	}

	function switchToCodeTab() {
		var activation;

		if ( typeof activateCanvasTab !== 'function' ) {
			return;
		}

		if ( 'code' === getActiveCanvasTabName() ) {
			applyCanvasTabState( 'code' );
			refreshCodeEditor();
			focusCodeEditor();
			return;
		}

		activation = activateCanvasTab( 'code' );

		if ( activation && typeof activation.then === 'function' ) {
			activation.then( function() {
				focusCodeEditor();
			} );
			return;
		}

		focusCodeEditor();
	}

	function focusCodeEditor() {
		window.setTimeout( function() {
			if ( codeEditorInstance && codeEditorInstance.codemirror ) {
				codeEditorInstance.codemirror.focus();
				return;
			}

			if ( codeInput ) {
				codeInput.focus();
			}
		}, 0 );
	}

	function createAnchorBlock() {
		var block;

		if ( isSaving() ) {
			return;
		}

		showStructureSidebar();

		block = {
			id: 'anchor-' + Date.now(),
			type: 'anchor',
			anchorId: '',
			title: getAnchorBlockTitle( '' ),
			titleLocked: true,
			content: '',
		};

		pushHistory();
		commitCodeToSelectedBlock();
		editorState.blocks.push( block );
		editorState.selectedId = block.id;
		renderStructure();
		syncSelectionFromBlock();
		scheduleUnsavedIndicatorUpdate();

		if ( typeof activateCanvasTab === 'function' ) {
			activateCanvasTab( 'edit' );
		}

		if ( anchorIdInput ) {
			anchorIdInput.focus();
		}
	}

	function createHtmlBlock() {
		var index = editorState.blocks.length;
		var block;

		if ( isSaving() ) {
			return;
		}

		showStructureSidebar();

		if ( ! editorState.blocks.length && codeHasPersistableContent() ) {
			pushHistory();
			ensureBlockForCode();
			scheduleUnsavedIndicatorUpdate();
			switchToCodeTab();
			return;
		}

		block = {
			id: 'html-' + Date.now(),
			type: 'html',
			title: ( i18n.emptyBlock || 'Пустой HTML-блок' ) + ' ' + ( index + 1 ),
			titleLocked: false,
			content: '',
		};

		pushHistory();
		commitCodeToSelectedBlock();
		editorState.blocks.push( block );
		editorState.selectedId = block.id;
		renderStructure();
		syncSelectionFromBlock();
		scheduleUnsavedIndicatorUpdate();
		switchToCodeTab();
	}

	function initAnchorEditor() {
		if ( ! anchorIdInput ) {
			return;
		}

		anchorIdInput.addEventListener( 'input', function() {
			if ( ! isAnchorBlock( getBlockById( editorState.selectedId ) ) ) {
				return;
			}

			commitAnchorToSelectedBlock();
			renderStructure();
			scheduleUnsavedIndicatorUpdate();
		} );

		anchorIdInput.addEventListener( 'blur', function() {
			if ( ! isAnchorBlock( getBlockById( editorState.selectedId ) ) ) {
				return;
			}

			commitAnchorToSelectedBlock( { allowEmpty: true } );
			renderStructure();
			scheduleUnsavedIndicatorUpdate();
			updatePagePreview();
		} );
	}

	function initStructure() {
		var index;

		if ( createAnchorButton ) {
			createAnchorButton.addEventListener( 'click', createAnchorBlock );
		}

		if ( createHtmlButton ) {
			createHtmlButton.addEventListener( 'click', createHtmlBlock );
		}

		initAnchorEditor();

		bindCodeChangeEvents();

		for ( index = 0; index < editorState.blocks.length; index++ ) {
			editorState.blocks[ index ] = normalizeLoadedBlock( editorState.blocks[ index ], index );
		}

		if ( editorState.blocks.length ) {
			editorState.selectedId = editorState.blocks[ 0 ].id;
		}

		renderStructure();
		syncCodeFromSelection();
		resetHistory();
	}

	function initDevicePreview() {
		var canvas = document.getElementById( 'art-editor-canvas' );
		var deviceToggle = document.getElementById( 'art-editor-device-toggle' );
		var deviceButtons = document.querySelectorAll( '.art-editor-screen__device-button[data-device]' );
		var deviceFrames = document.querySelectorAll( '.art-editor-screen__device-frame' );
		var resizeDragState = null;

		if ( ! canvas || ! deviceToggle || ! deviceButtons.length ) {
			return;
		}

		function clampMobileFrameWidth( width ) {
			return clampMobilePreviewWidth( width );
		}

		function applyMobileFrameWidth() {
			var widthValue;
			var frames = document.querySelectorAll( '.art-editor-screen__device-frame' );

			frames.forEach( function( frame ) {
				if ( 'mobile' === editorUiState.deviceMode ) {
					widthValue = clampMobileFrameWidth( editorUiState.mobileFrameWidth ) + 'px';
					frame.style.width = widthValue;
				} else {
					frame.style.width = '';
				}
			} );
		}

		function syncMobileFrameWidth() {
			if ( 'mobile' !== editorUiState.deviceMode ) {
				return;
			}

			applyMobileFrameWidth();
		}

		function syncDeviceButtons() {
			deviceButtons.forEach( function( button ) {
				var isActive = button.getAttribute( 'data-device' ) === editorUiState.deviceMode;

				button.classList.toggle( 'is-active', isActive );
				button.setAttribute( 'aria-pressed', isActive ? 'true' : 'false' );
			} );
		}

		function applyDeviceMode() {
			canvas.classList.toggle(
				'art-editor-screen__canvas--device-mobile',
				'mobile' === editorUiState.deviceMode
			);
			applyMobileFrameWidth();
			syncDeviceButtons();
		}

		function setDeviceMode( deviceMode ) {
			var isMobile = 'mobile' === deviceMode;

			editorUiState.deviceMode = isMobile ? 'mobile' : 'desktop';

			if ( ! isMobile ) {
				editorUiState.mobileFrameWidth = devicePreviewLimits.mobileWidthDefault;
			}

			applyDeviceMode();
			refreshPreviewForDeviceMode();
		}

		function finishResizeDrag() {
			var shouldRefreshPreview = !! resizeDragState;

			if ( ! resizeDragState ) {
				return;
			}

			resizeDragState.handle.classList.remove( 'is-dragging' );
			canvas.classList.remove( 'is-mobile-resizing' );
			resizeDragState = null;

			if ( shouldRefreshPreview && 'mobile' === editorUiState.deviceMode ) {
				refreshPreviewForDeviceMode();
			}
		}

		function bindMobileResizeHandle( handle ) {
			handle.addEventListener( 'mousedown', function( event ) {
				if ( 'mobile' !== editorUiState.deviceMode || 0 !== event.button ) {
					return;
				}

				event.preventDefault();
				event.stopPropagation();

				resizeDragState = {
					handle: handle,
					startX: event.clientX,
					startWidth: editorUiState.mobileFrameWidth,
				};

				handle.classList.add( 'is-dragging' );
				canvas.classList.add( 'is-mobile-resizing' );
			} );
		}

		function initMobileResizeHandles() {
			var resizeLabel = i18n.resizeMobilePreview || 'Resize mobile preview width';

			deviceFrames.forEach( function( frame ) {
				var handle;

				if ( frame.querySelector( '.art-editor-screen__device-resize-handle' ) ) {
					return;
				}

				handle = document.createElement( 'button' );
				handle.type = 'button';
				handle.className = 'art-editor-screen__device-resize-handle';
				handle.setAttribute( 'aria-label', resizeLabel );
				handle.title = resizeLabel;
				bindMobileResizeHandle( handle );
				frame.appendChild( handle );
			} );
		}

		document.addEventListener( 'mousemove', function( event ) {
			var nextWidth;

			if ( ! resizeDragState ) {
				return;
			}

			event.preventDefault();
			nextWidth = clampMobileFrameWidth(
				resizeDragState.startWidth + ( event.clientX - resizeDragState.startX )
			);

			if ( nextWidth === editorUiState.mobileFrameWidth ) {
				return;
			}

			editorUiState.mobileFrameWidth = nextWidth;
			applyMobileFrameWidth();
		} );

		document.addEventListener( 'mouseup', function() {
			finishResizeDrag();
		} );

		window.addEventListener( 'blur', function() {
			finishResizeDrag();
		} );

		deviceButtons.forEach( function( button ) {
			button.addEventListener( 'click', function() {
				var deviceMode = button.getAttribute( 'data-device' );

				if ( deviceMode ) {
					setDeviceMode( deviceMode );
				}
			} );
		} );

		initMobileResizeHandles();
		editorUiState.mobileFrameWidth = devicePreviewLimits.mobileWidthDefault;
		applyDeviceMode();

		return {
			setDeviceMode: setDeviceMode,
			syncMobileFrameWidth: syncMobileFrameWidth,
			updateVisibility: function( tabName ) {
				var selectedBlock = getBlockById( editorState.selectedId );
				var showToggle = ( 'edit' === tabName || 'view' === tabName ) && ! isAnchorBlock( selectedBlock );

				deviceToggle.hidden = ! showToggle;
			},
		};
	}

	function initCanvasTabs() {
		var tabButtons = document.querySelectorAll( '.art-editor-screen__canvas-tab' );
		var panels = document.querySelectorAll( '.art-editor-screen__canvas-panel' );
		var devicePreview = initDevicePreview();

		if ( ! tabButtons.length || ! panels.length ) {
			return;
		}

		function setCanvasTabsDisabled( disabled ) {
			var selectedBlock = getBlockById( editorState.selectedId );

			tabButtons.forEach( function( button ) {
				var tabName = button.getAttribute( 'data-tab' );

				if ( ! disabled && isAnchorBlock( selectedBlock ) && ( 'code' === tabName || 'view' === tabName ) ) {
					button.disabled = true;
					return;
				}

				button.disabled = disabled;
			} );
		}

		function performTabActivation( tabName ) {
			var selectedBlock = getBlockById( editorState.selectedId );

			if ( isAnchorBlock( selectedBlock ) && ( 'code' === tabName || 'view' === tabName ) ) {
				return;
			}

			applyCanvasTabState( tabName );

			if ( 'edit' === tabName ) {
				commitCodeToSelectedBlock();

				if ( isAnchorBlock( selectedBlock ) ) {
					syncAnchorEditorFromBlock( selectedBlock );

					if ( ! suppressNextViewPreviewRefresh ) {
						updatePagePreview();
					} else {
						suppressNextViewPreviewRefresh = false;
					}

					if ( devicePreview ) {
						devicePreview.syncMobileFrameWidth();
					}
				} else if ( suppressNextEditPreviewRefresh ) {
					suppressNextEditPreviewRefresh = false;

					if ( devicePreview ) {
						devicePreview.syncMobileFrameWidth();
					}

					if ( isSelectedElementLocatorForCurrentBlock() && elementEditorController && ! isPageSettingsPanelOpen() ) {
						elementEditorController.openPanel( editorState.selectedElementLocator );
					}
				} else {
					updatePreview( { showLoading: true } );

					if ( devicePreview ) {
						devicePreview.syncMobileFrameWidth();
					}

					if ( isSelectedElementLocatorForCurrentBlock() && elementEditorController && ! isPageSettingsPanelOpen() ) {
						elementEditorController.openPanel( editorState.selectedElementLocator );
					}
				}
			}

			if ( 'edit' !== tabName ) {
				if ( elementEditorController ) {
					elementEditorController.closePanel();
				}

				if ( editorState.selectedElementLocator && ! isSelectedElementLocatorForCurrentBlock() ) {
					clearSelectedElementLocator( { skipPanel: true } );
				}
			}

			if ( 'view' === tabName ) {
				commitCodeToSelectedBlock();

				if ( ! suppressNextViewPreviewRefresh ) {
					updatePagePreview( { showLoading: true } );
				} else {
					suppressNextViewPreviewRefresh = false;
				}

				if ( devicePreview ) {
					devicePreview.syncMobileFrameWidth();
				}
			}

			syncPreviewStatusBanner();

			if ( 'code' === tabName && ! isAnchorBlock( selectedBlock ) ) {
				refreshCodeEditor();
				window.setTimeout( function() {
					highlightSelectedElementInCode();
				}, 0 );
			}

			updateCanvasModeForBlock( selectedBlock );

			if ( devicePreview ) {
				devicePreview.updateVisibility( tabName );
			}
		}

		function activateTab( tabName ) {
			var currentTab = getActiveCanvasTabName();
			var selectedBlock = getBlockById( editorState.selectedId );

			if ( isSaving() || ! tabName || tabName === currentTab ) {
				return Promise.resolve();
			}

			if ( isAnchorBlock( selectedBlock ) && ( 'code' === tabName || 'view' === tabName ) ) {
				return Promise.resolve();
			}

			if ( 'edit' === currentTab ) {
				setCanvasTabsDisabled( true );

				return commitPendingVisualEdit()
					.then( function() {
						performTabActivation( tabName );
					} )
					.finally( function() {
						setCanvasTabsDisabled( false );
					} );
			}

			performTabActivation( tabName );
			return Promise.resolve();
		}

		tabButtons.forEach( function( button ) {
			button.addEventListener( 'click', function() {
				var tabName = button.getAttribute( 'data-tab' );

				if ( tabName ) {
					activateTab( tabName );
				}
			} );
		} );

		activateCanvasTab = activateTab;
	}

	function initSaveAndPreview() {
		var saveButton = document.getElementById( 'art-editor-save-button' );
		var publishButton = document.getElementById( 'art-editor-publish-button' );
		var previewButton = document.getElementById( 'art-editor-preview-button' );
		var resetTimer = null;
		var saveUrl = config.saveBlocksUrl || config.restUrl;

		if ( ! saveUrl || ! config.nonce ) {
			return;
		}

		function setActionButtonsDisabled( disabled ) {
			if ( saveButton ) {
				saveButton.disabled = disabled;
			}

			if ( publishButton ) {
				publishButton.disabled = disabled;
			}
		}

		function resetButtonSoon( activeButton, defaultLabel ) {
			window.clearTimeout( resetTimer );
			resetTimer = window.setTimeout( function() {
				if ( activeButton ) {
					activeButton.textContent = defaultLabel;
				}

				setActionButtonsDisabled( false );
			}, 1800 );
		}

		function saveBlocks( status, options ) {
			var settings = options || {};
			var manageSaveLock = false !== settings.manageSaveLock;

			flushPendingElementEdits( { skipHistory: true } );
			commitCodeToSelectedBlock();

			if ( manageSaveLock ) {
				beginSaving();
			}

			return window.fetch( saveUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-WP-Nonce': config.nonce,
				},
				body: JSON.stringify( {
					status: status || config.postStatus || 'draft',
					blocks: editorState.blocks.map( mapBlockForSave ),
				} ),
			} )
				.then( function( response ) {
					if ( ! response.ok ) {
						throw new Error( 'save_failed' );
					}

					return response.json();
				} )
				.then( function( data ) {
					if ( data && Array.isArray( data.htmlBlocks ) ) {
						var previousSelectedIndex = getBlockIndex( editorState.selectedId );

						editorState.blocks = data.htmlBlocks.map( function( block, index ) {
							return normalizeLoadedBlock( block, index );
						} );

						if ( previousSelectedIndex >= 0 && editorState.blocks.length ) {
							editorState.selectedId = editorState.blocks[
								Math.min( previousSelectedIndex, editorState.blocks.length - 1 )
							].id;
						} else if ( editorState.selectedId && ! getBlockById( editorState.selectedId ) ) {
							editorState.selectedId = editorState.blocks.length ? editorState.blocks[ 0 ].id : null;
						}

						if (
							editorState.selectedElementLocator &&
							editorState.selectedElementLocator.blockId !== editorState.selectedId
						) {
							editorState.selectedElementLocator.blockId = editorState.selectedId;
						}

						renderStructure();
						syncCodeFromSelection();
					}

					if ( data && data.status ) {
						config.postStatus = data.status;
					}

					resetHistory();
					updateSavedBlocksBaseline();

					return data;
				} )
				.finally( function() {
					if ( manageSaveLock ) {
						endSaving();
					}
				} );
		}

		function saveDocument( targetStatus ) {
			var pageSettings = getPageSettingsFromDom();
			var blocksStatus = targetStatus || config.postStatus || 'draft';
			var includeStatus = !! targetStatus;

			if ( targetStatus ) {
				pageSettings.status = targetStatus;
			}

			beginSaving();

			return savePageSettings( pageSettings, {
				includeStatus: includeStatus,
				status: targetStatus,
				manageSaveLock: false,
			} )
				.then( function() {
					return saveBlocks( blocksStatus, { manageSaveLock: false } );
				} )
				.then( function( data ) {
					if ( data && data.status ) {
						config.postStatus = data.status;
					}

					updateDocumentSaveUi( config.postStatus );
					updateSavedSettingsBaseline();

					return data;
				} )
				.finally( function() {
					endSaving();
				} );
		}

		function runSaveAction( activeButton, labels, targetStatus ) {
			setActionButtonsDisabled( true );
			activeButton.textContent = labels.saving;

			return saveDocument( targetStatus )
				.then( function() {
					activeButton.textContent = labels.saved;
					resetButtonSoon( activeButton, labels.default );
				} )
				.catch( function() {
					activeButton.textContent = labels.error;
					resetButtonSoon( activeButton, labels.default );
				} );
		}

		if ( saveButton ) {
			saveButton.addEventListener( 'click', function() {
				if ( isSaving() ) {
					return;
				}

				runSaveAction( saveButton, {
					default: i18n.save || 'Save',
					saving: i18n.saving || 'Saving…',
					saved: i18n.saved || 'Saved',
					error: i18n.saveError || 'Error',
				} );
			} );
		}

		if ( publishButton ) {
			publishButton.addEventListener( 'click', function() {
				if ( isSaving() ) {
					return;
				}

				runSaveAction( publishButton, {
					default: i18n.publish || 'Publish',
					saving: i18n.publishing || 'Publishing…',
					saved: i18n.published || i18n.saved || 'Published',
					error: i18n.publishError || i18n.saveError || 'Error',
				}, 'publish' );
			} );
		}

		if ( previewButton ) {
			previewButton.addEventListener( 'click', function() {
				if ( isSaving() ) {
					return;
				}

				var previewWindow = window.open( 'about:blank', 'art-editor-preview-' + config.postId );

				previewButton.disabled = true;

				saveDocument()
					.then( function() {
						var previewUrl = config.previewUrl;
						var separator;

						if ( ! previewUrl ) {
							throw new Error( 'preview_missing' );
						}

						separator = previewUrl.indexOf( '?' ) === -1 ? '?' : '&';
						previewUrl = previewUrl + separator + 'ver=' + Date.now();

						if ( previewWindow ) {
							previewWindow.opener = null;
							previewWindow.location.href = previewUrl;
							previewWindow.focus();
						} else {
							window.open( previewUrl, 'art-editor-preview-' + config.postId );
						}
					} )
					.catch( function() {
						if ( previewWindow ) {
							previewWindow.close();
						}

						window.alert( i18n.previewError || 'Preview error' );
					} )
					.finally( function() {
						previewButton.disabled = false;
					} );
			} );
		}

		updatePublishButtonVisibility();
	}

	function initPageSettings() {
		var settingsToggle = document.getElementById( 'art-editor-settings-toggle' );
		var settingsClose = document.getElementById( 'art-editor-settings-close' );
		var settingsPanel = document.getElementById( 'art-editor-settings-panel' );
		var structureView = document.getElementById( 'art-editor-structure-view' );
		var settingsStatus = document.getElementById( 'art-editor-settings-status' );
		var titleInput = document.getElementById( 'art-editor-page-title' );
		var slugInput = document.getElementById( 'art-editor-page-slug' );
		var statusInput = document.getElementById( 'art-editor-page-status' );
		var layoutInput = document.getElementById( 'art-editor-layout-mode' );
		var styleInput = document.getElementById( 'art-editor-style-mode' );
		var pageSettings = {
			title: config.postTitle || '',
			slug: config.postSlug || '',
			status: config.postStatus || 'draft',
			layoutMode: config.layoutMode || 'canvas',
			styleMode: config.styleMode || 'editor',
		};
		var statusTimer = null;
		var titleTimer = null;

		if ( ! settingsToggle || ! settingsPanel || ! structureView || ! titleInput || ! statusInput || ! layoutInput || ! styleInput ) {
			return;
		}

		function setSettingsStatus( message, isError ) {
			if ( ! settingsStatus ) {
				return;
			}

			window.clearTimeout( statusTimer );
			settingsStatus.textContent = message || '';
			settingsStatus.hidden = ! message;
			settingsStatus.classList.toggle( 'is-error', !! isError );

			if ( message ) {
				statusTimer = window.setTimeout( function() {
					settingsStatus.hidden = true;
					settingsStatus.textContent = '';
					settingsStatus.classList.remove( 'is-error' );
				}, 2200 );
			}
		}

		function syncSettingsInputs() {
			titleInput.value = pageSettings.title || '';
			if ( slugInput ) {
				slugInput.value = pageSettings.slug || '';
			}
			statusInput.value = pageSettings.status || 'draft';
			layoutInput.value = pageSettings.layoutMode || 'canvas';
			styleInput.value = pageSettings.styleMode || 'editor';
			updatePermalinkHint( pageSettings.status );
		}

		function applyPageSettingsResponse( data ) {
			if ( data && 'string' === typeof data.title ) {
				pageSettings.title = data.title;
				config.postTitle = data.title;
			}

			if ( data && 'string' === typeof data.slug ) {
				pageSettings.slug = data.slug;
			}

			if ( data && data.status ) {
				pageSettings.status = data.status;
				config.postStatus = data.status;
			}

			if ( data && data.layoutMode ) {
				pageSettings.layoutMode = data.layoutMode;
				config.layoutMode = data.layoutMode;
			}

			if ( data && data.styleMode ) {
				pageSettings.styleMode = data.styleMode;
				config.styleMode = data.styleMode;
			}

			applyPermalinkSettings( data );
			syncSettingsInputs();
			updateDocumentSaveUi( pageSettings.status );
		}

		function persistPageSettings() {
			var nextSettings = getPageSettingsFromDom();

			pageSettings.title = nextSettings.title;
			pageSettings.slug = nextSettings.slug;
			pageSettings.status = config.postStatus || pageSettings.status;
			pageSettings.layoutMode = nextSettings.layoutMode;
			pageSettings.styleMode = nextSettings.styleMode;

			return savePageSettings( pageSettings, { includeStatus: false } )
				.then( function( data ) {
					applyPageSettingsResponse( data );
					setSettingsStatus( i18n.saved || 'Saved', false );
				} )
				.catch( function( error ) {
					if ( error && 'AbortError' === error.name ) {
						return;
					}

					pageSettings.title = config.postTitle || '';
					pageSettings.slug = config.postSlug || '';
					pageSettings.status = config.postStatus || 'draft';
					pageSettings.layoutMode = config.layoutMode || 'canvas';
					pageSettings.styleMode = config.styleMode || 'editor';
					syncSettingsInputs();
					updateDocumentSaveUi( pageSettings.status );
					setSettingsStatus( i18n.settingsSaveError || 'Settings save error', true );
				} );
		}

		function scheduleTitleSave() {
			window.clearTimeout( titleTimer );
			titleTimer = window.setTimeout( function() {
				persistPageSettings();
			}, 600 );
		}

		function toggleSettingsPanel( forceOpen ) {
			var shouldOpen = 'boolean' === typeof forceOpen ? forceOpen : settingsPanel.hidden;
			var elementPanel = document.getElementById( 'art-editor-element-panel' );

			if ( shouldOpen ) {
				clearSelectedElementLocator();
			} else if ( elementEditorController ) {
				elementEditorController.closePanel();
			}

			settingsPanel.hidden = ! shouldOpen;
			settingsToggle.setAttribute( 'aria-expanded', shouldOpen ? 'true' : 'false' );
			settingsToggle.classList.toggle( 'is-active', shouldOpen );

			if ( shouldOpen ) {
				structureView.hidden = true;
			} else if ( elementPanel && ! elementPanel.hidden ) {
				structureView.hidden = true;
			} else {
				structureView.hidden = false;
			}
		}

		settingsToggle.addEventListener( 'click', function() {
			if ( isSaving() ) {
				return;
			}

			toggleSettingsPanel( settingsPanel.hidden );
		} );

		if ( settingsClose ) {
			settingsClose.addEventListener( 'click', function() {
				toggleSettingsPanel( false );
			} );
		}

		titleInput.addEventListener( 'input', function() {
			updateDocumentHeader( titleInput.value, pageSettings.status );
			scheduleUnsavedIndicatorUpdate();
			scheduleTitleSave();
		} );

		if ( slugInput ) {
			slugInput.addEventListener( 'input', scheduleUnsavedIndicatorUpdate );

			slugInput.addEventListener( 'blur', function() {
				window.clearTimeout( titleTimer );
				persistPageSettings();
			} );
		}

		titleInput.addEventListener( 'blur', function() {
			window.clearTimeout( titleTimer );
			persistPageSettings();
		} );

		layoutInput.addEventListener( 'change', function() {
			pageSettings.layoutMode = layoutInput.value;
			persistPageSettings();
		} );

		styleInput.addEventListener( 'change', function() {
			pageSettings.styleMode = styleInput.value;
			persistPageSettings();
		} );

		syncSettingsInputs();
	}

	initCodeEditor();
	initStructure();
	initHistoryControls();
	initVisualTextEditBridge();
	elementEditorController = initElementEditorPanel();
	initCanvasTabs();
	initPreviewLoadingUi();
	initPreviewStatusBanner();
	initSaveAndPreview();
	initPageSettings();
	updateSavedBaseline();
	initUnsavedChangesGuard();
	updateUnsavedIndicator();
} )();
