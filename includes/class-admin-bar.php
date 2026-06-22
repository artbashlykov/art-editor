<?php
/**
 * Frontend admin bar integration.
 *
 * @package Art_Editor
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class Art_Editor_Admin_Bar
 */
class Art_Editor_Admin_Bar {

	/**
	 * Register hooks.
	 */
	public static function init() {
		add_action( 'admin_bar_menu', array( __CLASS__, 'register_menu_item' ), 81 );
	}

	/**
	 * Add "Редактор HTML" to the WordPress admin bar on ART Editor posts.
	 *
	 * @param WP_Admin_Bar $wp_admin_bar Admin bar instance.
	 */
	public static function register_menu_item( $wp_admin_bar ) {
		if ( is_admin() || ! is_admin_bar_showing() || ! $wp_admin_bar instanceof WP_Admin_Bar ) {
			return;
		}

		$post_id = Art_Editor_Frontend::get_current_post_id();

		if ( $post_id <= 0 ) {
			return;
		}

		if ( ! Art_Editor_Post_Meta::is_built_with_art_editor( $post_id ) ) {
			return;
		}

		if ( ! Art_Editor_Block_Editor::is_supported_post( $post_id ) ) {
			return;
		}

		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			return;
		}

		$wp_admin_bar->add_node(
			array(
				'id'    => 'art-editor-html',
				'title' => esc_html__( 'Редактор HTML', 'art-editor' ),
				'href'  => Art_Editor_Block_Editor::get_edit_url( $post_id ),
				'meta'  => array(
					'class' => 'art-editor-admin-bar-edit',
				),
			)
		);
	}
}
