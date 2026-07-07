<?php
/**
 * Standalone ART Editor screen (admin page).
 *
 * @package Art_Editor
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class Art_Editor_Editor_Screen
 */
class Art_Editor_Editor_Screen {

	/**
	 * Register hooks.
	 */
	public static function init() {
		add_action( 'admin_action_art_editor', array( __CLASS__, 'render' ) );
	}

	/**
	 * Render the standalone editor page and exit.
	 */
	public static function render() {
		if ( empty( $_GET['post'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
			wp_die( esc_html__( 'Запись не указана.', 'art-editor' ) );
		}

		$post_id = absint( wp_unslash( $_GET['post'] ) ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended

		if ( ! $post_id || ! current_user_can( 'edit_post', $post_id ) ) {
			wp_die( esc_html__( 'У вас нет прав редактировать эту запись.', 'art-editor' ) );
		}

		$post = get_post( $post_id );

		if ( ! $post || ! Art_Editor_Block_Editor::is_supported_post( $post_id ) ) {
			wp_die( esc_html__( 'Этот тип записи не поддерживается.', 'art-editor' ) );
		}

		Art_Editor_Post_Meta::mark_as_art_editor( $post_id );

		$import_result = Art_Editor_Content::import_gutenberg_blocks_into_art_editor( $post_id );

		if ( is_wp_error( $import_result ) ) {
			wp_die( esc_html( $import_result->get_error_message() ) );
		}

		$post = get_post( $post_id );

		if ( ! $post instanceof WP_Post ) {
			wp_die( esc_html__( 'Запись не найдена.', 'art-editor' ) );
		}

		self::load_editor_page( $post );
		exit;
	}

	/**
	 * Output the editor shell.
	 *
	 * @param WP_Post $post Current post.
	 */
	private static function load_editor_page( $post ) {
		global $art_editor_current_post;

		$art_editor_current_post = $post;

		add_filter( 'show_admin_bar', '__return_false' );

		$code_editor_settings = wp_enqueue_code_editor(
			array(
				'type'       => 'text/html',
				'codemirror' => array(
					'theme' => 'art-editor-dark',
					'lint'  => false,
				),
			)
		);

		$script_deps = array( 'jquery' );

		if ( $code_editor_settings ) {
			$script_deps[] = 'code-editor';
		}

		wp_enqueue_media(
			array(
				'post' => $post,
			)
		);

		$script_deps[] = 'media-editor';
		$script_deps[] = 'media-views';

		wp_enqueue_style(
			'art-editor-brand',
			ART_EDITOR_PLUGIN_URL . 'assets/css/brand.css',
			array(),
			ART_EDITOR_VERSION
		);

		$screen_style_deps = array( 'art-editor-brand' );

		if ( $code_editor_settings ) {
			$screen_style_deps[] = 'code-editor';
		}

		wp_enqueue_style(
			'art-editor-screen',
			ART_EDITOR_PLUGIN_URL . 'assets/css/editor-screen.css',
			$screen_style_deps,
			ART_EDITOR_VERSION
		);

		if ( $code_editor_settings ) {
			wp_enqueue_style(
				'art-editor-codemirror-theme',
				ART_EDITOR_PLUGIN_URL . 'assets/css/codemirror-theme.css',
				array( 'code-editor', 'art-editor-screen' ),
				ART_EDITOR_VERSION
			);
		}

		wp_enqueue_script(
			'art-editor-screen',
			ART_EDITOR_PLUGIN_URL . 'assets/js/editor-screen.js',
			$script_deps,
			ART_EDITOR_VERSION,
			true
		);

		$screen_config = self::get_screen_config( $post );

		if ( $code_editor_settings ) {
			$screen_config['codeEditorSettings'] = $code_editor_settings;
		}

		wp_localize_script(
			'art-editor-screen',
			'artEditorScreenConfig',
			$screen_config
		);

		require ART_EDITOR_PLUGIN_DIR . 'admin/views/editor-screen.php';
	}

	/**
	 * Data passed to the editor screen script.
	 *
	 * @param WP_Post $post Current post.
	 * @return array
	 */
	public static function get_screen_config( $post ) {
		$status_labels = array();

		foreach ( get_post_stati( array( 'internal' => false ), 'objects' ) as $status_object ) {
			$status_labels[ $status_object->name ] = $status_object->label;
		}

		$permalink_data = self::get_permalink_settings_data( $post );

		return array(
			'postId'           => (int) $post->ID,
			'postType'         => $post->post_type,
			'postTitle'        => $post->post_title,
			'postStatus'       => 'auto-draft' === $post->post_status ? 'draft' : $post->post_status,
			'canPublish'       => current_user_can( 'publish_post', $post->ID ),
			'postSlug'         => $permalink_data['slug'],
			'permalink'        => esc_url_raw( $permalink_data['permalink'] ),
			'permalinkPrefix'  => $permalink_data['permalinkPrefix'],
			'restUrl'          => esc_url_raw( rest_url( rest_get_route_for_post( $post ) ) ),
			'saveBlocksUrl'    => esc_url_raw( rest_url( 'art-editor/v1/posts/' . (int) $post->ID . '/html-blocks' ) ),
			'saveSettingsUrl'  => esc_url_raw( rest_url( 'art-editor/v1/posts/' . (int) $post->ID . '/page-settings' ) ),
			'previewDocumentUrl' => esc_url_raw( rest_url( 'art-editor/v1/posts/' . (int) $post->ID . '/preview-document' ) ),
			'previewEditBlockUrl' => esc_url_raw( rest_url( 'art-editor/v1/posts/' . (int) $post->ID . '/preview-edit-block' ) ),
			'previewUrl'       => esc_url_raw( self::get_preview_url( $post ) ),
			'htmlBlocks'       => Art_Editor_Content::get_html_blocks_from_post( $post ),
			'layoutMode'       => Art_Editor_Post_Meta::get_layout_mode( $post->ID ),
			'styleMode'        => Art_Editor_Post_Meta::get_style_mode( $post->ID ),
			'siteIconHead'     => self::get_site_icon_head_markup(),
			'nonce'            => wp_create_nonce( 'wp_rest' ),
			'statusLabels'     => $status_labels,
			'i18n'             => array(
				'save'              => __( 'Сохранить', 'art-editor' ),
				'saving'            => __( 'Сохранение…', 'art-editor' ),
				'saved'             => __( 'Сохранено', 'art-editor' ),
				'saveError'         => __( 'Не удалось сохранить.', 'art-editor' ),
				'publish'           => __( 'Опубликовать', 'art-editor' ),
				'publishing'        => __( 'Публикация…', 'art-editor' ),
				'published'         => __( 'Опубликовано', 'art-editor' ),
				'publishError'      => __( 'Не удалось опубликовать.', 'art-editor' ),
				'unsavedChangesConfirm' => __( 'Есть несохранённые изменения. Уйти без сохранения?', 'art-editor' ),
				'preview'           => __( 'Предпросмотр', 'art-editor' ),
				'previewError'      => __( 'Не удалось открыть предпросмотр.', 'art-editor' ),
				'pagePreviewError'  => __( 'Не удалось обновить просмотр страницы.', 'art-editor' ),
				'createHtml'        => __( 'Создать HTML', 'art-editor' ),
				'createAnchor'      => __( 'Добавить якорь', 'art-editor' ),
				'anchorBlock'       => __( 'Якорь', 'art-editor' ),
				'emptyAnchor'       => __( 'Пустой якорь', 'art-editor' ),
				'anchorLabel'       => __( 'Добавьте якорную ссылку', 'art-editor' ),
				'anchorHint'        => __( 'Используйте короткое латинское имя: буквы, цифры и дефис. В ссылках на лендинге указывайте #имя, например #pricing.', 'art-editor' ),
				'anchorPlaceholder' => __( 'pricing', 'art-editor' ),
				'structure'         => __( 'Структура', 'art-editor' ),
				'emptyBlocks'       => __( 'HTML-блоки не найдены. Создайте первый блок.', 'art-editor' ),
				'emptyBlock'        => __( 'Пустой HTML-блок', 'art-editor' ),
				'htmlBlock'         => __( 'HTML-блок', 'art-editor' ),
				'deleteBlock'       => __( 'Удалить блок', 'art-editor' ),
				'undo'              => __( 'Отменить', 'art-editor' ),
				'redo'              => __( 'Повторить', 'art-editor' ),
				'pageSettings'      => __( 'Настройки страницы', 'art-editor' ),
				'openPageSettings'  => __( 'Открыть настройки страницы', 'art-editor' ),
				'generalSettings'   => __( 'Основные настройки', 'art-editor' ),
				'pageTitle'         => __( 'Заголовок', 'art-editor' ),
				'pageSlug'          => __( 'Адрес', 'art-editor' ),
				'pageSlugPlaceholder' => __( 'ярлык-страницы', 'art-editor' ),
				'pageSlugPublishedHint' => __( 'После сохранения старый адрес перестанет работать.', 'art-editor' ),
				'pageStatus'        => __( 'Статус', 'art-editor' ),
				'untitled'          => __( 'Без названия', 'art-editor' ),
				'layoutMode'        => __( 'Шаблон', 'art-editor' ),
				'layoutTheme'       => __( 'Наследовать тему', 'art-editor' ),
				'layoutCanvas'      => __( 'Без шапки и подвала', 'art-editor' ),
				'layoutCanvasHint'  => __( 'Применяется только HTML-код страницы.', 'art-editor' ),
				'styleMode'         => __( 'Стили', 'art-editor' ),
				'styleTheme'        => __( 'Стили темы', 'art-editor' ),
				'styleEditor'       => __( 'Стили редактора', 'art-editor' ),
				'settingsSaveError' => __( 'Не удалось сохранить настройки.', 'art-editor' ),
				'previewDevices'    => __( 'Режим предпросмотра', 'art-editor' ),
				'deviceDesktop'     => __( 'Компьютер', 'art-editor' ),
				'deviceMobile'      => __( 'Телефон', 'art-editor' ),
				'deviceDesktopAria' => __( 'Просмотр для компьютера', 'art-editor' ),
				'deviceMobileAria'  => __( 'Просмотр для телефона', 'art-editor' ),
				'resizeMobilePreview' => __( 'Изменить ширину мобильного предпросмотра', 'art-editor' ),
				'previewEditError'    => __( 'Не удалось обновить превью блока. Показана последняя рабочая версия.', 'art-editor' ),
				'previewViewError'    => __( 'Не удалось обновить просмотр страницы. Показана последняя рабочая версия.', 'art-editor' ),
				'previewEditUnavailable' => __( 'Серверное превью блока недоступно. Обновите страницу или проверьте REST API.', 'art-editor' ),
				'previewViewUnavailable' => __( 'Серверный просмотр страницы недоступен. Обновите страницу или проверьте REST API.', 'art-editor' ),
				'previewRetry'      => __( 'Повторить', 'art-editor' ),
				'previewLoading'    => __( 'Загрузка…', 'art-editor' ),
				'elementEditor'       => __( 'Редактор элемента', 'art-editor' ),
				'clearElementSelection' => __( 'Сбросить выбор элемента', 'art-editor' ),
				'elementEditorTag'    => __( 'Тег', 'art-editor' ),
				'elementEditorSelectParent' => __( 'Родитель', 'art-editor' ),
				'elementEditorSelectParentTitle' => __( 'Выбрать родительский элемент', 'art-editor' ),
				'elementEditorFontSize' => __( 'Размер шрифта', 'art-editor' ),
				'elementEditorTextColor' => __( 'Цвет текста', 'art-editor' ),
				'elementEditorBackgroundColor' => __( 'Цвет фона', 'art-editor' ),
				'elementEditorReset'  => __( 'Сбросить', 'art-editor' ),
				'elementEditorLink'   => __( 'Ссылка', 'art-editor' ),
				'elementEditorLinkPlaceholder' => __( 'Введите или вставьте свой URL-адрес', 'art-editor' ),
				'elementEditorLinkBlank' => __( 'Открывать в новом окне', 'art-editor' ),
				'elementEditorLinkSettings' => __( 'Дополнительные настройки ссылки', 'art-editor' ),
				'elementEditorImage'    => __( 'Выбрать изображение', 'art-editor' ),
				'elementEditorImageTitle' => __( 'Выберите изображение', 'art-editor' ),
				'elementEditorImageButton' => __( 'Использовать изображение', 'art-editor' ),
				'elementEditorImageUnavailable' => __( 'Медиабиблиотека WordPress недоступна.', 'art-editor' ),
			),
		);
	}

	/**
	 * Get localized post status label.
	 *
	 * @param WP_Post $post Post object.
	 * @return string
	 */
	public static function get_post_status_label( $post ) {
		$status_object = get_post_status_object( $post->post_status );

		if ( $status_object && ! empty( $status_object->label ) ) {
			return $status_object->label;
		}

		return $post->post_status;
	}

	/**
	 * Post statuses available in the page settings dropdown.
	 *
	 * @param WP_Post $post Post object.
	 * @return array<string, string> Status slug => label.
	 */
	public static function get_available_post_statuses( $post ) {
		$statuses   = array();
		$candidates = array( 'draft', 'pending', 'publish', 'private', 'future' );
		$current    = 'auto-draft' === $post->post_status ? 'draft' : $post->post_status;

		foreach ( $candidates as $status ) {
			$status_object = get_post_status_object( $status );

			if ( ! $status_object || empty( $status_object->label ) ) {
				continue;
			}

			if ( in_array( $status, array( 'publish', 'private', 'future' ), true ) ) {
				if ( ! current_user_can( 'publish_post', $post->ID ) && $current !== $status ) {
					continue;
				}
			}

			$statuses[ $status ] = $status_object->label;
		}

		if ( $current && ! isset( $statuses[ $current ] ) ) {
			$current_object = get_post_status_object( $current );

			if ( $current_object && ! empty( $current_object->label ) ) {
				$statuses[ $current ] = $current_object->label;
			}
		}

		return $statuses;
	}

	/**
	 * Get site icon <link> tags for custom document heads.
	 *
	 * @return string
	 */
	public static function get_site_icon_head_markup() {
		if ( ! function_exists( 'wp_site_icon' ) ) {
			return '';
		}

		ob_start();
		wp_site_icon();
		$markup = ob_get_clean();

		return is_string( $markup ) ? $markup : '';
	}

	/**
	 * Get site icon markup like the block editor header.
	 *
	 * @return string
	 */
	public static function get_site_icon_markup() {
		$site_icon_url = get_site_icon_url( 36 );

		if ( $site_icon_url ) {
			return sprintf(
				'<img class="art-editor-screen__site-icon" src="%1$s" alt="%2$s" width="36" height="36" decoding="async" />',
				esc_url( $site_icon_url ),
				esc_attr__( 'Значок сайта', 'art-editor' )
			);
		}

		return sprintf(
			'<img class="art-editor-screen__site-icon art-editor-screen__site-icon--default" src="%1$s" alt="%2$s" width="36" height="36" decoding="async" />',
			esc_url( admin_url( 'images/wordpress-logo.svg' ) ),
			esc_attr__( 'Логотип WordPress', 'art-editor' )
		);
	}

	/**
	 * Get document title for the header.
	 *
	 * @param WP_Post $post Post object.
	 * @return string
	 */
	public static function get_document_title( $post ) {
		if ( $post->post_title ) {
			return $post->post_title;
		}

		return __( 'Без названия', 'art-editor' );
	}

	/**
	 * URL back to the block editor for the current post.
	 *
	 * @param WP_Post $post Post object.
	 * @return string
	 */
	public static function get_exit_url( $post ) {
		$exit_url = get_edit_post_link( $post->ID, 'raw' );

		if ( ! $exit_url ) {
			$exit_url = admin_url( 'post.php?post=' . (int) $post->ID . '&action=edit' );
		}

		return $exit_url;
	}

	/**
	 * Get permalink display data for the page settings panel.
	 *
	 * @param WP_Post $post Post object.
	 * @return array{slug:string,permalink:string,permalinkPrefix:string}
	 */
	public static function get_permalink_settings_data( $post ) {
		if ( ! $post instanceof WP_Post ) {
			return array(
				'slug'            => '',
				'permalink'       => '',
				'permalinkPrefix' => '',
			);
		}

		if ( ! function_exists( 'get_sample_permalink' ) ) {
			require_once ABSPATH . 'wp-admin/includes/post.php';
		}

		$slug         = (string) $post->post_name;
		$display_slug = rawurldecode( $slug );

		list( $sample_permalink, $editable_slug ) = get_sample_permalink( $post->ID, $post->post_title, $slug );

		$sample_permalink = (string) $sample_permalink;
		$editable_slug    = rawurldecode( (string) $editable_slug );
		$prefix           = self::get_permalink_prefix_from_sample( $sample_permalink, $slug, $editable_slug );

		$permalink = get_permalink( $post );

		return array(
			'slug'            => $display_slug,
			'permalink'       => $permalink ? (string) $permalink : $sample_permalink,
			'permalinkPrefix' => $prefix,
		);
	}

	/**
	 * Extract the non-editable permalink prefix from a sample permalink.
	 *
	 * @param string $sample_permalink Full sample permalink.
	 * @param string $stored_slug      Stored post_name.
	 * @param string $editable_slug    Editable slug from get_sample_permalink().
	 * @return string
	 */
	private static function get_permalink_prefix_from_sample( $sample_permalink, $stored_slug, $editable_slug ) {
		$prefix   = $sample_permalink;
		$suffixes = array();

		if ( '' !== $editable_slug ) {
			$suffixes[] = $editable_slug;
			$suffixes[] = rawurlencode( $editable_slug );
		}

		if ( '' !== $stored_slug ) {
			$suffixes[] = $stored_slug;
			$suffixes[] = rawurldecode( $stored_slug );
		}

		$suffixes = array_values( array_unique( array_filter( $suffixes ) ) );

		foreach ( $suffixes as $suffix ) {
			$candidate = preg_replace( '/' . preg_quote( $suffix, '/' ) . '\/?$/', '', $prefix );

			if ( is_string( $candidate ) && $candidate !== $prefix ) {
				$prefix = $candidate;
				break;
			}
		}

		$prefix = str_replace( array( '%pagename%', '%postname%' ), '', $prefix );

		return $prefix;
	}

	/**
	 * Get the front-end preview URL for a post.
	 *
	 * @param WP_Post $post Post object.
	 * @return string
	 */
	public static function get_preview_url( $post ) {
		$preview_url = get_preview_post_link( $post );

		if ( $preview_url ) {
			return $preview_url;
		}

		$permalink = get_permalink( $post );

		if ( ! $permalink ) {
			return '';
		}

		return add_query_arg( 'preview', 'true', $permalink );
	}
}
