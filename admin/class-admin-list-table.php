<?php
/**
 * Post list table integration.
 *
 * @package Art_Editor
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class Art_Editor_Admin_List_Table
 */
class Art_Editor_Admin_List_Table {

	/**
	 * Register hooks.
	 */
	public static function init() {
		add_filter( 'display_post_states', array( __CLASS__, 'add_post_state' ), 10, 2 );
		add_filter( 'post_row_actions', array( __CLASS__, 'filter_row_actions' ), 11, 2 );
		add_filter( 'page_row_actions', array( __CLASS__, 'filter_row_actions' ), 11, 2 );
	}

	/**
	 * Add ART Editor state to supported posts edited in the plugin.
	 *
	 * @param array   $post_states Post display states.
	 * @param WP_Post $post        Current post object.
	 * @return array
	 */
	public static function add_post_state( $post_states, $post ) {
		if ( ! self::can_show_for_post( $post ) ) {
			return $post_states;
		}

		$post_states['art_editor'] = esc_html__( 'ART Editor', 'art-editor' );

		return $post_states;
	}

	/**
	 * Add "Edit with ART Editor" row action.
	 *
	 * @param array   $actions Row actions.
	 * @param WP_Post $post    Current post object.
	 * @return array
	 */
	public static function filter_row_actions( $actions, $post ) {
		if ( ! self::can_show_for_post( $post ) ) {
			return $actions;
		}

		$actions['edit_with_art_editor'] = sprintf(
			'<a href="%1$s">%2$s</a>',
			esc_url( Art_Editor_Block_Editor::get_edit_url( $post->ID ) ),
			esc_html__( 'Редактировать в ART Editor', 'art-editor' )
		);

		return $actions;
	}

	/**
	 * Whether list-table integrations should appear for the post.
	 *
	 * @param WP_Post $post Post object.
	 * @return bool
	 */
	private static function can_show_for_post( $post ) {
		if ( ! $post instanceof WP_Post ) {
			return false;
		}

		if ( ! Art_Editor_Block_Editor::is_supported_post( $post->ID ) ) {
			return false;
		}

		if ( ! current_user_can( 'edit_post', $post->ID ) ) {
			return false;
		}

		return Art_Editor_Post_Meta::is_built_with_art_editor( $post->ID );
	}
}
