<?php
/**
 * Frontend guards for per-post ART Editor settings.
 *
 * @package Art_Editor
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class Art_Editor_Frontend
 */
class Art_Editor_Frontend {

	/**
	 * Register hooks.
	 */
	public static function init() {
		add_filter( 'template_include', array( __CLASS__, 'maybe_use_canvas_template' ), 99 );
		add_filter( 'body_class', array( __CLASS__, 'add_canvas_body_class' ) );
		add_filter( 'elementor/frontend/print_google_fonts', array( __CLASS__, 'maybe_disable_elementor_google_fonts' ) );
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'maybe_enqueue_block_stylesheets' ), 15 );
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'maybe_enqueue_canvas_assets' ), 20 );
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'maybe_enqueue_partner_assets' ), 25 );
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'maybe_dequeue_foreign_styles' ), 1000 );
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'maybe_dequeue_foreign_styles' ), 9999 );
		add_action( 'loop_start', array( __CLASS__, 'reset_preview_block_index' ) );
		add_filter( 'render_block', array( __CLASS__, 'maybe_scope_html_block' ), 10, 2 );
	}

	/**
	 * Whether the current singular request should use the canvas template.
	 *
	 * @param int $post_id Post ID.
	 * @return bool
	 */
	public static function should_use_canvas_template( $post_id ) {
		$post_id = (int) $post_id;

		if ( $post_id <= 0 ) {
			return false;
		}

		if ( ! Art_Editor_Post_Meta::should_apply_frontend_settings( $post_id ) ) {
			return false;
		}

		return Art_Editor_Post_Meta::LAYOUT_CANVAS === Art_Editor_Post_Meta::get_layout_mode( $post_id );
	}

	/**
	 * Resolve the post ID for the current frontend request.
	 *
	 * @return int
	 */
	public static function get_current_post_id() {
		if ( is_singular() ) {
			return (int) get_queried_object_id();
		}

		if ( is_preview() ) {
			$preview_id = (int) get_query_var( 'page_id' );

			if ( $preview_id > 0 ) {
				return $preview_id;
			}

			$preview_id = (int) get_query_var( 'p' );

			if ( $preview_id > 0 ) {
				return $preview_id;
			}
		}

		return 0;
	}

	/**
	 * Use a standalone canvas template only for ART Editor posts with canvas mode.
	 *
	 * @param string $template Current template path.
	 * @return string
	 */
	public static function maybe_use_canvas_template( $template ) {
		$post_id = self::get_current_post_id();

		if ( $post_id <= 0 || ! self::should_use_canvas_template( $post_id ) ) {
			return $template;
		}

		$canvas_template = ART_EDITOR_PLUGIN_DIR . 'public/views/canvas.php';

		if ( ! file_exists( $canvas_template ) ) {
			return $template;
		}

		return $canvas_template;
	}

	/**
	 * Add a canvas-specific body class.
	 *
	 * @param string[] $classes Body classes.
	 * @return string[]
	 */
	public static function add_canvas_body_class( $classes ) {
		$post_id = self::get_current_post_id();

		if ( $post_id > 0 && self::should_use_canvas_template( $post_id ) ) {
			$classes[] = 'art-editor-template-canvas';
		}

		return $classes;
	}

	/**
	 * Enqueue external stylesheet links referenced inside HTML blocks.
	 *
	 * Matches editor preview iframes, which inject the same links into document head.
	 */
	public static function maybe_enqueue_block_stylesheets() {
		if ( is_admin() || wp_doing_ajax() || ( function_exists( 'wp_is_json_request' ) && wp_is_json_request() ) ) {
			return;
		}

		$post_id = self::get_current_post_id();

		if ( $post_id <= 0 || ! Art_Editor_Post_Meta::should_apply_frontend_settings( $post_id ) ) {
			return;
		}

		$post = get_post( $post_id );

		if ( ! $post instanceof WP_Post ) {
			return;
		}

		$html_blocks = Art_Editor_Content::get_html_blocks_from_post( $post );

		if ( empty( $html_blocks ) ) {
			return;
		}

		$block_html = array();

		foreach ( $html_blocks as $html_block ) {
			if ( ! is_array( $html_block ) ) {
				continue;
			}

			$block_html[] = isset( $html_block['content'] ) ? (string) $html_block['content'] : '';
		}

		$stylesheet_links = Art_Editor_Preview::collect_block_stylesheet_links( $block_html );

		if ( empty( $stylesheet_links ) ) {
			return;
		}

		$index = 0;

		foreach ( $stylesheet_links as $stylesheet_href ) {
			$stylesheet_href = esc_url( (string) $stylesheet_href );

			if ( '' === $stylesheet_href || ! wp_http_validate_url( $stylesheet_href ) ) {
				continue;
			}

			wp_enqueue_style(
				'art-editor-block-css-' . $index . '-' . substr( md5( $stylesheet_href ), 0, 8 ),
				$stylesheet_href,
				array(),
				null
			);

			++$index;
		}
	}

	/**
	 * Let partner plugins enqueue assets on ART Editor frontend pages.
	 */
	public static function maybe_enqueue_partner_assets() {
		if ( is_admin() || wp_doing_ajax() || ( function_exists( 'wp_is_json_request' ) && wp_is_json_request() ) ) {
			return;
		}

		$post_id = self::get_current_post_id();

		if ( $post_id <= 0 || ! Art_Editor_Post_Meta::should_apply_frontend_settings( $post_id ) ) {
			return;
		}

		/**
		 * Enqueue partner plugin assets for ART Editor HTML blocks.
		 *
		 * @param int $post_id Current post ID.
		 */
		do_action( 'art_editor_enqueue_partner_assets', $post_id );
	}

	/**
	 * Enqueue minimal canvas styles.
	 */
	public static function maybe_enqueue_canvas_assets() {
		$post_id = self::get_current_post_id();

		if ( $post_id <= 0 || ! self::should_use_canvas_template( $post_id ) ) {
			return;
		}

		wp_enqueue_style(
			'art-editor-canvas',
			ART_EDITOR_PLUGIN_URL . 'assets/css/canvas.css',
			array( 'admin-bar' ),
			ART_EDITOR_VERSION . '.' . (string) filemtime( ART_EDITOR_PLUGIN_DIR . 'assets/css/canvas.css' )
		);
	}

	/**
	 * Whether the current frontend request should use editor-owned styles only.
	 *
	 * @return bool
	 */
	public static function uses_editor_owned_frontend_styles() {
		if ( is_admin() || wp_doing_ajax() || ( function_exists( 'wp_is_json_request' ) && wp_is_json_request() ) ) {
			return false;
		}

		$post_id = self::get_current_post_id();

		if ( $post_id <= 0 || ! Art_Editor_Post_Meta::should_apply_frontend_settings( $post_id ) ) {
			return false;
		}

		return Art_Editor_Post_Meta::STYLE_EDITOR === Art_Editor_Post_Meta::get_style_mode( $post_id );
	}

	/**
	 * Disable Elementor kit Google Fonts on editor-owned ART Editor pages.
	 *
	 * @param bool $should_print Whether Elementor should print Google Fonts.
	 * @return bool
	 */
	public static function maybe_disable_elementor_google_fonts( $should_print ) {
		if ( self::uses_editor_owned_frontend_styles() ) {
			return false;
		}

		return $should_print;
	}

	/**
	 * Dequeue theme, page-builder, and global styles on editor-owned ART Editor pages.
	 */
	public static function maybe_dequeue_foreign_styles() {
		if ( ! self::uses_editor_owned_frontend_styles() ) {
			return;
		}

		global $wp_styles;

		if ( ! $wp_styles instanceof WP_Styles ) {
			return;
		}

		$theme_urls = self::get_theme_style_base_urls();

		foreach ( array_unique( (array) $wp_styles->queue ) as $handle ) {
			if ( empty( $wp_styles->registered[ $handle ] ) ) {
				continue;
			}

			if ( self::should_dequeue_foreign_style_handle( $handle, $wp_styles->registered[ $handle ], $theme_urls ) ) {
				wp_dequeue_style( $handle );
			}
		}
	}

	/**
	 * Theme directory URLs used to detect theme-owned stylesheets.
	 *
	 * @return string[]
	 */
	private static function get_theme_style_base_urls() {
		return array_values(
			array_unique(
				array_filter(
					array(
						untrailingslashit( get_template_directory_uri() ),
						untrailingslashit( get_stylesheet_directory_uri() ),
					)
				)
			)
		);
	}

	/**
	 * Whether a queued stylesheet should be removed on editor-owned pages.
	 *
	 * @param string $handle     Style handle.
	 * @param object $style      Registered style object.
	 * @param string[]  $theme_urls Theme base URLs.
	 * @return bool
	 */
	public static function should_dequeue_foreign_style_handle( $handle, $style, $theme_urls ) {
		if ( self::is_protected_style_handle( $handle ) ) {
			return false;
		}

		$handle = (string) $handle;
		$src    = ( is_object( $style ) && isset( $style->src ) ) ? (string) $style->src : '';

		foreach ( (array) $theme_urls as $theme_url ) {
			if ( '' !== $src && 0 === strpos( $src, $theme_url ) ) {
				return true;
			}
		}

		if ( 0 === strpos( $handle, 'elementor' ) || 0 === strpos( $handle, 'elementor-pro' ) ) {
			return true;
		}

		if ( 0 === strpos( $handle, 'e-gallery' ) || 0 === strpos( $handle, 'e-swiper' ) || 0 === strpos( $handle, 'e-animations' ) ) {
			return true;
		}

		if ( 0 === strpos( $handle, 'widget-' ) && ( '' === $src || false !== strpos( $src, 'elementor' ) ) ) {
			return true;
		}

		if ( '' !== $src && false !== strpos( $src, '/plugins/elementor/' ) ) {
			return true;
		}

		if ( '' !== $src && false !== strpos( $src, '/plugins/elementor-pro/' ) ) {
			return true;
		}

		$wordpress_foreign_handles = array(
			'global-styles',
			'classic-theme-styles',
			'wp-block-library',
			'wp-block-library-theme',
			'core-block-supports-duotone',
		);

		return in_array( $handle, $wordpress_foreign_handles, true );
	}

	/**
	 * Style handles that must stay enqueued on editor-owned pages.
	 *
	 * @param string $handle Style handle.
	 * @return bool
	 */
	private static function is_protected_style_handle( $handle ) {
		$handle = (string) $handle;

		if ( 0 === strpos( $handle, 'art-editor' ) ) {
			return true;
		}

		return in_array( $handle, array( 'admin-bar', 'admin-bar-inline', 'dashicons' ), true );
	}

	/**
	 * Reset the scoped HTML block counter for the current loop.
	 *
	 * @param WP_Query $query Current query.
	 */
	public static function reset_preview_block_index( $query ) {
		if ( ! $query instanceof WP_Query || ! $query->is_main_query() ) {
			return;
		}

		Art_Editor_Preview::reset_frontend_block_index();
	}

	/**
	 * Scope core/html block output on ART Editor posts.
	 *
	 * @param string $block_content Rendered block HTML.
	 * @param array  $block         Parsed block.
	 * @return string
	 */
	public static function maybe_scope_html_block( $block_content, $block ) {
		return Art_Editor_Preview::maybe_scope_rendered_block( $block_content, $block );
	}
}
