<?php
/**
 * REST API endpoints for ART Editor.
 *
 * @package Art_Editor
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class Art_Editor_Rest
 */
class Art_Editor_Rest {

	/**
	 * Register hooks.
	 */
	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
	}

	/**
	 * Register REST routes.
	 */
	public static function register_routes() {
		register_rest_route(
			'art-editor/v1',
			'/posts/(?P<id>\d+)/html-blocks',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'save_html_blocks' ),
				'permission_callback' => array( __CLASS__, 'can_edit_post' ),
				'args'                => array(
					'id' => array(
						'type'              => 'integer',
						'required'          => true,
						'sanitize_callback' => 'absint',
					),
				),
			)
		);

		register_rest_route(
			'art-editor/v1',
			'/posts/(?P<id>\d+)/page-settings',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'save_page_settings' ),
				'permission_callback' => array( __CLASS__, 'can_edit_post' ),
				'args'                => array(
					'id' => array(
						'type'              => 'integer',
						'required'          => true,
						'sanitize_callback' => 'absint',
					),
				),
			)
		);

		register_rest_route(
			'art-editor/v1',
			'/posts/(?P<id>\d+)/preview-document',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'preview_document' ),
				'permission_callback' => array( __CLASS__, 'can_edit_post' ),
				'args'                => array(
					'id' => array(
						'type'              => 'integer',
						'required'          => true,
						'sanitize_callback' => 'absint',
					),
				),
			)
		);

		register_rest_route(
			'art-editor/v1',
			'/posts/(?P<id>\d+)/preview-edit-block',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'preview_edit_block' ),
				'permission_callback' => array( __CLASS__, 'can_edit_post' ),
				'args'                => array(
					'id' => array(
						'type'              => 'integer',
						'required'          => true,
						'sanitize_callback' => 'absint',
					),
				),
			)
		);

		register_rest_route(
			'art-editor/v1',
			'/posts/(?P<id>\d+)/leave-builder',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'leave_builder_mode' ),
				'permission_callback' => array( __CLASS__, 'can_edit_post' ),
				'args'                => array(
					'id' => array(
						'type'              => 'integer',
						'required'          => true,
						'sanitize_callback' => 'absint',
					),
				),
			)
		);
	}

	/**
	 * Check whether the current user can edit the post.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return bool
	 */
	public static function can_edit_post( $request ) {
		$post_id = (int) $request->get_param( 'id' );

		return $post_id > 0 && current_user_can( 'edit_post', $post_id );
	}

	/**
	 * Save HTML blocks for a post.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function save_html_blocks( $request ) {
		$post_id = (int) $request->get_param( 'id' );
		$payload = $request->get_json_params();
		$blocks  = isset( $payload['blocks'] ) ? $payload['blocks'] : array();
		$status  = isset( $payload['status'] ) ? sanitize_key( $payload['status'] ) : '';

		if ( '' === $status ) {
			$post = get_post( $post_id );
			$status = $post instanceof WP_Post ? $post->post_status : 'draft';
		}

		$status = Art_Editor_Post_Meta::sanitize_post_status( $status, $post_id );

		if ( is_wp_error( $status ) ) {
			return $status;
		}

		$result = Art_Editor_Content::save_html_blocks( $post_id, $blocks, $status );

		if ( is_wp_error( $result ) ) {
			return $result;
		}

		$post = get_post( $post_id );

		return rest_ensure_response(
			array(
				'postId'     => $post_id,
				'status'     => $post ? $post->post_status : $status,
				'htmlBlocks' => Art_Editor_Content::get_html_blocks_from_post( $post ),
			)
		);
	}

	/**
	 * Save per-page ART Editor settings.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function save_page_settings( $request ) {
		$post_id     = (int) $request->get_param( 'id' );
		$payload     = $request->get_json_params();
		$layout_mode = isset( $payload['layoutMode'] ) ? $payload['layoutMode'] : Art_Editor_Post_Meta::LAYOUT_THEME;
		$style_mode  = isset( $payload['styleMode'] ) ? $payload['styleMode'] : Art_Editor_Post_Meta::STYLE_THEME;
		$title       = array_key_exists( 'title', $payload ) ? (string) $payload['title'] : null;
		$status      = isset( $payload['status'] ) ? sanitize_key( $payload['status'] ) : null;
		$slug        = array_key_exists( 'slug', $payload ) ? (string) $payload['slug'] : null;

		$result = Art_Editor_Post_Meta::save_page_settings( $post_id, $layout_mode, $style_mode, $title, $status, $slug );

		if ( is_wp_error( $result ) ) {
			return $result;
		}

		Art_Editor_Post_Meta::mark_as_art_editor( $post_id );

		$post = get_post( $post_id );

		if ( ! $post instanceof WP_Post ) {
			return new WP_Error( 'art_editor_post_not_found', __( 'Запись не найдена.', 'art-editor' ), array( 'status' => 404 ) );
		}

		$permalink_data = Art_Editor_Editor_Screen::get_permalink_settings_data( $post );

		return rest_ensure_response(
			array(
				'postId'          => $post_id,
				'title'           => $post->post_title,
				'status'          => $post->post_status,
				'slug'            => $permalink_data['slug'],
				'permalink'       => $permalink_data['permalink'],
				'permalinkPrefix' => $permalink_data['permalinkPrefix'],
				'previewUrl'      => Art_Editor_Editor_Screen::get_preview_url( $post ),
				'layoutMode'      => Art_Editor_Post_Meta::get_layout_mode( $post_id ),
				'styleMode'       => Art_Editor_Post_Meta::get_style_mode( $post_id ),
			)
		);
	}

	/**
	 * Build a preview iframe document for the editor "View" tab.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function preview_document( $request ) {
		$post_id = (int) $request->get_param( 'id' );
		$post    = get_post( $post_id );

		if ( ! $post instanceof WP_Post ) {
			return new WP_Error( 'art_editor_post_not_found', __( 'Запись не найдена.', 'art-editor' ), array( 'status' => 404 ) );
		}

		$payload     = $request->get_json_params();
		$layout_mode = isset( $payload['layoutMode'] ) ? $payload['layoutMode'] : Art_Editor_Post_Meta::get_layout_mode( $post_id );
		$style_mode  = isset( $payload['styleMode'] ) ? $payload['styleMode'] : Art_Editor_Post_Meta::get_style_mode( $post_id );
		$blocks      = array();

		if ( isset( $payload['blocks'] ) && is_array( $payload['blocks'] ) ) {
			foreach ( $payload['blocks'] as $block ) {
				if ( ! is_array( $block ) ) {
					continue;
				}

				$blocks[] = isset( $block['content'] ) ? (string) $block['content'] : '';
			}
		} else {
			$html_blocks = Art_Editor_Content::get_html_blocks_from_post( $post );

			foreach ( $html_blocks as $html_block ) {
				$blocks[] = isset( $html_block['content'] ) ? (string) $html_block['content'] : '';
			}
		}

		$document = Art_Editor_Preview::build_document(
			$blocks,
			array(
				'layout_mode'           => $layout_mode,
				'style_mode'            => $style_mode,
				'block_link_navigation' => true,
			)
		);

		return rest_ensure_response(
			array(
				'postId'     => $post_id,
				'layoutMode' => Art_Editor_Post_Meta::sanitize_layout_mode( $layout_mode ),
				'styleMode'  => Art_Editor_Post_Meta::sanitize_style_mode( $style_mode ),
				'document'   => $document,
			)
		);
	}

	/**
	 * Build a scoped preview iframe document for the editor "Edit" tab.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function preview_edit_block( $request ) {
		$post_id = (int) $request->get_param( 'id' );
		$post    = get_post( $post_id );

		if ( ! $post instanceof WP_Post ) {
			return new WP_Error( 'art_editor_post_not_found', __( 'Запись не найдена.', 'art-editor' ), array( 'status' => 404 ) );
		}

		$payload     = $request->get_json_params();
		$layout_mode = isset( $payload['layoutMode'] ) ? $payload['layoutMode'] : Art_Editor_Post_Meta::get_layout_mode( $post_id );
		$html        = isset( $payload['html'] ) ? (string) $payload['html'] : '';

		$document = Art_Editor_Preview::build_edit_block_document(
			$html,
			array(
				'layout_mode' => $layout_mode,
				'block_index' => 0,
			)
		);

		return rest_ensure_response(
			array(
				'postId'     => $post_id,
				'layoutMode' => Art_Editor_Post_Meta::sanitize_layout_mode( $layout_mode ),
				'document'   => $document,
			)
		);
	}

	/**
	 * Leave ART Editor builder mode for a post.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function leave_builder_mode( $request ) {
		$post_id = (int) $request->get_param( 'id' );
		$export  = Art_Editor_Content::export_art_editor_to_gutenberg( $post_id );

		if ( is_wp_error( $export ) ) {
			return $export;
		}

		$result = Art_Editor_Post_Meta::leave_builder_mode( $post_id );

		if ( is_wp_error( $result ) ) {
			return $result;
		}

		return rest_ensure_response(
			array(
				'postId'      => $post_id,
				'isArtEditor' => false,
			)
		);
	}
}
