<?php
/**
 * Gutenberg block editor integration.
 *
 * @package Art_Editor
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class Art_Editor_Block_Editor
 */
class Art_Editor_Block_Editor {

	/**
	 * Register hooks.
	 */
	public static function init() {
		add_action( 'enqueue_block_editor_assets', array( __CLASS__, 'enqueue_assets' ) );
	}

	/**
	 * Enqueue toolbar button assets in the block editor.
	 */
	public static function enqueue_assets() {
		$post_id = get_the_ID();

		if ( ! $post_id || ! self::is_supported_post( $post_id ) ) {
			return;
		}

		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			return;
		}

		wp_enqueue_style(
			'art-editor-brand',
			ART_EDITOR_PLUGIN_URL . 'assets/css/brand.css',
			array(),
			ART_EDITOR_VERSION
		);

		wp_enqueue_style(
			'art-editor-block-editor',
			ART_EDITOR_PLUGIN_URL . 'assets/css/block-editor.css',
			array( 'art-editor-brand' ),
			ART_EDITOR_VERSION
		);

		wp_enqueue_script(
			'art-editor-block-editor',
			ART_EDITOR_PLUGIN_URL . 'assets/js/block-editor.js',
			array(
				'wp-plugins',
				'wp-element',
				'wp-data',
				'wp-i18n',
				'wp-edit-post',
			),
			ART_EDITOR_VERSION,
			true
		);

		wp_localize_script(
			'art-editor-block-editor',
			'artEditorConfig',
			array(
				'postId'        => $post_id,
				'editUrl'       => self::get_edit_url( $post_id ),
				'isArtEditor'   => Art_Editor_Post_Meta::is_built_with_art_editor( $post_id ),
				'leaveModeUrl'  => esc_url_raw( rest_url( 'art-editor/v1/posts/' . (int) $post_id . '/leave-builder' ) ),
				'nonce'         => wp_create_nonce( 'wp_rest' ),
			)
		);
	}

	/**
	 * Build the standalone editor screen URL.
	 *
	 * @param int $post_id Post ID.
	 * @return string
	 */
	public static function get_edit_url( $post_id ) {
		return add_query_arg(
			array(
				'post'   => (int) $post_id,
				'action' => 'art_editor',
			),
			admin_url( 'post.php' )
		);
	}

	/**
	 * Whether the post type uses the block editor.
	 *
	 * @param int $post_id Post ID.
	 * @return bool
	 */
	public static function is_supported_post( $post_id ) {
		$post_type = get_post_type( $post_id );

		if ( ! $post_type ) {
			return false;
		}

		return use_block_editor_for_post_type( $post_type ) && Art_Editor_Settings::is_post_type_enabled( $post_type );
	}
}
