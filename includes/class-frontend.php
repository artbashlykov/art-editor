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
		add_filter( 'show_admin_bar', array( __CLASS__, 'maybe_hide_admin_bar' ) );
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'maybe_enqueue_canvas_assets' ), 20 );
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'maybe_dequeue_theme_styles' ), 1000 );
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
	 * Hide the admin bar on canvas pages for a cleaner preview.
	 *
	 * @param bool $show Whether to show the admin bar.
	 * @return bool
	 */
	public static function maybe_hide_admin_bar( $show ) {
		$post_id = self::get_current_post_id();

		if ( $post_id > 0 && self::should_use_canvas_template( $post_id ) ) {
			return false;
		}

		return $show;
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
			array(),
			ART_EDITOR_VERSION
		);
	}

	/**
	 * Dequeue active theme styles only for ART Editor posts in editor-owned style mode.
	 */
	public static function maybe_dequeue_theme_styles() {
		if ( is_admin() || wp_doing_ajax() || ( function_exists( 'wp_is_json_request' ) && wp_is_json_request() ) ) {
			return;
		}

		$post_id = self::get_current_post_id();

		if ( $post_id <= 0 || ! Art_Editor_Post_Meta::should_apply_frontend_settings( $post_id ) ) {
			return;
		}

		if ( Art_Editor_Post_Meta::STYLE_EDITOR !== Art_Editor_Post_Meta::get_style_mode( $post_id ) ) {
			return;
		}

		global $wp_styles;

		if ( ! $wp_styles instanceof WP_Styles ) {
			return;
		}

		$theme_urls = array_unique(
			array_filter(
				array(
					untrailingslashit( get_template_directory_uri() ),
					untrailingslashit( get_stylesheet_directory_uri() ),
				)
			)
		);

		foreach ( (array) $wp_styles->queue as $handle ) {
			if ( empty( $wp_styles->registered[ $handle ] ) || empty( $wp_styles->registered[ $handle ]->src ) ) {
				continue;
			}

			$src = $wp_styles->registered[ $handle ]->src;

			foreach ( $theme_urls as $theme_url ) {
				if ( 0 === strpos( $src, $theme_url ) ) {
					wp_dequeue_style( $handle );
					break;
				}
			}
		}
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
