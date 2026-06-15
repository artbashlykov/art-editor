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
	var structureList = document.getElementById( 'art-editor-structure-list' );
	var structureEmpty = document.getElementById( 'art-editor-structure-empty' );
	var createHtmlButton = document.getElementById( 'art-editor-create-html' );
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
	var suppressCodeChangeEvents = false;

	var editorUiState = {
		deviceMode: 'desktop',
		mobileFrameWidth: 375,
	};

	var devicePreviewLimits = {
		mobileWidthDefault: 375,
		mobileWidthMin: 320,
		mobileWidthMax: 520,
	};

	var persistenceState = {
		savedBlocksSnapshot: '',
		savedSettingsSnapshot: '',
		saveInFlight: 0,
	};

	var unsavedIndicatorTimer = null;

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

		if ( codeEditorInstance && codeEditorInstance.codemirror ) {
			if ( codeEditorInstance.codemirror.getValue() !== nextValue ) {
				if ( settings.silent ) {
					suppressCodeChangeEvents = true;
				}

				codeEditorInstance.codemirror.setValue( nextValue );

				if ( settings.silent ) {
					suppressCodeChangeEvents = false;
				}
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
		if ( elementEditorController && elementEditorController.cancelPendingLinkApply ) {
			elementEditorController.cancelPendingLinkApply();
		}

		if ( elementEditorController && elementEditorController.cancelPendingTextStyleApply ) {
			elementEditorController.cancelPendingTextStyleApply();
		}

		if ( ! locator || ! Array.isArray( locator.path ) || ! locator.path.length ) {
			clearSelectedElementLocator( { skipIframe: true } );
			return;
		}

		if ( ! editorState.selectedId ) {
			return;
		}

		editorState.selectedElementLocator = {
			blockId: editorState.selectedId,
			path: locator.path,
			tag: locator.tag || '',
			outerHtml: locator.outerHtml || '',
			textContent: locator.textContent || '',
		};

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
		var styleControls = document.getElementById( 'art-editor-element-style-controls' );
		var fontSizeRow = document.getElementById( 'art-editor-element-font-size-row' );
		var textColorRow = document.getElementById( 'art-editor-element-text-color-row' );
		var backgroundColorRow = document.getElementById( 'art-editor-element-background-color-row' );
		var fontSizeInput = document.getElementById( 'art-editor-element-font-size' );
		var fontSizeResetButton = document.getElementById( 'art-editor-element-font-size-reset' );
		var textColorInput = document.getElementById( 'art-editor-element-text-color' );
		var textColorResetButton = document.getElementById( 'art-editor-element-text-color-reset' );
		var backgroundColorInput = document.getElementById( 'art-editor-element-background-color' );
		var backgroundColorResetButton = document.getElementById( 'art-editor-element-background-color-reset' );
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

		if ( ! elementPanel || ! structureView ) {
			return null;
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

			if ( ! elementSummary ) {
				return;
			}

			if ( ! locator || ! locator.tag ) {
				elementSummary.hidden = true;
				elementSummary.textContent = '';
				return;
			}

			tagLabel = i18n.elementEditorTag || 'Тег';
			tagName = String( locator.tag ).toLowerCase();
			elementSummary.textContent = '';
			elementSummary.appendChild( document.createElement( 'strong' ) ).textContent = tagLabel + ':';
			elementSummary.appendChild( document.createTextNode( ' <' + tagName + '>' ) );
			elementSummary.hidden = false;
		}

		function updateTextStyleResetButtons( textStyleState ) {
			var hasFontSize = !! ( textStyleState && textStyleState.fontSize );
			var hasColor = !! ( textStyleState && textStyleState.color );
			var hasBackgroundColor = !! ( textStyleState && textStyleState.backgroundColor );

			if ( fontSizeResetButton ) {
				fontSizeResetButton.disabled = ! hasFontSize;
			}

			if ( textColorResetButton ) {
				textColorResetButton.disabled = ! hasColor;
			}

			if ( backgroundColorResetButton ) {
				backgroundColorResetButton.disabled = ! hasBackgroundColor;
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
			var isText = isTextElementLocator( locator );
			var canSetBackground = isBackgroundStyleableLocator( locator );

			if ( imageControls ) {
				imageControls.hidden = ! isImage;
			}

			if ( fontSizeRow ) {
				fontSizeRow.hidden = ! isText;
			}

			if ( textColorRow ) {
				textColorRow.hidden = ! isText;
			}

			if ( backgroundColorRow ) {
				backgroundColorRow.hidden = ! canSetBackground;
			}

			if ( styleControls ) {
				styleControls.hidden = ! isText && ! canSetBackground;
			}

			if ( ! locator || ! locator.path || ! locator.path.length ) {
				if ( fontSizeRow ) {
					fontSizeRow.hidden = true;
				}

				if ( textColorRow ) {
					textColorRow.hidden = true;
				}

				if ( backgroundColorRow ) {
					backgroundColorRow.hidden = true;
				}

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

				if ( textColorInput ) {
					textColorInput.value = '#000000';
				}

				if ( backgroundColorInput ) {
					backgroundColorInput.value = '#ffffff';
				}

				updateTextStyleResetButtons( null );
				closeLinkOptions();
				return;
			}

			block = getBlockById( editorState.selectedId );

			if ( ( isText && fontSizeInput && textColorInput ) || ( canSetBackground && backgroundColorInput ) ) {
				textStyleState = getElementTextStyleStateFromHtml( block ? block.content || '' : '', locator.path );

				isSyncingTextStyleControls = true;

				if ( isText && fontSizeInput && textColorInput ) {
					fontSizeInput.value = textStyleState.fontSize || '';
					textColorInput.value = textStyleState.color || '#000000';
				}

				if ( canSetBackground && backgroundColorInput ) {
					backgroundColorInput.value = textStyleState.backgroundColor || '#ffffff';
				}

				isSyncingTextStyleControls = false;
				updateTextStyleResetButtons( textStyleState );
			}

			if ( ! linkUrlInput || ! linkBlankCheckbox ) {
				return;
			}

			linkState = getElementLinkStateFromHtml( block ? block.content || '' : '', locator.path );

			isSyncingLinkControls = true;
			linkUrlInput.value = linkState.href;
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

		function applyLinkFromControls() {
			var block;
			var locator;
			var result;
			var nextLocator;

			if ( isSyncingLinkControls || ! editorState.selectedId || ! isSelectedElementLocatorForCurrentBlock() ) {
				return;
			}

			block = getBlockById( editorState.selectedId );

			if ( ! block ) {
				return;
			}

			locator = editorState.selectedElementLocator;
			result = applyElementLinkEdit(
				block.content || '',
				locator.path,
				linkUrlInput ? linkUrlInput.value : '',
				linkBlankCheckbox ? linkBlankCheckbox.checked : false
			);

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
				applyLinkFromControls();
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
			var colorValue;
			var backgroundColorValue;
			var isText;
			var canSetBackground;
			var touchesText;
			var touchesBackground;

			if ( isSyncingTextStyleControls || ! editorState.selectedId || ! isSelectedElementLocatorForCurrentBlock() ) {
				return;
			}

			isText = isTextElementLocator( editorState.selectedElementLocator );
			canSetBackground = isBackgroundStyleableLocator( editorState.selectedElementLocator );
			touchesText = ! changedProperties || changedProperties.fontSize || changedProperties.color;
			touchesBackground = ! changedProperties || changedProperties.backgroundColor;

			if ( touchesText && ! isText ) {
				return;
			}

			if ( touchesBackground && ! canSetBackground ) {
				return;
			}

			block = getBlockById( editorState.selectedId );

			if ( ! block ) {
				return;
			}

			locator = editorState.selectedElementLocator;
			fontSizeValue = overrides && Object.prototype.hasOwnProperty.call( overrides, 'fontSize' ) ? overrides.fontSize : ( fontSizeInput ? fontSizeInput.value : '' );
			colorValue = overrides && Object.prototype.hasOwnProperty.call( overrides, 'color' ) ? overrides.color : ( textColorInput ? textColorInput.value : '' );
			backgroundColorValue = overrides && Object.prototype.hasOwnProperty.call( overrides, 'backgroundColor' ) ? overrides.backgroundColor : ( backgroundColorInput ? backgroundColorInput.value : '' );
			result = applyElementTextStyleEdit(
				block.content || '',
				locator.path,
				{
					fontSize: fontSizeValue,
					color: colorValue,
					backgroundColor: backgroundColorValue,
				},
				changedProperties
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

			updatePreview();
			updatePagePreview();
			syncElementControls( editorState.selectedElementLocator );

			if ( editorState.selectedElementLocator ) {
				openPanel( editorState.selectedElementLocator );
			}

			scheduleUnsavedIndicatorUpdate();
		}

		function scheduleTextStyleApply() {
			window.clearTimeout( textStyleApplyTimer );
			textStyleApplyTimer = window.setTimeout( function() {
				textStyleApplyTimer = null;
				applyTextStyleFromControls( { fontSize: true } );
			}, 300 );
		}

		function cancelPendingTextStyleApply() {
			window.clearTimeout( textStyleApplyTimer );
			textStyleApplyTimer = null;
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

		function resetTextColorStyle() {
			flushStyleHistoryCheckpoint();
			pushHistory();

			if ( textColorInput ) {
				textColorInput.value = '#000000';
			}

			applyTextStyleFromControls( { color: true }, { color: '' }, { skipHistory: true } );
		}

		function resetBackgroundColorStyle() {
			flushStyleHistoryCheckpoint();
			pushHistory();

			if ( backgroundColorInput ) {
				backgroundColorInput.value = '#ffffff';
			}

			applyTextStyleFromControls( { backgroundColor: true }, { backgroundColor: '' }, { skipHistory: true } );
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

				applyLinkFromControls();
			} );
		}

		if ( linkBlankCheckbox ) {
			linkBlankCheckbox.addEventListener( 'change', applyLinkFromControls );
		}

		if ( fontSizeInput ) {
			fontSizeInput.addEventListener( 'input', scheduleTextStyleApply );
			fontSizeInput.addEventListener( 'change', function() {
				cancelPendingTextStyleApply();
				applyTextStyleFromControls( { fontSize: true } );
			} );
		}

		if ( textColorInput ) {
			textColorInput.addEventListener( 'input', function() {
				applyTextStyleFromControls( { color: true } );
			} );
			textColorInput.addEventListener( 'change', function() {
				applyTextStyleFromControls( { color: true } );
			} );
		}

		if ( backgroundColorInput ) {
			backgroundColorInput.addEventListener( 'input', function() {
				applyTextStyleFromControls( { backgroundColor: true } );
			} );
			backgroundColorInput.addEventListener( 'change', function() {
				applyTextStyleFromControls( { backgroundColor: true } );
			} );
		}

		if ( fontSizeResetButton ) {
			fontSizeResetButton.addEventListener( 'click', resetFontSizeStyle );
		}

		if ( textColorResetButton ) {
			textColorResetButton.addEventListener( 'click', resetTextColorStyle );
		}

		if ( backgroundColorResetButton ) {
			backgroundColorResetButton.addEventListener( 'click', resetBackgroundColorStyle );
		}

		return {
			openPanel: openPanel,
			closePanel: closePanel,
			clearActiveElement: clearActiveElement,
			cancelPendingLinkApply: cancelPendingLinkApply,
			cancelPendingTextStyleApply: cancelPendingTextStyleApply,
			syncElementControls: syncElementControls,
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
			doc = new window.DOMParser().parseFromString( html, 'text/html' );
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

	function commitCodeToSelectedBlock() {
		var block = ensureBlockForCode();

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
			editorState.blocks.map( function( block ) {
				return {
					id: block.id,
					title: block.title,
					titleLocked: !! block.titleLocked,
					content: block.content || '',
				};
			} )
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
		var indicator = document.getElementById( 'art-editor-unsaved-indicator' );

		if ( ! indicator ) {
			return;
		}

		indicator.hidden = ! isDirty();
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

		setCodeEditorEnabled( ! locked && editorState.blocks.length > 0 );
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
	}

	function endSaving() {
		persistenceState.saveInFlight = Math.max( 0, persistenceState.saveInFlight - 1 );
		updateEditorSaveLock();
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
			blocks: editorState.blocks.map( function( block ) {
				return {
					id: block.id,
					title: block.title,
					titleLocked: !! block.titleLocked,
					content: block.content || '',
				};
			} ),
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
			return {
				id: block.id,
				title: block.title,
				titleLocked: !! block.titleLocked,
				content: block.content || '',
			};
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

	function isElementDeleteShortcutTarget( target ) {
		if ( ! target || ! target.closest ) {
			return true;
		}

		if ( target.isContentEditable ) {
			return false;
		}

		if ( target.closest( 'input, textarea, select' ) ) {
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

		if ( 'Backspace' !== event.key && 'Delete' !== event.key ) {
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
			return;
		}

		if ( ! isHistoryShortcutTarget( event.target ) ) {
			return;
		}

		if ( 'z' === event.key && ! event.shiftKey ) {
			event.preventDefault();
			undoChange();
			return;
		}

		if ( 'z' === event.key && event.shiftKey ) {
			event.preventDefault();
			redoChange();
			return;
		}

		if ( 'y' === event.key ) {
			event.preventDefault();
			redoChange();
		}
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

		if ( codeEditorInstance && codeEditorInstance.codemirror ) {
			codeEditorInstance.codemirror.on( 'keydown', handleHistoryShortcut );
		}
	}

	function parseBlockContent( html ) {
		var styles = [];
		var bodyHtml = html || '';
		var doc;
		var styleNodes;
		var index;

		if ( ! html || ! String( html ).trim() || ! window.DOMParser ) {
			return {
				styles: styles,
				body: bodyHtml,
			};
		}

		try {
			doc = new window.DOMParser().parseFromString( html, 'text/html' );
			styleNodes = doc.querySelectorAll( 'head style, body style' );

			for ( index = 0; index < styleNodes.length; index++ ) {
				styles.push( styleNodes[ index ].outerHTML );
			}

			if ( doc.body ) {
				bodyHtml = doc.body.innerHTML;
			}
		} catch ( error ) {
			// Keep the raw HTML when parsing fails.
		}

		return {
			styles: styles,
			body: bodyHtml,
		};
	}

	function buildPreviewDocument( bodyHtml, blockStyles, options ) {
		var editMode = options && options.editMode;
		var blockLinkNavigation = options && options.blockLinkNavigation;
		var headExtras = '';
		var siteIconHead = config.siteIconHead || '';

		if ( editMode ) {
			headExtras += getEditInspectHeadMarkup();
		}

		if ( blockLinkNavigation || editMode ) {
			headExtras += getPreviewLinkGuardMarkup();
		}

		return [
			'<!doctype html>',
			'<html>',
			'<head>',
			'<meta charset="utf-8">',
			'<meta name="viewport" content="width=device-width, initial-scale=1">',
			siteIconHead,
			'<style>',
			'html,body{margin:0;padding:0;box-sizing:border-box;}',
			'*,*::before,*::after{box-sizing:inherit;}',
			'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#1e1e1e;}',
			'img,video,iframe,svg{max-width:100%;}',
			'</style>',
			blockStyles || '',
			headExtras,
			'</head>',
			'<body>',
			bodyHtml || '',
			'</body>',
			'</html>',
		].join( '' );
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

	function unwrapAnchorElement( anchor ) {
		var parent = anchor.parentElement;

		if ( ! parent ) {
			return;
		}

		while ( anchor.firstChild ) {
			parent.insertBefore( anchor.firstChild, anchor );
		}

		parent.removeChild( anchor );
	}

	function normalizeLinkHref( href ) {
		var trimmed;

		if ( 'string' !== typeof href ) {
			return '';
		}

		trimmed = href.trim();

		if ( ! trimmed ) {
			return '';
		}

		if ( /^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test( trimmed ) ) {
			return trimmed;
		}

		if ( /^www\./i.test( trimmed ) ) {
			return 'https://' + trimmed;
		}

		if ( /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?::\d+)?(?:[/?#][^\s]*)?$/i.test( trimmed ) ) {
			return 'https://' + trimmed;
		}

		return trimmed;
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
			doc = new window.DOMParser().parseFromString( html, 'text/html' );
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
			doc = new window.DOMParser().parseFromString( html, 'text/html' );
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

	function getElementTextStyleStateFromHtml( html, path ) {
		var doc;
		var target;
		var fontSize;
		var color;
		var backgroundColor;

		if ( ! html || ! window.DOMParser || ! path || ! path.length ) {
			return {
				fontSize: '',
				color: '',
				backgroundColor: '',
			};
		}

		try {
			doc = new window.DOMParser().parseFromString( html, 'text/html' );
			target = findElementByPath( doc.body, path );

			if ( ! target ) {
				return {
					fontSize: '',
					color: '',
					backgroundColor: '',
				};
			}

			fontSize = formatFontSizeForInput( target.style.getPropertyValue( 'font-size' ) );
			color = cssColorToHex( target.style.getPropertyValue( 'color' ) );
			backgroundColor = cssColorToHex( target.style.getPropertyValue( 'background-color' ) );

			return {
				fontSize: fontSize,
				color: color,
				backgroundColor: backgroundColor,
			};
		} catch ( error ) {
			return {
				fontSize: '',
				color: '',
				backgroundColor: '',
			};
		}
	}

	function applyElementTextStyleEdit( html, path, textStyles, changedProperties ) {
		var doc;
		var target;
		var selectionPath;
		var fontSize;
		var color;
		var backgroundColor;
		var shouldUpdateFontSize;
		var shouldUpdateColor;
		var shouldUpdateBackgroundColor;

		if ( ! html || ! window.DOMParser || ! path || ! path.length || ! textStyles ) {
			return null;
		}

		shouldUpdateFontSize = ! changedProperties || changedProperties.fontSize;
		shouldUpdateColor = ! changedProperties || changedProperties.color;
		shouldUpdateBackgroundColor = ! changedProperties || changedProperties.backgroundColor;
		fontSize = normalizeFontSizeInput( textStyles.fontSize );
		color = cssColorToHex( textStyles.color );
		backgroundColor = cssColorToHex( textStyles.backgroundColor );

		try {
			doc = new window.DOMParser().parseFromString( html, 'text/html' );
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

			if ( shouldUpdateColor ) {
				if ( color ) {
					target.style.setProperty( 'color', color );
				} else {
					target.style.removeProperty( 'color' );
				}
			}

			if ( shouldUpdateBackgroundColor ) {
				if ( backgroundColor ) {
					target.style.setProperty( 'background-color', backgroundColor );
				} else {
					target.style.removeProperty( 'background-color' );
				}
			}

			if ( ! target.getAttribute( 'style' ) ) {
				target.removeAttribute( 'style' );
			}

			selectionPath = getElementPathFromNode( target, doc.body );

			return {
				html: serializeBlockContentFromDocument( doc ),
				selectionPath: selectionPath,
			};
		} catch ( error ) {
			return null;
		}
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
		var selectionPath;

		if ( ! html || ! window.DOMParser || ! path || ! path.length || ! src ) {
			return null;
		}

		try {
			doc = new window.DOMParser().parseFromString( html, 'text/html' );
			target = findElementByPath( doc.body, path );

			if ( ! target || 'IMG' !== target.tagName ) {
				return null;
			}

			target.setAttribute( 'src', src );

			if ( alt ) {
				target.setAttribute( 'alt', alt );
			}

			selectionPath = getElementPathFromNode( target, doc.body );

			return {
				html: serializeBlockContentFromDocument( doc ),
				selectionPath: selectionPath,
			};
		} catch ( error ) {
			return null;
		}
	}

	function applyElementLinkAttributes( anchor, href, openInNew ) {
		anchor.setAttribute( 'href', href );

		if ( openInNew ) {
			anchor.setAttribute( 'target', '_blank' );
			anchor.setAttribute( 'rel', 'noopener noreferrer' );
			return;
		}

		anchor.removeAttribute( 'target' );
		anchor.removeAttribute( 'rel' );
	}

	function applyElementLinkEdit( html, path, href, openInNew ) {
		var doc;
		var target;
		var anchor;
		var newAnchor;
		var selectionPath;

		if ( ! html || ! window.DOMParser || ! path || ! path.length ) {
			return null;
		}

		href = normalizeLinkHref( href );

		try {
			doc = new window.DOMParser().parseFromString( html, 'text/html' );
			target = findElementByPath( doc.body, path );

			if ( ! target ) {
				return null;
			}

			anchor = findLinkAnchorForElement( target, doc.body );

			if ( ! href ) {
				if ( anchor ) {
					if ( target === anchor && anchor.firstElementChild ) {
						target = anchor.firstElementChild;
					}

					unwrapAnchorElement( anchor );
				}

				if ( target && target.parentElement ) {
					selectionPath = getElementPathFromNode( target, doc.body );
				} else {
					selectionPath = path;
				}

				return {
					html: serializeBlockContentFromDocument( doc ),
					selectionPath: selectionPath,
				};
			}

			if ( anchor ) {
				applyElementLinkAttributes( anchor, href, openInNew );
				selectionPath = getElementPathFromNode( target, doc.body );

				return {
					html: serializeBlockContentFromDocument( doc ),
					selectionPath: selectionPath,
				};
			}

			newAnchor = doc.createElement( 'a' );
			applyElementLinkAttributes( newAnchor, href, openInNew );

			if ( ! target.parentElement ) {
				return null;
			}

			target.parentElement.insertBefore( newAnchor, target );
			newAnchor.appendChild( target );
			selectionPath = getElementPathFromNode( target, doc.body );

			return {
				html: serializeBlockContentFromDocument( doc ),
				selectionPath: selectionPath,
			};
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
			doc = new window.DOMParser().parseFromString( html, 'text/html' );
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
		var styleNodes;
		var bodyHtml = '';
		var styleIndex;

		if ( ! doc ) {
			return '';
		}

		styleNodes = doc.querySelectorAll( 'head style, body style' );

		for ( styleIndex = 0; styleIndex < styleNodes.length; styleIndex++ ) {
			styles.push( styleNodes[ styleIndex ].outerHTML );
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
			doc = new window.DOMParser().parseFromString( html, 'text/html' );
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

		nextHtml = applyVisualTextEdit( block.content || '', path, innerHtml );

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

			if ( ! pendingElementSelectionPath || ! previewFrame.contentWindow ) {
				return;
			}

			restoreGeneration = pendingElementSelectionGeneration;

			if ( restoreGeneration !== previewRestoreGeneration ) {
				pendingElementSelectionPath = null;
				pendingElementSelectionGeneration = 0;
				return;
			}

			previewFrame.contentWindow.postMessage( {
				source: 'art-editor-parent',
				type: 'selectElementByPath',
				path: pendingElementSelectionPath,
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
			'.art-editor-inspect-active{outline:2px solid #2271b1!important;outline-offset:2px;background-color:rgba(34,113,177,.08)!important;}',
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
			'function getInspectableElement(node){',
			'while(node&&node!==document.body&&node!==document.documentElement){',
			'if(!ignored[node.tagName]){return node;}',
			'node=node.parentElement;',
			'}',
			'return null;',
			'}',
			'function hasEditableText(node){',
			'return!!(node&&node.textContent&&node.textContent.replace(/\\s+/g,"").length);',
			'}',
			'function getElementPath(node){',
			'var path=[];',
			'var parent;',
			'var index;',
			'while(node&&node!==document.body&&node!==document.documentElement){',
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
			'target=getInspectableElement(document.elementFromPoint(x,y));',
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
			'if(editing){return;}',
			'preventAnchorActivation(event);',
			'target=getInspectableElement(event.target);',
			'event.preventDefault();',
			'event.stopPropagation();',
			'setActive(target);',
			'clearHover();',
			'},true);',
			'document.addEventListener("dblclick",function(event){',
			'var target;',
			'target=getInspectableElement(event.target);',
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
			'if(!active){return;}',
			'if("Backspace"===event.key||"Delete"===event.key){',
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
			'setActive(findElementByPath(data.path||[]));',
			'clearHover();',
			'}',
			'},false);',
			'})();',
			'<\/script>',
		].join( '' );
	}

	function getSelectedBlockPreviewDocument() {
		var parts = parseBlockContent( getCodeValue() );

		return buildPreviewDocument( parts.body, parts.styles.join( '\n' ), { editMode: true } );
	}

	function getAllBlocksPreviewDocument() {
		var allStyles = [];
		var allBodies = [];
		var index;
		var block;
		var parts;

		commitCodeToSelectedBlock();

		for ( index = 0; index < editorState.blocks.length; index++ ) {
			block = editorState.blocks[ index ];
			parts = parseBlockContent( block.content || '' );
			allStyles = allStyles.concat( parts.styles );

			if ( parts.body ) {
				allBodies.push( parts.body );
			}
		}

		return buildPreviewDocument( allBodies.join( '\n' ), allStyles.join( '\n' ), { blockLinkNavigation: true } );
	}

	function updatePreview() {
		if ( ! previewFrame ) {
			return;
		}

		previewRestoreGeneration += 1;

		if ( isSelectedElementLocatorForCurrentBlock() && editorState.selectedElementLocator.path ) {
			pendingElementSelectionPath = editorState.selectedElementLocator.path;
			pendingElementSelectionGeneration = previewRestoreGeneration;
		} else {
			pendingElementSelectionPath = null;
			pendingElementSelectionGeneration = 0;
		}

		previewFrame.srcdoc = getSelectedBlockPreviewDocument();
	}

	function updatePagePreview() {
		if ( ! pagePreviewFrame ) {
			return;
		}

		commitCodeToSelectedBlock();

		if ( ! config.previewDocumentUrl || ! config.nonce ) {
			pagePreviewFrame.srcdoc = getAllBlocksPreviewDocument();
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
				if ( data && 'string' === typeof data.document && data.document ) {
					pagePreviewFrame.srcdoc = data.document;
					return;
				}

				throw new Error( 'page_preview_empty' );
			} )
			.catch( function() {
				pagePreviewFrame.srcdoc = getAllBlocksPreviewDocument();
			} );
	}

	function syncCodeFromSelection() {
		var block = getBlockById( editorState.selectedId );

		clearSelectedElementLocator();

		if ( block ) {
			setCodeValue( block.content || '' );
			setCodeEditorEnabled( true );
		} else {
			setCodeValue( '' );
			setCodeEditorEnabled( true );
		}

		updatePreview();
		updatePagePreview();
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
		pushHistory();
		commitCodeToSelectedBlock();
		editorState.selectedId = blockId;
		renderStructure();
		syncCodeFromSelection();
	}

	function switchToCodeTab() {
		if ( typeof activateCanvasTab === 'function' ) {
			activateCanvasTab( 'code' );
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
			title: ( i18n.emptyBlock || 'Пустой HTML-блок' ) + ' ' + ( index + 1 ),
			titleLocked: false,
			content: '',
		};

		pushHistory();
		commitCodeToSelectedBlock();
		editorState.blocks.push( block );
		editorState.selectedId = block.id;
		renderStructure();
		syncCodeFromSelection();
		scheduleUnsavedIndicatorUpdate();
		switchToCodeTab();
	}

	function initStructure() {
		var index;

		if ( createHtmlButton ) {
			createHtmlButton.addEventListener( 'click', createHtmlBlock );
		}

		bindCodeChangeEvents();

		for ( index = 0; index < editorState.blocks.length; index++ ) {
			editorState.blocks[ index ].titleLocked = !! editorState.blocks[ index ].titleLocked;
			editorState.blocks[ index ].title = editorState.blocks[ index ].title || getBlockTitle( editorState.blocks[ index ].content, index );
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
			return Math.min(
				devicePreviewLimits.mobileWidthMax,
				Math.max( devicePreviewLimits.mobileWidthMin, Math.round( width ) )
			);
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
		}

		function finishResizeDrag() {
			if ( ! resizeDragState ) {
				return;
			}

			resizeDragState.handle.classList.remove( 'is-dragging' );
			canvas.classList.remove( 'is-mobile-resizing' );
			resizeDragState = null;
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
				var showToggle = 'edit' === tabName || 'view' === tabName;

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
			tabButtons.forEach( function( button ) {
				button.disabled = disabled;
			} );
		}

		function performTabActivation( tabName ) {
			tabButtons.forEach( function( button ) {
				var isActive = button.getAttribute( 'data-tab' ) === tabName;

				button.classList.toggle( 'is-active', isActive );
				button.setAttribute( 'aria-selected', isActive ? 'true' : 'false' );
			} );

			panels.forEach( function( panel ) {
				var isActive = panel.id === 'art-editor-panel-' + tabName;

				panel.classList.toggle( 'is-active', isActive );

				if ( isActive ) {
					panel.removeAttribute( 'hidden' );
				} else {
					panel.setAttribute( 'hidden', 'hidden' );
				}
			} );

			if ( 'edit' === tabName ) {
				commitCodeToSelectedBlock();
				updatePreview();

				if ( devicePreview ) {
					devicePreview.syncMobileFrameWidth();
				}

				if ( isSelectedElementLocatorForCurrentBlock() && elementEditorController ) {
					elementEditorController.openPanel( editorState.selectedElementLocator );
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
				updatePagePreview();

				if ( devicePreview ) {
					devicePreview.syncMobileFrameWidth();
				}
			}

			if ( 'code' === tabName ) {
				refreshCodeEditor();
				window.setTimeout( function() {
					highlightSelectedElementInCode();
				}, 0 );
			}

			if ( devicePreview ) {
				devicePreview.updateVisibility( tabName );
			}
		}

		function activateTab( tabName ) {
			var currentTab = getActiveCanvasTabName();

			if ( isSaving() || ! tabName || tabName === currentTab ) {
				return;
			}

			if ( 'edit' === currentTab ) {
				setCanvasTabsDisabled( true );

				commitPendingVisualEdit()
					.then( function() {
						performTabActivation( tabName );
					} )
					.finally( function() {
						setCanvasTabsDisabled( false );
					} );

				return;
			}

			performTabActivation( tabName );
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
					blocks: editorState.blocks.map( function( block ) {
						return {
							content: block.content || '',
							title: block.titleLocked ? ( block.title || '' ) : '',
						};
					} ),
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

						editorState.blocks = data.htmlBlocks;

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

			if ( shouldOpen && elementEditorController ) {
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
	initSaveAndPreview();
	initPageSettings();
	updateSavedBaseline();
	initUnsavedChangesGuard();
	updateUnsavedIndicator();
} )();
