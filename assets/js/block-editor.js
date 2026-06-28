( function( wp ) {
	'use strict';

	if ( ! wp || ! wp.plugins || ! wp.element ) {
		return;
	}

	var __ = wp.i18n.__;
	var createElement = wp.element.createElement;
	var useEffect = wp.element.useEffect;
	var useState = wp.element.useState;
	var createPortal = wp.element.createPortal;
	var registerPlugin = wp.plugins.registerPlugin;
	var config = window.artEditorConfig || {};
	var mountRegistry = {};

	function findEditorToolbar() {
		var selectors = [
			'.edit-post-header-toolbar',
			'.editor-header__toolbar',
			'.interface-interface-skeleton__header .edit-post-header-toolbar',
			'.interface-interface-skeleton__header .editor-header__toolbar',
		];
		var index;
		var toolbar;

		for ( index = 0; index < selectors.length; index++ ) {
			toolbar = document.querySelector( selectors[ index ] );

			if ( toolbar ) {
				return toolbar;
			}
		}

		return null;
	}

	function findEditorContentArea() {
		var selectors = [
			'.interface-interface-skeleton__content',
			'.edit-post-layout__content',
			'.block-editor-writing-flow',
		];
		var index;
		var area;

		for ( index = 0; index < selectors.length; index++ ) {
			area = document.querySelector( selectors[ index ] );

			if ( area ) {
				return area;
			}
		}

		return null;
	}

	function getOrCreateMount( mountId, parent, insertBeforeNode ) {
		var mount = mountRegistry[ mountId ] || document.getElementById( mountId );

		if ( ! mount ) {
			mount = document.createElement( 'div' );
			mount.id = mountId;
			mount.className = 'art-editor-topbar-button-slot';
		}

		mountRegistry[ mountId ] = mount;

		if ( ! parent ) {
			return mount.isConnected ? mount : null;
		}

		if ( mount.isConnected && mount.parentNode === parent ) {
			return mount;
		}

		if ( mount.isConnected && parent.contains( mount ) ) {
			return mount;
		}

		if ( insertBeforeNode && insertBeforeNode.parentNode === parent ) {
			parent.insertBefore( mount, insertBeforeNode );
		} else {
			parent.appendChild( mount );
		}

		return mount;
	}

	function redirectWhenSaveSettled( editUrl ) {
		var attempts = 0;
		var maxAttempts = 40;

		window.setTimeout( function checkSaveState() {
			var select = wp.data.select( 'core/editor' );

			if ( select.isSavingPost() || select.isAutosavingPost() ) {
				attempts += 1;

				if ( attempts >= maxAttempts ) {
					window.alert( __( 'Не удалось сохранить запись перед открытием редактора.', 'art-editor' ) );
					return;
				}

				window.setTimeout( checkSaveState, 300 );
				return;
			}

			if ( select.getLastPostSaveError && select.getLastPostSaveError() ) {
				window.alert( __( 'Не удалось сохранить запись перед открытием редактора.', 'art-editor' ) );
				return;
			}

			window.location.href = editUrl;
		}, 300 );
	}

	function openEditorScreen() {
		var editUrl = config.editUrl;
		var editor = wp.data.dispatch( 'core/editor' );
		var currentPost = wp.data.select( 'core/editor' ).getCurrentPost();
		var isNewPost = currentPost && 'auto-draft' === currentPost.status;
		var title;

		if ( ! editUrl ) {
			return;
		}

		if ( isNewPost ) {
			title = wp.data.select( 'core/editor' ).getEditedPostAttribute( 'title' );

			if ( ! title ) {
				editor.editPost( {
					title: __( 'ART Editor #', 'art-editor' ) + ( config.postId || '' ),
				} );
			}

			var saveResult = editor.savePost();

			if ( saveResult && 'function' === typeof saveResult.then ) {
				saveResult.catch( function() {
					window.alert( __( 'Не удалось сохранить запись перед открытием редактора.', 'art-editor' ) );
				} );
			}

			redirectWhenSaveSettled( editUrl );
			return;
		}

		window.location.href = editUrl;
	}

	function returnToWordPressEditor() {
		var message = __( 'Вернуться к редактору Gutenberg? Блоки ART Editor останутся HTML-блоками, а ранее импортированные элементы Gutenberg снова станут обычными блоками.', 'art-editor' );

		if ( ! window.confirm( message ) ) {
			return;
		}

		if ( ! config.leaveModeUrl || ! config.nonce ) {
			document.body.classList.remove( 'art-editor-gutenberg-active' );
			return;
		}

		window.fetch( config.leaveModeUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-WP-Nonce': config.nonce,
			},
		} )
			.then( function( response ) {
				if ( ! response.ok ) {
					throw new Error( 'leave_builder_failed' );
				}

				window.location.reload();
			} )
			.catch( function() {
				window.alert( __( 'Не удалось вернуться в редактор WordPress.', 'art-editor' ) );
			} );
	}

	function HtmlLauncherButton( props ) {
		return createElement(
			'button',
			{
				type: 'button',
				className: 'art-editor-topbar-button',
				onClick: props.onClick,
			},
			createElement( 'span', { className: 'art-editor-topbar-button__icon' }, '<>' ),
			createElement( 'span', null, __( 'Редактор HTML', 'art-editor' ) )
		);
	}

	function BackToWordPressButton( props ) {
		return createElement(
			'div',
			{ id: 'art-editor-switch-mode', className: 'art-editor-switch-mode' },
			createElement(
				'button',
				{
					type: 'button',
					id: 'art-editor-switch-mode-button',
					className: 'art-editor-switch-mode__button',
					onClick: props.onClick,
				},
				createElement(
					'span',
					{ className: 'art-editor-switch-mode__label' },
					'\u2190 ' + __( 'Вернуться в Gutenberg', 'art-editor' )
				)
			)
		);
	}

	function BuilderPanel( props ) {
		return createElement(
			'div',
			{ id: 'art-editor-gutenberg-panel', className: 'art-editor-gutenberg-panel' },
			createElement(
				'p',
				{ className: 'art-editor-gutenberg-panel__hint' },
				__( 'Эта страница редактируется в ART Editor. Чтобы не сломать вёрстку, блоки Gutenberg здесь недоступны.', 'art-editor' )
			),
			createElement(
				'button',
				{
					type: 'button',
					className: 'art-editor-gutenberg-panel__button',
					onClick: props.onEdit,
				},
				createElement( 'span', { className: 'art-editor-topbar-button__icon' }, '<>' ),
				createElement( 'span', null, __( 'Редактировать HTML', 'art-editor' ) )
			),
			createElement(
				'button',
				{
					type: 'button',
					className: 'art-editor-gutenberg-panel__button art-editor-gutenberg-panel__button--secondary',
					onClick: props.onLeave,
				},
				__( 'Вернуться в Gutenberg', 'art-editor' )
			)
		);
	}

	function useDomMount( getParent, mountId, insertBeforeSelector ) {
		var mountState = useState( null );
		var mountNode = mountState[ 0 ];
		var setMountNode = mountState[ 1 ];

		useEffect( function() {
			var observer;
			var observedTarget = null;
			var rafId = 0;

			function getObserverTarget() {
				return document.querySelector( '.interface-interface-skeleton__header' )
					|| document.querySelector( '.edit-post-header' )
					|| document.querySelector( '.editor-header' )
					|| document.body;
			}

			function ensureObserver() {
				var target = getObserverTarget();

				if ( ! window.MutationObserver || observedTarget === target ) {
					return;
				}

				if ( observer ) {
					observer.disconnect();
				}

				observer = new window.MutationObserver( scheduleSync );
				observer.observe( target, {
					childList: true,
					subtree: true,
				} );
				observedTarget = target;
			}

			function syncMount() {
				var parent = getParent();
				var insertBeforeNode = insertBeforeSelector ? document.querySelector( insertBeforeSelector ) : null;
				var node = getOrCreateMount( mountId, parent, insertBeforeNode );

				ensureObserver();

				if ( ! node ) {
					return;
				}

				setMountNode( function( current ) {
					return current === node ? current : node;
				} );
			}

			function scheduleSync() {
				if ( rafId ) {
					window.cancelAnimationFrame( rafId );
				}

				rafId = window.requestAnimationFrame( syncMount );
			}

			scheduleSync();

			if ( ! window.MutationObserver ) {
				var timer = window.setInterval( syncMount, 1000 );

				return function() {
					window.clearInterval( timer );

					if ( rafId ) {
						window.cancelAnimationFrame( rafId );
					}
				};
			}

			return function() {
				if ( observer ) {
					observer.disconnect();
				}

				if ( rafId ) {
					window.cancelAnimationFrame( rafId );
				}
			};
		}, [ mountId, insertBeforeSelector ] );

		return mountNode;
	}

	function HtmlLauncher() {
		var mountNode = useDomMount( findEditorToolbar, 'art-editor-topbar-button', null );

		if ( ! createPortal || ! mountNode ) {
			return null;
		}

		return createPortal(
			createElement( HtmlLauncherButton, { onClick: openEditorScreen } ),
			mountNode,
			'art-editor-html-launcher'
		);
	}

	function BuilderModeUi() {
		var toolbarMount = useDomMount( findEditorToolbar, 'art-editor-switch-mode-mount', '#elementor-switch-mode, #elementor-edit-button-gutenberg, #art-editor-topbar-button' );
		var panelMount = useDomMount( findEditorContentArea, 'art-editor-gutenberg-panel-mount', null );

		useEffect( function() {
			document.body.classList.add( 'art-editor-gutenberg-active' );

			return function() {
				document.body.classList.remove( 'art-editor-gutenberg-active' );
			};
		}, [] );

		return createElement(
			wp.element.Fragment,
			null,
			toolbarMount && createPortal(
				createElement( BackToWordPressButton, { onClick: returnToWordPressEditor } ),
				toolbarMount,
				'art-editor-switch-mode-portal'
			),
			panelMount && createPortal(
				createElement( BuilderPanel, {
					onEdit: openEditorScreen,
					onLeave: returnToWordPressEditor,
				} ),
				panelMount,
				'art-editor-builder-panel-portal'
			)
		);
	}

	function App() {
		if ( config.isArtEditor ) {
			return createElement( BuilderModeUi, null );
		}

		return createElement( HtmlLauncher, null );
	}

	registerPlugin( 'art-editor-launcher', {
		render: App,
	} );
}( window.wp ) );
